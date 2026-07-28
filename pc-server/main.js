const { app, BrowserWindow, Tray, Menu, shell, clipboard } = require('electron');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');

// ── Start embedded Express + WebSocket Server ─────────────────
// server.js exports the http.Server instance so we can call
// server.address().port once it is listening.
let server = null;
try {
  server = require('./server.js');
} catch (err) {
  console.error('[Electron Main] Server launch error:', err);
}

let mainWindow = null;
let tray = null;
let isQuitting = false;

// Actual port the server is listening on — populated by resolveServerPort()
// before any window or tray is created. Never assume a default here.
let serverPort = null;

/**
 * Resolves the actual port the embedded server is listening on.
 *
 * Primary path  — read server.address().port directly from the exported
 *                 http.Server instance (works for both the preferred port
 *                 and any OS-assigned random fallback port).
 * Fallback path — if the server isn't ready yet, poll /api/network-info
 *                 up to ~5 s then hand back whatever port it reports.
 */
function resolveServerPort(callback) {
  // Primary: ask the exported http.Server instance directly
  if (server && typeof server.address === 'function') {
    const addr = server.address();
    if (addr && addr.port) {
      serverPort = addr.port;
      return callback(serverPort);
    }
  }

  // Fallback: the server hasn't emitted 'listening' yet — poll network-info.
  // We don't know the port yet so we probe the preferred env port first;
  // once the server responds it will tell us the real (possibly random) port.
  const http = require('http');
  const probePort = parseInt(process.env.PORT || '2907', 10);
  let attempts = 0;
  const MAX_ATTEMPTS = 10;

  function tryFetch() {
    attempts++;
    const req = http.get(`http://127.0.0.1:${probePort}/api/network-info`, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json && json.port) {
            serverPort = json.port;
            return callback(serverPort);
          }
        } catch (_) {}
        serverPort = probePort;
        callback(serverPort);
      });
    });
    req.on('error', () => {
      if (attempts < MAX_ATTEMPTS) {
        setTimeout(tryFetch, 500);
      } else {
        // Last resort: re-check server.address() in case it became ready
        if (server && typeof server.address === 'function') {
          const addr = server.address();
          if (addr && addr.port) {
            serverPort = addr.port;
            return callback(serverPort);
          }
        }
        serverPort = probePort;
        callback(serverPort);
      }
    });
    req.setTimeout(1000, () => req.destroy());
  }

  tryFetch();
}

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

  try {
    if (typeof app !== 'undefined' && typeof app.getLoginItemSettings === 'function') {
      const settings = app.getLoginItemSettings();
      if (settings && settings.openAtLogin) {
        return callback(true);
      }
    }
  } catch (e) {}

  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS"', (err, stdout) => {
    if (!err && stdout && (stdout.includes('PaymentAlertsOBS') || stdout.includes('Payment Alerts'))) {
      return callback(true);
    }

    try {
      const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      const s1 = path.join(startupFolder, 'PaymentAlertsOBS.lnk');
      const s2 = path.join(startupFolder, 'Payment Alerts for OBS.lnk');
      if (fs.existsSync(s1) || fs.existsSync(s2)) {
        return callback(true);
      }
    } catch (e) {}

    callback(false);
  });
}

function setWindowsStartup(enable, callback) {
  if (process.platform !== 'win32') return callback ? callback(false, 'Windows platform required') : null;

  let usedElectron = false;
  try {
    if (typeof app !== 'undefined' && typeof app.setLoginItemSettings === 'function') {
      app.setLoginItemSettings({
        openAtLogin: enable,
        path: process.execPath
      });
      usedElectron = true;
    }
  } catch (e) {
    console.warn('[Startup] setLoginItemSettings warning:', e.message);
  }

  // Delete manual registry entry if Electron handled it, to avoid duplicate startup entries
  exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f', () => {
    if (!usedElectron) {
      if (enable) {
        const exePath = process.execPath;
        const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /t REG_SZ /d "\"${exePath}\"" /f`;
        exec(cmd, (err) => {
          if (callback) callback(!err, err ? err.message : null);
        });
        return;
      }
    }
    if (!enable) {
      try {
        const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        ['PaymentAlertsOBS.lnk', 'Payment Alerts for OBS.lnk'].forEach(f => {
          const p = path.join(startupFolder, f);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        });
      } catch (e) {}
    }
    if (callback) callback(true, null);
  });
}

function shouldMinimizeOnClose() {
  if (server && typeof server.getMinimizeOnClose === 'function') {
    return server.getMinimizeOnClose();
  }
  return true;
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 480,
    height: 520,
    minWidth: 440,
    minHeight: 480,
    title: 'Payment Alerts for OBS',
    icon: path.join(__dirname, 'public', 'icon.png'),
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  createApplicationMenu();

  // Route any window.open() or clicked external links to default OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load lightweight app main screen
  mainWindow.loadURL(`http://127.0.0.1:${serverPort}/app`).catch(err => {
    console.error('[Electron Main] Failed to load main screen URL:', err);
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription, validatedURL) => {
    console.warn(`[Electron Main] Page failed to load: ${validatedURL} (${errorDescription})`);
    if (errorCode === -102 || errorCode === -105) {
      console.error('[Electron Main] Server connection refused. The embedded server may have failed to start.');
    }
  });

  // Handle window close: minimize to tray or quit app based on setting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      if (shouldMinimizeOnClose()) {
        event.preventDefault();
        mainWindow.hide();
        if (tray) {
          tray.displayBalloon({
            title: 'Payment Alerts for OBS',
            content: 'App is running in system tray. Right-click icon for options.'
          });
        }
        return false;
      } else {
        isQuitting = true;
        app.quit();
      }
    }
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
    // serverPort is resolved before this is ever called
    const port = serverPort;
    const connectUrl = `http://${primaryIp}:${port}`;

    const template = [
      {
        label: 'File',
        submenu: [
          {
            label: `📋 Copy Mobile Connection IP (${primaryIp}:${port})`,
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
            click: () => shell.openExternal(`http://${getPrimaryIp()}:${port}/overlay/alerts`)
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
                detail: `Author: clowneon1\nMobile Connection IP: ${connectUrl}\nLocal Port: ${port} (TCP)`
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

  const primaryIp = getPrimaryIp();
  const port = serverPort;
  const connectUrl = `http://${primaryIp}:${port}`;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚡ Open Main Window',
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
      label: '🌐 Open Control Panel in Browser',
      click: () => {
        shell.openExternal(`http://127.0.0.1:${port}/config`);
      }
    },
    {
      label: `📋 Copy Connection IP (${primaryIp}:${port})`,
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
      label: '❌ Quit Payment Alerts',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
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
    // Resolve the real port FIRST — before creating the window or tray —
    // so every URL built in createMainWindow / createApplicationMenu /
    // updateTrayMenu uses the actual listening port (including random fallbacks).
    resolveServerPort((port) => {
      serverPort = port;
      createMainWindow();
      createTray();
    });

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
