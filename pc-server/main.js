const { app, BrowserWindow, Tray, Menu, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// ── Start embedded Express + WebSocket Server ─────────────────
let server = null;
try {
  server = require('./server.js');
} catch (err) {
  console.error('[Electron Main] Server launch error:', err);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

function getPrimaryIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal && !iface.address.startsWith('169.254')) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function isWindowsStartupEnabled(callback) {
  if (process.platform !== 'win32') return callback(false);
  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS"', (err, stdout) => {
    callback(!err && stdout && stdout.includes('PaymentAlertsOBS'));
  });
}

function setWindowsStartup(enable, callback) {
  try {
    app.setLoginItemSettings({
      openAtLogin: enable,
      path: process.execPath
    });
  } catch (e) {
    console.warn('[Startup] setLoginItemSettings warning:', e.message);
  }

  if (process.platform === 'win32') {
    const exePath = process.execPath;
    const cmd = enable
      ? `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /t REG_SZ /d "\"${exePath}\"" /f`
      : `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f`;
    exec(cmd, () => { if (callback) callback(); });
  } else if (callback) {
    callback();
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1240,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    title: 'Payment Alerts for OBS - clowneon1',
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  createApplicationMenu();
  mainWindow.loadURL('http://127.0.0.1:3000/config');

  // Minimize to tray instead of closing when user clicks X
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      if (tray) {
        tray.displayBalloon({
          title: 'Payment Alerts for OBS',
          content: 'App is running in system tray. Right-click icon for options.'
        });
      }
    }
    return false;
  });

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });
}

function createTray() {
  const iconPath = path.join(__dirname, 'public', 'icon.png');
  tray = new Tray(iconPath);
  tray.setToolTip('Payment Alerts for OBS');

  updateTrayMenu();

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createApplicationMenu() {
  isWindowsStartupEnabled((startupEnabled) => {
    const primaryIp = getPrimaryIp();
    const connectUrl = `http://${primaryIp}:3000`;

    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: `📋 Copy Mobile Connection IP (${primaryIp}:3000)`,
            click: () => {
              clipboard.writeText(connectUrl);
              if (mainWindow && mainWindow.webContents) {
                mainWindow.webContents.executeJavaScript(`
                  if (window.showToast) window.showToast('📋 Copied Mobile IP: ${connectUrl}');
                `);
              }
            }
          },
          {
            label: '📡 Open OBS Overlay in Browser',
            click: () => shell.openExternal(`http://${getPrimaryIp()}:3000/overlay/alerts`)
          },
          { type: 'separator' },
          {
            label: 'Exit',
            click: () => {
              isQuitting = true;
              app.quit();
            }
          }
        ]
      },
      {
        label: 'Startup & Options',
        submenu: [
          {
            label: '⚙️ Start on Windows Boot',
            type: 'checkbox',
            checked: startupEnabled,
            click: (item) => {
              setWindowsStartup(item.checked, () => {
                createApplicationMenu();
                updateTrayMenu();
              });
            }
          }
        ]
      },
      {
        label: 'Logs',
        submenu: [
          {
            label: '📋 Open Live Server Logs',
            click: () => shell.openExternal(`http://${getPrimaryIp()}:3000/api/logs`)
          }
        ]
      },
      {
        label: 'View',
        submenu: [
          { role: 'reload' },
          { role: 'forceReload' },
          { role: 'toggleDevTools' },
          { type: 'separator' },
          { role: 'resetZoom' },
          { role: 'zoomIn' },
          { role: 'zoomOut' },
          { type: 'separator' },
          { role: 'togglefullscreen' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
            label: 'About Payment Alerts for OBS',
            click: () => {
              const { dialog } = require('electron');
              dialog.showMessageBox(mainWindow, {
                type: 'info',
                title: 'About Payment Alerts for OBS',
                message: 'Payment Alerts for OBS v1.0.0',
                detail: `Author: clowneon1\nMobile Connection IP: ${connectUrl}\nLocal Port: 3000 (TCP)`
              });
            }
          }
        ]
      }
    ];

    const menu = Menu.buildFromTemplate(template);
    Menu.setApplicationMenu(menu);
  });
}

function updateTrayMenu() {
  if (!tray) return;

  isWindowsStartupEnabled((startupEnabled) => {
    const primaryIp = getPrimaryIp();
    const connectUrl = `http://${primaryIp}:3000`;

    const contextMenu = Menu.buildFromTemplate([
      {
        label: '🖥️ Open Dashboard Window',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createMainWindow();
          }
        }
      },
      {
        label: `📋 Copy Mobile IP (${primaryIp}:3000)`,
        click: () => {
          clipboard.writeText(connectUrl);
          if (mainWindow && mainWindow.webContents) {
            mainWindow.webContents.executeJavaScript(`
              if (window.showToast) window.showToast('📋 Copied Mobile IP: ${connectUrl}');
            `);
          }
        }
      },
      { type: 'separator' },
      {
        label: '📄 Open Live Logs',
        click: () => {
          shell.openExternal(`http://${getPrimaryIp()}:3000/api/logs`);
        }
      },
      {
        label: '⚙️ Start on Windows Boot',
        type: 'checkbox',
        checked: startupEnabled,
        click: (menuItem) => {
          setWindowsStartup(menuItem.checked, () => {
            updateTrayMenu();
          });
        }
      },
      { type: 'separator' },
      {
        label: '❌ Quit Payment Alerts',
        click: () => {
          isQuitting = true;
          app.quit();
        }
      }
    ]);

    tray.setContextMenu(contextMenu);
  });
}

// ── Single Instance Lock ──────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createMainWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Keep app running in background tray
  }
});
