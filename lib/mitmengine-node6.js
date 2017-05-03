'use strict';

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const { connect } = require('net'),
      crypto = require('crypto'),
      { EventEmitter } = require('events'),
      forge = require('node-forge'),
      fs = require('fs'),
      http = require('http'),
      https = require('https'),
      os = require('os'),
      oshostn = os.hostname(),
      //oshostn for debugging only
{ parse } = require('url'),
      path = require('path').join,
      tls = require('tls');

let debug,
    libcurl,
    tunnel,
    pkgVersion = '?',
    curlEnabled = true;

try {
  debug = require('debug');
} catch (e) {
  debug = () => () => {};
}

try {
  libcurl = require('node-libcurl').Curl;
} catch (e) {
  curlEnabled = false;

  try {
    tunnel = require('tunnel');
  } catch (e) {
    tunnel = null;
  }
}

try {
  let pkgUp = require('find-up').sync('package.json');
  pkgVersion = require(pkgUp).version;
} catch (e) {}

//thank you http-mitm-proxy for X.509 signing defaults
const SSLTLS_EXTENSIONS = [{
  name: 'basicConstraints',
  cA: true
}, {
  name: 'keyUsage',
  keyCertSign: false,
  digitalSignature: true,
  nonRepudiation: false,
  keyEncipherment: true,
  dataEncipherment: true
}, {
  name: 'extKeyUsage',
  serverAuth: true,
  clientAuth: true,
  codeSigning: false,
  emailProtection: false,
  timeStamping: false
}, {
  name: 'nsCertType',
  client: true,
  server: true,
  email: false,
  objsign: false,
  sslCA: false,
  emailCA: false,
  objCA: false
}, { name: 'subjectKeyIdentifier' }];

const SSLTLS_SERVER_EXTENSIONS = [{
  name: 'basicConstraints',
  cA: false
}, {
  name: 'keyUsage',
  keyCertSign: false,
  digitalSignature: true,
  nonRepudiation: false,
  keyEncipherment: true,
  dataEncipherment: true
}, {
  name: 'extKeyUsage',
  serverAuth: true,
  clientAuth: true,
  codeSigning: false,
  emailProtection: false,
  timeStamping: false
}, {
  name: 'nsCertType',
  client: true,
  server: true,
  email: false,
  objsign: false,
  sslCA: false,
  emailCA: false,
  objCA: false
}, {
  name: 'subjectKeyIdentifier'
}];

const SSLTLS_ISSUER = [{
  name: 'commonName',
  value: 'wssipmitmengine'
}, {
  name: 'countryName',
  value: 'US'
}, {
  shortName: 'ST',
  value: 'California'
}, {
  name: 'organizationName',
  value: 'NCC Group'
}, {
  shortName: 'OU',
  value: 'wssipmitmengine'
}];

module.exports = class mitmengine extends EventEmitter {

  constructor(options = {}) {
    var _this;

    _this = super();

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

      onRequestHeaders: false,
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
        this.debug(`Warning: node-libcurl isn't installed and neither is node-tunnel.`);
        this.debug(`Be advised that upstream proxy requests will not work as a result.`);
      }
    }

    _asyncToGenerator(function* () {
      return yield _this._makeNewTempDir();
    })();
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

        headerObj[rawHeaders[i]].push(rawHeaders[i + 1]);
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
    var _this2 = this;

    return new Promise((() => {
      var _ref2 = _asyncToGenerator(function* (resolve, reject) {
        if (deleteExisting) {
          try {
            fs.unlinkSync(_this2.tmpDir);
            yield _this2._makeNewTempDir();
          } catch (e) {
            reject(e);
            return;
          }
        }

        let tmpRootCAPEM = path(_this2.tmpDir, 'ca.pem');

        if (!fs.existsSync(tmpRootCAPEM)) {
          forge.pki.rsa.generateKeyPair({ bits: 2048 }, function (err, keys) {
            if (err) {
              reject(err);
              return;
            }

            let certificate = forge.pki.createCertificate();
            let { privateKey, publicKey } = keys;

            certificate.serialNumber = crypto.randomBytes(8).toString('hex');
            certificate.validity.notBefore = new Date();
            certificate.validity.notAfter = new Date();
            certificate.validity.notAfter.setFullYear(certificate.validity.notAfter.getFullYear() + 2);

            certificate.setSubject(_this2.tlsIssuer);
            certificate.setIssuer(_this2.tlsIssuer);
            certificate.setExtensions(_this2.tlsExtensions);

            let rootCACallback = _this2.onRootCAGeneration !== false ? _this2.onRootCAGeneration(certificate, privateKey, publicKey) : null;

            if (typeof rootCACallback === 'object') {
              certificate = typeof rootCACallback.certificate !== 'undefined' ? rootCACallback.certificate : certificate;
              privateKey = typeof rootCACallback.privateKey !== 'undefined' ? rootCACallback.privateKey : privateKey;
              publicKey = typeof rootCACallback.publicKey !== 'undefined' ? rootCACallback.publicKey : publicKey;
            }

            certificate.publicKey = publicKey;

            try {
              certificate.sign(privateKey, forge.md.sha256.create());
              _this2.emit('new_root_certificate', certificate, privateKey, publicKey);

              fs.writeFileSync(path(_this2.tmpDir, 'ca.pem'), forge.pki.certificateToPem(certificate));
              fs.writeFileSync(path(_this2.tmpDir, 'ca_pri.pem'), forge.pki.privateKeyToPem(privateKey));
              fs.writeFileSync(path(_this2.tmpDir, 'ca_pub.pem'), forge.pki.publicKeyToPem(publicKey));
            } catch (e) {
              reject(e);
              return;
            }

            _this2.debug('generated new CAs');
            _this2._cachedPrivateKey = privateKey;

            resolve(_this2._cachedPrivateKey);
          });
        } else {
          try {
            _this2.debug('caching existing private key from ca_pri.pem');
            _this2._cachedPrivateKey = forge.pki.privateKeyFromPem(fs.readFileSync(path(_this2.tmpDir, 'ca_pri.pem')));
          } catch (e) {
            reject(e);
            return;
          }

          resolve(_this2._cachedPrivateKey);
        }
      });

      return function (_x, _x2) {
        return _ref2.apply(this, arguments);
      };
    })());
  }

  set certificatePEM(contents) {
    this.debug('ca.pem is being overwritten, but this will not take effect in the instantiated class');
    fs.writeFileSync(path(this.tmpDir, 'ca.pem'), contents);
  }

  get certificatePEM() {
    try {
      return fs.readFileSync(path(this.tmpDir, 'ca.pem'), 'utf8');
    } catch (e) {
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
    } catch (e) {
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
    } catch (e) {
      return false;
    }
  }

  _generateServerKeys(serverUrl, serverCert, res, rej) {
    forge.pki.rsa.generateKeyPair({ bits: 1024 }, (err, keys) => {
      if (err) {
        rej(err);
        return;
      }

      let certificate = forge.pki.createCertificate();
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
      let { privateKey, publicKey } = keys;

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
        switch (individualNames[0]) {
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
      let callback = this.onServerKeyGeneration !== false ? this.onServerKeyGeneration(hostIdentifier, certificate, privateKey, publicKey, signingKey) : null;

      if (typeof callback === 'object') {
        certificate = typeof callback.certificate !== 'undefined' ? callback.certificate : certificate;
        privateKey = typeof callback.privateKey !== 'undefined' ? callback.privateKey : privateKey;
        publicKey = typeof callback.publicKey !== 'undefined' ? callback.publicKey : publicKey;
        signingKey = typeof callback.signingKey !== 'undefined' ? callback.signingKey : signingKey;
      }

      certificate.publicKey = publicKey;

      try {
        certificate.sign(signingKey, forge.md.sha256.create());

        this.emit('new_server_keys', hostIdentifier, certificate, privateKey, publicKey);

        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '.pem'), forge.pki.certificateToPem(certificate));
        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pri.pem'), forge.pki.privateKeyToPem(privateKey));
        fs.writeFileSync(path(this.tmpDir, this._cachedHostsHash[hostIdentifier] + '_pub.pem'), forge.pki.publicKeyToPem(publicKey));
      } catch (e) {
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

        let socket = tls.connect({
          host: serverUrl.hostname,
          port: serverUrl.port,
          rejectUnauthorized: false,
          timeout: this.timeout
        }, () => {
          let serverCert = socket.getPeerCertificate();
          socket.end();
          this._generateServerKeys(serverUrl, serverCert, resolve, reject);
        });

        socket.on('error', () => {
          try {
            socket.end();
          } catch (e) {
            //nothing
          }

          let serverCert = {
            serialNumber: crypto.randomBytes(8).toString('hex'),
            valid_from: new Date(),
            valid_to: new Date(),
            subject: this.tlsIssuer,
            subjectaltname: `URI:${serverUrl.hostname}`
          };

          serverCert.valid_to.setFullYear(serverCert.valid_to.getFullYear() + 2);

          this._generateServerKeys(serverUrl, serverCert, resolve, reject);
        });
      } else {
        resolve(true);
      }
    });
  }

  _setupHttpsServer(serverUrl) {
    var _this3 = this;

    return new Promise((() => {
      var _ref3 = _asyncToGenerator(function* (resolve, reject) {
        let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
        let hostnameSHA256 = _this3._cachedHostsHash[hostIdentifier];

        if (hostnameSHA256 in _this3._cachedServersList) {
          resolve(_this3._cachedServersList[hostnameSHA256]);
          return;
        }

        let result,
            httpsOptions = {};

        try {
          result = yield _this3._getHTTPSCertificate(serverUrl);

          httpsOptions.key = fs.readFileSync(path(_this3.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8');
          httpsOptions.cert = fs.readFileSync(path(_this3.tmpDir, `${hostnameSHA256}.pem`), 'utf8');
        } catch (e) {
          reject(e);
          return;
        }

        let httpsProxy = https.createServer(httpsOptions);

        httpsProxy.on('connect', function (req, socket, head) {
          req.url = 'https://' + _this3._fixRequestUrl(req.url, serverUrl);
          _this3.onConnect(req, socket, head);
        });

        httpsProxy.on('upgrade', function (req, socket, head) {
          req.url = 'https://' + _this3._fixRequestUrl(req.url, serverUrl);
          if (_this3.onUpgrade) _this3.onUpgrade(serverUrl, httpsOptions, req, socket, head);
        });

        httpsProxy.on('request', function (req, res) {
          req.url = 'https://' + _this3._fixRequestUrl(req.url, serverUrl);
          _this3.onRequest(req, res);
        });

        httpsProxy.on('close', function () {
          _this3.emit('close_sub', true, httpsProxy);
          delete _this3._cachedServersList[hostnameSHA256];
        });

        httpsProxy.on('clientError', function (err, socket) {
          _this3.onError(err);
          socket.end(_this3._writeErrorPage(err));
        });

        _this3.emit('listen_pre_sub', true, httpsProxy);
        httpsProxy.listen(function () {
          _this3.emit('listen_post_sub', true, httpsProxy);
        });

        _this3._cachedServersList[hostnameSHA256] = httpsProxy;

        let { address, port } = httpsProxy.address();
        _this3.debug(`CONNECT: [HTTPS] ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

        resolve(httpsProxy);
      });

      return function (_x3, _x4) {
        return _ref3.apply(this, arguments);
      };
    })());
  }

  _setupServer(httpsServer, request, clientSocket, head, hostIdentifier) {
    let { address, port } = httpsServer.address();

    connect(port, address, () => {
      clientSocket.write(`HTTP/${request.httpVersion} 200 Connection Established\r\n` + `Proxy-Agent: ${this.name}/${this.version}\r\n\r\n`);

      serverSocket.write(head);
      serverSocket.pipe(clientSocket).pipe(serverSocket);
    });
  }

  onConnect(request, clientSocket, head) {
    var _this4 = this;

    request.pause();

    let parsedUrl = parse(`http://${request.url}`);
    let hostIdentifier = `${parsedUrl.hostname}:${parsedUrl.port}`;

    if (!(hostIdentifier in this._cachedHostsHash)) {
      this._cachedHostsHash[hostIdentifier] = crypto.createHash('sha256').update(hostIdentifier).digest('hex').substr(0, 24);
    }

    if (head[0] == 0x16 || head[0] == 0x80 || head[0] == 0x00) {
      this.debug('---> is SSL/TLS');

      _asyncToGenerator(function* () {
        _this4._setupServer((yield _this4._setupHttpsServer(parsedUrl)), request, clientSocket, head, hostIdentifier);
      })();
    } else {
      let httpProxy = http.createServer();

      httpProxy.on('upgrade', (req, socket, head) => {
        req.url = 'http://' + this._fixRequestUrl(req.url, parsedUrl);

        if (this.onUpgrade) this.onUpgrade(serverUrl, {}, req, socket, head);
      });

      httpProxy.on('request', (req, res) => {
        req.url = 'http://' + this._fixRequestUrl(req.url, parsedUrl);
        this.onRequest(req, res);
      });

      httpProxy.on('close', () => {
        this.emit('close_sub', false, httpProxy);
        delete this._cachedServersList[hostnameSHA256];
      });

      httpProxy.on('clientError', (err, socket) => {
        this.onError(err);
        socket.end(this._writeErrorPage(err));
      });

      this.emit('listen_pre_sub', false, httpProxy);
      httpProxy.listen(() => {
        this.emit('listen_post_sub', false, httpProxy);
      });

      this._cachedServersList[this._cachedHostsHash[hostIdentifier]] = httpProxy;

      let { address, port } = httpProxy.address();
      this.debug(`CONNECT: [HTTP] ${hostIdentifier} <-> ${address === '::' ? oshostn : address}:${port}`);

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

    this.debug(`wrote error page (${error.message})`);

    return contents;
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

    if (httpVersion === '1.0') serveVersion = libcurl.http.VERSION_1_0;else if (httpVersion === '1.1') serveVersion = libcurl.http.VERSION_1_1;else if (httpVersion === '2.0') serveVersion = libcurl.http.VERSION_2_0;

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

    let code = 0,
        reason = '',
        _headers = {},
        _httpver = '',
        proxyHit = false;

    curl.on('header', c => {
      let _chunkString = c.toString('utf8').trim();

      if (this.useUpstreamProxy && !proxyHit && _chunkString === '') {
        proxyHit = true;
        return;
      }

      if (_chunkString === '' && code > 100) {
        this.emit('response_headers', queuePosition, code, reason, _headers, 'curl');

        if (this.onResponseHeaders) {
          let respHeaders = this.onResponseHeaders(queuePosition, code, reason, _headers, 'curl');
          if (typeof respHeaders === 'object') {
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

        if (_header_name in _headers) {
          if (typeof _headers[_header_name] === 'string') {
            let tmp = `${_headers[_header_name]}`;
            _headers[_header_name] = [tmp];
          }

          _headers[_header_name].push(_header_val);
        } else {
          _headers[_header_name] = _header_val;
        }
      }
    });

    curl.on('data', c => {
      this.emit('response_data', queuePosition, c, 'curl');
      if (this.onResponseData) c = this.onResponseData(queuePosition, c, 'curl');

      clientResponse.write(c);
    });

    curl.on('end', () => {
      this.emit('response_end', queuePosition, null, 'curl');
      clientResponse.end();
      closeConnection();

      this.requestQueue--;
    });

    curl.on('error', error => {
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
    let { method, url, httpVersion, rawHeaders } = clientRequest;

    let handlerMatch = url.match(/http:\/\/me\//);
    if (handlerMatch !== null && handlerMatch.index === 0 && typeof this.requestHandler === 'function') {
      return this.requestHandler(clientRequest, clientResponse);
    }

    if (this.useCurl) {
      this.debug(`REQUEST: [CURL] [${method}] ${url} [HTTP/${httpVersion}]`);

      let _buf = [],
          _size = 0;

      clientRequest.on('data', c => {
        _buf.push(c);
        _size += c.length;
      });

      clientRequest.on('end', () => {
        let header_name = '',
            header_val = '',
            _headers = [];

        for (let i = 0; i < rawHeaders.length; i += 2) {
          header_name = rawHeaders[i];
          header_val = rawHeaders[i + 1];

          if (header_name.toLowerCase().match(/proxy-/)) continue;

          if (header_name.toLowerCase() === 'connection' && this.eraseConnectionHeader) header_val = '_';

          _headers.push(`${header_name}: ${header_val}`);
        }

        let _postField = _size !== 0 ? Buffer.concat(_buf, _size).toString('utf8') : '';
        _buf = [], _size = 0;

        this.emit('request_new_curl', queuePosition, method, url, httpVersion, _headers, _postField);

        if (this.onRequestCurl) {
          let callback = this.onRequestCurl(queuePosition, method, url, httpVersion, _headers, _postField);
          if (typeof callback === 'object') {
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
      let debugNote = `REQUEST: [NODE] [${method}] ${url} [HTTP/${httpVersion}]`;

      let options = Object.assign({
        headers: this._getRawHeaderObj(rawHeaders),
        method: method,
        rejectUnauthorized: this.rejectUnauthorized
      }, parse(url));

      let tunnelagent = false;
      let isTLS = options.protocol === 'https:';

      if (this.useUpstreamProxy && tunnel !== null) {
        let proxyUrlParsed = parse(this.proxyUrl);
        let proxyIsHttp = proxyUrlParsed.protocol === 'http:';
        let proxyIsHttps = proxyUrlParsed.protcol === 'https:';

        if (proxyIsHttp || proxyIsHttps) {
          let tunneloptions = {
            proxy: {
              host: proxyUrlParsed.hostname,
              port: proxyUrlParsed.port,
              headers: {
                'User-Agent': `${this.name}/${this.version}`
              },
              rejectUnauthorized: this.rejectUnauthorized
            }
          };

          if (proxyUrlParsed.auth !== null) {
            tunneloptions.proxyAuth = proxyUrlParsed.auth;
          }

          if (isTLS) {
            let hostnameSHA256 = this._cachedHostsHash[`${options.hostname}:${options.port}`];

            tunneloptions.key = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8');
            tunneloptions.cert = fs.readFileSync(path(this.tmpDir, `${hostnameSHA256}.pem`), 'utf8');
          }

          if (proxyIsHttps) {
            tunnelagent = (isTLS ? tunnel.httpsOverHttps : tunnel.httpOverHttps)(tunneloptions);
          } else {
            tunnelagent = (isTLS ? tunnel.httpsOverHttp : tunnel.httpOverHttp)(tunneloptions);
          }

          debugNote += ` > [${proxyUrlParsed.hostname}:${proxyUrlParsed.port} CONNECT ${options.hostname}:${options.port}]`;
        }
      }

      if (this.eraseConnectionHeader) {
        options.headers['Connection'] = '_';
      }

      options.agent = tunnelagent;

      this.debug(debugNote);
      this.emit('request_new_node', queuePosition, options);

      if (this.onRequestNode) {
        let reqCallback = this.onRequestNode(queuePosition, options);
        if (typeof reqCallback === 'object') {
          options = reqCallback;
        }
      }

      let connector = (isTLS ? https : http).request(options, serverResponse => {
        serverResponse.pause();

        let code = serverResponse.statusCode;
        let reason = serverResponse.statusMessage;
        let headers = this._getRawHeaderObj(serverResponse.rawHeaders);

        if (this.onResponseHeaders) {
          this.emit('response_headers', queuePosition, code, reason, headers, 'node');

          let callback = this.onResponseHeaders(queuePosition, code, reason, headers, 'node');
          if (typeof callback === 'object') {
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

        serverResponse.on('data', c => {
          this.emit('response_data', queuePosition, c);
          if (this.onResponseData) c = this.onResponseData(queuePosition, c, 'node');
          clientResponse.write(c);
        });

        serverResponse.on('end', c => {
          this.emit('response_end', queuePosition, c);
          if (this.onResponseEnd) c = this.onResponseEnd(queuePosition, c, 'curl');
          clientResponse.end(c);
        });

        serverResponse.resume();
      }).on('error', err => {
        this.debug(`connector error: ${err.message}`);
        this.onError(err);

        clientResponse.end(this._writeErrorPage(err));
        this.requestQueue--;
      });

      clientRequest.on('data', c => {
        this.emit('request_data', queuePosition, c);

        if (this.onRequestData) c = this.onRequestData(queuePosition, c);
        connector.write(c);
      });

      clientRequest.on('end', c => {
        this.emit('request_end', queuePosition, c);

        if (this.onRequestEnd) c = this.onRequestEnd(queuePosition, c);
        connector.end(c);

        this.requestQueue--;
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

    return !(testParse.hostname === null || testParse.slashes === false || supportedProtocols.indexOf(testParse.protocol) === -1 || isNaN(Number(testParse.port)));
  }

  listen(newRootCertificate = false) {
    var _this5 = this;

    if (this.useUpstreamProxy && !this.upstreamUrlValid(this.proxyUrl)) {
      this.onError(new Error('The configured upstream URL is invalid. Please specify a URL starting with http://, https://, socks4://, socks5:// etc.'));
      return false;
    }

    this.emit('listen_pre', this._proxy);

    try {
      _asyncToGenerator(function* () {
        return yield _this5.cacheNewCA(newRootCertificate);
      })();

      if (typeof this.port !== 'number' || typeof this.port === 'number' && (this.port < 0 || this.port > 0xFFFF)) {
        this.debug(`invalid port: [${typeof this.port} ${this.port}], set to random port`);
        this.port = 0;
      }

      this._proxy.listen(this.port, this.hostname, () => {
        this.port = this.port === 0 ? this._proxy.address().port : this.port;

        this.debug(`LISTEN: ${this.hostname}:${this.port}`);
        this.listening = true;

        this.emit('listen_post', this._proxy);
      });
    } catch (e) {
      this.onError(e);
      return false;
    }

    return true;
  }

  end() {
    try {
      Object.keys(this._cachedServersList).forEach(key => {
        let { address, port } = this._cachedServersList[key].address();

        this.debug(`CLOSE: ${address === '::' ? oshostn : address}:${port}`);
        this._cachedServersList[key].close(() => {
          delete this._cachedServersList[key];
        });
      });
    } catch (e) {
      this.onError(e);
    }

    this._cachedServersList = {};

    this.debug(`CLOSE: ${this.hostname}:${this.port}`);
    this._proxy.close(() => {
      this.listening = false;
      this.emit('close');
    });
  }
};
