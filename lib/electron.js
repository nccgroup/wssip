const {app, BrowserWindow, dialog, Menu, ipcMain} = require('electron');

const WebSocketProxy    = require('./wsproxy'),
      menuBuilder       = require('./menu'),
      events            = require('events'),
      path              = require('path').join,
      fs                = require('fs'),
      conf              = require('conf'),
      {name, version}   = require(path(__dirname, '..', 'package.json')),
      windowStateKeeper = require('electron-window-state'),
      ndebug            = require('./debug'),
      argv              = require('./argv')(version),

      debug             = {},
      config            = new conf({
        cwd: argv.tmp,
        configName: 'preferences',
        projectName: name
      });

debug.electron = ndebug(`${name}:electron`);

if(process.mas) {
  app.setName(name);
}

const defaultSet = (name, value) => {
  if(!config.has(name)) {
    config.set(name, value);
  }
}

const ifExists = (me, def) => {
  return (typeof me === 'undefined' ? def : me);
}

defaultSet('autoStart', argv.start);
defaultSet('proxyHost', ifExists(argv.host, '127.0.0.1'));
defaultSet('proxyPort', ifExists(argv.port, 8080));
defaultSet('useUpstreamProxy', argv.upstream);
defaultSet('upstreamHost', ifExists(argv.upstreamHost, '127.0.0.1'));
defaultSet('upstreamPort', ifExists(argv.upstreamPort, 8081));
defaultSet('timeout', ifExists(argv.timeout, 0));
defaultSet('rejectUnauthorized', argv.rejectUnauthorized);
defaultSet('perMessageDeflate', typeof argv.disableDeflate === 'undefined' ? true : !argv.disableDeflate);

let mainWindow = null;
let proxy = null;

const isSingleInstance = () => {
  //TODO: multiple instances of wssip available
  debug.electron('check if another instance is open');

  if(process.mas)
    return false;

  return app.makeSingleInstance(function() {
    if(main !== null) {
      if(mainWindow.isMinimized())
        mainWindow.restore();

      mainWindow.focus();
    }
  });
}

const ready = () => {
  if(isSingleInstance())
    return app.quit();

  debug.electron('app path: ' + app.getAppPath());
  debug.electron('user data storage: ' + app.getPath('userData'));

  let mainWindowState = windowStateKeeper({
    defaultWidth: 1366,
    defaultHeight: 768
  });

  mainWindow = new BrowserWindow({
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: mainWindowState.x,
    y: mainWindowState.y,
    title: `WSSiP/${version}`,
    show: false
  });

  proxy = new WebSocketProxy(mainWindow);

  menuBuilder(proxy);
  mainWindowState.manage(mainWindow);

  mainWindow.loadURL(path('file://', __dirname, '..', 'public', 'electron.html'));

  if(argv.devtools) {
    mainWindow.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if(argv.start || config.get('autoStart') === true) {
      proxy.start();
    }

    mainWindow.show();
  });

  if(process.platform === 'darwin') {
    app.setAboutPanelOptions({
      applicationName: name,
      applicationVersion: version,
      version: version,
      credits: 'https://github.com/nccgroup/wssip'
    });
  }
}

app.on('ready', ready);

app.on('window-all-closed', () => app.quit());

app.on('activate', () => {
  if(mainWindow === null)
    ready();
});

ipcMain.on('debug', (e, segment, descriptor) => {
  if(!(segment in debug)) {
    debug[segment] = ndebug(`${name}:${segment}`);
  }

  debug[segment](descriptor);
});

ipcMain.on('changeHostCallback', (e, hostname) => config.set('proxyHost', hostname));
ipcMain.on('changePortCallback', (e, port) => config.set('proxyPort', parseInt(port)));
ipcMain.on('changeUpstreamHostCallback', (e, hostname) => config.set('upstreamHost', hostname));
ipcMain.on('changeUpstreamPortCallback', (e, port) => config.set('upstreamPort', parseInt(port)));

process.on('uncaughtException', err => {
  debug.electron('Uncaught ' + err.stack);

  if(mainWindow !== null) {
    menuBuilder(proxy);
    mainWindow.webContents.send('mitmengine-error', err.message, err.stack);
  }
});
