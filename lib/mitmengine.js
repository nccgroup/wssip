/*
  Credit to https://github.com/joeferner/node-http-mitm-proxy
  for a lot of the base structure, CONNECT handling, X509 signing, etc.
*/

const {connect}       = require('net'),
      crypto          = require('crypto'),
      {EventEmitter}  = require('events'),
      forge           = require('node-forge'),
      fs              = require('fs'),
      http            = require('http'),
      https           = require('https'),
      {parse}         = require('url'),
      path            = require('path').join,
      tls             = require('tls'),
      tmpdir          = require('os').tmpdir(),
      pkgVersion      = require(path(__dirname, '..', 'package.json')).version;

let debug, tunnel, libcurl,
    curlEnabled = true;

try {
  debug = require('debug');
} catch(e) {
  debug = () => () => {};
}

try {
  libcurl = require('node-libcurl').Curl;
} catch(e) {
  libcurl = null;
  curlEnabled = false;

  try {
    tunnel = require('tunnel-agent');
  } catch(e) {
    tunnel = null;
  }
}

//thank you http-mitm-proxy for X.509 signing defaults
const SSLTLS_EXTENSIONS = [
  {
    name: 'basicConstraints',
    cA: true
  },
  {
    name: 'keyUsage',
    keyCertSign: true,
    digitalSignature: true,
    nonRepudiation: true,
    keyEncipherment: true,
    dataEncipherment: true
  },
  {
    name: 'extKeyUsage',
    serverAuth: true,
    clientAuth: true,
    codeSigning: true,
    emailProtection: true,
    timeStamping: true
  },
  {
    name: 'nsCertType',
    client: true,
    server: true,
    email: true,
    objsign: true,
    sslCA: true,
    emailCA: true,
    objCA: true
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
    value: 'mitm'
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
    value: 'wssipMitmengine'
  }
];

module.exports = class mitmengine extends EventEmitter {

  constructor (options = {}, createTempDir = true) {
    super();
    this.setOptions(options);

    if (createTempDir) {
      this._makeNewTempDir(createTempDir)
        .then(() => {})
        .catch(e => {});
      //auto-handle by error event
    }
  }

  setOptions (options = {}) {

    options = Object.assign({
      hostname: this.hostname || 'localhost',
      port: this.port || 0,
      useHTTPS: this.useHTTPS || false,

      uaId: this.uaId || `wssip_mitmengine/${pkgVersion}`,
      debugName: this.debugName || 'mitmengine',
      useCurl: this.useCurl || curlEnabled,

      useUpstreamProxy: this.useUpstreamProxy || false,
      proxyUrl: this.proxyUrl || '',

      timeout: this.timeout || 0,
      rejectUnauthorized: this.rejectUnauthorized || false,
      tmpDir: this.tmpDir || path(tmpdir, '.mitm-cache'),

      requestHandler: this.requestHandler || false,

      tlsDefaultExtensions: this.tlsExtensions || SSLTLS_EXTENSIONS,
      tlsDefaultServerExtensions: this.tlsServerExtensions || SSLTLS_SERVER_EXTENSIONS,
      tlsDefaultIssuer: this.tlsIssuer || SSLTLS_ISSUER,

      eraseConnectionHeader: this.eraseConnectionHeader || false,

      onRequestCurl: this.onRequestCurl || false,
      onRequestNode: this.onRequestNode || false,
      onRequestData: this.onRequestData || false,
      onRequestEnd: this.onRequestEnd || false,
      onResponseHeaders: this.onResponseHeaders || false,
      onResponseData: this.onResponseData || false,
      onResponseEnd: this.onResponseEnd || false,
      onUpgrade: this.onUpgrade || false,
      onRootCAGeneration: this.onRootCAGeneration || false,
      onServerKeyGeneration: this.onServerKeyGeneration || false
    }, options);

    this.hostname = options.hostname;
    this.port = options.port;
    this.useHTTPS = options.useHTTPS;

    this.useUpstreamProxy = options.useUpstreamProxy;
    this.proxyUrl = options.proxyUrl;
    this.timeout = options.timeout;
    this.uaId = options.uaId;
    this.rejectUnauthorized = options.rejectUnauthorized;
    this.tmpDir = options.tmpDir;
    this.requestHandler = options.requestHandler;
    this.eraseConnectionHeader = options.eraseConnectionHeader;

    this.tlsExtensions = options.tlsDefaultExtensions;
    this.tlsServerExtensions = options.tlsDefaultServerExtensions;
    this.tlsIssuer = options.tlsDefaultIssuer;

    this.debugName = options.debugName;
    this.debug = debug(this.debugName);

    this._cachedHostsHash = {};
    this._cachedServersList = {};
    this._cachedPrivateKey = null;

    this.listening = false;
    this.requestQueue = 0;

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

    return true;
  }

  _setProxyTimeout(seconds) {
    if(typeof this._proxy !== 'undefined' && this._proxy != null) {
      this._proxy.timeout = seconds;
    }
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

  //pre-util.promisify wrappers
  _promisify(func, ...args) {
    return new Promise((resolve, reject) => {
      func(...args, (err = false, data = null) => {
        if(err) {
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
  }

  _makeNewTempDir(makeIfNotExists = true) {
    //TODO: cleanup
    return new Promise((resolve, reject) => {
      fs.access(this.tmpDir, fs.constants.R_OK | fs.constants.W_OK , accessError => {
        if(accessError) {
          if(accessError.code === 'ENOENT' && makeIfNotExists) {
            fs.mkdir(this.tmpDir, 0o766, mkdirError => {
              if(mkdirError) {
                this.onError('mitmengine#_makeNewTempDir', 'MKDIR_FAIL', mkdirError);
                reject(mkdirError);
              } else {
                fs.access(this.tmpDir, fs.constants.W_OK, writeError => {
                  if(writeError) {
                    this.onError('mitmengine#_makeNewTempDir', 'WRITE_ERROR', writeError);
                    reject(writeError);
                  } else {
                    resolve(true);
                  }
                });
              }
            });
          } else {
            this.onError('mitmengine#_makeNewTempDir', 'ACCESS_FAIL', accessError);
            reject(accessError);
          }
        } else {
          resolve(true);
        }
      });
    });
  }

  _cacheMasterKeys() {
    let tmpRootCAPEM = path(this.tmpDir, 'ca.pem');
    let expiration = 0;

    return this._promisify(fs.stat, tmpRootCAPEM)
    .catch(err => {
      if(err.code !== 'ENOENT') {
        this.onError('mitmengine#_cacheMasterKeys', 'STAT_CAPEM_ERROR', err);
        throw err;
      }

      return {'mtime': 0};
    })
    .then(stats => new Promise((resolve, reject) => {
      let expiration = stats.mtime;
      if (expiration !== 0) {
        expiration.setFullYear(expiration.getFullYear() + 2);
      }

      if (expiration === 0 || expiration.getTime() <= new Date().getTime()) {
        forge.pki.rsa.generateKeyPair({bits: 2048}, (err, keys) => {
          if (err) {
            this.onError('mitmengine#_cacheMasterKeys', 'KEY_GENERATION_FAIL', err);
            throw err;
            return;
          }

          let certificate = forge.pki.createCertificate();
          let {privateKey} = keys;

          certificate.publicKey = keys.publicKey;
          certificate.serialNumber = crypto.randomBytes(16).toString('hex').toUpperCase();
          certificate.validity.notBefore = new Date();
          certificate.validity.notBefore.setDate(certificate.validity.notBefore.getDate() - 1);
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

          certificate.sign(privateKey, forge.md.sha256.create());

          let certPEM = forge.pki.certificateToPem(certificate);
          let privateKeyPEM = forge.pki.privateKeyToPem(privateKey);
          let publicKeyPEM = forge.pki.publicKeyToPem(keys.publicKey);

          this.emit('new_root_certificate', certPEM, privateKeyPEM, publicKeyPEM);

          resolve([certPEM, privateKeyPEM, publicKeyPEM]);
        });
      } else {
        resolve(false);
      }
    }))
    .then(pemArray => {
      if(pemArray) {
        let writeOpt = {
          encoding: 'utf8',
          mode: 0o766,
          flag: 'w'
        },
        [certPEM, privateKeyPEM, publicKeyPEM] = pemArray;

        return Promise.all(
          this._promisify(fs.writeFile, path(this.tmpDir, 'ca.pem'), certPEM, writeOpt),
          this._promisify(fs.writeFile, path(this.tmpDir, 'ca_pri.pem'), privateKeyPEM, writeOpt),
          this._promisify(fs.writeFile, path(this.tmpDir, 'ca_pub.pem'), publicKeyPEM, writeOpt)
        ).then(() => {
          return Promise.resolve(privateKeyPEM);
        });
      } else {
        return this._promisify(
          fs.readFile,
          path(this.tmpDir, 'ca_pri.pem'),
          { encoding: 'utf8', flag: 'r' }
        );
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

  _isCertificateObject(cert) {
    return typeof cert === 'object' && ('CN' in cert || 'OU' in cert || 'C' in cert || 'ST' in cert || 'O' in cert || 'L' in cert || 'E' in cert);
  }

  _generateServerKeys(serverUrl, serverCert) {
    return this._promisify(forge.pki.rsa.generateKeyPair, {bits: 1024})
    .then(keys => {
      let certificate = forge.pki.createCertificate();
      let hostIdentifier = `${serverUrl.hostname}:${serverUrl.port}`;
      let {privateKey} = keys;

      certificate.publicKey = keys.publicKey;
      certificate.serialNumber = crypto.randomBytes(16).toString('hex').toUpperCase();
      certificate.validity.notBefore = new Date(serverCert.valid_from);
      certificate.validity.notAfter = new Date(serverCert.valid_to);

      if(this._isCertificateObject(serverCert.subject)) {
        let subject = [];

        Object.keys(serverCert.subject).forEach(shortName => {
          if(!(shortName == 'CN' || shortName == 'OU' || shortName == 'C' || shortName == 'ST' || shortName == 'O' || shortName == 'L' || shortName == 'E'))
            return;

          let value = serverCert.subject[shortName];

          if(value instanceof Array) {
            value.forEach(individualVal =>
              subject.push({
                shortName: shortName,
                value: individualVal
              })
            );
          } else {
            subject.push({
              shortName: shortName,
              value: value
            });
          }
        });

        serverCert.subject = subject;
      }

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
          signingKey = typeof callback.signingKey !== 'undefined' ? callback.signingKey : signingKey;
        }
      }

      certificate.sign(signingKey, forge.md.sha256.create());

      let certPEM = forge.pki.certificateToPem(certificate);
      let privateKeyPEM = forge.pki.privateKeyToPem(privateKey);
      let publicKeyPEM = forge.pki.publicKeyToPem(keys.publicKey);

      this.emit('new_server_keys', hostIdentifier, certPEM, privateKeyPEM, publicKeyPEM);

      return [this._getHostHash(hostIdentifier), certPEM, privateKeyPEM, publicKeyPEM];
    }).then(pemArray => {
      let [hash, certPEM, privateKeyPEM, publicKeyPEM] = pemArray;

      return Promise.all([
        this._promisify(fs.writeFile, path(this.tmpDir, `${hash}.pem`), certPEM),
        this._promisify(fs.writeFile, path(this.tmpDir, `${hash}_pri.pem`), privateKeyPEM),
        this._promisify(fs.writeFile, path(this.tmpDir, `${hash}_pub.pem`), publicKeyPEM)
      ]);
    });
  }

  _serverCertFilesExist(identifier) {
    return Promise.all([
      this._promisify(fs.stat, path(this.tmpDir, `${identifier}.pem`)),
      this._promisify(fs.stat, path(this.tmpDir, `${identifier}_pri.pem`)),
      this._promisify(fs.stat, path(this.tmpDir, `${identifier}_pub.pem`))
    ]).then(result => new Promise((resolve, reject) => {
      result.forEach(stat => {
        let expiration = stats.mtime;
        expiration.setFullYear(expiration.getFullYear() + 2);

        if(expiration.getTime() <= new Date().getTime()) {
          reject(false);
        } else {
          resolve(true);
        }
      });
    }));
  }

  _getHTTPSCertificate(serverUrl) {
    return new Promise((resolve, reject) => {
      let filenameIdentifier = this._getHostHash(`${serverUrl.hostname}:${serverUrl.port}`);

      this._serverCertFilesExist(filenameIdentifier)
        .then(result => resolve(true))
        .catch(err => {
          let socket = tls.connect(
            {
              host: serverUrl.hostname,
              port: serverUrl.port,
              rejectUnauthorized: this.rejectUnauthorized,
              timeout: this.timeout
            }, () => {
              let serverCert = socket.getPeerCertificate();
              socket.end();

              this._generateServerKeys(serverUrl, serverCert)
                .then(res => resolve(res))
                .catch(e => reject(e));
            }
          );

          socket.on('error', () => {
            //we assume we can't connect to get it (localhost:port?) so generate one anyway

            try {
              socket.end();
            } catch(e) {
              //nothing
            }

            let serverCert = {
              serialNumber: crypto.randomBytes(16).toString('hex').toUpperCase(),
              valid_from: new Date(),
              valid_to: new Date(),
              subject: this.tlsIssuer,
              subjectaltname: `URI:${serverUrl.hostname}`
            }

            serverCert.valid_to.setFullYear(serverCert.valid_to.getFullYear() + 2);

            this._generateServerKeys(serverUrl, serverCert)
              .then(res => resolve(true))
              .catch(e => reject(e));
          });
        });
    });
  }

  _setupHttpServer(serverUrl) {
    let isHTTPS = serverUrl.protocol === 'https:';
    let hostnameSHA256 = this._getHostHash(`${serverUrl.hostname}:${serverUrl.port}`);
    let serverName = (isHTTPS ? 't:' : 'h:') + hostnameSHA256; //TLS vs HTTP

    if(serverName in this._cachedServersList)
      return Promise.resolve(this._cachedServersList[serverName]);

    return (isHTTPS ?
      this._getHTTPSCertificate(serverUrl)
      .then(result => {
        return Promise.all([
          this._promisify(fs.readFile, path(this.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8'),
          this._promisify(fs.readFile, path(this.tmpDir, `${hostnameSHA256}.pem`), 'utf8')
        ]);
      })
    :
      Promise.resolve([])
    ).then(keyCert => {
      if(isHTTPS) {
        return https.createServer({
          key: keyCert[0],
          cert: keyCert[1]
        });
      }

      return http.createServer();
    })
    .then(proxy => {
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
        if(err.message.indexOf('no shared cipher') !== -1) {
          err.message = 'client did not negotiate shared ciphers properly';
        }

        this.onError('mitmengine#_setupHttpServer', `SUBPROXY_CLIENTERROR:${isHTTPS ? 't' : 'h'}:${serverUrl.hostname}:${serverUrl.port}`, err);
        socket.end(this._writeErrorPage(err));
      });

      proxy.on('error', (err) => {
        this.onError('mitmengine#_setupHttpServer', `SUBPROXY_ERROR:${isHTTPS ? 't' : 'h'}:${serverUrl.hostname}:${serverUrl.port}`, err);
      });

      return proxy;
    }).then(proxy => new Promise((resolve, reject) => {
      this.emit('listen_pre_sub', proxy, serverUrl);

      proxy.listen(() => {
        let {address, port} = proxy.address();
        this.emit('listen_post_sub', proxy, serverUrl, address, port);

        this._cachedServersList[serverName] = proxy;

        this.debug(`CONNECT: [${isHTTPS ? 'HTTPS' : 'HTTP'}] ${serverUrl.hostname}:${serverUrl.port} <-> ${address === '::' ? 'localhost' : address}:${port}`);
        resolve(proxy);
      });
    }));
  }

  onConnect(request, clientSocket, head) {
    if(!head || head.length === 0) {
      clientSocket.once('data', this.onConnectNext.bind(this, request, clientSocket));
      clientSocket.write(`HTTP/${request.httpVersion} 200 Connection Established\r\n` +
                         `Proxy-Agent: ${this.uaId}\r\n`);

      if('proxy-connection' in request.headers && request.headers['proxy-connection'].toLowerCase() === 'keep-alive') {
        clientSocket.write('Proxy-Connection: keep-alive\r\nConnection: keep-alive\r\n');
      }

      clientSocket.write('\r\n');
    } else {
      this.onConnectNext(request, clientSocket, head);
    }
  }

  onConnectNext(request, clientSocket, head) {
    request.pause();

    let isHTTPS = head[0] == 0x16 || head[0] == 0x80 || head[0] == 0x00;
    let parsedUrl = parse(`${isHTTPS ? 'https://' : 'http://'}${request.url}`);
    let hostIdentifier = `${parsedUrl.hostname}:${parsedUrl.port}`;

    this._setupHttpServer(parsedUrl)
      .then(resultingServer => {
        let serverSocket = connect(resultingServer.address().port, () => {
          serverSocket.pipe(clientSocket).pipe(serverSocket);
          clientSocket.emit('data', head);
          request.resume();
        });

        serverSocket.on('error', e => {
          if(e.message.indexOf('alert unknown ca') !== -1 || e.message.indexOf('SSL alert number 48') !== -1) {
            e.message = 'CA not imported into or trusted by client';
          } else if(e.message.indexOf('alert bad certificate') !== -1) {
            e.message = 'untrusted SSL/TLS certificate by server (may be known issue)';
          } else if(e.message.indexOf('no shared cipher') !== -1) {
            e.message = 'server cipher negotiation error';
          }

          this.onError('mitmengine#onConnectNext', `SERVERSOCKET_ERROR:${resultingServer.address().port}:${hostIdentifier}`, e);
          request.resume();
        });
      })
      .catch(e => {
        this.onError('mitmengine#onConnectNext', `SERVERSOCKET_SETUP_ERROR:${hostIdentifier}`, e);
        request.resume();
      });
  }

  _writeErrorPage (error) {
    let stack = error.stack.split('\n').join('<br/>\r\n').split(' ').join('&nbsp;');

    let contents = '<!doctype html>\n';
    contents += '<html>\n';
    contents += '<head>\n';
    contents += '<title>Proxy Error</title>\n';
    contents += '<meta charset="utf-8" />\n';
    contents += '</head>\n';
    contents += '<body>\n';
    contents += '<h3>Proxy Error</h3>\n';
    contents += '<p>' + stack + '</p>\n';
    contents += '</body>\n';
    contents += '</html>';

    return contents;
  }

  responseData (queuePosition, chunk) {
    this.emit('response_data', queuePosition, chunk);

    if(this.onResponseData) {
      chunk = this.onResponseData(queuePosition, chunk);
    }

    return chunk;
  }

  responseEnd (queuePosition, chunk) {
    this.emit('response_end', queuePosition, chunk);

    if(this.onResponseEnd) {
      chunk = this.onResponseEnd(queuePosition, chunk);
    }

    this.requestQueue--;
    return chunk;
  }

  _curlRequest (method, url, httpVersion, headers, postField, clientResponse, queuePosition) {
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

    curl.on('error', error => {
      this.onError('mitmengine#_curlRequest', 'CURL_REQUEST_ERROR', error);
      clientResponse.end(this._writeErrorPage(error));
      closeConnection();

      this.requestQueue--;
    });

    curl.perform();
  }

  _getHostHash(hostIdentifier) {
    if (!(hostIdentifier in this._cachedHostsHash)) {
      this._cachedHostsHash[hostIdentifier] = crypto.createHash('SHA256').update(hostIdentifier).digest('hex').substr(0, 32);
    }

    return this._cachedHostsHash[hostIdentifier];
  }

  async onRequest (clientRequest, clientResponse) {
    clientRequest.pause();

    let queuePosition = this.requestQueue++;
    let _buf = [], _size = 0;
    let {method, url, httpVersion, rawHeaders} = clientRequest;

    let handlerMatch = url.match(/http:\/\/mitm\//);
    if (handlerMatch !== null && handlerMatch.index === 0 && typeof this.requestHandler === 'function') {
      clientRequest.on('data', c => {
        _buf.push(c);
        _size += c.length;
      });

      clientRequest.on('end', () => {
        let data = _size !== 0 ? Buffer.concat(_buf, _size).toString('utf8') : '';
        _size = 0;

        this.requestHandler(clientRequest, clientResponse, data);
      });

      clientRequest.resume();
      return;
    }

    if(this.useCurl) {
      this.debug(`REQUEST: [CURL:${queuePosition}] [${method}] ${url} [HTTP/${httpVersion}]`);

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
        protocol: 'http:',
        headers: this._getRawHeaderObj(rawHeaders),
        method: method,
        rejectUnauthorized: this.rejectUnauthorized,
        port: 80,
        timeout: this.timeout
      }, parse(url));

      let tunnelagent = false;
      let isTLS = options.protocol === 'https:';

      if(this.useUpstreamProxy && tunnel !== null) {
        let proxyUrlParsed = Object.assign({ protocol: 'http:', port: 80 }, parse(this.proxyUrl));
        let proxyIsHttp = proxyUrlParsed.protocol === 'http:';
        let proxyIsHttps = proxyUrlParsed.protcol === 'https:';

        if(proxyIsHttp || proxyIsHttps) {
          let tunneloptions = {
            proxy: {
              host: proxyUrlParsed.hostname,
              port: proxyUrlParsed.port,
              headers: {
                'User-Agent': `${this.uaId}`
              }
            },
            rejectUnauthorized: this.rejectUnauthorized
          }

          if(proxyUrlParsed.auth !== null) {
            tunneloptions.proxyAuth = proxyUrlParsed.auth;
          }

          if(isTLS) {
            let hostnameSHA256 = this._getHostHash(`${options.hostname}:${options.port}`);

            tunneloptions.key = await this._promisify(fs.readFile, path(this.tmpDir, `${hostnameSHA256}_pri.pem`), 'utf8');
            tunneloptions.cert = await this._promisify(fs.readFile, path(this.tmpDir, `${hostnameSHA256}.pem`), 'utf8');
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
	let rawHead = serverResponse.rawHeaders;
	for (let i = rawHead.length-1; i>=0; i--) {
	  rawHead[i] = rawHead[i].replace(/[^\x20-\x7E]/g, '').replace(/[\s]/g, '%20');
	}
        let headers = this._getRawHeaderObj(rawHead);

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
          this.onError('mitmengine#onRequest', 'CLIENTRESPONSE_ERROR', err);

          clientResponse.end(this._writeErrorPage(err));
          this.requestQueue--;
        });

        serverResponse.on('error', err => {
          this.debug(`serverResponse error: ${err.message}`);
          this.onError('mitmengine#onRequest', 'SERVERRESPONSE_ERROR', err);

          clientResponse.end(this._writeErrorPage(err));
          this.requestQueue--;
        });

        serverResponse.on('data', c => clientResponse.write(this.responseData(queuePosition, c)));
        serverResponse.on('end', c => clientResponse.end(this.responseEnd(queuePosition, c)));

        serverResponse.resume();
      }).on('error', err => {
        this.debug(`connector error: ${err.message}`);
        this.onError('mitmengine#onRequest', 'CONNECTOR_ERROR', err);

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
      this.onError('mitmengine#onRequest', 'CLIENTREQUEST_ERROR', error);
      clientResponse.end(this._writeErrorPage(error));
      this.requestQueue--;
    });

    clientRequest.resume();
  }

  onError (where, description, err) {
    this.debug('ERROR: [%s] [%s] [%s]', where, description, err.message);
    this.emit('error', where, description, err);
  }

  _upstreamValid (url) {
    let testParse = parse(url);
    let supportedProtocols = ['http:', 'https:', 'socks4:', 'socks4a:', 'socks5:', 'socks5h:'];

    return !(testParse.hostname === null ||
             testParse.slashes === false ||
             supportedProtocols.indexOf(testParse.protocol) === -1 ||
             isNaN(Number(testParse.port))
            );
  }

  _appendProxyListeners () {
    this._setProxyTimeout();

    this._proxy.on('connect', this.onConnect.bind(this));
    this._proxy.on('request', this.onRequest.bind(this));
    this._proxy.on('error', this.onError.bind(this, 'proxy#error', 'PROXY_ERROR'));

    this._proxy.on('clientError', (err, socket) => {
      if(err.message.indexOf('no shared cipher') !== -1) {
        err.message = 'client did not negotiate shared ciphers properly';
      }

      this.onError('proxy#clientError', 'clientError', err);
      socket.end(this._writeErrorPage(err));
    });
  }

  _createProxyServer () {
    if(this.useHTTPS) {
      return Promise.all([
        this._promisify(fs.readFile, path(this.tmpDir, 'ca.pem'), 'utf8'),
        this._promisify(fs.readFile, path(this.tmpDir, 'ca_pri.pem'), 'utf8')
      ]).then(certArray => {
        let [cert, key] = certArray;

        this._proxy = https.createServer({
          key: key,
          cert: cert,
          rejectUnauthorized: this.rejectUnauthorized
        });

        this._appendProxyListeners();
        return Promise.resolve(this._proxy);
      });
    }

    this._proxy = http.createServer();
    this._appendProxyListeners();
    return Promise.resolve(this._proxy);
  }

  _checkListenErrors () {
    if (this.listening) {
      let err = new Error('Proxy is already listening');
      this.onError('mitmengine#_checkListenErrors', 'PROXY_LISTENING', err);
      return err;
    }

    if (this.useUpstreamProxy && !this._upstreamValid(this.proxyUrl)) {
      let err = new Error('The configured upstream URL is invalid. Please specify a URL starting with http://, https://, socks4://, socks5:// etc.');
      this.onError('mitmengine#listen', 'PROXY_UPSTREAM_ERROR', err);
      return err;
    }

    if (typeof this.port !== 'number' || (typeof this.port === 'number' && (this.port < 0 || this.port > 0xFFFF))) {
      let err = new Error('The port number is invalid. Port must be 0-65535.');
      this.onError('mitmengine#listen', 'PROXY_PORT_ERROR', err);
      return err;
    }

    return true;
  }

  listen (newRootCertificate = false) {
    return this._cacheMasterKeys(newRootCertificate)
      .then(pemKey => {
        let err = this._checkListenErrors();

        if(err != true) {
          return Promise.reject(err);
        }

        this._cachedPrivateKey = forge.pki.privateKeyFromPem(pemKey);

        return this._createProxyServer();
      })
      .then(proxyRes => {
        this.emit('listen_pre', this._proxy);

        this._proxy.listen(this.port, this.hostname, () => {
          this.port = this.port === 0 ? this._proxy.address().port : this.port;

          this.debug(`LISTEN: ${this.hostname}:${this.port}`);
          this.listening = true;

          this.emit('listen_post', this._proxy);
        });
      });
  }

  end() {
    return new Promise((res, rej) => {
      let promiseChain = [];

      Object.keys(this._cachedServersList).forEach(key => {
        promiseChain.push(new Promise((resolve, reject) => {
          if(this._cachedServersList[key].listening) {
            let {address, port} = this._cachedServersList[key].address();
            this.debug(`CLOSE: ${address === '::' ? 'localhost' : address}:${port}`);

            this._cachedServersList[key].on('error', err => {
              this.onError('mitmengine#end', 'SUBPROXY_CLOSE_ERROR', err);
              reject(err);
            });

            this._cachedServersList[key].close(() => {
              delete this._cachedServersList[key];
              resolve(true);
            });
          } else {
            resolve(true);
            delete this._cachedServersList[key];
          }
        }));
      });

      Promise.all(promiseChain)
        .then(() => {
          this.debug(`CLOSE: ${this.hostname}:${this.port}`);
          this._proxy.close(() => {
            this.listening = false;
            this.emit('close');

            res(true);
          });
        })
        .catch(e => rej(e));
    });
  }
}
