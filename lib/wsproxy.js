const {app, Menu, ipcMain} = require('electron'),
      mitmengine           = require('./mitmengine-node6'),
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
    this.mitmInst = null;
    this.BrowserWindow = browserWindow;

    this.clientSocket = [];
    this.serverSocket = [];

    this.connection = this.connection.bind(this);
    this.addWebSocket = this.addWebSocket.bind(this);

    //this.webServerRequest = new WebSocketRESTAPI(browserWindow, tmpDir);
  }

  addWebSocket(httpProxy) {
    new WebSocket.Server({
      server: httpProxy,
      rejectUnauthorized: ifExists(argv.rejectUnauthorized, config.get('rejectUnauthorized')),
      perMessageDeflate: (argv.disableDeflate ? true : config.get('perMessageDeflate'))
    }).on('connection', this.connection);
  }

  start() {
    let options = {
      debugName: `${name}:mitmengine`,
      name: `${name}_mitmengine`,
      version: version, //package.json
      hostname: ifExists(argv.h, config.get('proxyHost')),
      port: ifExists(argv.p, config.get('proxyPort')),
      tmpDir: this.tmpDir,
      useUpstreamProxy: typeof argv.u !== 'undefined' || config.get('useUpstreamProxy') === true,
      proxyUrl: typeof argv.u === 'undefined' ? config.get('upstreamUrl') : argv.u,
      timeout: ifExists(argv.t, config.get('timeout')),
      rejectUnauthorized: ifNotSet(argv.rejectUnauthorized, config.get('rejectUnauthorized'))
      //requestHandler: this.webServerRequest.request
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
    this.clientSocket[id] = cSocket;
    this.clientSocket[id].pause();

    let connectionUrl = url.parse(this.clientSocket[id].upgradeReq.url);

    if(connectionUrl.protocol === 'https:') {
      connectionUrl.protocol = 'wss:';
    } else if(connectionUrl.protocol === 'http:') {
      connectionUrl.protocol = 'ws:';
    }

    let properUrl = `${connectionUrl.protocol}//${connectionUrl.host}${connectionUrl.path}`;

    debug(`Connection ${id}: ${properUrl}`);

    this.serverSocket[id] = new WebSocket(properUrl, { rejectUnauthorized: config.get('rejectUnauthorized') });
    this.serverSocket[id].once('open', () => {
      this.serverSocket[id].pause();

      this.sendIpc('new-connection', this.id, properUrl, connectionUrl);

      this.clientSocket[id].on('close', (code, reason) => this.close('client', id, code, reason));
      this.serverSocket[id].on('close', (code, reason) => this.close('server', id, code, reason));
      this.clientSocket[id].on('error', (err) => this.error('client', err));
      this.serverSocket[id].on('error', (err) => this.error('server', err));
      this.clientSocket[id].on('message', (data, flags) => this.message('client', id, data, flags));
      this.serverSocket[id].on('message', (data, flags) => this.message('server', id, data, flags));
      this.clientSocket[id].on('ping', (data, flags) => this.ping('client', id, data, flags));
      this.serverSocket[id].on('ping', (data, flags) => this.ping('server', id, data, flags));
      this.clientSocket[id].on('pong', (data, flags) => this.pong('client', id, data, flags));
      this.serverSocket[id].on('pong', (data, flags) => this.pong('server', id, data, flags));

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
        if(this.clientSocket[id].readyState === WebSocket.CLOSING || this.clientSocket[id].readyState === WebSocket.CLOSED) {
          return this.serverSocket[id].close(1000, '');
        } else if(this.serverSocket[id].readyState === WebSocket.CLOSING || this.serverSocket[id].readyState === WebSocket.CLOSED) {
          return this.clientSocket[id].close(1000, '');
        }

        if(sender === 'client') {
          if(type === 'message') {
            this.clientSocket[id].send(data, flags, (err) => this.sendConfirm('client', err));
          } else if(type === 'ping') {
            this.clientSocket[id].ping(data, flags, (err) => this.sendConfirm('client', err));
          } else if(type === 'pong') {
            this.clientSocket[id].pong(data, flags, (err) => this.sendConfirm('client', err));
          } else {
            this.error(sender, `Unknown message type '${type}' specified`);
          }
        } else if(sender === 'server') {
          if(type === 'message') {
            this.serverSocket[id].send(data, flags, (err) => this.sendConfirm('server', err));
          } else if(type === 'ping') {
            this.serverSocket[id].send(data, flags, (err) => this.sendConfirm('server', err));
          } else if(type === 'pong') {
            this.serverSocket[id].send(data, flags, (err) => this.sendConfirm('server', err));
          } else {
            this.error(sender, `Unknown message type '${type}' specified`);
          }
        } else {
          this.error('ws', `Unknown sender '${sender}' specified`);
        }
      });

      ipcMain.once(`mitmengine-ready-${id}`, (e) => {
        this.serverSocket[id].resume();
        this.clientSocket[id].resume();
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
      this.clientSocket[id].close(code, reason);
    } else if(sender === 'server') {
      this.serverSocket[id].close(code, reason);
    }

    this.sendIpc('close-connection', sender, id);
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
}
