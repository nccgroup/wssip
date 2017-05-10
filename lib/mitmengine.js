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

let debug = () => () => {},
    libcurl = null,
    tunnel = null,
    pkgVersion = '?',
    curlEnabled = true;

try {
  debug = require('debug');
} catch(e) {}

try {
  libcurl = require('node-libcurl').Curl;
} catch(e) {
  curlEnabled = false;

  try {
    tunnel = require('tunnel-agent');
  } catch(e) {}
}

try {
  let pkgUp = require('find-up').sync('package.json');
  pkgVersion = require(pkgUp).version;
} catch(e) {}

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

      name: 'wssip_mitmengine',
      debugName: 'mitmengine',
      version: pkgVersion,
      useCurl: curlEnabled,

      useUpstreamProxy: false,
      proxyUrl: '',

      timeout: 0,
      rejectUnauthorized: false,
      tmpDir: path(os.tmpdir(), '.mitm-cache'),

      requestHandler: false,

      tlsDefaultExtensions: SSLTLS_EXTENSIONS,
      tlsDefaultServerExtensions: SSLTLS_SERVER_EXTENSIONS,
      tlsDefaultIssuer: SSLTLS_ISSUER,

      eraseConnectionHeader: false,

      onRequestCurl: false,
      onRequestNode: false,
      onRequestData: false,
      onRequestEnd: false,
      onResponseHeaders: false,
      onResponseData: false,
      onResponseEnd: false,
      onUpgrade: false,
      onRootCAGeneration: false,
      onServerKeyGeneration: false
    }, options);

    this._proxy = http.createServer();

    this.hostname = options.hostname;
    this.port = options.port;
    this.useUpstreamProxy = options.useUpstreamProxy;
    this.proxyUrl = options.proxyUrl;
    this.timeout = options.timeout;
    this.name = options.name;
    this.version = options.version;
    this.rejectUnauthorized = options.rejectUnauthorized;
    this.tmpDir = options.tmpDir;
    this.requestHandler = options.requestHandler;
    this.eraseConnectionHeader = options.eraseConnectionHeader;

    this.tlsExtensions = options.tlsDefaultExtensions;
    this.tlsServerExtensions = options.tlsDefaultServerExtensions;
    this.tlsIssuer = options.tlsDefaultIssuer;

    this.debug = debug(options.debugName);

    this._cachedHostsHash = {};
    this._cachedServersList = {};
    this._cachedPrivateKey = null;

    this.listening = false;
    this.requestQueue = 0;

    this.onConnect = this.onConnect.bind(this);
    this.onRequest = this.onRequest.bind(this);
    this.onError = this.onError.bind(this);

    this._proxy.on('connect', this.onConnect);
    this._proxy.on('request', this.onRequest);
    this._proxy.on('error', this.onError);

    this._proxy.on('clientError', (err, socket) => {
      this.onError(err);
      socket.end(this._writeErrorPage(err));
    });

    this.onRequestCurl = options.onRequestCurl;
    this.onRequestNode = options.onRequestNode;
    this.onRequestData = options.onRequestData;
    this.onRequestEnd = options.onRequestEnd;

    this.onResponseHeaders = options.onResponseHeaders;
    this.onResponseData = options.onResponseData;
    this.onResponseEnd = options.onResponseEnd;

    this.onUpgrade = options.onUpgrade;

    this.onRootCAGeneration = options.onRootCAGeneration;
    this.onServerKeyGeneration = options.onServerKeyGeneration;

    if (!this.useCurl) {
      if (tunnel !== null) {
        this.debug(`node-libcurl is not installed. Defaulting back to Node.`);
        this.debug(`HTTP/S upstream proxy requests will work, but SOCKS4/5 proxy will not.`);
      } else {
        this.debug(`Warning: node-libcurl isn't installed and neither is tunnel-agent.`);
        this.debug(`Be advised that upstream proxy requests will not work as a result.`);
      }
    }

    this._makeNewTempDir();
  }

  connectionIsHttps(req, socket, head) {
    return head.length === 0 || head[0] == 0x80 || head[0] == 0x00;
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
    try {
      fs.accessSync(this.tmpDir, fs.constants.R_OK);
    } catch(err) {
      if(err.code === 'ENOENT') {
        try {
          fs.mkdirSync(this.tmpDir);
          fs.chmodSync(this.tmpDir, '766');
        } catch(error) {
          this.onError(error);
          return;
        }

        try {
          fs.accessSync(this.tmpDir, fs.constants.W_OK);
        } catch(error) {
          this.onError(error);
        }
      } else {
        this.onError(err);
      }
    }
  }

  cacheNewCA(deleteExisting) {
    return new Promise((resolve, reject) => {
      let tmpRootCAPEM = path(this.tmpDir, 'ca.pem');

      let expiration = fs.statSync(tmpRootCAPEM).ctime;
      expiration.setFullYear(expiration.getFullYear() + 2);

      if (deleteExisting) {
        try {
          fs.unlinkSync(this.tmpDir);
          this._makeNewTempDir();
        } catch(e) {
          reject(e);
          return;
        }
      }

      if (!fs.existsSync(tmpRootCAPEM) || expiration.getTime() <= new Date().getTime()) {
        forge.pki.rsa.generateKeyPair({bits: 2048}, (err, keys) => {
          if (err) {
            reject(err);
            return;
          }

          let certificate = forge.pki.createCertificate();
          let {privateKey} = keys;

          certificate.publicKey = keys.publicKey;
          certificate.serialNumber = crypto.randomBytes(8).toString('hex');
          certificate.validity.notBefore = new Date();
          certificate.validity.notAfter = new Date();
          certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + 2);

          certificate.setSubject(this.tlsIssuer);
          certificate.setIssuer(this.tlsIssuer);
          certificate.setExtensions(this.tlsExtensions);

          if(this.onRootCAGeneration) {
            let rootCACallback = this.onRootCAGeneration(certificate, privateKey);

            if(typeof rootCACallback === 'object') {
              certificate = typeof rootCACallback.certificate !== 'undefined' ? rootCACallback.certificate : certificate;
              privateKey = typeof rootCACallback.privateKey !== 'undefined' ? rootCACallback.privateKey : privateKey;
            }
          }

          try {
            certificate.sign(privateKey, forge.md.sha256.create());

            let certPEM = forge.pki.certificateToPem(certificate);
            let privateKeyPEM = forge.pki.privateKeyToPem(privateKey);
            let publicKeyPEM = forge.pki.publicKeyToPem(keys.publicKey);

            this.emit('new_root_certificate', certPEM, privateKeyPEM, publicKeyPEM);

            fs.writeFileSync(path(this.tmpDir, 'ca.pem'), certPEM);
            fs.writeFileSync(path(this.tmpDir, 'ca_pri.pem'), privateKeyPEM);
            fs.writeFileSync(path(this.tmpDir, 'ca_pub.pem'), publicKeyPEM);
          } catch(e) {
            reject(e);
            return;
          }

          this.debug('ROOTCA: [none]');
          this._cachedPrivateKey = privateKey;

          resolve(this._cachedPrivateKey);
        });
      } else {
        try {
          let privKey = path(this.tmpDir, 'ca_pri.pem');

          this.debug(`ROOTCA: ${privKey}`);
          this._cachedPrivateKey = forge.pki.privateKeyFromPem(fs.readFileSync(privKey));
        } catch(e) {
          reject(e);
          return;
        }

        resolve(this._cachedPrivateKey);
      }
    });
  }

  set certificatePEM(contents) {
    this.debug('ca.pem is being overwritten, but this will not take effect in the instantiated class');
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
    this.debug('ca_pri.pem is being overwritten, but this will not take effect in the instantiated class');
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
    this.debug('ca_pub.pem is being overwritten, but this will not take effect in the instantiated class');
    fs.writeFileSync(path(this.tmpDir, 'ca_pub.pem'), contents);
  }

  get publicKeyPEM() {
    try {
      return fs.readFileSync(path(this.tmpDir, 'ca_pub.pem'), 'utf8');
    } catch(e) {
      return false;
    }
  }

  _generateServerKeys(serverUrl, serverCert) {
    return new Promise((resolve, reject) => {
      forge.pki.rsa.generateKeyPair({bits: 1024}, (err, keys) => {
        if (err) {
          reject(err);
          return;
        }

        let certificate = forge.pki.createCertificate();
        let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
        let {privateKey} = keys;

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

        let signingKey = this._cachedPrivateKey;

        if(this.onServerKeyGeneration) {
          let callback = this.onServerKeyGeneration(hostIdentifier, certificate, privateKey, signingKey);

          if(typeof callback === 'object') {
            certificate = typeof callback.certificate !== 'undefined' ? callback.certificate : certificate;
            privateKey = typeof callback.privateKey !== 'undefined' ? callback.privateKey : privateKey;
            signingKey = typeof callback.signingKey !== 'undefined' ? callback.signingKey : signingKey;
          }
        }

        try {
          certificate.sign(signingKey, forge.md.sha256.create());

          let certPEM = forge.pki.certificateToPem(certificate);
          let privateKeyPEM = forge.pki.privateKeyToPem(privateKey);
          let publicKeyPEM = forge.pki.publicKeyToPem(keys.publicKey);

          this.emit('new_server_keys', hostIdentifier, certPEM, privateKeyPEM, publicKeyPEM);

          fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'), certPEM);
          fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'), privateKeyPEM);
          fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'), publicKeyPEM);
        } catch(e) {
          reject(e);
          return;
        }

        resolve(true);
      });
    });
  }

  _getHTTPSCertificate(serverUrl) {
    return new Promise((resolve, reject) => {
      let expiration = 0;
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
      let pemPath = path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem');

      let pemExists = fs.existsSync(pemPath);
      let publicKeyExists = fs.existsSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'));
      let privateKeyExists = fs.existsSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'));

      try {
        expiration = fs.statSync(pemPath).ctime;
        expiration.setFullYear(expiration.getFullYear() + 2);
      } catch(e) {}

      if (!pemExists || !publicKeyExists || !privateKeyExists || expiration.getTime() <= new Date().getTime()) {

        let socket = tls.connect(
          {
            host: serverUrl.hostname,
            port: serverUrl.port,
            rejectUnauthorized: this.rejectUnauthorized,
            timeout: this.timeout
          }, async () => {
            let serverCert = socket.getPeerCertificate();
            socket.end();

            try {
              await this._generateServerKeys(serverUrl, serverCert);
            } catch(e) {
              reject(e);
            }
          }
        );

        socket.on('error', async () => {
          //we assume we can't connect to get it (localhost:port?) so generate one anyway

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

          try {
            await this._generateServerKeys(serverUrl, serverCert);
          } catch(e) {
            reject(e);
          }
        });
      } else {
        resolve(true);
      }
    });
  }

  _setupHttpServer(serverUrl) {
    return new Promise(async (resolve, reject) => {
      let isHTTPS = serverUrl.protocol === 'https:';
      let hostnameSHA256 = this._cachedHostsHash[`${serverUrl.hostname}:${serverUrl.port}`];
      let serverName = (isHTTPS ? 't:' : 'h:') + hostnameSHA256; //TLS vs HTTP

      if (serverName in this._cachedServersList) {
        resolve(this._cachedServersList[serverName]);
        return;
      }

      let options = {};

      if(isHTTPS) {
        try {
          await this._getHTTPSCertificate(serverUrl);

          options.key = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8');
          options.cert = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}.pem`), 'utf8');
        } catch(e) {
          reject(e);
          return;
        }
      }

      let proxy = (isHTTPS ? https : http).createServer(options);
      let prefix = isHTTPS ? 'https://' : 'http://';

      proxy.on('connect', (req, socket, head) => {
        req.url = prefix + this._fixRequestUrl(req.url, serverUrl);
        this.onConnect(req, socket, head);
      });

      proxy.on('upgrade', (req, socket, head) => {
        req.url = prefix + this._fixRequestUrl(req.url, serverUrl);
        if(this.onUpgrade) this.onUpgrade(req, socket, head, options);
      });

      proxy.on('request', (req, res) => {
        req.url = prefix + this._fixRequestUrl(req.url, serverUrl);
        this.onRequest(req, res);
      });

      proxy.on('close', () => {
        this.emit('close_sub', proxy, serverUrl);
        delete this._cachedServersList[serverName];
      });

      proxy.on('clientError', (err, socket) => {
        this.onError(err);
        socket.end(this._writeErrorPage(err));
      });

      this.emit('listen_pre_sub', proxy, serverUrl);

      proxy.listen(() => {
        let {address, port} = proxy.address();
        this.emit('listen_post_sub', proxy, serverUrl, address, port);

        this._cachedServersList[serverName] = proxy;

        this.debug(`CONNECT: [${isHTTPS ? 'HTTPS' : 'HTTP'}] ${serverUrl.hostname}:${serverUrl.port} <-> ${address === '::' ? oshostn : address}:${port}`);

        resolve(proxy);
      });
    });
  }

  async onConnect(request, clientSocket, head) {
    request.pause();

    let isHTTPS = this.connectionIsHttps(request, clientSocket, head);
    let parsedUrl = parse(`${isHTTPS ? 'https://' : 'http://'}${request.url}`);
    let hostIdentifier = `${parsedUrl.hostname}:${parsedUrl.port}`;

    if (!(hostIdentifier in this._cachedHostsHash)) {
      this._cachedHostsHash[hostIdentifier] = crypto.createHash('SHA256').update(hostIdentifier).digest('hex').substr(0, 32);
    }

    try {
      let server = await this._setupHttpServer(parsedUrl);
      let {address, port} = server.address();

      let serverSocket = connect(port, address, () => {
        clientSocket.write(`HTTP/${request.httpVersion} 200 Connection Established\r\n` +
                           `Proxy-Agent: ${this.name}/${this.version}\r\n\r\n`);

        serverSocket.write(head);
        serverSocket.pipe(clientSocket).pipe(serverSocket);
        request.resume();
      });
    } catch(e) {
      this.onError(e);
      request.resume();
    }
  }

  _writeErrorPage(error) {
    let stack = error.stack.split('\n').join('<br/>\r\n').split(' ').join('&nbsp;');

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

    this.debug(`wrote error page (${error.message})`);

    return contents;
  }

  responseData(queuePosition, chunk) {
    this.emit('response_data', queuePosition, chunk);

    if(this.onResponseData) {
      chunk = this.onResponseData(queuePosition, chunk);
    }

    return chunk;
  }

  responseEnd(queuePosition, chunk) {
    this.emit('response_end', queuePosition, chunk);

    if(this.onResponseEnd) {
      chunk = this.onResponseEnd(queuePosition, chunk);
    }

    this.requestQueue--;
    return chunk;
  }

  _curlRequest(method, url, httpVersion, headers, postField, clientResponse, queuePosition) {
    let curl = new libcurl();
    let closeConnection = curl.close.bind(curl);

    curl.enable(libcurl.feature.NO_DATA_PARSING);
    curl.enable(libcurl.feature.NO_DATA_STORAGE);
    curl.enable(libcurl.feature.NO_HEADER_STORAGE);

    //set proxy & config options
    if (this.useUpstreamProxy) {
      curl.setOpt(libcurl.option.PROXY, this.proxyUrl);
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
        this.emit('response_headers', queuePosition, code, reason, _headers);

        if(this.onResponseHeaders) {
          let respHeaders = this.onResponseHeaders(queuePosition, code, reason, _headers);
          if(typeof respHeaders === 'object') {
            code = typeof respHeaders.code === 'number' ? respHeaders.code : code;
            reason = typeof respHeaders.reason === 'string' ? respHeaders.reason : reason;
            _headers = typeof respHeaders.headers === 'object' ? respHeaders.headers : _headers;
          }
        }

        clientResponse.writeHead(code, reason, _headers);
        return;
      }

      let firstLine = _chunkString.match(/HTTP/);

      if (firstLine !== null && firstLine.index === 0) {
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

    curl.on('data', c => clientResponse.write(this.responseData(queuePosition, c)));
    curl.on('end', () => clientResponse.end(this.responseEnd(queuePosition, null)));

    curl.on('error', (error) => {
      this.onError(error);
      clientResponse.end(this._writeErrorPage(error));
      closeConnection();

      this.requestQueue--;
    });

    curl.perform();
  }

  onRequest(clientRequest, clientResponse) {
    clientRequest.pause();

    let queuePosition = this.requestQueue++;
    let {method, url, httpVersion, rawHeaders} = clientRequest;

    let handlerMatch = url.match(/http:\/\/me\//);
    if (handlerMatch !== null && handlerMatch.index === 0 && typeof this.requestHandler === 'function') {
      return this.requestHandler(clientRequest, clientResponse);
    }

    if(this.useCurl) {
      this.debug(`REQUEST: [CURL:${queuePosition}] [${method}] ${url} [HTTP/${httpVersion}]`);

      let _buf = [], _size = 0;

      clientRequest.on('data', c => {
        _buf.push(c);
        _size += c.length;
      });

      clientRequest.on('end', () => {
        let header_name = '', header_val = '', _headers = [];

        for (let i = 0; i < rawHeaders.length; i += 2) {
          header_name = rawHeaders[i];
          header_val = rawHeaders[i + 1];

          if (header_name.toLowerCase().match(/proxy-/))
            continue;

          if (header_name.toLowerCase() === 'connection' && this.eraseConnectionHeader)
            header_val = '_';

          _headers.push(`${header_name}: ${header_val}`);
        }

        let _postField = _size !== 0 ? Buffer.concat(_buf, _size).toString('utf8') : '';
        _buf = [], _size = 0;

        this.emit('request_new_curl', queuePosition, method, url, httpVersion, _headers, _postField);

        if(this.onRequestCurl) {
          let callback = this.onRequestCurl(queuePosition, method, url, httpVersion, _headers, _postField);
          if(typeof callback === 'object') {
            method = typeof callback.method === 'string' ? callback.method : method;
            url = typeof callback.url === 'string' ? callback.url : url;
            httpVersion = typeof callback.httpVersion === 'string' ? callback.httpVersion : httpVersion;
            _headers = typeof callback.headers === 'object' ? callback.headers : _headers;
            _postField = typeof callback.postField === 'string' ? callback.postField : _postField;
          }
        }

        this._curlRequest(method, url, httpVersion, _headers, _postField, clientResponse, queuePosition);
      });

    } else {
      let debugNote = `REQUEST: [NODE:${queuePosition}] [${method}] ${url} [HTTP/${httpVersion}]`;

      let options = Object.assign({
        headers: this._getRawHeaderObj(rawHeaders),
        method: method,
        rejectUnauthorized: this.rejectUnauthorized,
        port: 80
      }, parse(url));

      let tunnelagent = false;
      let isTLS = options.protocol === 'https:';

      if(this.useUpstreamProxy && tunnel !== null) {
        let proxyUrlParsed = parse(this.proxyUrl);
        let proxyIsHttp = proxyUrlParsed.protocol === 'http:';
        let proxyIsHttps = proxyUrlParsed.protcol === 'https:';

        if((proxyIsHttp || proxyIsHttps) && typeof proxyUrlParsed.port !== 'undefined') {
          let tunneloptions = {
            proxy: {
              host: proxyUrlParsed.hostname,
              port: proxyUrlParsed.port,
              headers: {
                'User-Agent': `${this.name}/${this.version}`
              }
            },
            rejectUnauthorized: this.rejectUnauthorized
          }

          if(proxyUrlParsed.auth !== null) {
            tunneloptions.proxyAuth = proxyUrlParsed.auth;
          }

          if(isTLS) {
            let hostnameSHA256 = this._cachedHostsHash[`${options.hostname}:${options.port}`];

            tunneloptions.key = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8');
            tunneloptions.cert = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}.pem`), 'utf8');
          }

          if(proxyIsHttps) {
            tunnelagent = (isTLS ? tunnel.httpsOverHttps : tunnel.httpOverHttps)(tunneloptions);
          } else {
            tunnelagent = (isTLS ? tunnel.httpsOverHttp : tunnel.httpOverHttp)(tunneloptions);
          }

          debugNote += ` > [${proxyUrlParsed.hostname}:${proxyUrlParsed.port} CONNECT ${options.hostname}:${options.port}]`;
        }
      }

      if(this.eraseConnectionHeader) {
        options.headers['Connection'] = '_';
      }

      options.agent = tunnelagent;

      this.debug(debugNote);
      this.emit('request_new_node', queuePosition, options);

      if(this.onRequestNode) {
        let reqCallback = this.onRequestNode(queuePosition, options);
        if(typeof reqCallback === 'object') {
          options = reqCallback;
        }
      }

      let connector = (isTLS ? https : http).request(options, serverResponse => {
        serverResponse.pause();

        let code = serverResponse.statusCode;
        let reason = serverResponse.statusMessage;
        let headers = this._getRawHeaderObj(serverResponse.rawHeaders);

        if(this.onResponseHeaders) {
          this.emit('response_headers', queuePosition, code, reason, headers);

          let callback = this.onResponseHeaders(queuePosition, code, reason, headers);
          if(typeof callback === 'object') {
            code = typeof callback.code === 'number' ? callback.code : code;
            reason = typeof callback.reason === 'string' ? callback.reason : reason;
            headers = typeof callback.headers === 'object' ? callback.headers : headers;
          }
        }

        clientResponse.writeHead(code, reason, headers);

        clientResponse.on('error', err => {
          this.debug(`clientResponse error: ${err.message}`);
          this.onError(err);

          clientResponse.end(this._writeErrorPage(err));
          this.requestQueue--;
        });

        serverResponse.on('error', err => {
          this.debug(`serverResponse error: ${err.message}`);
          this.onError(err);

          clientResponse.end(this._writeErrorPage(err));
          this.requestQueue--;
        });

        serverResponse.on('data', c => clientResponse.write(this.responseData(queuePosition, c)));
        serverResponse.on('end', c => clientResponse.end(this.responseEnd(queuePosition, c)));

        serverResponse.resume();
      }).on('error', err => {
        this.debug(`connector error: ${err.message}`);
        this.onError(err);

        clientResponse.end(this._writeErrorPage(err));
        this.requestQueue--;
      });

      clientRequest.on('data', c => {
        this.emit('request_data', queuePosition, c);

        if(this.onRequestData) c = this.onRequestData(queuePosition, c);
        connector.write(c);
      });

      clientRequest.on('end', c => {
        this.emit('request_end', queuePosition, c);

        if(this.onRequestEnd) c = this.onRequestEnd(queuePosition, c);
        connector.end(c);
      });
    }

    clientRequest.on('error', error => {
      this.onError(error);
      clientResponse.end(this._writeErrorPage(error));
      this.requestQueue--;
    });

    clientRequest.resume();
  }

  onError(err) {
    this.emit('error', err);
  }

  upstreamUrlValid(url) {
    let testParse = parse(url);
    let supportedProtocols = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'];

    return !(testParse.hostname === null ||
             testParse.slashes === false ||
             supportedProtocols.indexOf(testParse.protocol) === -1 ||
             isNaN(Number(testParse.port))
            );
  }

  async listen(newRootCertificate=false) {
    if (this.useUpstreamProxy && !this.upstreamUrlValid(this.proxyUrl)) {
      this.onError(new Error('The configured upstream URL is invalid. Please specify a URL starting with http://, https://, socks4://, socks5:// etc.'));
      return false;
    }

    this.emit('listen_pre', this._proxy);

    try {
      await this.cacheNewCA(newRootCertificate);

      if(typeof this.port !== 'number' || (typeof this.port === 'number' && (this.port < 0 || this.port > 0xFFFF))) {
        this.debug(`invalid port: [${typeof this.port} ${this.port}], set to random port`);
        this.port = 0;
      }

      this._proxy.listen(this.port, this.hostname, () => {
        this.port = this.port === 0 ? this._proxy.address().port : this.port;

        this.debug(`LISTEN: ${this.hostname}:${this.port}`);
        this.listening = true;

        this.emit('listen_post', this._proxy);
      });

    } catch(e) {
      this.onError(e);
      return false;
    }

    return true;
  }

  end() {
    try {
      Object.keys(this._cachedServersList).forEach(key => {
        let {address, port} = this._cachedServersList[key].address();

        this.debug(`CLOSE: ${address === '::' ? oshostn : address}:${port}`);
        this._cachedServersList[key].close(() => {
          delete this._cachedServersList[key];
        });
      });
    } catch(e) {
      this.onError(e);
    }

    this._cachedServersList = {};

    this.debug(`CLOSE: ${this.hostname}:${this.port}`);
    this._proxy.close(() => {
      this.listening = false;
      this.emit('close');
    });
  }
}
