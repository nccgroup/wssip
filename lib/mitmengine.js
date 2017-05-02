const {connect}       = require('net'),
      crypto          = require('crypto'),
      {EventEmitter}  = require('events'),
      forge           = require('node-forge'),
      fs              = require('fs'),
      http            = require('http'),
      https           = require('https'),
      os              = require('os'),
      oshostn         = os.hostname(), //oshostn for debugging only
      {parse}         = require('url'),
      path            = require('path').join,
      tls             = require('tls');

let debug, libcurl, curlEnabled = true;

try {
  libcurl = require('node-libcurl').Curl;
} catch(e) {
  curlEnabled = false;
}

try {
  debug = require('debug')('wssip:mitmengine');
} catch(e) {
  debug = () => {};
}

//thank you http-mitm-proxy for X.509 signing defaults
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

module.exports = class mitmengine extends EventEmitter {

  constructor(options={}) {
    super();

    options = Object.assign({
      hostname: 'localhost',
      port: 0,
      useUpstreamProxy: false,
      proxyHostname: null,
      proxyPort: null,
      timeout: 0,
      version: '?',
      rejectUnauthorized: false,
      tmpDir: path(os.tmpdir(), '.mitm-cache'),
      requestHandler: null,
      tlsDefaultExtensions: SSLTLS_EXTENSIONS,
      tlsDefaultServerExtensions: SSLTLS_SERVER_EXTENSIONS,
      tlsDefaultIssuer: SSLTLS_ISSUER
    }, options);

    this._proxy = http.createServer();
    this.useCurl = typeof options.forceCurl === 'undefined' ? curlEnabled : options.forceCurl;

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

    this.onConnect = this.onConnect.bind(this);
    this.onRequest = this.onRequest.bind(this);
    this.onError = this.onError.bind(this);

    //(async () => await this._makeNewTempDir())();
    this._makeNewTempDir().then(() => {}).catch(e => {});

    this._proxy.on('connect', this.onConnect);
    this._proxy.on('request', this.onRequest);
    this._proxy.on('error', this.onError);
  }

  get timeout() {
    return this._proxy.timeout;
  }

  set timeout(seconds) {
    this._proxy.timeout = seconds;
  }

  _fixRequestUrl(requrl, newurl) {
    let newReqUrl = '';

    if (requrl.indexOf('/') === 0) {
      let auth = newurl.auth !== null ? `${newurl.auth}@` : '';
      let port = newurl.port !== null ? `:${newurl.port}` : '';
      newReqUrl = `${auth}${newurl.hostname}${port}${requrl}`;
    }

    return newReqUrl;
  }

  _getRawHeaderObj(rawHeaders) {
    let headerObj = {};

    for (let i = 0; i < rawHeaders.length; i += 2) {
      if (rawHeaders[i].toLowerCase().match(/proxy-/)) {
        continue;
      }

      if (rawHeaders[i] in headerObj) {
        if (typeof headerObj[rawHeaders[i]] === 'string') {
          let tmp = headerObj[rawHeaders[i]];
          headerObj[rawHeaders[i]] = [tmp];
        }

        headerObj[rawHeaders[i]].push(rawHeaders[i+1]);
      } else {
        headerObj[rawHeaders[i]] = rawHeaders[i + 1];
      }
    }

    return headerObj;
  }

  _makeNewTempDir() {
    return new Promise((resolve, reject) => {
      fs.access(this.tmpDir, fs.constants.R_OK, err => {
        if (err) {
          fs.mkdirSync(this.tmpDir);
          fs.chmodSync(this.tmpDir, '766');

          fs.access(this.tmpDir, fs.constants.W_OK, e => {
            if (e) {
              this.onError(e);
              reject(e);
            } else {
              resolve(true);
            }
          });
        }
      });
    });
  }

  cacheNewCA(deleteExisting) {
    return new Promise((resolve, reject) => {
      if (deleteExisting) {
        try {
          fs.unlinkSync(this.tmpDir);
          //await this._makeNewTempDir();
          this.makeNewTempDir().then(() => {}).catch(e => {
            throw e;
          });
        } catch(e) {
          reject(e);
          return;
        }
      }

      let tmpRootCAPEM = path(this.tmpDir, 'ca.pem');

      if (!fs.existsSync(tmpRootCAPEM)) {
        forge.pki.rsa.generateKeyPair({bits: 2048}, (err, keys) => {
          if (err) {
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

            fs.writeFileSync(path(this.tmpDir, 'ca.pem'), forge.pki.certificateToPem(certificate));
            fs.writeFileSync(path(this.tmpDir, 'ca_pri.pem'), forge.pki.privateKeyToPem(keys.privateKey));
            fs.writeFileSync(path(this.tmpDir, 'ca_pub.pem'), forge.pki.publicKeyToPem(keys.publicKey));

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
          this._cachedPrivateKey = forge.pki.privateKeyFromPem(fs.readFileSync(path(this.tmpDir, 'ca_pri.pem')));
        } catch(e) {
          reject(e);
          return;
        }

        resolve(this._cachedPrivateKey);
      }
    });
  }

  set certificatePEM(contents) {
    fs.writeFileSync(path(this.tmpDir, 'ca.pem'), contents);
  }

  get certificatePEM() {
    try {
      return fs.readFileSync(path(this.tmpDir, 'ca.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  set privateKeyPEM(contents) {
    fs.writeFileSync(path(this.tmpDir, 'ca_pri.pem'), contents);
  }

  get privateKeyPEM() {
    try {
      return fs.readFileSync(path(this.tmpDir, 'ca_pri.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  set publicKeyPEM(contents) {
    fs.writeFileSync(path(this.tmpDir, 'ca_pub.pem'), contents);
  }

  get publicKeyPEM() {
    try {
      return fs.readFileSync(path(this.tmpDir, 'ca_pub.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  _generateServerKeys(serverUrl, serverCert, res, rej) {
    forge.pki.rsa.generateKeyPair({bits: 1024}, (err, keys) => {
      if (err) {
        rej(err);
        return;
      }

      let certificate = forge.pki.createCertificate();
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`

      certificate.publicKey = keys.publicKey;
      certificate.serialNumber = serverCert.serialNumber;
      certificate.validity.notBefore = new Date(serverCert.valid_from);
      certificate.validity.notAfter = new Date(serverCert.valid_to);
      certificate.setSubject(serverCert.subject);
      certificate.setIssuer(this.tlsIssuer);

      let serverExtensions = this.tlsServerExtensions.slice(0);
      let altNamesArray = [];
      let serverSubjectAltName = typeof serverCert.subjectaltname === 'undefined' ? '' : serverCert.subjectaltname;

      serverSubjectAltName.split(', ').forEach(san => {
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

        if (sanType === -1) {
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

        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'), forge.pki.certificateToPem(certificate));
        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'), forge.pki.privateKeyToPem(keys.privateKey));
        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'), forge.pki.publicKeyToPem(keys.publicKey));

        this.emit('newServerKeys', certificate, keys.privateKey, keys.publicKey);
      } catch(e) {
        rej(e);
        return;
      }

      res(true);
    });
  }

  _getHTTPSCertificate(serverUrl) {
    return new Promise((resolve, reject) => {
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
      let pemExists = fs.existsSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'));
      let publicKeyExists = fs.existsSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'));
      let privateKeyExists = fs.existsSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'));

      if (!pemExists || !publicKeyExists || !privateKeyExists) {

        let socket = tls.connect(
          {
            host: serverUrl.hostname,
            port: serverUrl.port,
            rejectUnauthorized: false,
            timeout: this.timeout
          }, () => {
            let serverCert = socket.getPeerCertificate();
            socket.end();
            this._generateServerKeys(serverUrl, serverCert, resolve, reject);
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
            subjectaltname: `URI:${serverUrl.hostname}`
          }

          serverCert.valid_to.setFullYear(serverCert.valid_to.getFullYear() + 2);

          this._generateServerKeys(serverUrl, serverCert, resolve, reject);
        });
      } else {
        resolve(true);
      }
    });
  }

  _setupHttpsServer(serverUrl) {
    return new Promise((resolve, reject) => {
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
      let hostnameSHA256 = this._cachedHostsHash[hostIdentifier];

      if (hostnameSHA256 in this._cachedServersList) {
        resolve(this._cachedServersList[hostnameSHA256]);
        return;
      }

      //let result;
      //try {
      //  result = await this._getHTTPSCertificate(serverUrl);
      //} catch(e) {
      //  reject(e);
      //  return;
      //}

      this._getHTTPSCertificate(serverUrl).then(result => {
      let httpsOptions = {};

      try {
        httpsOptions.key = fs.readFileSync(path(this.tmpDir, hostnameSHA256 + '_pri.pem'), 'utf8');
        httpsOptions.cert = fs.readFileSync(path(this.tmpDir, hostnameSHA256 + '.pem'), 'utf8');
      } catch(e) {
        reject(e);
        return;
      }

      let httpsProxy = https.createServer(httpsOptions);

      httpsProxy.on('connect', (req, socket, head) => {
        req.url = 'https://' + this._fixRequestUrl(req.url, serverUrl);
        this.onConnect(req, socket, head);
      });

      httpsProxy.on('upgrade', (req, socket, head) => {
        req.url = 'https://' + this._fixRequestUrl(req.url, serverUrl);
      });

      httpsProxy.on('request', (req, res) => {
        req.url = 'https://' + this._fixRequestUrl(req.url, serverUrl);
        this.onRequest(req, res);
      });

      httpsProxy.on('close', () => {
        delete this._cachedServersList[hostnameSHA256];
      });

      this.emit('beforeListening', httpsProxy);
      httpsProxy.listen();

      this._cachedServersList[hostnameSHA256] = httpsProxy;

      let {address, port} = httpsProxy.address();
      debug(`CONNECT: [HTTPS] ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

      resolve(httpsProxy);
      }).catch(e => reject(e));
    });
  }

  _setupServer(httpsServer, request, clientSocket, head, hostIdentifier) {
    let {address, port} = httpsServer.address();

    let serverSocket = connect(port, address, () => {
      if (this.useUpstreamProxy !== true) {
        clientSocket.write(`HTTP/${request.httpVersion} 200 Connection Established\r\n` +
                           `Proxy-Agent: wssip_mitmengine/${this.version}\r\n\r\n`);
      }

      serverSocket.write(head);
      serverSocket.pipe(clientSocket).pipe(serverSocket);
    });

    serverSocket.on('end', () => this.emit('netServerEnd', serverSocket));
    clientSocket.on('end', () => this.emit('netClientEnd', clientSocket));
  }

  onConnect(request, clientSocket, head) {
    request.pause();

    let parsedUrl = parse(`http://${request.url}`);
    let hostIdentifier = `${parsedUrl.hostname}:${parsedUrl.port}`;
    let is_https = parsedUrl.port === '443'; //TODO: better way of figuring out if HTTPS?

    if (!(hostIdentifier in this._cachedHostsHash)) {
      this._cachedHostsHash[hostIdentifier] = crypto.createHash('sha256').update(hostIdentifier).digest('hex').substr(0, 24);
    }

    if (is_https) {
      //(async () => {
        //this._setupServer(await this._setupHttpsServer(parsedUrl), request, clientSocket, head, hostIdentifier);
      //})();
      this._setupHttpsServer(parsedUrl)
        .then(server => this._setupServer(server, request, clientSocket, head, hostIdentifier))
        .catch(e => this.onError(e));
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
      debug(`CONNECT: [HTTP] ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

      this._setupServer(httpProxy, request, clientSocket, head, hostIdentifier);
    }

    request.resume();
  }

  _writeErrorPage(error) {
    let stack = error.stack;
    stack = stack.split('\n').join('<br />\r\n');
    stack = stack.split(' ').join('&nbsp;');
    stack = stack.split(' ').join('&nbsp;&nbsp;&nbsp;&nbsp;');

    let contents = '<!doctype html>\n';
    contents += '<html>\n';
    contents += '<head>\n';
    contents += '<title>Proxy Error</title>\n';
    contents += '<meta charset="utf-8" />\n';
    contents += '</head>\n';
    contents += '<body>\n';
    contents += '<h3>' + error.message + '</h3>\n';
    contents += '<p>' + stack + '</p>\n';
    contents += '</body>\n';
    contents += '</html>';

    debug(`wrote error page (${error.message})`);

    return contents;
  }

  _curlRequest(method, url, httpVersion, headers, postField, clientResponse) {
    let curl = new libcurl();
    let closeConnection = curl.close.bind(curl);

    curl.enable(libcurl.feature.NO_DATA_PARSING);
    curl.enable(libcurl.feature.NO_DATA_STORAGE);
    curl.enable(libcurl.feature.NO_HEADER_STORAGE);

    //set proxy & config options
    if (this.useUpstreamProxy) {
      curl.setOpt(libcurl.option.PROXY, `http://${this.proxyHostname}:${this.proxyPort}/`);
    }

    curl.setOpt(libcurl.option.PATH_AS_IS, true);
    curl.setOpt(libcurl.option.FOLLOWLOCATION, false);

    if (!this.rejectUnauthorized) {
      curl.setOpt(libcurl.option.SSL_VERIFYHOST, 0);
      curl.setOpt(libcurl.option.SSL_VERIFYPEER, 0);
    }

    curl.setOpt(libcurl.option.TIMEOUT, this.timeout);
    curl.setOpt(libcurl.option.NOPROGRESS, true);

    //GET / HTTP/1.1
    let serveVersion = libcurl.http.VERSION_NONE;

    if (httpVersion === '1.0')
      serveVersion = libcurl.http.VERSION_1_0;
    else if (httpVersion === '1.1')
      serveVersion = libcurl.http.VERSION_1_1;
    else if (httpVersion === '2.0')
      serveVersion = libcurl.http.VERSION_2_0;

    curl.setOpt(libcurl.option.CUSTOMREQUEST, method);
    curl.setOpt(libcurl.option.HTTP_VERSION, serveVersion);
    curl.setOpt(libcurl.option.URL, url);

    //send headers
    curl.setOpt(libcurl.option.HEADER, false);
    curl.setOpt(libcurl.option.HTTPHEADER, headers);

    //send body (if there is one)
    if (postField !== '') {
      curl.setOpt(libcurl.option.POSTFIELDS, postField);
    }

    let code = 0, reason = '', _headers = {}, _httpver = '', proxyHit = false;

    curl.on('header', c => {
      let _chunkString = c.toString('utf8').trim();

      if (this.useUpstreamProxy && !proxyHit && _chunkString === '') {
        proxyHit = true;
        return;
      }

      if (_chunkString === '' && code > 100) {
        clientResponse.writeHead(code, reason, _headers);
        return;
      }

      if (/HTTP/.test(_chunkString.toUpperCase())) {
        let _rawHeader = _chunkString.split(' ');
        _httpver = _rawHeader.shift().toUpperCase().replace('HTTP/', '');
        code = Number(_rawHeader.shift());
        reason = _rawHeader.join(' ');
      } else if (code !== 100) {
        let _rawHeader = _chunkString.split(': ');
        let _header_name = _rawHeader.shift();
        let _header_val = _rawHeader.join(': ');

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

    curl.on('data', c => clientResponse.write(c));

    curl.on('end', () => {
      clientResponse.end();
      closeConnection();
    });

    curl.on('error', (error) => {
      this.onError(error);
      clientResponse.end(this._writeErrorPage(error));
      closeConnection();
    });

    curl.perform();
  }

  _nodeRequest(options, clientRequest, clientResponse) {
    clientRequest.pipe((options.protocol === 'https:' ? https : http).request(options, serverResponse => {
      serverResponse.pause();

      clientResponse.writeHead(serverResponse.statusCode, serverResponse.statusMessage, this._getRawHeaderObj(serverResponse.rawHeaders));

      clientResponse.on('error', err => {
        debug(`clientResponse error: ${err.message}`);
        this.onError(err);

        clientResponse.end(this._writeErrorPage(err));
      });

      serverResponse.on('error', err => {
        debug(`serverResponse error: ${err.message}`);
        this.onError(err);

        clientResponse.end(this._writeErrorPage(err));
      });

      serverResponse.on('end', () => {
        if ('socket' in options && options.socket !== null) {
          options.socket.end();
        }

        clientResponse.end();
      });

      serverResponse.on('data', c => clientResponse.write(c));

      serverResponse.resume();
    }).on('error', err => {
      debug(`connector error: ${err.message}`);
      this.onError(err);

      clientResponse.end(this._writeErrorPage(err));
    }));
  }

  onRequest(clientRequest, clientResponse) {
    clientRequest.pause();

    let handlerMatch = clientRequest.url.match(/http:\/\/me\//);
    if (handlerMatch !== null && handlerMatch.index === 0 && typeof this.requestHandler === 'function') {
      this.requestHandler(clientRequest, clientResponse);
      return;
    }

    if(this.useCurl === true) {
      debug(`REQUEST: [CURL] [${clientRequest.method}] ${clientRequest.url} [HTTP/${clientRequest.httpVersion}]`);

      let _buf = [], _size = 0;

      clientRequest.on('data', c => {
        _buf.push(c);
        _size += c.length;
      });

      clientRequest.on('end', () => {
        let header_name = '', header_val = '', _headers = [];

        for (let i = 0; i < clientRequest.rawHeaders.length; i += 2) {
          header_name = clientRequest.rawHeaders[i];
          header_val = clientRequest.rawHeaders[i + 1];

          if (header_name.toLowerCase().match(/proxy-/))
            continue;

          if (header_name.toLowerCase() === 'connection')
            header_val = '_';

          _headers.push(`${header_name}: ${header_val}`);
        }

        let _postField = _size !== 0 ? Buffer.concat(_buf, _size).toString('utf8') : '';
        _buf = [], _size = 0;

        this._curlRequest(clientRequest.method, clientRequest.url, clientRequest.httpVersion, _headers, _postField, clientResponse);
      });

    } else {
      debug(`REQUEST: [NODE] [${clientRequest.method}] ${clientRequest.url} [HTTP/${clientRequest.httpVersion}]`);

      let options = Object.assign({
        headers: this._getRawHeaderObj(clientRequest.rawHeaders),
        method: clientRequest.method,
        rejectUnauthorized: this.rejectUnauthorized,
        socket: null
      }, parse(clientRequest.url));

      options.headers['Connection'] = '_';

      if (this.useUpstreamProxy === true) {
        http.request({
          host: this.proxyHostname,
          port: this.proxyPort,
          method: 'CONNECT',
          path: options.host
        }).on('connect', (res, socket, head) => {
          options.socket = socket;
          options.agent = false;

          this._nodeRequest(options, clientRequest, clientResponse);
        }).on('error', err => {
          debug(`upstream proxy request error: ${err.message}`);
          this.onError(err);

          clientResponse.end(this._writeErrorPage(err));
        });

      } else {
        this._nodeRequest(options, clientRequest, clientResponse);
      }
    }

    clientRequest.on('error', error => {
      this.onError(error);
      clientResponse.end(this._writeErrorPage(error));
    });

    clientRequest.resume();
  }

  onError(err) {
    this.emit('error', err);
  }

  listen() {
    if (this.useUpstreamProxy && (typeof this.proxyHostname !== 'string' || typeof this.proxyPort !== 'number')) {
      this.onError(new Error('The configured upstream proxy hostname or port number is invalid.'));
      return false;
    }

    this.emit('beforeListening', this._proxy);

    //try {
    //  (async () => await this.cacheNewCA(false))();
    //...
    //} catch(e) {
    //  this.emit('error', e);
    //  return false;
    //}

    this.cacheNewCA(false).then(() => {
      if(typeof this.port !== 'number' || (typeof this.port === 'number' && (this.port < 0 || this.port > 0xFFFF))) {
        debug(`invalid port: [${typeof this.port} ${this.port}], set to random port`);
        this.port = 0;
      }

      this._proxy.listen(this.port, this.hostname, () => {
        this.port = this.port === 0 ? this._proxy.address().port : this.port;

        debug(`LISTEN: ${this.hostname}:${this.port}`);
        this.listening = true;

        this.emit('afterListening', this._proxy);
      });
    }).catch(e => this.onError(e));

    return true;
  }

  end() {
    try {
      Object.keys(this._cachedServersList).forEach(key => {
        let {address, port} = this._cachedServersList[key].address();

        debug(`CLOSE: ${address === '::' ? oshostn : address}:${port}`);
        this._cachedServersList[key].close(() => {
          delete this._cachedServersList[key];
        });
      });
    } catch(e) {
      //e
    }

    this._cachedServersList = {};

    debug(`CLOSE: ${this.hostname}:${this.port}`);
    this._proxy.close(() => {
      this.listening = false;
      this.emit('closed');
    });
  }
}
