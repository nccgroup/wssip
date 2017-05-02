const {app, dialog, ipcMain, Menu} = require('electron');

const path            = require('path'),
      {name, version} = require(path.join(__dirname, '..', 'package.json')),
      argv            = require('./argv')(version),
      events          = require('events'),
      debug           = require('./debug')(`${name}:menu`),
      conf            = require('conf'),
      fs              = require('fs'),

      config = new conf({
        cwd: argv.tmp,
        configName: 'preferences',
        projectName: name
      });

const menuBuilder = (proxy) => {
  const fileMenu = {
    label: 'File',
    submenu: [{
      label: 'New',
      accelerator: 'CmdOrCtrl+N',
      click: (item, focusedWindow) => {
        focusedWindow.webContents.send('wssip-new');
      }
    }, {
      label: 'Open...',
      accelerator: 'CmdOrCtrl+O',
      click: (item, focusedWindow) => {
        dialog.showOpenDialog(focusedWindow, {
          filters: [
            {name: 'JSON Files', extensions: ['json']}
          ],
          properties: ['openFile']
        }, (filePaths) => {
          if(typeof filePaths === 'undefined') return;

          let nonImport = [];

          filePaths.forEach(file => {
            let contents;

            try {
              contents = fs.readFileSync(file, 'utf8');
            } catch(e) {
              nonImport.push(`${file} (permission error)`);
              return;
            }

            try {
              contents = JSON.parse(contents);
            } catch(e) {
              nonImport.push(`${file} (not a valid JSON format)`);
              return;
            }

            if (name in contents) {
              focusedWindow.webContents.send('wssip-import', contents.wssip);
            } else {
              nonImport.push(`${file} (not a valid ${name} JSON)`);
            }
          });

          if(nonImport.length !== 0) {
            let message = 'The following files could not be imported:\n';
            message += nonImport.join('\n');

            focusedWindow.webContents.send('dialogAlert', message);
          }
        });
      }
    }, {
      label: 'Save',
      accelerator: 'CmdOrCtrl+S',
      click: (item, focusedWindow) => {
        dialog.showSaveDialog(focusedWindow, {
          filters: [
            {name: 'JSON Files', extensions: ['json']}
          ]
        }, (filename) => {
          if(typeof filename === 'undefined') return;

          focusedWindow.webContents.send('wssip-export', filename);
        });
      }
    }, {
      type: 'separator'
    }, {
      label: 'Close',
      click: (item, focusedWindow) => {
        focusedWindow.close();
      }
    }]
  }

  const editMenu = {
    label: 'Edit',
    submenu: [{
      label: 'Undo',
      accelerator: 'CmdOrCtrl+Z',
      role: 'undo'
    }, {
      label: 'Redo',
      accelerator: 'Shift+CmdOrCtrl+Z',
      role: 'redo'
    }, {
      type: 'separator'
    }, {
      label: 'Cut',
      accelerator: 'CmdOrCtrl+X',
      role: 'cut'
    }, {
      label: 'Copy',
      accelerator: 'CmdOrCtrl+C',
      role: 'copy'
    }, {
      label: 'Paste',
      accelerator: 'CmdOrCtrl+V',
      role: 'paste'
    }, {
      label: 'Select All',
      accelerator: 'CmdOrCtrl+A',
      role: 'selectall'
    }]
  }

  const certificateMenu = {
    label: 'Certificate',
    submenu: [{
      label: 'Export Certificate',
      submenu: [{
        label: 'As PEM...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.pem Files', extensions: ['pem']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.certificatePEM();

            try {
              if(!certificateContents) {
                debug('certificatePEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                fs.writeFileSync(filename, certificateContents);
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }, {
        label: 'As DER...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.der Files', extensions: ['der']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.certificatePEM();

            try {
              if(!certificateContents) {
                debug('certificatePEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                certificateContents = certificateContents.split('-----')[2].split('\r\n').join('');
                fs.writeFileSync(filename, Buffer.from(certificateContents, 'base64'));
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }]
    }, {
      label: 'Export Public Key',
      submenu: [{
        label: 'As PEM...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.pem Files', extensions: ['pem']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.publicKeyPEM();

            try {
              if(!certificateContents) {
                debug('publicKeyPEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                fs.writeFileSync(filename, certificateContents);
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }, {
        label: 'As DER...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.der Files', extensions: ['der']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.publicKeyPEM();

            try {
              if(!certificateContents) {
                debug('publicKeyPEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                certificateContents = certificateContents.split('-----')[2].split('\r\n').join('');
                fs.writeFileSync(filename, Buffer.from(certificateContents, 'base64'));
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }]
    }, {
      label: 'Export Private Key',
      submenu: [{
        label: 'As PEM...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.pem Files', extensions: ['pem']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.privateKeyPEM();

            try {
              if(!certificateContents) {
                debug('privateKeyPEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                fs.writeFileSync(filename, certificateContents);
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }, {
        label: 'As DER...',
        click: (item, focusedWindow) => {
          dialog.showSaveDialog(focusedWindow, {
            filters: [
              {name: '.der Files', extensions: ['der']}
            ]
          }, (filename) => {
            if(typeof filename === 'undefined') return;

            let certificateContents = proxy.privateKeyPEM();

            try {
              if(!certificateContents) {
                debug('privateKeyPEM = ' + certificateContents);
                focusedWindow.webContents.send('dialogAlert', 'Could not retrieve certificate PEM contents.');
              } else {
                certificateContents = certificateContents.split('-----')[2].split('\r\n').join('');
                fs.writeFileSync(filename, Buffer.from(certificateContents, 'base64'));
              }
            } catch(e) {
              debug(e);
              focusedWindow.webContents.send('dialogAlert', `Permission denied for write: ${filename}`);
            }
          });
        }
      }]
    }, {
      type: 'separator'
    }, {
      label: 'Reset All CAs',
      click: (item, focusedWindow) => {
        if(proxy.listening() === false) {
          proxy.cacheNewCA(true).then((privateKeyObj) => {
            debug('reset callback success');
          }).catch((e) => {
            debug(e);
            focusedWindow.webContents.send('dialogAlert', `Could not reset CA certificates: ${e.message}`);
          });
        } else {
          focusedWindow.webContents.send('dialogAlert', 'Resetting Root CAs and associated can only be done when proxy is not started.');
        }
      }
    }]
  }

  const optionsMenu = {
    label: 'Options',
    submenu: [{
      label: 'Start/Stop Server',
      type: 'checkbox',
      checked: proxy.listening(),
      click: (item, focusedWindow) => {
        (proxy.listening() === true) ? proxy.stop() : proxy.start();
      }
    }, {
      label: 'Automatically Start On Startup',
      type: 'checkbox',
      checked: config.get('autoStart'),
      click: (item, focusedWindow) => {
        config.set('autoStart', !config.get('autoStart'));
        menuBuilder(proxy);
      }
    }, {
      label: 'Change Host...',
      click: (item, focusedWindow) => {
        focusedWindow.webContents.send('changeHost', config.get('proxyHost'));
      }
    }, {
      label: 'Change Port...',
      click: (item, focusedWindow) => {
        focusedWindow.webContents.send('changePort', config.get('proxyPort'));
      }
    }, {
      type: 'separator'
    }, {
      label: 'Upstream Proxy',
      submenu: [{
        label: 'Enable',
        type: 'checkbox',
        checked: config.get('useUpstreamProxy'),
        click: (item, focusedWindow) => {
          config.set('useUpstreamProxy', !config.get('useUpstreamProxy'));
          menuBuilder(proxy);
        }
      }, {
        type: 'separator'
      }, {
        label: 'Change Host...',
        click: (item, focusedWindow) => {
          focusedWindow.webContents.send('changeUpstreamHost', config.get('upstreamHost'));
        }
      }, {
        label: 'Change Port...',
        click: (item, focusedWindow) => {
          focusedWindow.webContents.send('changeUpstreamPort', config.get('upstreamPort'));
        }
      }]
    }, {
      type: 'separator'
    }, {
      label: 'Clear Inactive Connections',
      click: (item, focusedWindow) => {
        focusedWindow.webContents.send('clearInactive');
      }
    }, {
      type: 'separator'
    }, {
      label: 'Reject Unknown Certificates',
      type: 'checkbox',
      checked: config.get('rejectUnauthorized'),
      click: (item, focusedWindow) => {
        config.set('rejectUnauthorized', !config.get('rejectUnauthorized'));
        menuBuilder(proxy);
      }
    }, {
      label: 'Per-Message Deflate',
      type: 'checkbox',
      checked: config.get('perMessageDeflate'),
      click: (item, focusedWindow) => {
        config.set('perMessageDeflate', !config.get('perMessageDeflate'));
        menuBuilder(proxy);
      }
    }]
  }

  let windowMenu = {
    label: 'Window',
    role: 'window',
    submenu: [{
      label: 'Reload',
      accelerator: 'CmdOrCtrl+R',
      click: (item, focusedWindow) => {
        if (focusedWindow) {
          focusedWindow.reload();
        }
      }
    }, {
      type: 'separator',
    }, {
      label: 'Minimize',
      accelerator: 'CmdOrCtrl+M',
      role: 'minimize'
    }, {
      label: 'Close',
      accelerator: 'CmdOrCtrl+W',
      role: 'close'
    }]
  }

  const helpMenu = {
    label: 'Help',
    role: 'help'
  }

  const menu = [];

  if(process.platform === 'darwin') {
    menu.push({
      label: `${name}`,
      submenu: [{
        label: `About ${name}`,
        role: 'about'
      }, {
        type: 'separator'
      }, {
        label: 'Services',
        role: 'services',
        submenu: []
      }, {
        label: `Hide ${name}`,
        accelerator: 'Command+H',
        role: 'hide'
      }, {
        label: 'Hide Others',
        accelerator: 'Command+Alt+H',
        role: 'hideothers'
      }, {
        label: 'Show All',
        role: 'unhide'
      }, {
        type: 'separator'
      }, {
        label: 'Quit',
        accelerator: 'Command+Q',
        click: () => {
          app.quit();
        }
      }]
    });

    windowMenu.submenu.push({
      type: 'separator'
    });

    windowMenu.submenu.push({
      label: 'Bring All to Front',
      role: 'front'
    });

  }

  menu.push(fileMenu);
  menu.push(editMenu);
  menu.push(certificateMenu);
  menu.push(optionsMenu);
  menu.push(windowMenu);
  menu.push(helpMenu);

  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

module.exports = menuBuilder;
