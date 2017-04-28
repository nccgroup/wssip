const {app, BrowserWindow, dialog, Menu, ipcMain} = require('electron');

const WebSocketProxy    = require('./wsproxy'),
      menuBuilder       = require('./menu'),
      events            = require('events'),
      path              = require('path'),
      fs                = require('fs'),
      conf              = require('conf'),
      {name, version}   = require(path.join(__dirname, '..', 'package.json')),
      windowStateKeeper = require('electron-window-state'),

      debug             = {},
      config            = new conf({
        cwd: app.getPath('userData'),
        configName: 'preferences',
        projectName: name
      });

let ndebug;

try {
  ndebug = require('debug');
} catch(e) {
  ndebug = function() {
    return function() {}
  }
}

debug.electron = ndebug('wssip:electron');

debug.electron('app path: ' + app.getAppPath());
debug.electron('user data storage: ' + app.getPath('userData'));

if(process.mas) {
  app.setName(name);
}

const defaultSet = (name, value) => {
  if(!config.has(name)) {
    config.set(name, value);
  }
}

defaultSet('autoStart', true);
defaultSet('proxyHost', '127.0.0.1');
defaultSet('proxyPort', 8080);
defaultSet('useUpstreamProxy', false);
defaultSet('upstreamHost', '127.0.0.1');
defaultSet('upstreamPort', 8081);
defaultSet('timeout', 0);
defaultSet('rejectUnauthorized', false);
defaultSet('perMessageDeflate', true);

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

  let mainWindowState = windowStateKeeper({
    defaultWidth: 1366,
    defaultHeight: 768
  });

  let options = {
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: mainWindowState.x,
    y: mainWindowState.y,
    title: `WSSiP/${version}`,
    show: false
  }

  mainWindow = new BrowserWindow(options);
  proxy = new WebSocketProxy(mainWindow);

  menuBuilder(proxy);
  mainWindowState.manage(mainWindow);

  mainWindow.loadURL(path.join('file://', __dirname, '..', 'public', 'index.html'));

  if('DEBUG' in process.env) {
    mainWindow.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.on('did-finish-load', () => {
    if(config.get('autoStart') === true) {
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

app.on('window-all-closed', () => {
  app.quit();
});

app.on('activate', () => {
  if(mainWindow === null)
    ready();
});

ipcMain.on('debug', (e, segment, descriptor) => {
  if(!(segment in debug)) {
    debug[segment] = ndebug(`wssip:${segment}`);
  }

  (debug[segment])(descriptor);
});

ipcMain.on('changeHostCallback', (e, hostname) => {
  config.set('proxyHost', hostname);
});

ipcMain.on('changePortCallback', (e, port) => {
  config.set('proxyPort', parseInt(port));
});

ipcMain.on('changeUpstreamHostCallback', (e, hostname) => {
  config.set('upstreamHost', hostname);
});

ipcMain.on('changeUpstreamPortCallback', (e, port) => {
  config.set('upstreamPort', parseInt(port));
});

process.on('uncaughtException', (err) => {
  debug.electron('Uncaught ' + err.stack);

  if(mainWindow !== null) {
    menuBuilder(proxy);
    mainWindow.webContents.send('mitmengine-error', err.message, err.stack);
  }
});
