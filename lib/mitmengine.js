//in the near future, this will likely end up being a module of its own

const http      = require('http'),
      https     = require('https'),
      tls       = require('tls'),
      crypto    = require('crypto'),
      net       = require('net'),
      url       = require('url'),
      events    = require('events'),
      path      = require('path'),
      fs        = require('fs'),
      forge     = require('node-forge'),
      os        = require('os'),
      oshostn   = os.hostname(); //oshostn for debugging only

let debug, libcurl,
    curlEnabled = true;

try {
  debug = require('debug')('wssip:mitmengine');
} catch(e) {
  debug = function() {}
}

try {
  libcurl = require('node-libcurl').Curl;
} catch(e) {
  curlEnabled = false;
}

const SSLTLS_EXTENSIONS = [
  {
    name: 'basicConstraints',
    cA: true
  },
  {
    name: 'keyUsage',
    keyCertSign: false,
    digitalSignature: true,
    nonRepudiation: false,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: false,
    emailProtection: false,
    timeStamping: false
  },
  {
    name: 'nsCertType',
    client: true,
    server: true,
    email: false,
    objsign: false,
    sslCA: false,
    emailCA: false,
    objCA: false
  },
  { name: 'subjectKeyIdentifier' }
];

const SSLTLS_SERVER_EXTENSIONS = [
  {
    name: 'basicConstraints',
    cA: false
  },
  {
    name: 'keyUsage',
    keyCertSign: false,
    digitalSignature: true,
    nonRepudiation: false,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: false,
    emailProtection: false,
    timeStamping: false
  },
  {
    name: 'nsCertType',
    client: true,
    server: true,
    email: false,
    objsign: false,
    sslCA: false,
    emailCA: false,
    objCA: false
  },
  {
    name: 'subjectKeyIdentifier'
  }
];

const SSLTLS_ISSUER = [
  {
    name: 'commonName',
    value: 'wssipmitmengine'
  },
  {
    name: 'countryName',
    value: 'US'
  },
  {
    shortName: 'ST',
    value: 'California'
  },
  {
    name: 'organizationName',
    value: 'NCC Group'
  },
  {
    shortName: 'OU',
    value: 'wssipmitmengine'
  }
];

module.exports = class mitmengine extends events.EventEmitter {
  constructor(options={}) {
    super();

    if(curlEnabled === false) {
      this.emit('error', new Error('node-libcurl could not be initialized. Please check that the module is compiled correctly.'));
      return;
    }

    options = Object.assign({
      hostname: '127.0.0.1',
      port: 8080,
      useUpstreamProxy: false,
      proxyHostname: null,
      proxyPort: null,
      timeout: 0,
      version: '?',
      rejectUnauthorized: false,
      tmpDir: path.join(os.tmpdir(), '.mitm-cache'),
      requestHandler: null,
      tlsDefaultExtensions: SSLTLS_EXTENSIONS,
      tlsDefaultServerExtensions: SSLTLS_SERVER_EXTENSIONS,
      tlsDefaultIssuer: SSLTLS_ISSUER
    }, options);

    this._proxy = http.createServer();

    this.hostname = options.hostname;
    this.port = options.port;
    this.useUpstreamProxy = options.useUpstreamProxy;
    this.proxyHostname = options.proxyHostname;
    this.proxyPort = options.proxyPort;
    this.timeout = options.timeout;
    this.version = options.version;
    this.rejectUnauthorized = options.rejectUnauthorized;
    this.tmpDir = options.tmpDir;
    this.requestHandler = options.requestHandler;

    this.tlsExtensions = options.tlsDefaultExtensions;
    this.tlsServerExtensions = options.tlsDefaultServerExtensions;
    this.tlsIssuer = options.tlsDefaultIssuer;

    this._cachedHostsHash = {};
    this._cachedServersList = {};
    this._cachedPrivateKey = null;

    this.listening = false;

    this._makeNewTempDir();

    this._proxy.on('connect', this.onConnect.bind(this));
    this._proxy.on('request', this.onRequest.bind(this));
  }

  get timeout() {
    return this._proxy.timeout;
  }

  set timeout(seconds) {
    this._proxy.timeout = seconds;
  }

  _fixRequestUrl(requrl, url) {
    let newReqUrl = '';

    if(requrl.indexOf('/') === 0) {
      let auth = url.auth !== null ? `${url.auth}@` : '';
      let port = url.port !== null ? `:${url.port}` : '';
      newReqUrl = `${auth}${url.hostname}${port}${requrl}`;
    }

    return newReqUrl;
  }

  _makeNewTempDir() {
    fs.access(this.tmpDir, fs.constants.R_OK, (err) => {
      if(err) {
        fs.mkdirSync(this.tmpDir);
        fs.chmodSync(this.tmpDir, '766');

        fs.access(this.tmpDir, fs.constants.W_OK, (err) => {
          if(err) {
            this.emit('error', err);
            return;
          }
        });
      }
    });
  }

  cacheNewCA(deleteExisting) {
    return new Promise((resolve, reject) => {
      if(deleteExisting) {
        try {
          fs.unlinkSync(this.tmpDir);
          this._makeNewTempDir();
        } catch(e) {
          reject(e);
          return;
        }
      }

      let tmpRootCAPEM = path.join(this.tmpDir, 'ca.pem');

      if(!fs.existsSync(tmpRootCAPEM)) {
        forge.pki.rsa.generateKeyPair({bits: 2048}, (err, keys) => {
          if(err) {
            reject(err);
            return;
          }

          let certificate = forge.pki.createCertificate();

          certificate.publicKey = keys.publicKey;
          certificate.serialNumber = crypto.randomBytes(8).toString('hex');
          certificate.validity.notBefore = new Date();
          certificate.validity.notAfter = new Date();
          certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + 2);

          certificate.setSubject(this.tlsIssuer);
          certificate.setIssuer(this.tlsIssuer);
          certificate.setExtensions(this.tlsExtensions);

          try {
            certificate.sign(keys.privateKey, forge.md.sha256.create());

            fs.writeFileSync(path.join(this.tmpDir, 'ca.pem'), forge.pki.certificateToPem(certificate));
            fs.writeFileSync(path.join(this.tmpDir, 'ca_pri.pem'), forge.pki.privateKeyToPem(keys.privateKey));
            fs.writeFileSync(path.join(this.tmpDir, 'ca_pub.pem'), forge.pki.publicKeyToPem(keys.publicKey));

            this.emit('newRootCertificate', certificate, keys.privateKey, keys.publicKey);
          } catch(e) {
            reject(e);
            return;
          }

          debug('generated new CAs');
          this._cachedPrivateKey = keys.privateKey;

          resolve(this._cachedPrivateKey);
        });
      } else {
        try {
          debug('caching existing private key from ca_pri.pem');
          this._cachedPrivateKey = forge.pki.privateKeyFromPem(fs.readFileSync(path.join(this.tmpDir, 'ca_pri.pem')));
        } catch(e) {
          reject(e);
          return;
        }

        resolve(this._cachedPrivateKey);
      }
    });
  }

  certificatePEM() {
    try {
      return fs.readFileSync(path.join(this.tmpDir, 'ca.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  privateKeyPEM() {
    try {
      return fs.readFileSync(path.join(this.tmpDir, 'ca_pri.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  publicKeyPEM() {
    try {
      return fs.readFileSync(path.join(this.tmpDir, 'ca_pub.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  _generateServerKeys(url, serverCert, res, rej) {
    forge.pki.rsa.generateKeyPair({bits: 1024}, (err, keys) => {
      if(err) {
        rej(err);
        return;
      }

      let certificate = forge.pki.createCertificate();
      let hostIdentifier = url.hostname + ':' + url.port;

      certificate.publicKey = keys.publicKey;
      certificate.serialNumber = serverCert.serialNumber;
      certificate.validity.notBefore = new Date(serverCert.valid_from);
      certificate.validity.notAfter = new Date(serverCert.valid_to);
      certificate.setSubject(serverCert.subject);
      certificate.setIssuer(this.tlsIssuer);

      let serverExtensions = this.tlsServerExtensions.slice(0);
      let altNamesArray = [];
      let serverSubjectAltName = typeof serverCert.subjectaltname === 'undefined' ? '' : serverCert.subjectaltname;

      serverSubjectAltName.split(', ').forEach((san) => {
        let individualNames = san.split(':');
        let sanType = -1;

        //TODO: not 100% sure on names to case
        switch(individualNames[0]) {
          case 'otherName':
          case 'OTHERNAME':
            sanType = 0;
            break;
          case 'email':
          case 'EMAIL':
            sanType = 1;
            break;
          case 'DNS':
            sanType = 2;
            break;
          case 'X400':
            sanType = 3;
            break;
          case 'URI':
            sanType = 6;
            break;
          case 'IP':
            sanType = 7;
            break;
          case 'RID':
            sanType = 8;
            break;
          default:
            break;
        }

        if(sanType === -1) {
          return;
        }

        altNamesArray.push({
          type: sanType,
          value: individualNames[1]
        });

      });

      serverExtensions.push({
        name: 'subjectAltName',
        altNames: altNamesArray
      });

      certificate.setExtensions(serverExtensions);

      try {
        certificate.sign(this._cachedPrivateKey, forge.md.sha256.create());

        fs.writeFileSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'), forge.pki.certificateToPem(certificate));
        fs.writeFileSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'), forge.pki.privateKeyToPem(keys.privateKey));
        fs.writeFileSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'), forge.pki.publicKeyToPem(keys.publicKey));

        this.emit('newServerKeys', certificate, keys.privateKey, keys.publicKey);
      } catch(e) {
        rej(e);
        return;
      }

      res(true);
    });
  }

  _getHTTPSCertificate(url) {
    return new Promise((resolve, reject) => {
      let hostIdentifier = url.hostname + ':' + url.port;
      let pemExists = fs.existsSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'));
      let publicKeyExists = fs.existsSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'));
      let privateKeyExists = fs.existsSync(path.join(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'));

      if(!pemExists || !publicKeyExists || !privateKeyExists) {

        let socket = tls.connect(
          {
            host: url.hostname,
            port: url.port,
            rejectUnauthorized: false,
            timeout: this.timeout
          }, () => {
            let serverCert = socket.getPeerCertificate();
            socket.end();
            this._generateServerKeys(url, serverCert, resolve, reject);
          }
        );

        socket.on('error', () => {
          try {
            socket.end();
          } catch(e) {
            //nothing
          }

          let serverCert = {
            serialNumber: crypto.randomBytes(8).toString('hex'),
            valid_from: new Date(),
            valid_to: new Date(),
            subject: this.tlsIssuer,
            subjectaltname: `URI:${url.hostname}`
          }

          serverCert.valid_to.setFullYear(serverCert.valid_to.getFullYear() + 2);

          this._generateServerKeys(url, serverCert, resolve, reject);
        });
      } else {
        resolve(true);
      }
    });
  }

  _setupHttpsServer(url) {
    return new Promise((resolve, reject) => {
      let hostIdentifier = url.hostname + ':' + url.port;
      let hostnameSHA256 = this._cachedHostsHash[hostIdentifier];

      if(hostnameSHA256 in this._cachedServersList) {
        resolve(this._cachedServersList[hostnameSHA256]);
        return;
      }

      //let result;
      //(async () => {
      //  result = await this._getHTTPSCertificate(url);
      //})();

      this._getHTTPSCertificate(url).then((result) => {
        let httpsOptions = {};

        try {
          httpsOptions.key = fs.readFileSync(path.join(this.tmpDir, hostnameSHA256 + '_pri.pem'), 'utf8');
          httpsOptions.cert = fs.readFileSync(path.join(this.tmpDir, hostnameSHA256 + '.pem'), 'utf8');
        } catch(e) {
          reject(e);
          return;
        }

        let httpsProxy = https.createServer(httpsOptions);

        httpsProxy.on('connect', (req, socket, head) => {
          req.url = 'https://' + this._fixRequestUrl(req.url, url);
          this.onConnect(req, socket, head);
        });

        httpsProxy.on('upgrade', (req, socket, head) => {
          req.url = 'https://' + this._fixRequestUrl(req.url, url);
        });

        httpsProxy.on('request', (req, res) => {
          req.url = 'https://' + this._fixRequestUrl(req.url, url);
          this.onRequest(req, res);
        });

        httpsProxy.on('close', () => {
          delete this._cachedServersList[hostnameSHA256];
        });

        this.emit('beforeListening', httpsProxy);
        httpsProxy.listen();

        this._cachedServersList[hostnameSHA256] = httpsProxy;

        let {address, port} = httpsProxy.address();
        debug(`HTTPS CONNECT: ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

        resolve(httpsProxy);
      }).catch((e) => {
        reject(e);
      });
    });
  }

  _setupServer(httpsServer, request, clientSocket, head, hostIdentifier) {
    let {address, port} = httpsServer.address();

    let serverSocket = net.connect(port, address, () => {
      clientSocket.write(`HTTP/${request.httpVersion} 200 Connection Established\r\n` +
                         `Proxy-Agent: wssip_mitmengine/${this.version}\r\n\r\n`);

      serverSocket.write(head);
      serverSocket.pipe(clientSocket).pipe(serverSocket);
    });

    serverSocket.on('end', () => this.emit('netServerEnd', serverSocket));
    clientSocket.on('end', () => this.emit('netClientEnd', clientSocket));
  }

  onConnect(request, clientSocket, head) {
    request.pause();

    let parsedUrl = url.parse(`http://${request.url}`);
    let hostIdentifier = parsedUrl.hostname + ':' + parsedUrl.port;
    let is_https = parsedUrl.port === '443'; //TODO: better way of figuring out if HTTPS?

    if(!(hostIdentifier in this._cachedHostsHash)) {
      this._cachedHostsHash[hostIdentifier] = crypto.createHash('sha256').update(hostIdentifier).digest('hex').substr(0, 24);
    }

    if(is_https) {
      //(async () => {
      //  this._setupServer(await this._setupHttpsServer(parsedUrl), request, clientSocket, head, hostIdentifier);
      //})();

      this._setupHttpsServer(parsedUrl).then(
        (httpsServer) =>
          this._setupServer(httpsServer, request, clientSocket, head, hostIdentifier)
      ).catch((e) => {
        debug(e);
        this.emit('error', e);
      });

    } else {
      let httpProxy = http.createServer();

      httpProxy.on('upgrade', (req, socket, head) => {
        req.url = 'http://' + this._fixRequestUrl(req.url, parsedUrl);
      });

      httpProxy.on('request', (req, res) => {
        req.url = 'http://' + this._fixRequestUrl(req.url, parsedUrl);
        this.onRequest(req, res);
      });

      httpProxy.on('close', () => {
        delete this._cachedServersList[hostnameSHA256];
      });

      this.emit('beforeListening', httpProxy);
      httpProxy.listen();

      this._cachedServersList[this._cachedHostsHash[hostIdentifier]] = httpProxy;

      let {address, port} = httpProxy.address();
      debug(`HTTP CONNECT: ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

      this._setupServer(httpProxy, request, clientSocket, head, hostIdentifier);
    }

    request.resume();
  }

  _writeErrorPage(error) {
    let contents = '<!doctype html>\n';
    contents += '<html>\n';
    contents += '<head>\n';
    contents += '<title>Proxy Error</title>\n';
    contents += '<meta charset="utf-8" />\n';
    contents += '</head>\n';
    contents += '<body>\n';
    contents += '<h1>Error</h1>\n';
    contents += '<p>' + error + '</p>\n';
    contents += '</body>\n';
    contents += '</html>';

    debug('wrote error page to user with reason ' + error.message);
    this.emit('error', error);

    return contents;
  }

  onRequest(clientRequest, clientResponse) {
    //TODO: will refine this so it uses straight TCP connection
    //with a fallback onto http/s.request() and finally node-libcurl

    let _buf = [];
    let _size = 0;
    let _postField = '';
    let _headers = [];
    let _httpver = '1.1';
    let _code = -1;
    let _reason = '';

    clientRequest.pause();

    let header_name = '';
    let header_val = '';

    for(let i = 0; i < clientRequest.rawHeaders.length; i += 2) {
      header_name = clientRequest.rawHeaders[i];
      header_val = clientRequest.rawHeaders[i + 1];

      if(header_name.toLowerCase().match(/proxy-/))
        continue;

      _headers.push(`${header_name}: ${header_val}`);
    }

    clientRequest.on('data', (chunk) => {
      _buf.push(chunk);
      _size += chunk.length;
    });

    clientRequest.on('end', () => {
      if(_size !== 0) {
        _postField = Buffer.concat(_buf, _size).toString('utf8');
        _buf = [];
        _size = 0;
      }

      debug(`REQUEST: ${clientRequest.method} ${clientRequest.url}`);

      let handlerMatch = clientRequest.url.match(/http:\/\/me\//);
      if(handlerMatch !== null && handlerMatch.index === 0 && typeof this.requestHandler === 'function') {
        this.requestHandler(clientRequest.method, clientRequest.url.replace('http://me', ''), clientResponse);
        return;
      }

      let curl = new libcurl();
      let closeConnection = curl.close.bind(curl);

      curl.enable(libcurl.feature.NO_DATA_PARSING);

      //set proxy & config options
      if(this.useUpstreamProxy) {
        curl.setOpt(libcurl.option.PROXY, 'http://' + this.proxyHostname + ':' + this.proxyPort + '/');
      }

      curl.setOpt(libcurl.option.PATH_AS_IS, true);
      curl.setOpt(libcurl.option.FOLLOWLOCATION, false);
      curl.setOpt(libcurl.option.SSL_VERIFYHOST, 0);
      curl.setOpt(libcurl.option.SSL_VERIFYPEER, 0);
      curl.setOpt(libcurl.option.TIMEOUT, this.timeout);
      curl.setOpt(libcurl.option.NOPROGRESS, true);

      //GET / HTTP/1.1
      let serveVersion = libcurl.http.VERSION_NONE;

      if(clientRequest.httpVersion === '1.0')
        serveVersion = libcurl.http.VERSION_1_0;
      else if(clientRequest.httpVersion === '1.1')
        serveVersion = libcurl.http.VERSION_1_1;
      else if(clientRequest.httpVersion === '2.0')
        serveVersion = libcurl.http.VERSION_2_0;

      curl.setOpt(libcurl.option.CUSTOMREQUEST, clientRequest.method);
      curl.setOpt(libcurl.option.HTTP_VERSION, serveVersion);
      curl.setOpt(libcurl.option.URL, clientRequest.url);

      //send headers
      curl.setOpt(libcurl.option.HEADER, false);
      curl.setOpt(libcurl.option.HTTPHEADER, _headers);
      _headers = {};

      //send body (if there is one)
      if(_postField !== '') {
        curl.setOpt(libcurl.option.POSTFIELDS, _postField);
        debug(`REQUEST: ${clientRequest.method} sends ${_postField.length} byte(s)`);
        _postField = '';
      }

      let _upstreamProxyHit = false; //skip 200 Connection established

      curl.on('header', (chunk) => {
        let _chunkString = chunk.toString('utf8').trim();

        if(this.useUpstreamProxy === true && _upstreamProxyHit === false && _chunkString === '') {
          _upstreamProxyHit = true;
          return;
        }

        if(_chunkString === '' && _code > 100) {
          clientResponse.writeHead(_code, _reason, _headers);
          return;
        }

        if(_chunkString.match(/HTTP/)) {
          let _rawHeader = _chunkString.split(' ');
          _httpver = _rawHeader[0].replace('HTTP/', '');
          _code = parseInt(_rawHeader[1]);
          _reason = _chunkString.replace(`HTTP/${_httpver} ${_code} `, '');
        } else if(_code !== 100) {
          let _rawHeader = _chunkString.split(': ');
          let _header_name = _rawHeader[0].replace(':');
          let _header_val =  _chunkString.replace(`${_header_name}: `, '');

          if(_header_name in _headers) {
            if(typeof _headers[_header_name] === 'string') {
              let tmp = `${_headers[_header_name]}`;
              _headers[_header_name] = [tmp];
            }

            _headers[_header_name].push(_header_val);
          } else {
            _headers[_header_name] = _header_val;
          }
        }
      });

      curl.on('data', (chunk) => clientResponse.write(chunk));

      curl.on('end', () => {
        clientResponse.end();
        closeConnection();
      });

      curl.on('error', (error) => {
        clientResponse.end(this._writeErrorPage.call(this, error));
        closeConnection();
      });

      curl.perform();
    });

    clientRequest.on('error', (error) => clientResponse.end(this._writeErrorPage.call(this, error)));
    clientRequest.resume();
  }

  listen() {
    if(curlEnabled === false) {
      this.emit('error', new Error('node-libcurl could not be initialized. Please check that the module is compiled correctly.'));
      return false;
    }

    if(typeof this.port !== 'number') {
      this.emit('error', new Error('The listening proxy port number is invalid.'));
      return false;
    }

    if(this.useUpstreamProxy && (typeof this.proxyHostname !== 'string' || typeof this.proxyPort !== 'number')) {
      this.emit('error', new Error('The configured upstream proxy hostname or port number is invalid.'));
      return false;
    }

    this.emit('beforeListening', this._proxy);

    this.cacheNewCA(false).then(() => {
      try {
        this._proxy.listen(this.port, this.hostname, () => {
          debug(`LISTENING: ${this.hostname}:${this.port}`);
          this.emit('afterListening', this._proxy);
          this.listening = true;
        });
      } catch(e) {
        this.emit('error', e);
      }
    }).catch((e) => {
      debug(e);
      this.emit('error', e);
    });

    return true;
  }

  end() {
    try {
      Object.keys(this._cachedServersList).forEach((key) => {
        let {address, port} = this._cachedServersList[key].address();

        debug(`CLOSING: ${address === '::' ? oshostn : address}:${port}`);
        this._cachedServersList[key].close(() => {
          delete this._cachedServersList[key];
        });
      });
    } catch(e) {
      //e
    }

    this._cachedServersList = [];

    debug(`CLOSING: ${this.hostname}:${this.port}`);
    this._proxy.close(() => {
      this.listening = false;
      this.emit('closed');
    });
  }
}
