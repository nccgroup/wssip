try {
  require.resolve('electron');
} catch(e) {
  console.error(`Electron is not installed. Make sure 'npm install' has been successfully run.`);
  process.exit(1);
}

const {app, BrowserWindow, dialog, Menu, ipcMain} = require('electron');

const WebSocketProxy                = require('./wsproxy'),
      menuBuilder                   = require('./menu'),
      events                        = require('events'),
      path                          = require('path').join,
      fs                            = require('fs'),
      conf                          = require('conf'),
      {name, version, productName}  = require(path(__dirname, '..', 'package.json')),
      windowStateKeeper             = require('electron-window-state'),
      ndebug                        = require('./debug'),
      argv                          = require('./argv')(version),
      url                           = require('url'),

      debug             = {},
      config            = new conf({
        cwd: argv.tmp,
        configName: 'preferences',
        projectName: name
      });

let enableLiveReload;

try {
  enableLiveReload = require('electron-compile').enableLiveReload;
} catch(e) {
  enableLiveReload = () => {};
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

const appIcon = (() => {
  if(process.platform === 'win32') {
    return path(__dirname, '..', 'build', 'icon.ico');
  } else if(process.platform === 'darwin') {
    return path(__dirname, '..', 'build', 'icon.icns');
  } else {
    return path(__dirname, '..', 'build', 'icon', '512x512.png');
  }
})();

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

const ready = () => {
  //check if electron >= 1.7 for async/await in mitmengine
  let [major, minor] = process.versions.node.split('.');
  if((Number(major) < 7) || (Number(major) == 7 && Number(minor) < 9)) {
    debug.electron(`Exiting because Node version ${process.versions.node} < 7.9.0`);
    dialog.showErrorBox('Error', 'Electron installed is not 1.7+. Install Electron using "npm i -g electron@1.7" then try wssip again.');
    process.exit(1);
  } else {
    debug.electron(`version check pass: ${process.versions.node} >= 7.9.0`);
  }

  let mainWindowState = windowStateKeeper({
    defaultWidth: 1366,
    defaultHeight: 768
  });

  enableLiveReload({strategy: 'react-hmr'});

  mainWindow = new BrowserWindow({
    icon: appIcon,
    width: mainWindowState.width,
    height: mainWindowState.height,
    x: mainWindowState.x,
    y: mainWindowState.y,
    title: `${productName}/${version}`,
    show: false
  });

  proxy = new WebSocketProxy(mainWindow);

  menuBuilder(proxy);
  mainWindowState.manage(mainWindow);

  mainWindow.loadURL(url.format({
    protocol: 'file:',
    slashes: true,
    pathname: path(__dirname, '..', 'app', 'app.html')
  }));

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

  fs.writeFile(filename, JSON.stringify(json), 'utf8', err => {
    if(err) {
      mainWindow.webContents.send('mitmengine-error', err.message, err.stack);
    }
  });
});

ipcMain.on('app-bounce', (e, type) => {
  if (type !== 'critical' && type !== 'informational') {
    type = 'informational';
  }

  e.returnValue = mainWindow.isFocused() ? -1 : app.dock.bounce(type);
});

ipcMain.on('app-bounce-cancel', (e, id) => app.dock.cancelBounce(Number(id)));

process.on('uncaughtException', reason => {
  if(reason.code === 'EADDRINUSE' && mainWindow !== null) return;

  (typeof debug.electron !== 'function' ? console.error : debug.electron)(`Uncaught ${reason.stack}`);
  process.exit(1);
});

process.on('unhandledRejection', (reason, p) => {
  (typeof debug.electron !== 'function' ? console.error : debug.electron)(`Uncaught [Promise] ${reason.stack}`);
  process.exit(1);
});
