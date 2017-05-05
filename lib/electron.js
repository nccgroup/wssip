try {
  require.resolve('electron');
} catch(e) {
  console.error(`Electron is not installed. Make sure 'npm install' has been successfully run.`);
  process.exit(1);
}

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

if(typeof app === 'undefined') {
  console.error(`Please use the 'wssip' (or 'electron') command to start this application instead of 'node'.`);
  process.exit(1);
}

debug.electron = ndebug(`${name}:electron`);

if(process.mas) {
  app.setName(name);
}

const defaultSet = (name, value) => {
  if(!config.has(name)) {
    config.set(name, value);
  }
}

const ifExists = (me, def) => (typeof me === 'undefined' ? def : me);

defaultSet('autoStart', argv.start);
defaultSet('proxyHost', ifExists(argv.host, '127.0.0.1'));
defaultSet('proxyPort', ifExists(argv.p, 8080));
defaultSet('useUpstreamProxy', typeof argv.u !== 'undefined');
defaultSet('upstreamUrl', ifExists(argv.u, 'http://localhost:8081/'));
defaultSet('timeout', ifExists(argv.t, 0));
defaultSet('rejectUnauthorized', argv.rejectUnauthorized);
defaultSet('perMessageDeflate', typeof argv.disableDeflate === 'undefined' ? true : !argv.disableDeflate);

let mainWindow = null;
let proxy = null;

const isSingleInstance = () => {
  //TODO: multiple instances of wssip available
  debug.electron('check if another instance is open');

  if(process.mas)
    return false;

  return app.makeSingleInstance(() => {
    if(mainWindow !== null) {
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

const setPort = (vname, port) => {
  let _port = Number(port);

  if(isNaN(_port) || _port < 0 || _port > 0xFFFF) {
    mainWindow.webContents.send('dialogAlert', `Invalid Port: ${port}`);
  } else {
    config.set(vname, _port);
  }
}

ipcMain.on('changeHostCallback', (e, hostname) => config.set('proxyHost', hostname));
ipcMain.on('changePortCallback', (e, port) => setPort('proxyPort', port));
ipcMain.on('changeUpstreamCallback', (e, url) => config.set('upstreamUrl', url));

ipcMain.on('savefileCallback', (e, filename, json) => {
  if(typeof json !== 'object' || !(name in json)) return;

  try {
    fs.writeFileSync(filename, JSON.stringify(json), 'utf8');
  } catch(err) {
    mainWindow.webContents.send('mitmengine-error', err.message, err.stack);
  }
});

process.on('uncaughtException', reason => {
  if(reason.code === 'EADDRINUSE' && mainWindow !== null) return;

  debug.electron(`Uncaught ${reason.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  debug.electron(`Uncaught [Promise] ${reason.stack}`);
  process.exit(1);
});
