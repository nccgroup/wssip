const {app, Menu, ipcMain} = require('electron'),
      mitmengine           = require('mitmengine'),
      WebSocket            = require('ws'),
      conf                 = require('conf'),
      events               = require('events'),
      path                 = require('path'),
      fs                   = require('fs'),
      {name, version}      = require(path.join(__dirname, '..', 'package.json')),
      argv                 = require('./argv')(version),
      url                  = require('url'),
      menuBuilder          = require('./menu'),
      debug                = require('./debug')(`${name}:wsproxy`),

      config               = new conf({
        cwd: argv.tmp,
        configName: 'preferences',
        projectName: name
      }),

      ifExists             = (me, def) => (typeof me === 'undefined' ? def : me),
      ifNotSet             = (me, def) => (me === false ? def : me);

if (typeof app === 'undefined') {
  console.error(`Please use the 'wssip' (or 'electron') command to start this application instead of 'node'.`);
  process.exit(1);
}

module.exports = class WebSocketProxy {

  constructor(browserWindow) {
    this.tmpDir = path.join(argv.tmp, 'certstore');

    this.id = -1;
    this.mitmInst = new mitmengine({
      debugName: `${name}:mitmengine`,
      name: `${name}_mitmengine`,
      version: version, //package.json
      tmpDir: this.tmpDir
    });

    this.BrowserWindow = browserWindow;
    this.connections = {};

    this.connection = this.connection.bind(this);
    this.addWebSocket = this.addWebSocket.bind(this);
    this.request = this.request.bind(this);
  }

  addWebSocket(httpProxy) {
    new WebSocket.Server({
      server: httpProxy,
      rejectUnauthorized: ifExists(argv.rejectUnauthorized, config.get('rejectUnauthorized')),
      perMessageDeflate: (argv.disableDeflate ? true : config.get('perMessageDeflate'))
    }).on('connection', this.connection);
  }

  start() {
    delete this.mitmInst;

    let options = {
      debugName: `${name}:mitmengine`,
      uaId: `${name}_mitmengine/${version}`, //package.json
      hostname: ifExists(argv.h, config.get('proxyHost')),
      port: ifExists(argv.p, config.get('proxyPort')),
      tmpDir: this.tmpDir,
      useUpstreamProxy: typeof argv.u !== 'undefined' || config.get('useUpstreamProxy') === true,
      proxyUrl: typeof argv.u === 'undefined' ? config.get('upstreamUrl') : argv.u,
      timeout: ifExists(argv.t, config.get('timeout')),
      rejectUnauthorized: ifNotSet(argv.rejectUnauthorized, config.get('rejectUnauthorized'))
      requestHandler: this.request
    }

    this.mitmInst = new mitmengine(options);
    this.mitmInst.on('listen_pre', this.addWebSocket);
    this.mitmInst.on('listen_pre_sub', this.addWebSocket);

    this.mitmInst.on('listen_post', (proxy) => {
      let title = `WSSiP/${version} - listening on `;
      title += options.hostname + `:${this.mitmInst.port}`;

      if(options.useUpstreamProxy === true) {
        let tmpProxy = url.parse(options.proxyUrl);
        title += ` -> ${tmpProxy.protocol}//${tmpProxy.hostname}:${tmpProxy.port}`;
      }

      this.BrowserWindow.webContents.send('new-title', title);
      menuBuilder(this);
    });

    this.mitmInst.on('error', err => this.sendIpc('error', err.message, err.stack));

    try {
      this.mitmInst.listen();
    } catch(e) {
      menuBuilder(this);
      this.sendIpc('error', e.message, e.stack);
    }
  }

  listening() {
    return this.mitmInst !== null && this.mitmInst.listening === true;
  }

  stop() {
    this.BrowserWindow.webContents.send('new title', `WSSiP/${version} - stopping...`);

    this.clientSocket.forEach((key) => {
      this.clientSocket[key].close(1000, '');
      this.serverSocket[key].close(1000, '');
    });

    this.mitmInst.on('close', () => {
      menuBuilder(this);
      this.BrowserWindow.webContents.send('new-title', `WSSiP/${version} - not listening`);
    });

    this.mitmInst.end();
  }

  privateKeyPEM() {
    return this.mitmInst.privateKeyPEM;
  }

  certificatePEM() {
    return this.mitmInst.certificatePEM;
  }

  publicKeyPEM() {
    return this.mitmInst.publicKeyPEM;
  }

  cacheNewCA(x) {
    return this.mitmInst.cacheNewCA(x);
  }

  //---- WebSocket Magic ----

  sendIpc(event, ...args) {
    return this.BrowserWindow.webContents.send(`mitmengine-${event}`, ...args);
  }

  connection(cSocket) {
    let id = ++this.id;

    this.connections[id] = {
      client: cSocket,
      server: null
    }

    this.connections[id].client.pause();

    let connectionUrl = url.parse(this.connections[id].client.upgradeReq.url);

    if(connectionUrl.protocol === 'https:') {
      connectionUrl.protocol = 'wss:';
    } else if(connectionUrl.protocol === 'http:') {
      connectionUrl.protocol = 'ws:';
    }

    let properUrl = url.format(connectionUrl);
    debug(`Connection ${id}: ${properUrl}`);

    this.connections[id].server = new WebSocket(properUrl, { rejectUnauthorized: config.get('rejectUnauthorized') });
    this.connections[id].server.once('open', () => {
      this.connections[id].server.pause();

      this.sendIpc('new-connection', this.id, properUrl, connectionUrl);

      this.connections[id].client.on('close', (code, reason) => this.close('client', id, code, reason));
      this.connections[id].server.on('close', (code, reason) => this.close('server', id, code, reason));
      this.connections[id].client.on('error', (err) => this.error('client', err));
      this.connections[id].server.on('error', (err) => this.error('server', err));
      this.connections[id].client.on('message', (data, flags) => this.message('client', id, data, flags));
      this.connections[id].server.on('message', (data, flags) => this.message('server', id, data, flags));
      this.connections[id].client.on('ping', (data, flags) => this.ping('client', id, data, flags));
      this.connections[id].server.on('ping', (data, flags) => this.ping('server', id, data, flags));
      this.connections[id].client.on('pong', (data, flags) => this.pong('client', id, data, flags));
      this.connections[id].server.on('pong', (data, flags) => this.pong('server', id, data, flags));

      ipcMain.on(`mitmengine-send-${Number(id)}`, (e, sender, type, data, flags) => {
        if('binary' in flags && flags.binary === true && typeof data === 'string') {
          if(/^[a-fA-F0-9]/.test(data) && data.length % 2 === 0) {
            data = Buffer.from(data, 'hex');
          } else {
            this.error(sender, new Error('Message is not in valid hex format for conversion to binary'));
            return;
          }
        }

        //weird closing handshake
        if(this.connections[id].client.readyState === WebSocket.CLOSING || this.connections[id].client.readyState === WebSocket.CLOSED) {
          return this.connections[id].server.close(1000, '');
        } else if(this.connections[id].server.readyState === WebSocket.CLOSING || this.connections[id].server.readyState === WebSocket.CLOSED) {
          return this.connections[id].client.close(1000, '');
        }

        if(sender === 'client') {
          if(type === 'message') {
            this.connections[id].client.send(data, flags, (err) => this.sendConfirm('client', err));
          } else if(type === 'ping') {
            this.connections[id].client.ping(data, flags, (err) => this.sendConfirm('client', err));
          } else if(type === 'pong') {
            this.connections[id].client.pong(data, flags, (err) => this.sendConfirm('client', err));
          } else {
            this.error(sender, `Unknown message type '${type}' specified`);
          }
        } else if(sender === 'server') {
          if(type === 'message') {
            this.connections[id].server.send(data, flags, (err) => this.sendConfirm('server', err));
          } else if(type === 'ping') {
            this.connections[id].server.ping(data, flags, (err) => this.sendConfirm('server', err));
          } else if(type === 'pong') {
            this.connections[id].server.pong(data, flags, (err) => this.sendConfirm('server', err));
          } else {
            this.error(sender, `Unknown message type '${type}' specified`);
          }
        } else {
          this.error('ws', `Unknown sender '${sender}' specified`);
        }
      });

      ipcMain.once(`mitmengine-ready-${id}`, (e) => {
        this.connections[id].server.resume();
        this.connections[id].client.resume();
      });
    });
  }

  close(sender, id, code, reason) {
    if(typeof code === 'undefined' || typeof code === 'null') {
      code = 1000;
    }

    if(typeof reason === 'undefined' || typeof reason === 'null') {
      reason = '';
    }

    if(sender === 'client') {
      this.connections[id].client.close(code, reason);
    } else if(sender === 'server') {
      this.connections[id].server.close(code, reason);
    }

    this.sendIpc('close-connection', sender, id);

    delete this.connections[id].client;
    delete this.connections[id].server;
  }

  error(sender, err) {
    this.sendIpc('error', `[${sender}] ${err.message}`, err.stack);
  }

  sendConfirm(sender, error) {
    if(typeof error !== 'undefined' && typeof error !== 'null') {
      this.error(sender, error);
    }
  }

  message(sender, id, data, flags) {
    if(typeof data === 'undefined' || typeof data === 'null')
      data = '';

    this.sendIpc('data', id, sender, data, 'message', flags);
  }

  ping(sender, id, data, flags) {
    this.sendIpc('data', id, sender, data, 'ping', flags);
  }

  pong(sender, id, data, flags) {
    this.sendIpc('data', id, sender, data, 'pong', flags);
  }

  //---- WSSiP REST API ----

  /*
  Using http://mitm/

  GET /ws/[id]                     Is this connection active?
  <- {'connected': true}
  <- {'connected': false}

  GET /cacert.pem -> CA PEM
  GET /cacert.der -> CA DER
  GET /privatekey.pem -> Private Key PEM
  GET /privatekey.der -> Private Key DER
  GET /publickey.pem -> Public Key PEM
  GET /publickey.der -> Public Key DER

  POST /ws/[id]/[client/server]/[message/ping/pong]/[ascii/binary]?log=true
  -> data
  <- {'success': true}
  <- {'success': false, 'reason': 'Connection is not open'}
  ?log=true only for it to show in wssip
  */

  request(request, response, data = '') {
    let me = url.parse(`http://mitm${request.url}`);
    let responseBody, matcher;

    debug(`incoming request http://mitm${request.url}`);

    if(request.method === 'GET' && (
      me.pathname.indexOf('/cacert.') === 0 ||
      me.pathname.indexOf('/privatekey.') === 0 ||
      me.pathname.indexOf('/publickey.') === 0)
    ) {
      let _split = me.pathname.split('.');
      let name = _split[0], type = _split[1];

      if(type !== 'pem' && type !== 'der') {
        return this.sendOther(404, request, response);
      }

      if(name === '/cacert') {
        name = 'cacert.pem';
      } else if(name === '/privatekey') {
        name = 'ca_pri.pem';
      } else if(name === '/publickey') {
        name = 'ca_pub.pem';
      }

      try {
        responseBody = fs.readFileSync(path.join(this.certDir, name), 'utf8');

        if(type === 'der') {
          responseBody = Buffer.from(responseBody.split('-----')[2].split('\r\n').join(''), 'base64');
        }
      } catch(e) {
        return this.sendOther(500, request, response, 'text/plain', 'Could not retrieve certificate.\n\n' + e.stack);
      }

      response.writeHead(200, {
        'Content-Length': responseBody.length,
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${name}"`
      });

      response.end(responseBody);

    } else if((matcher = me.pathname.match(/\/ws\/\d+(.*)/)) !== null) {
      let id = Number(matcher[0].replace('/ws/', '')), options = matcher[1].split('/');
      let isConnected = id in this.connections.client || id in this.connections.server;

      if(request.method === 'GET' && (
        (options.length === 1 && options[0] === '') ||
        (options.length === 2 && options[0] === '' && options[1] === '')
      )) {
        responseBody = JSON.stringify({
          connected: isConnected
        });

        response.writeHead(200, {
          'Content-Length': responseBody.length,
          'Content-Type': 'application/json'
        });

        response.end(responseBody);

      } else if(request.method === 'POST' && this.doesMatchSendMessage(options)) {
        let sender = options[1], method = options[2], datatype = options[3];
        let log = me.query.log === 'true' || me.query.log === 'y';

        let flags = {
          binary: datatype === 'binary',
          mask: me.query.mask === 'true' || me.query.mask === 'y'
        };

        if(log) {
          (() => {
            if(method == 'message') return this.message;
            else if(method == 'ping') return this.ping;
            else if(method == 'pong') return this.pong;
          })(id, data, sender, flags);

          //TODO: actually evaluate if error or not
          responseBody = JSON.stringify({ sent: true });

          response.writeHead(200, {
            'Content-Length': responseBody.length,
            'Content-Type': 'application/json'
          });

          response.end(responseBody);

        } else {
          (() => {
            if(method == 'message') return this.connections[id][sender].send;
            else if(method == 'ping') return this.connections[id][sender].ping;
            else if(method == 'pong') return this.connections[id][sender].pong;
          })(data, flags, (err) => {
            if(err) {
              responseBody = JSON.stringify({
                sent: false,
                error: err
              });

              response.writeHead(500, {
                'Content-Type': 'application/json',
                'Content-Length': responseBody.length
              });
            } else {
              responseBody = JSON.stringify({
                sent: true
              });

              response.writeHead(200, {
                'Content-Type': 'application/json',
                'Content-Length': responseBody.length
              });
            }

            response.end(responseBody);
          });
        }
      } else {
        this.sendOther(404, request, response);
      }
    } else {
      this.sendOther(404, request, response);
    }
  }

  doesMatchSendMessage(opt) {
    return (
      (opt.length === 4 || opt.length === 5) &&
      ('client' in opt[1] || 'server' in opt[1]) &&
      ('message' in opt[2] || 'ping' in opt[2] || 'pong' in opt[2]) &&
      ('ascii' in opt[3] || 'text' in opt[3] || 'binary' in opt[3])
    );
  }

  sendOther(code, request, response, type = 'text/plain', msg = '') {
    if (code === 404 && msg === '') {
      msg = `404 Not Found (or Invalid): ${request.url}`;
    }

    response.writeHead(code, {
      'Content-Type': type,
      'Content-Length': msg.length
    });

    response.end(msg);
  }
}
