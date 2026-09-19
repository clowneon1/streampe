const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
const os = require('os');
const child_process = require('child_process');
const { exec } = child_process;
const dgram = require('dgram');
const winston = require('winston');
require('winston-daily-rotate-file');
const { Bonjour } = require('bonjour-service');
const aliasesStore = require('./aliases-store');
const updateManager = require('./update-manager');
const PaymentsCsv = require('./public/js/lib/payments-csv');
const {
  APP_NAME,
  APP_VERSION,
  DEFAULT_PORT,
  FALLBACK_PORTS,
  UDP_DISCOVERY_PORT,
  MDNS_SERVICE_TYPE,
  MAX_REDOS_INPUT_LENGTH,
  NETWORK_CHANGE_CHECK_INTERVAL_MS,
  ANDROID_HEARTBEAT_INTERVAL_MS,
  OBS_HEARTBEAT_INTERVAL_MS,
  getDefaultAppDataDir
} = require('./constants');

// App Configuration and Constants
const isCompiled = !process.execPath.endsWith('node') &&
  !process.execPath.endsWith('node.exe') &&
  !process.execPath.endsWith('bun') &&
  !process.execPath.endsWith('bun.exe');

const isDev = !isCompiled && process.env.NODE_ENV !== 'production';

let baseDir = isCompiled ? path.dirname(process.execPath) : __dirname;
let PUBLIC_DIR = path.join(baseDir, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  PUBLIC_DIR = path.join(__dirname, 'public');
}

// In development mode (npm run dev), strictly use pc-server/data as root
// In compiled/production runtime, use AppData (%APPDATA%\StreamPe) or custom configured path
let defaultAppDataDir = isDev ? path.join(__dirname, 'data') : getDefaultAppDataDir();
let writableBaseDir = isDev ? path.join(__dirname, 'data') : defaultAppDataDir;

if (!isDev) {
  try {
    if (process.env.TAURI_APP_DATA) {
      writableBaseDir = process.env.TAURI_APP_DATA;
    }
  } catch (e) { }
}

// Auto-migrate legacy portable directory files (config, data, logs) to AppData if needed
function migrateLocalDataIfNeeded(localBase, targetBase) {
  try {
    if (localBase === targetBase) return;
    const foldersToMigrate = ['config', 'data', 'logs'];
    let migratedCount = 0;

    for (const folder of foldersToMigrate) {
      const srcFolder = path.join(localBase, folder);
      const destFolder = path.join(targetBase, folder);

      if (fs.existsSync(srcFolder)) {
        if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true });

        const copyRecursive = (src, dest) => {
          const entries = fs.readdirSync(src, { withFileTypes: true });
          for (const entry of entries) {
            const srcPath = path.join(src, entry.name);
            const destPath = path.join(dest, entry.name);
            if (entry.isDirectory()) {
              if (!fs.existsSync(destPath)) fs.mkdirSync(destPath, { recursive: true });
              copyRecursive(srcPath, destPath);
            } else if (!fs.existsSync(destPath)) {
              fs.copyFileSync(srcPath, destPath);
              migratedCount++;
            }
          }
        };
        copyRecursive(srcFolder, destFolder);
      }
    }
    if (migratedCount > 0) {
      console.log(`[Storage] 📦 Migrated ${migratedCount} data/config file(s) from local directory to ${targetBase}`);
    }
  } catch (err) {
    console.warn(`[Storage] Migration notice: ${err.message}`);
  }
}

if (isCompiled) {
  migrateLocalDataIfNeeded(baseDir, writableBaseDir);
  if (baseDir !== __dirname) {
    migrateLocalDataIfNeeded(__dirname, writableBaseDir);
  }
}

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const obsClients = new Set();
const androidClients = new Set();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(PUBLIC_DIR, { index: false }));

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'icon.png'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'config.html'));
});

// ── Path Config Bootstrapping ──
const PATH_CONFIG_FILE = path.join(writableBaseDir, 'path-config.json');
let customPaths = { storageRootDir: '' };
if (!isDev) {
  try {
    if (fs.existsSync(PATH_CONFIG_FILE)) {
      customPaths = JSON.parse(fs.readFileSync(PATH_CONFIG_FILE, 'utf8')) || {};
    }
  } catch (e) {
    console.error('[Server] Failed to read path-config.json:', e.message);
  }
}

const storageRoot = (!isDev && customPaths.storageRootDir && customPaths.storageRootDir.trim())
  ? path.resolve(customPaths.storageRootDir.trim())
  : writableBaseDir;

const LOG_DIR = path.join(storageRoot, 'logs');
const SETTINGS_DIR = path.join(storageRoot, 'config');
const DATA_DIR = isDev ? storageRoot : path.join(storageRoot, 'data');

for (const dir of [LOG_DIR, SETTINGS_DIR, DATA_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error(`[Server] Failed to create directory ${dir}:`, e.message);
  }
}

if (isDev) {
  console.log(`[Storage] 🛠️ Dev Mode Active: Using pc-server/data as root (${storageRoot})`);
} else {
  console.log(`[Storage] 📦 Production Mode: Using storage root (${storageRoot})`);
}

// Consolidate legacy per-profile folders (data/<profile>/YYYY/MM.csv) into unified data/YYYY/MM.csv
// Safely archives original legacy files into data/data.old/<profile>/YYYY/MM.csv (like Windows.old)
function consolidateLegacyProfileData(dataDir) {
  if (!fs.existsSync(dataDir)) return;
  const oldArchiveDir = path.join(dataDir, 'data.old');
  try {
    const entries = fs.readdirSync(dataDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && !/^\d{4}$/.test(entry.name) && entry.name !== 'data.old' && !entry.name.startsWith('.')) {
        const profileDir = path.join(dataDir, entry.name);
        const subEntries = fs.readdirSync(profileDir, { withFileTypes: true });
        for (const sub of subEntries) {
          if (sub.isDirectory() && /^\d{4}$/.test(sub.name)) {
            const yr = sub.name;
            const yearDir = path.join(profileDir, yr);
            const csvFiles = fs.readdirSync(yearDir).filter(f => f.endsWith('.csv') && !f.endsWith('.bak') && !f.endsWith('.migrated'));
            for (const file of csvFiles) {
              const srcCsv = path.join(yearDir, file);
              const targetYearDir = path.join(dataDir, yr);
              const targetCsv = path.join(targetYearDir, file);
              if (!fs.existsSync(targetYearDir)) fs.mkdirSync(targetYearDir, { recursive: true });
              if (!fs.existsSync(targetCsv)) {
                fs.copyFileSync(srcCsv, targetCsv);
              } else {
                const srcTxs = PaymentsCsv.parseCsv(fs.readFileSync(srcCsv, 'utf8'));
                const targetTxs = PaymentsCsv.parseCsv(fs.readFileSync(targetCsv, 'utf8'));
                const existingIds = new Set(targetTxs.map(t => t.id).filter(Boolean));
                let appended = 0;
                for (const tx of srcTxs) {
                  if (!tx.id || !existingIds.has(tx.id)) {
                    targetTxs.push(tx);
                    if (tx.id) existingIds.add(tx.id);
                    appended++;
                  }
                }
                if (appended > 0) {
                  fs.writeFileSync(targetCsv, PaymentsCsv.serializeCsv(targetTxs), 'utf8');
                }
              }
              // Safely relocate legacy source file to data/data.old/<profile>/<year>/<file>
              const archiveProfileYearDir = path.join(oldArchiveDir, entry.name, yr);
              if (!fs.existsSync(archiveProfileYearDir)) fs.mkdirSync(archiveProfileYearDir, { recursive: true });
              const archiveDst = path.join(archiveProfileYearDir, file);
              try {
                fs.renameSync(srcCsv, archiveDst);
              } catch (_) {
                try {
                  fs.copyFileSync(srcCsv, archiveDst);
                  fs.unlinkSync(srcCsv);
                } catch (__) { }
              }
            }
            try {
              if (fs.readdirSync(yearDir).length === 0) {
                fs.rmdirSync(yearDir);
              }
            } catch (_) { }
          }
        }
      }
    }
  } catch (err) {
    console.warn('[Storage] Legacy consolidation notice:', err.message);
  }
}

function sanitizeAllLedgerFiles(dataDir) {
  if (!fs.existsSync(dataDir)) return;
  try {
    const years = fs.readdirSync(dataDir).filter(f => /^\d{4}$/.test(f));
    let cleanedCount = 0;
    let upgradedCount = 0;
    let normalizedFilesCount = 0;
    for (const yr of years) {
      const yrPath = path.join(dataDir, yr);
      const months = fs.readdirSync(yrPath).filter(f => /^\d{2}\.csv$/.test(f));
      for (const m of months) {
        const filePath = path.join(yrPath, m);
        const rawContent = fs.readFileSync(filePath, 'utf8');
        const firstLine = (rawContent.split(/\r?\n/)[0] || '').toLowerCase();
        const needsHeaderUpgrade = !firstLine.includes('canonicalsender');
        const rawTxs = PaymentsCsv.parseCsv(rawContent);
        const seen = new Set();
        const cleanTxs = [];
        for (const t of rawTxs) {
          const k = t.id || `${t.timestamp}_${t.sender}_${t.amount}`;
          if (!seen.has(k)) {
            seen.add(k);
            cleanTxs.push(t);
          }
        }
        const cleanContent = PaymentsCsv.serializeCsv(cleanTxs);
        const rawNormalized = rawContent.replace(/\r\n/g, '\n').trim();
        const cleanNormalized = cleanContent.replace(/\r\n/g, '\n').trim();
        const contentChanged = rawNormalized !== cleanNormalized;

        if (rawTxs.length > cleanTxs.length || needsHeaderUpgrade || contentChanged) {
          fs.writeFileSync(filePath, cleanContent, 'utf8');
          if (needsHeaderUpgrade) {
            upgradedCount++;
            console.log(`[Storage] 📦 Upgraded ${yr}/${m}.csv to 10-column canonical schema on disk`);
          }
          if (rawTxs.length > cleanTxs.length) {
            cleanedCount += (rawTxs.length - cleanTxs.length);
            console.log(`[Storage] 🧹 Sanitized ${rawTxs.length - cleanTxs.length} duplicate(s) in ${yr}/${m}`);
          }
          if (contentChanged && rawTxs.length === cleanTxs.length && !needsHeaderUpgrade) {
            normalizedFilesCount++;
            console.log(`[Storage] 📅 Normalized dates and formatting in ${yr}/${m}.csv`);
          }
        }
      }
    }
    if (upgradedCount > 0) {
      console.log(`[Storage] 🚀 Migrated ${upgradedCount} historical CSV file(s) to 10-column canonical schema.`);
    }
    if (cleanedCount > 0) {
      console.log(`[Storage] ✅ Startup Ledger Sanity Check: cleaned ${cleanedCount} duplicate transaction(s).`);
    }
    if (normalizedFilesCount > 0) {
      console.log(`[Storage] 📅 Startup Ledger Sanity Check: normalized date/time format in ${normalizedFilesCount} file(s).`);
    }
  } catch (err) {
    console.warn('[Storage] Ledger sanitization notice:', err.message);
  }
}

consolidateLegacyProfileData(DATA_DIR);
sanitizeAllLedgerFiles(DATA_DIR);

aliasesStore.initAliasesStore(DATA_DIR);

function decorateWithDisplayName(transactions, settings = {}, profile = '') {
  const list = Array.isArray(transactions) ? transactions : [];
  const targetProf = profile || (profilesStore && profilesStore.activeProfile) || 'Default';
  return list.map(tx => {
    if (!tx || typeof tx !== 'object') return tx;
    const raw = tx.rawSender || tx.sender || 'Anonymous';
    const formatted = aliasesStore.formatDonorName(raw, settings, targetProf);
    return { ...tx, rawSender: raw, sender: formatted };
  });
}

const customLevels = {
  levels: {
    error: 0,
    warn: 1,
    info: 2,
    event: 3,
    parse: 4,
    dedup: 5,
    debug: 6,
  },
  colors: {
    error: 'red',
    warn: 'yellow',
    info: 'cyan',
    event: 'magenta',
    parse: 'green',
    dedup: 'gray',
    debug: 'blue',
  },
};

winston.addColors(customLevels.colors);

const logFileFormat = winston.format.printf(({ level, message, tag, timestamp, data }) => {
  const lvl = String(level).toUpperCase();
  const tagStr = tag ? ` [${tag}]` : '';
  const dataStr = data !== undefined ? `\n${JSON.stringify(data, null, 2)}` : '';
  return `[${timestamp}] [${lvl}]${tagStr} ${message}${dataStr}`;
});

const consoleFormat = winston.format.printf(({ level, message, tag, data }) => {
  const lvl = String(level).toUpperCase();
  const tagStr = tag ? ` [${tag}]` : '';
  const dataStr = data !== undefined ? `\n${JSON.stringify(data, null, 2)}` : '';
  return `[${lvl}]${tagStr} ${message}${dataStr}`;
});

const dailyRotateTransport = new winston.transports.DailyRotateFile({
  filename: path.join(LOG_DIR, 'application_%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  auditFile: path.join(LOG_DIR, '.log-audit.json'),
  maxFiles: '7d',
  zippedArchive: false,
  format: winston.format.combine(
    winston.format.timestamp(),
    logFileFormat
  ),
});

const winstonLogger = winston.createLogger({
  levels: customLevels.levels,
  level: 'debug',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        consoleFormat
      ),
    }),
    dailyRotateTransport,
  ],
});

function getTodayDateStr() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getAvailableLogDates() {
  try {
    if (!fs.existsSync(LOG_DIR)) return [];
    const files = fs.readdirSync(LOG_DIR);
    return files
      .map(file => {
        const match = file.match(/^application_(\d{4}-\d{2}-\d{2})\.log$/);
        if (match) {
          const filePath = path.join(LOG_DIR, file);
          let size = 0;
          try { size = fs.statSync(filePath).size; } catch (_) { }
          return { date: match[1], filename: file, size };
        }
        return null;
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (e) {
    return [];
  }
}

function writeLog(level, tag, message, data) {
  winstonLogger.log({
    level: level.toLowerCase(),
    tag,
    message,
    data,
  });
}

const log = {
  info: (tag, msg, data) => writeLog('info', tag, msg, data),
  warn: (tag, msg, data) => writeLog('warn', tag, msg, data),
  error: (tag, msg, data) => writeLog('error', tag, msg, data),
  event: (tag, msg, data) => writeLog('event', tag, msg, data),
  dedup: (tag, msg, data) => writeLog('dedup', tag, msg, data),
  debug: (tag, msg, data) => writeLog('debug', tag, msg, data),
  parse: (tag, msg, data) => writeLog('parse', tag, msg, data),
};

// ── Network & Windows Utilities ─────────────────────────────────────
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const list = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        list.push({ name, address: iface.address });
      }
    }
  }
  list.sort((a, b) => {
    const aSelf = a.address.startsWith('169.254');
    const bSelf = b.address.startsWith('169.254');
    if (aSelf && !bSelf) return 1;
    if (!aSelf && bSelf) return -1;
    return 0;
  });
  return list;
}

function getPrimaryIp() {
  const list = getLocalIpAddresses();
  return list.length > 0 ? list[0].address : '127.0.0.1';
}

function autoSyncWindowsStartupPath() {
  if (process.platform !== 'win32') return;

  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "StreamPe"', (err, stdout) => {
    if (err || !stdout) return; // Not enabled in startup, no action needed

    const currentExe = getMainAppExePath();
    if (!currentExe) return;

    try {
      const match = stdout.match(/StreamPe\s+REG_\w+\s+(.*)/i);
      if (match && match[1]) {
        const rawReg = match[1].trim().replace(/^"/, '').replace(/"$/, '').trim();
        const currentResolved = path.resolve(currentExe);
        const regResolved = path.resolve(rawReg);

        if (currentResolved.toLowerCase() !== regResolved.toLowerCase() || !fs.existsSync(regResolved)) {
          log.info('Startup', `Auto-syncing startup registration: updating path from "${rawReg}" -> "${currentResolved}"`);
          const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "StreamPe" /t REG_SZ /d "\"${currentResolved}\"" /f`;
          exec(cmd, (regErr) => {
            if (!regErr) {
              log.info('Startup', `Successfully auto-re-registered Windows Startup to active portable binary: "${currentResolved}"`);
            }
          });
        }
      }
    } catch (e) {
      log.warn('Startup', 'Auto-sync startup path check error: ' + e.message);
    }
  });
}

function isWindowsStartupEnabled(callback) {
  if (process.platform !== 'win32') return callback(false);

  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', (err, stdout) => {
    let hasStreamPe = !err && stdout && stdout.includes('StreamPe');

    // Clean up legacy registry keys silently without forcing startup enabled
    if (!err && stdout && (stdout.includes('PaymentAlertsOBS') || stdout.includes('Payment Alerts') || stdout.includes('electron.app.Payment Alerts'))) {
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Payment Alerts for OBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "electron.app.Payment Alerts for OBS" /f 2>nul', () => { });
    }

    if (hasStreamPe) {
      // Auto-heal path if portable folder was moved, renamed, or extracted to a new release directory
      autoSyncWindowsStartupPath();
      return callback(true);
    }

    try {
      const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
      if (!hasStreamPe && fs.existsSync(path.join(startupFolder, 'StreamPe.lnk'))) {
        hasStreamPe = true;
      }
    } catch (_) { }

    callback(hasStreamPe);
  });
}

function getMainAppExePath() {
  const base = path.dirname(process.execPath);
  const cwd = process.cwd();

  const candidates = [
    // 1. Portable release structure (StreamPe.exe in same directory as process.execPath)
    path.join(base, 'StreamPe.exe'),
    path.join(base, 'streampe.exe'),

    // 2. Sidecar structure (server.exe inside subfolder or sidecar folder, StreamPe.exe in parent)
    path.join(base, '..', 'StreamPe.exe'),
    path.join(base, '..', 'streampe.exe'),
    path.join(base, '..', '..', 'StreamPe.exe'),
    path.join(base, '..', '..', 'streampe.exe'),

    // 3. Working directory candidates
    path.join(cwd, 'StreamPe.exe'),
    path.join(cwd, 'streampe.exe'),
    path.join(cwd, '..', 'StreamPe.exe'),
    path.join(cwd, '..', 'streampe.exe'),

    // 4. Tauri build target output locations
    path.join(base, '..', 'target', 'release', 'streampe.exe'),
    path.join(base, '..', 'target', 'release', 'StreamPe.exe'),
    path.join(base, '..', 'target', 'debug', 'streampe.exe'),
    path.join(base, '..', '..', 'src-tauri', 'target', 'release', 'streampe.exe'),
    path.join(__dirname, 'src-tauri', 'target', 'release', 'streampe.exe'),
    path.join(__dirname, '..', 'src-tauri', 'target', 'release', 'streampe.exe')
  ];

  for (const cand of candidates) {
    try {
      const resolved = path.resolve(cand);
      if (fs.existsSync(resolved)) return resolved;
    } catch (_) { }
  }
  return null;
}

function setWindowsStartup(enable, callback) {
  if (process.platform !== 'win32') return callback ? callback(false, 'Windows platform required') : null;

  // Clean up all legacy registry keys and cached Task Manager entries
  const cleanupCmd = 'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "StreamPe" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Payment Alerts for OBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "StreamPe" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "PaymentAlertsOBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run" /v "Payment Alerts for OBS" /f 2>nul';

  exec(cleanupCmd, () => {
    if (enable) {
      const exePath = getMainAppExePath();
      if (!exePath) {
        log.warn('Startup', 'Cannot enable Windows startup: StreamPe.exe desktop app binary not found on disk.');
        if (callback) callback(false, 'StreamPe.exe desktop application binary not found');
        return;
      }

      log.info('Startup', `Setting Windows Startup registry entry to StreamPe app: "${exePath}"`);
      const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "StreamPe" /t REG_SZ /d "\"${exePath}\"" /f`;
      exec(cmd, (err) => {
        if (callback) callback(!err, err ? err.message : null);
      });
      return;
    }
    if (!enable) {
      try {
        const startupFolder = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
        ['StreamPe.lnk', 'PaymentAlertsOBS.lnk', 'Payment Alerts for OBS.lnk'].forEach(f => {
          const p = path.join(startupFolder, f);
          if (fs.existsSync(p)) fs.unlinkSync(p);
        });
      } catch (e) { }
    }
    if (callback) callback(true, null);
  });
}

function ensureWindowsFirewallRule(callback) {
  if (process.platform !== 'win32') {
    if (callback) callback(false, 'Not Windows');
    return;
  }
  const targetPort = activeServerPort || DEFAULT_PORT || 2907;
  exec('netsh advfirewall firewall show rule name="StreamPe Server"', (err, stdout) => {
    if (err || !stdout || stdout.includes('No rules match') || stdout.includes('No rules found')) {
      const psCmd = `powershell -Command "Start-Process netsh -ArgumentList 'advfirewall firewall add rule name=\\\"StreamPe Server\\\" protocol=TCP dir=in localport=${targetPort} action=allow' -Verb RunAs -WindowStyle Hidden"`;
      exec(psCmd, (psErr) => {
        if (psErr) log.warn('Firewall', 'Firewall auto-rule error:', psErr.message);
        else log.info('Firewall', `Windows Firewall rule for port ${targetPort} created successfully`);
        if (callback) callback(!psErr, psErr ? psErr.message : null);
      });
    } else {
      if (callback) callback(true, null);
    }
  });
}

// ── Payment Parser (Declarative JSON Rule Engine) ────────────────────────
const STRIP_PREFIXES = [
  /^phonepe\s*[-:]\s*/i,
  /^gpay\s*[-:]\s*/i,
  /^google pay\s*[-:]\s*/i,
  /^amazon pay\s*[-:]\s*/i,
  /^from\s+/i,
];

const STRIP_SUFFIXES = [
  / on amazon pay$/i,
  / on google pay$/i,
  / using upi$/i,
  / on upi$/i,
  / to your( bank)? account$/i,
  / via \w+$/i,
];

function cleanSender(name) {
  if (!name) return 'Donor';
  let s = String(name).trim();
  for (const rx of STRIP_PREFIXES) s = s.replace(rx, '');
  for (const rx of STRIP_SUFFIXES) s = s.replace(rx, '');
  return s.trim() || 'Donor';
}

function cleanMessage(text) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (/^(?:tap\s+to\s+view(?:\s+details|\s+transaction)?\.?|payment\s+received\.?|completed\.?|view\s+transaction\.?|received\.?)$/i.test(trimmed)) {
    return '';
  }
  return trimmed;
}

function normaliseAmount(raw) {
  if (!raw) return '\u20B90';
  const stripped = String(raw).trim()
    .replace(/^\u20B9\s*/, '')
    .replace(/^[Rr][Ss]\.?\s*/, '')
    .replace(/\s*rupees$/i, '')
    .trim();
  return `\u20B9${stripped}`;
}

function normaliseAmountNumber(raw) {
  const norm = normaliseAmount(raw);
  return parseFloat(norm.replace(/[^\d.]/g, '')) || 0;
}

// Load declarative payment-rules.json
let PAYMENT_RULES_PATH = path.join(baseDir, 'payment-rules.json');
if (!fs.existsSync(PAYMENT_RULES_PATH)) {
  PAYMENT_RULES_PATH = path.join(__dirname, 'payment-rules.json');
}
let paymentRulesStore = { version: '1.0.0', apps: [] };

try {
  if (fs.existsSync(PAYMENT_RULES_PATH)) {
    const rawRules = fs.readFileSync(PAYMENT_RULES_PATH, 'utf8');
    paymentRulesStore = JSON.parse(rawRules);
    log.info('Parser', `Loaded payment-rules.json v${paymentRulesStore.version} (${paymentRulesStore.apps.length} app rule suites)`);
    runPaymentRulesBootSelfTest(paymentRulesStore);
  }
} catch (e) {
  log.error('Parser', 'Failed to load payment-rules.json: ' + e.message);
}

function runPaymentRulesBootSelfTest(rulesStore) {
  let totalRules = 0;
  let passedRules = 0;

  for (const appConfig of rulesStore.apps || []) {
    for (const rule of appConfig.rules || []) {
      totalRules++;
      if (rule.sample) {
        const sampleNotif = {
          packageName: appConfig.packageNames[0] || '',
          appName: appConfig.appName,
          title: rule.sample.title || '',
          text: rule.sample.text || '',
          bigText: rule.sample.bigText || '',
          message: rule.sample.message || ''
        };
        const parsed = parsePayment(sampleNotif);
        if (parsed && normaliseAmountNumber(parsed.amount) === rule.sample.expectedAmount) {
          passedRules++;
        } else {
          log.warn('ParserSelfTest', `Rule self-test warning for [${rule.id}]: expected ${rule.sample.expectedAmount}, got ${JSON.stringify(parsed)}`);
        }
      } else {
        passedRules++;
      }
    }
  }
  log.info('ParserSelfTest', `⚡ Payment rules startup self-test: ${passedRules}/${totalRules} rules verified`);
}

function evaluateSourceExpression(expr, titleMatch, bodyMatch) {
  if (!expr) return '';
  if (expr.includes('||')) {
    const parts = expr.split('||').map(p => p.trim());
    for (const p of parts) {
      const res = evaluateSourceExpression(p, titleMatch, bodyMatch);
      if (res) return res;
    }
    return '';
  }

  if (expr.startsWith('title.')) {
    const idx = parseInt(expr.replace('title.', ''), 10);
    return titleMatch && titleMatch[idx] ? titleMatch[idx] : '';
  }

  if (expr.startsWith('body.')) {
    const idx = parseInt(expr.replace('body.', ''), 10);
    return bodyMatch && bodyMatch[idx] ? bodyMatch[idx] : '';
  }

  return '';
}

function parsePayment(notification) {
  if (!notification) return null;

  // Input Sanity & ReDoS Guard (max 300 chars)
  const pkg = String(notification.packageName || '').trim().toLowerCase();
  const appName = String(notification.appName || '').trim();
  const title = String(notification.title || '').trim().substring(0, 300);
  const titleBig = String(notification.titleBig || '').trim().substring(0, 300);
  const text = String(notification.text || '').trim().substring(0, 300);
  const bigText = String(notification.bigText || '').trim().substring(0, 300);

  const body = bigText || text;
  const targetTitle = title || titleBig;
  const allContent = `${title} ${titleBig} ${text} ${bigText}`.trim();

  if (!allContent) return null;

  // Identify matching app configuration
  const matchedAppConfig = (paymentRulesStore.apps || []).find(app => {
    return (app.packageNames || []).some(p => pkg.includes(p.toLowerCase())) ||
      (app.appName && appName.toLowerCase().includes(app.appName.toLowerCase()));
  });

  // Evaluate matching app rules or fallback rules
  const appsToEvaluate = matchedAppConfig ? [matchedAppConfig] : (paymentRulesStore.apps || []);

  for (const appConfig of appsToEvaluate) {
    for (const rule of appConfig.rules || []) {
      let titleMatch = null;
      let bodyMatch = null;

      if (rule.titlePattern) {
        const titleRx = new RegExp(rule.titlePattern, 'i');
        titleMatch = titleRx.exec(targetTitle);
        if (!titleMatch && !rule.bodyPattern) continue;
      }

      if (rule.bodyPattern) {
        const bodyRx = new RegExp(rule.bodyPattern, 'i');
        bodyMatch = bodyRx.exec(body) || bodyRx.exec(text) || bodyRx.exec(title);
        if (!bodyMatch) continue;
      }

      if (rule.titlePattern && !titleMatch) continue;

      let rawSender = '';
      let rawAmount = '';

      if (rule.senderSource) {
        rawSender = evaluateSourceExpression(rule.senderSource, titleMatch, bodyMatch);
      }
      if (rule.amountSource) {
        rawAmount = evaluateSourceExpression(rule.amountSource, titleMatch, bodyMatch);
      }

      if (rawSender && rawAmount) {
        const sender = cleanSender(rawSender);
        const amount = normaliseAmount(rawAmount);

        let message = '';
        if (rule.extractMessage) {
          const rawMsg = (text && text !== bodyMatch[0] && !bodyMatch[0].includes(text)) ? text : (notification.message || '');
          message = cleanMessage(rawMsg);
        }

        const parsed = {
          sender,
          amount,
          sourceApp: appConfig.appName || appName || 'UPI',
          message
        };

        log.info('PARSE', `🟢 Matched rule [${rule.id}] => Sender: "${sender}", Amount: ${amount} via ${parsed.sourceApp}`);
        return parsed;
      }
    }
  }

  // Strict Positive Whitelist Fallback:
  // Non-matching notifications from payment apps are logged as promotional and ignored
  if (matchedAppConfig) {
    log.info('PARSE', `🟡 Ignored (${matchedAppConfig.appName} non-payment / promotional alert) => Title: "${title}", Text: "${text}"`);
  }

  return null;
}

// ── Configuration Files ───────────────────────────────────────────────
// Schema refreshed for Goal widget opacity and saving persistence
const ConfigSchema = require('./public/js/lib/config-schema');
const ConfigMigration = require('./public/js/lib/config-migration');
const TemplateMatcher = require('./public/js/lib/template-matcher');

const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const LEGACY_CONFIG_FILE = fs.existsSync(path.join(baseDir, 'widget-config.json')) ? path.join(baseDir, 'widget-config.json') : path.join(__dirname, 'widget-config.json');
const SHIPPED_DEFAULT_PROFILE_FILE = fs.existsSync(path.join(baseDir, 'templates', 'default-profile.json'))
  ? path.join(baseDir, 'templates', 'default-profile.json')
  : path.join(__dirname, 'templates', 'default-profile.json');

function getShippedDefaultProfile() {
  try {
    if (fs.existsSync(SHIPPED_DEFAULT_PROFILE_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(SHIPPED_DEFAULT_PROFILE_FILE, 'utf8'));
      if (parsed && typeof parsed === 'object') {
        return ConfigMigration.migrate(parsed);
      }
    }
  } catch (e) {
    log.error('Settings', 'Failed to read default-profile.json: ' + e.message);
  }
  return ConfigSchema.createDefaultConfig();
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      log.info('Settings', `Loaded from ${SETTINGS_FILE}`);
      return ConfigMigration.migrate(data);
    } else if (fs.existsSync(LEGACY_CONFIG_FILE)) {
      log.info('Settings', `Migrating legacy config from ${LEGACY_CONFIG_FILE}`);
      const migrated = ConfigMigration.migrate(JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8')));
      saveSettings(migrated);
      return migrated;
    }
  } catch (e) { log.error('Settings', 'Load error: ' + e.message); }
  log.info('Settings', 'No config found, loading shipped default profile');
  const initial = getShippedDefaultProfile();
  saveSettings(initial);
  return initial;
}

function applySettingsPatch(current, patch) {
  const body = patch && typeof patch === 'object' ? patch : {};
  const widgetPatch = body.widgets && typeof body.widgets === 'object' ? body.widgets : {};
  const merged = {
    ...current,
    ...body,
    alertTemplates: Array.isArray(body.alertTemplates) ? body.alertTemplates : current.alertTemplates,
    widgets: ConfigSchema.WIDGET_KINDS.reduce((acc, kind) => {
      acc[kind] = { ...current.widgets[kind], ...(widgetPatch[kind] || {}) };
      return acc;
    }, {}),
    filter: { ...current.filter, ...(body.filter || {}) },
    simulation: { ...(current.simulation || { isolatedMode: true }), ...(body.simulation || {}) }
  };
  return ConfigMigration.migrate(merged);
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const cleanSettings = JSON.parse(JSON.stringify(settings));
    if (cleanSettings.widgets) {
      if (cleanSettings.widgets.goal) delete cleanSettings.widgets.goal.currentAmount;
      if (cleanSettings.widgets.leaderboard) delete cleanSettings.widgets.leaderboard.supporters;
      if (cleanSettings.widgets.recent) delete cleanSettings.widgets.recent.recentDonations;
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(cleanSettings, null, 2), 'utf8');
  } catch (e) { log.error('Settings', 'Save error: ' + e.message); }
}

const PROFILES_FILE = path.join(SETTINGS_DIR, 'profiles.json');

function loadProfilesStore() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const raw = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      if (raw && raw.profiles && Object.keys(raw.profiles).length) {
        const store = ConfigMigration.migrateProfileStore(raw);
        saveProfilesStore(store);
        return store;
      }
    }
  } catch (e) { log.error('Profiles', 'Load error: ' + e.message); }
  const store = { activeProfile: 'Default', profiles: { 'Default': loadSettings() } };
  saveProfilesStore(store);
  return store;
}

function saveProfilesStore(store) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const cleanStore = JSON.parse(JSON.stringify(store));
    Object.keys(cleanStore.profiles).forEach(pName => {
      const p = cleanStore.profiles[pName];
      if (p && p.widgets) {
        if (p.widgets.goal) delete p.widgets.goal.currentAmount;
        if (p.widgets.leaderboard) delete p.widgets.leaderboard.supporters;
        if (p.widgets.recent) delete p.widgets.recent.recentDonations;
      }
    });
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(cleanStore, null, 2), 'utf8');
  } catch (e) { log.error('Profiles', 'Save error: ' + e.message); }
}

let profilesStore = loadProfilesStore();
let alertSettings = profilesStore.profiles[profilesStore.activeProfile] || loadSettings();

// ── Single Source of Truth: In-Memory Cached CSV Ledger ─────────────
const donationsCache = {};

function getTodayYearMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getDonationsCsvPath(profileNameOrYm, yearMonth) {
  let ym = yearMonth;
  if (!ym && profileNameOrYm && /^\d{4}-\d{2}$/.test(profileNameOrYm)) {
    ym = profileNameOrYm;
  }
  if (!ym) ym = getTodayYearMonth();
  const [year, month] = ym.split('-');
  return path.join(DATA_DIR, year, `${month}.csv`);
}

function getAvailableProfileMonths(profileName) {
  if (!fs.existsSync(DATA_DIR)) return [];

  const months = [];
  try {
    const years = fs.readdirSync(DATA_DIR).filter(y => /^\d{4}$/.test(y));
    for (const yr of years) {
      const yearDir = path.join(DATA_DIR, yr);
      const files = fs.readdirSync(yearDir).filter(f => /^\d{2}\.csv$/.test(f));
      for (const f of files) {
        const mo = f.replace('.csv', '');
        months.push(`${yr}-${mo}`);
      }
    }
  } catch (e) {
    log.error('Database', 'Error scanning data months: ' + e.message);
  }
  return months.sort().reverse();
}

// ── LRU Historical Cache Manager (< 15 MB RAM Target) ──────────────
const MAX_HISTORICAL_CACHED_MONTHS = 2;
const historicalCacheKeys = [];

function touchHistoricalCache(cacheKey) {
  const idx = historicalCacheKeys.indexOf(cacheKey);
  if (idx !== -1) {
    historicalCacheKeys.splice(idx, 1);
  }
  historicalCacheKeys.push(cacheKey);

  // Evict oldest historical month if over limit
  while (historicalCacheKeys.length > MAX_HISTORICAL_CACHED_MONTHS) {
    const oldestKey = historicalCacheKeys.shift();
    if (oldestKey && donationsCache[oldestKey]) {
      delete donationsCache[oldestKey];
    }
  }
}

/**
 * Returns sorted list of candidate months (YYYY-MM, descending) that intersect with the provided date filters.
 */
function getFilteredProfileMonths(profileName, filters = {}) {
  const allMonths = getAvailableProfileMonths();
  if (!allMonths.length) return [];

  const { month, specificDate, startDate, endDate } = filters;

  // 1. Direct month filter (e.g. '2026-05')
  if (month && month !== 'all' && /^\d{4}-\d{2}$/.test(month)) {
    return allMonths.includes(month) ? [month] : [];
  }

  // 2. Specific exact date filter (e.g. '2026-07-15')
  if (specificDate && /^\d{4}-\d{2}-\d{2}$/.test(specificDate)) {
    const targetYm = specificDate.substring(0, 7);
    return allMonths.includes(targetYm) ? [targetYm] : [];
  }

  // 3. Start/End date bounds (e.g. startDate: '2026-03-10', endDate: '2026-05-20')
  const startYm = startDate && /^\d{4}-\d{2}/.test(startDate) ? startDate.substring(0, 7) : null;
  const endYm = endDate && /^\d{4}-\d{2}/.test(endDate) ? endDate.substring(0, 7) : null;

  if (startYm || endYm) {
    return allMonths.filter(ym => {
      if (startYm && ym < startYm) return false;
      if (endYm && ym > endYm) return false;
      return true;
    });
  }

  return allMonths;
}

/**
 * Fast stream line-counter to compute record counts in monthly CSV files without holding full JS objects in RAM.
 */
function countMonthlyTransactionsFast(profileName, monthKey) {
  const filePath = getDonationsCsvPath(monthKey);
  try {
    if (!fs.existsSync(filePath)) return 0;
    const content = fs.readFileSync(filePath, 'utf8');
    let lines = 0;
    for (let i = 0; i < content.length; i++) {
      if (content.charCodeAt(i) === 10) lines++; // '\n'
    }
    if (content.length > 0 && content.charCodeAt(content.length - 1) !== 10) lines++;
    return Math.max(0, lines - 1);
  } catch (_) {
    return 0;
  }
}

function loadDonations(profileName, monthKey, options = {}) {
  const currentActiveYm = getTodayYearMonth();
  const ymKey = (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) ? monthKey : (options.filters && options.filters.month);

  // If specific month is requested
  if (ymKey && ymKey !== 'all') {
    const cacheKey = `ledger_${ymKey}`;
    if (donationsCache[cacheKey]) {
      if (ymKey !== currentActiveYm) touchHistoricalCache(cacheKey);
      return donationsCache[cacheKey];
    }
    const filePath = getDonationsCsvPath(ymKey);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const rawTxs = PaymentsCsv.parseCsv(content);
        const seen = new Set();
        const txs = [];
        for (const t of rawTxs) {
          const k = t.id || `${t.timestamp}_${t.sender}_${t.amount}`;
          if (!seen.has(k)) {
            seen.add(k);
            txs.push(t);
          }
        }
        const cleanContent = PaymentsCsv.serializeCsv(txs);
        const rawNormalized = content.replace(/\r\n/g, '\n').trim();
        const cleanNormalized = cleanContent.replace(/\r\n/g, '\n').trim();
        const contentChanged = rawNormalized !== cleanNormalized;

        if (rawTxs.length > txs.length || contentChanged) {
          try {
            fs.writeFileSync(filePath, cleanContent, 'utf8');
            if (rawTxs.length > txs.length) {
              log.info('DonationsCSV', `🧹 Auto-sanitized ${rawTxs.length - txs.length} duplicate row(s) in ${filePath}`);
            }
            if (contentChanged && rawTxs.length === txs.length) {
              log.info('DonationsCSV', `📅 Auto-sanitized dates/formatting in ${filePath}`);
            }
          } catch (_) { }
        }
        donationsCache[cacheKey] = txs;
        if (ymKey !== currentActiveYm) touchHistoricalCache(cacheKey);
        return txs;
      }
    } catch (e) {
      log.error('DonationsCSV', `Failed to load donations CSV (${filePath}): ` + e.message);
    }
    donationsCache[cacheKey] = [];
    if (ymKey !== currentActiveYm) touchHistoricalCache(cacheKey);
    return [];
  }

  // If filtered months or all history is requested
  const targetMonths = options.filters ? getFilteredProfileMonths(null, options.filters) : getAvailableProfileMonths();
  let allTxs = [];
  for (const ym of targetMonths) {
    const monthTxs = loadDonations(null, ym);
    allTxs = allTxs.concat(monthTxs);
  }
  allTxs.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return allTxs;
}

function clearAllDonationLedgers() {
  try {
    if (fs.existsSync(DATA_DIR)) {
      const years = fs.readdirSync(DATA_DIR).filter(f => /^\d{4}$/.test(f));
      for (const yr of years) {
        const yrPath = path.join(DATA_DIR, yr);
        try {
          const files = fs.readdirSync(yrPath).filter(f => f.endsWith('.csv'));
          for (const file of files) {
            try { fs.unlinkSync(path.join(yrPath, file)); } catch (_) { }
          }
          if (fs.readdirSync(yrPath).length === 0) {
            try { fs.rmdirSync(yrPath); } catch (_) { }
          }
        } catch (_) { }
      }
    }
    // Flush all in-memory ledger caches
    Object.keys(donationsCache).forEach(k => {
      if (k.startsWith('ledger_')) delete donationsCache[k];
    });
    historicalCacheKeys.length = 0;
    return true;
  } catch (err) {
    log.error('DonationsCSV', 'Error clearing donation ledgers: ' + err.message);
    return false;
  }
}

function saveDonations(profileName, transactions) {
  try {
    const groups = {};
    const realTransactions = (transactions || []).filter(t => !t.simulated);
    const seen = new Set();
    const uniqueTxs = [];

    for (const t of realTransactions) {
      const k = t.id || `${t.timestamp}_${t.sender}_${t.amount}`;
      if (!seen.has(k)) {
        seen.add(k);
        uniqueTxs.push(t);
      }
    }

    uniqueTxs.forEach(t => {
      const rawTx = {
        ...t,
        sender: t.rawSender || t.sender
      };
      delete rawTx.rawSender;

      let ym = PaymentsCsv.getMonthKey(rawTx.date || rawTx.timestamp);
      if (!ym) ym = getTodayYearMonth();
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(rawTx);
    });

    // Clean up any historical month shards that exist on disk but now have 0 transactions
    const existingMonths = getAvailableProfileMonths();
    for (const ym of existingMonths) {
      if (!groups[ym]) {
        const filePath = getDonationsCsvPath(ym);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) { }
        }
        const fileDir = path.dirname(filePath);
        try {
          if (fs.existsSync(fileDir) && fs.readdirSync(fileDir).length === 0) {
            fs.rmdirSync(fileDir);
          }
        } catch (_) { }
        delete donationsCache[`ledger_${ym}`];
      }
    }

    for (const [ym, txs] of Object.entries(groups)) {
      const filePath = getDonationsCsvPath(ym);
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
      const content = PaymentsCsv.serializeCsv(txs);
      fs.writeFileSync(filePath, content, 'utf8');
      donationsCache[`ledger_${ym}`] = txs;
    }

    return true;
  } catch (e) {
    log.error('DonationsCSV', `Failed to save donations CSV: ` + e.message);
    return false;
  }
}

function appendDonation(profileName, tx) {
  if (tx.simulated) return;

  let ym = PaymentsCsv.getMonthKey(tx.date || tx.timestamp);
  if (!ym) ym = getTodayYearMonth();

  const filePath = getDonationsCsvPath(ym);
  const cacheKey = `ledger_${ym}`;

  try {
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    // Deduplication check: prevent appending duplicate transactions
    const existing = donationsCache[cacheKey] || (fs.existsSync(filePath) ? loadDonations(null, ym) : []);
    const txKey = tx.id || `${tx.timestamp}_${tx.sender}_${tx.amount}`;
    if (existing.some(t => (t.id || `${t.timestamp}_${t.sender}_${t.amount}`) === txKey)) {
      return true; // Already recorded, prevent duplicate insertion
    }

    const rawTx = { ...tx, sender: tx.rawSender || tx.sender };
    delete rawTx.rawSender;
    const row = PaymentsCsv.formatCsvRow(rawTx) + '\n';

    if (!fs.existsSync(filePath)) {
      const content = PaymentsCsv.serializeCsv([rawTx]);
      fs.writeFileSync(filePath, content, 'utf8');
      donationsCache[cacheKey] = [tx];
    } else {
      fs.appendFileSync(filePath, row, 'utf8');
      if (donationsCache[cacheKey]) {
        donationsCache[cacheKey].unshift(tx);
      } else {
        loadDonations(null, ym);
      }
    }
    return true;
  } catch (e) {
    log.error('DonationsCSV', `Failed to append donation to ${filePath}: ` + e.message);
    return false;
  }
}

function migrateLegacyCsvDatabases() {
  try {
    if (!fs.existsSync(DATA_DIR)) return;
    const entries = fs.readdirSync(DATA_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const match = entry.name.match(/^donations_(.+?)\.csv$/);
        if (match) {
          const filePath = path.join(DATA_DIR, entry.name);
          log.info('Migration', `Found legacy flat CSV database: ${entry.name}`);
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const txs = PaymentsCsv.parseCsv(content);
            if (txs.length > 0) {
              log.info('Migration', `Consolidating ${txs.length} legacy transactions to unified ledger...`);
              saveDonations(null, txs);
            }
            fs.renameSync(filePath, filePath + '.bak');
          } catch (err) {
            log.error('Migration', `Failed to migrate legacy CSV ${entry.name}: ` + err.message);
          }
        }
      }
    }
  } catch (e) {
    log.error('Migration', 'Error listing legacy CSV files: ' + e.message);
  }
}

migrateLegacyCsvDatabases();

// ── Unified Metadata Cache Helpers (data/metadata.json) ──────────
function getMetadataPath() {
  return path.join(DATA_DIR, 'metadata.json');
}

function loadProfileMetadata(profileName) {
  const filePath = getMetadataPath();
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
  } catch (e) {
    log.error('Metadata', 'Load error: ' + e.message);
  }
  return {
    goal: { currentAmount: 0 },
    leaderboard: { supporters: {} },
    recent: { recentDonations: [] }
  };
}

function saveProfileMetadata(profileName, metadata) {
  const filePath = getMetadataPath();
  try {
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), 'utf8');
    return true;
  } catch (e) {
    log.error('Metadata', 'Save error: ' + e.message);
    return false;
  }
}

function syncDerivedMetricsToSettings(profileName, broadcast = true, newTx = null, forceRebuild = false) {
  const profile = profileName || (profilesStore && profilesStore.activeProfile) || 'Default';
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const startAmount = parseFloat(targetSettings.widgets?.goal?.startAmount) || 0;

  let metadata;

  if (newTx && !newTx.simulated) {
    // Incremental sync for real-time performance (prevents heavy historical CSV file parses during streams)
    metadata = loadProfileMetadata(profile);

    if (!metadata.goal) metadata.goal = { currentAmount: startAmount };
    if (!metadata.leaderboard) metadata.leaderboard = { supporters: {} };
    if (!metadata.recent) metadata.recent = { recentDonations: [] };

    const amt = parseFloat(newTx.amount) || 0;
    metadata.goal.currentAmount = (parseFloat(metadata.goal.currentAmount) || 0) + amt;

    const rawSender = newTx.sender || 'Anonymous';
    const donorName = aliasesStore.formatDonorName(rawSender, targetSettings, profile);

    const supporters = metadata.leaderboard.supporters || {};
    supporters[donorName] = (parseFloat(supporters[donorName]) || 0) + amt;
    metadata.leaderboard.supporters = supporters;

    let recent = metadata.recent.recentDonations || [];
    if (!Array.isArray(recent)) recent = [];
    const decorated = decorateWithTemplate({ ...newTx, rawSender: rawSender, sender: donorName }, profile);
    recent.unshift(decorated);
    if (recent.length > 50) recent = recent.slice(0, 50);
    metadata.recent.recentDonations = recent;

    saveProfileMetadata(profile, metadata);
  } else {
    // Full sync from disk files (re-evaluates transactions with active donor aliases)
    const rawTransactions = loadDonations(profile);
    const transactions = decorateWithDisplayName(rawTransactions, targetSettings, profile);
    const metrics = PaymentsCsv.computeMetrics(transactions, { startAmount, includeSimulated: false });

    // Preserve active goal's current progress rather than overwriting with all-time historical total revenue
    const existingMeta = loadProfileMetadata(profile);
    const preservedGoalAmount = (existingMeta?.goal?.currentAmount !== undefined)
      ? parseFloat(existingMeta.goal.currentAmount)
      : ((targetSettings.widgets?.goal?.currentAmount !== undefined)
        ? parseFloat(targetSettings.widgets.goal.currentAmount)
        : 0);

    metadata = {
      goal: { currentAmount: isNaN(preservedGoalAmount) ? 0 : preservedGoalAmount },
      leaderboard: { supporters: metrics.supporters },
      recent: { recentDonations: metrics.recentDonations }
    };

    saveProfileMetadata(profile, metadata);
  }

  // Merge into in-memory settings for widgets and websocket broadcasts
  if (!targetSettings.widgets) targetSettings.widgets = {};
  if (!targetSettings.widgets.goal) targetSettings.widgets.goal = {};
  if (!targetSettings.widgets.leaderboard) targetSettings.widgets.leaderboard = {};
  if (!targetSettings.widgets.recent) targetSettings.widgets.recent = {};

  targetSettings.widgets.goal.currentAmount = metadata.goal.currentAmount;
  targetSettings.widgets.leaderboard.supporters = metadata.leaderboard.supporters;
  targetSettings.widgets.recent.recentDonations = metadata.recent.recentDonations;

  if (profile === profilesStore.activeProfile) {
    alertSettings = targetSettings;
  }
  saveSettings(alertSettings);
  profilesStore.profiles[profile] = targetSettings;
  saveProfilesStore(profilesStore);

  if (broadcast) {
    broadcastSettings(alertSettings);
  }
  return {
    goalAmount: targetSettings.widgets.goal.currentAmount,
    supporters: targetSettings.widgets.leaderboard.supporters,
    recentDonations: targetSettings.widgets.recent.recentDonations
  };
}

// Initial Auto-Migration from settings.json to donations.csv if CSV doesn't exist
function autoMigrateInitialDonations() {
  try {
    const activeProf = profilesStore.activeProfile || 'Default';
    const availableMonths = getAvailableProfileMonths(activeProf);
    if (availableMonths.length === 0) {
      const filePath = getDonationsCsvPath(activeProf);
      const supporters = alertSettings.widgets?.leaderboard?.supporters || {};
      const recentList = alertSettings.widgets?.recent?.recentDonations || [];
      const txs = [];
      const now = Date.now();

      if (Array.isArray(recentList) && recentList.length > 0) {
        recentList.forEach((r, idx) => {
          const amtNum = parseFloat(TemplateMatcher.parseAmount(r.amount || r.amountValue)) || 0;
          const ts = Number(r.timestamp) || (now - (idx + 1) * 60000);
          txs.push({
            id: r.id || `migrated_recent_${ts}_${idx}`,
            timestamp: ts,
            date: new Date(ts).toISOString().split('T')[0],
            time: new Date(ts).toTimeString().split(' ')[0],
            sender: r.sender || 'Unknown',
            amount: amtNum,
            currency: 'INR',
            rawAmount: PaymentsCsv.formatCurrency(amtNum, 'INR'),
            sourceApp: r.sourceApp || 'Migrated Data',
            message: r.message || '',
            templateId: '',
            simulated: false
          });
        });
      }

      const recordedSupporters = new Set(txs.map(t => t.sender));
      Object.entries(supporters).forEach(([name, total]) => {
        if (!recordedSupporters.has(name)) {
          const amt = parseFloat(total) || 0;
          if (amt > 0) {
            txs.push({
              id: `migrated_supporter_${Date.now()}_${name.replace(/[^a-z0-9]/gi, '')}`,
              timestamp: now,
              date: new Date(now).toISOString().split('T')[0],
              time: new Date(now).toTimeString().split(' ')[0],
              sender: name,
              amount: amt,
              currency: 'INR',
              rawAmount: PaymentsCsv.formatCurrency(amt, 'INR'),
              sourceApp: 'Migrated Data',
              message: '',
              templateId: '',
              simulated: false
            });
          }
        }
      });

      saveDonations(activeProf, txs);
      log.info('DonationsCSV', `Initialized ${filePath} with ${txs.length} initial migrated transactions.`);
      syncDerivedMetricsToSettings(activeProf, false);
    } else {
      syncDerivedMetricsToSettings(activeProf, false);
    }
  } catch (e) {
    log.error('DonationsCSV', 'Auto-migration error: ' + e.message);
  }
}

autoMigrateInitialDonations();

// ── Alert ID deduplication ────────────────────────────────────────────
const processedAlertIds = new Set();

function broadcastSettings(settings) {
  const target = settings || alertSettings;
  const metadata = loadProfileMetadata();
  if (target && target.widgets) {
    if (!target.widgets.goal) target.widgets.goal = {};
    if (!target.widgets.leaderboard) target.widgets.leaderboard = {};
    if (!target.widgets.recent) target.widgets.recent = {};
    if (metadata.goal) target.widgets.goal.currentAmount = metadata.goal.currentAmount || 0;
    if (metadata.leaderboard) target.widgets.leaderboard.supporters = metadata.leaderboard.supporters || {};
    if (metadata.recent) target.widgets.recent.recentDonations = metadata.recent.recentDonations || [];
  }
  const payload = JSON.stringify({ type: 'SETTINGS_UPDATED', payload: target, activeProfile: profilesStore.activeProfile });
  obsClients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

// ── Amount filter ─────────────────────────────────────────────────────
const parseAmountNum = (rawAmount) => TemplateMatcher.parseAmount(rawAmount);

function decorateWithTemplate(event, profile = '', liveSettings = null) {
  const currentSettings = liveSettings || alertSettings;
  const amount = parseAmountNum(event.amount);
  const rawSender = event.rawSender || event.sender || 'Anonymous';
  const targetProf = profile || (profilesStore && profilesStore.activeProfile) || 'Default';
  const formattedSender = aliasesStore.formatDonorName(rawSender, currentSettings, targetProf);
  if (event.alertTemplateId) {
    const template = currentSettings.alertTemplates && currentSettings.alertTemplates.find(t => t.id === event.alertTemplateId);
    return {
      ...event,
      rawSender: rawSender,
      sender: formattedSender,
      amountValue: amount,
      alertTemplateId: template ? template.id : event.alertTemplateId,
      alertTemplateName: template ? template.name : ''
    };
  }
  const template = TemplateMatcher.select(currentSettings.alertTemplates, amount);
  return {
    ...event,
    rawSender: rawSender,
    sender: formattedSender,
    amountValue: amount,
    alertTemplateId: template ? template.id : null,
    alertTemplateName: template ? template.name : ''
  };
}

function processPaymentForGoalAndLeaderboard(notification) {
  try {
    const isSimulated = notification.simulated === true || notification.source === 'tester';
    const isIsolated = alertSettings.simulation ? alertSettings.simulation.isolatedMode !== false : true;

    // Strict guard: Never write simulated test alerts to persistent CSV if they are not real alerts
    if (isSimulated && isIsolated) {
      log.info('Payment', `[Simulation Mode: Isolated] Skipped live payment recording to CSV for ₹${notification.amount || '0'} from "${notification.sender || 'Test'}"`);
      return;
    }

    const alertId = notification.alertId || notification.eventId || notification.id || (notification.timestamp ? `${notification.packageName || notification.appName || ''}_${notification.timestamp}_${notification.amount || ''}` : null);
    if (alertId && processedAlertIds.has(alertId)) {
      log.dedup('Dedup', `alertId ${alertId} already processed — overlay only`);
      return;
    }

    const numAmount = parseAmountNum(notification.amount);
    const effectiveAmount = numAmount > 0 ? numAmount : 0;

    const rawSenderName = cleanSender(notification.rawSender || notification.sender || notification.title || 'Unknown');
    const formattedSenderName = aliasesStore.formatDonorName(rawSenderName, alertSettings, profilesStore.activeProfile);

    const now = Number(notification.timestamp) || Date.now();
    const d = new Date(now);

    const currencyCode = (notification.currency || 'INR').toUpperCase();
    const tx = {
      id: alertId || `evt_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      date: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '',
      time: !isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : '',
      rawSender: rawSenderName,
      sender: formattedSenderName,
      amount: effectiveAmount,
      currency: currencyCode,
      rawAmount: PaymentsCsv.formatCurrency(effectiveAmount, currencyCode),
      sourceApp: notification.sourceApp || notification.appName || 'Unknown',
      message: notification.message || '',
      templateId: notification.alertTemplateId || '',
      simulated: false
    };

    appendDonation(profilesStore.activeProfile, tx);

    const metrics = syncDerivedMetricsToSettings(profilesStore.activeProfile, true, tx);
    if (alertId) processedAlertIds.add(alertId);

    log.info('Payment', `[CSV Recorded] ₹${effectiveAmount} from "${rawSenderName}" via ${tx.sourceApp} | Total Goal: ₹${metrics.goalAmount} | AlertID=${tx.id}`);
  } catch (e) {
    log.error('Payment', 'Error in processPaymentForGoalAndLeaderboard: ' + e.message);
  }
}

// ── Routes ───────────────────────────────────────────────────────────
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));
app.get('/config', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'config.html')));
app.get('/preview', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'preview.html')));
app.get('/overlay/alerts', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
app.get('/overlay/alert', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
app.get('/overlay/goal', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'goal.html')));
app.get('/overlay/list', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));
app.get('/overlay/lists', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));
app.get('/overlay/leaderboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));
app.get('/overlay/recent', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));
app.get('/overlay/cycling-widget', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'cycling-widget.html')));
app.get('/overlay', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
app.get('/alerts', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
app.get('/alert', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'overlay.html')));
app.get('/goal', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'goal.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));
app.get('/list', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'list.html')));

app.get('/api/payment-rules', (req, res) => res.json(paymentRulesStore));

// ── CSV Donations & Analytics Endpoints ──────────────────────────────
app.get('/api/donations/months', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const months = getAvailableProfileMonths(profile);
  res.json({ ok: true, profile, months });
});

app.get('/api/analytics', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const month = req.query.month || 'all';
  const provider = req.query.provider || 'all';
  const search = req.query.search || '';
  const minAmount = req.query.minAmount || '';
  const maxAmount = req.query.maxAmount || '';
  const specificDate = req.query.date || req.query.specificDate || '';
  const { startDate, endDate } = normalizeDateBounds(req.query.startDate, req.query.endDate);

  const filterOptions = {
    month,
    provider,
    search,
    minAmount,
    maxAmount,
    specificDate,
    startDate,
    endDate
  };

  const transactions = loadDonations(profile, month, { filters: filterOptions });
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const startAmount = parseFloat(targetSettings.widgets?.goal?.startAmount) || 0;

  const metrics = PaymentsCsv.computeMetrics(transactions, {
    startAmount,
    includeSimulated: false,
    filters: filterOptions
  });

  const timelineMode = req.query.timelineMode || req.query.trendMode || 'month';
  const timeline = PaymentsCsv.computeTimelineData(transactions, timelineMode);

  const donutMode = req.query.donutMode || 'all';
  const donutTxs = PaymentsCsv.filterByTimeframe(transactions, donutMode);
  const detachedDonut = PaymentsCsv.computeDonutSegments(donutTxs);

  res.json({
    ok: true,
    profile,
    filters: { month, provider, search, minAmount, maxAmount, specificDate, startDate, endDate, timelineMode, donutMode },
    analytics: {
      ...metrics.analytics,
      donut: detachedDonut,
      timeline
    },
    count: metrics.totalCount
  });
});

app.get('/api/donations/query', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const month = req.query.month || 'all';
  const provider = req.query.provider || 'all';
  const search = req.query.search || '';
  const alias = req.query.alias || '';
  const minAmount = req.query.minAmount || '';
  const maxAmount = req.query.maxAmount || '';
  const specificDate = req.query.date || req.query.specificDate || '';
  const { startDate, endDate } = normalizeDateBounds(req.query.startDate, req.query.endDate);
  const sort = (req.query.sort || 'desc').toLowerCase();
  const sortBy = (req.query.sortBy || 'date').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));

  const filterOptions = {
    month,
    provider,
    search,
    alias,
    minAmount,
    maxAmount,
    specificDate,
    startDate,
    endDate,
    includeSimulated: false
  };

  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const candidateMonths = getFilteredProfileMonths(profile, filterOptions);

  // Fast path: Date descending (newest first - default table view)
  if (sortBy === 'date' && sort === 'desc') {
    let collectedFiltered = [];
    const neededCount = page * limit;
    let totalCount = 0;

    for (let i = 0; i < candidateMonths.length; i++) {
      const ym = candidateMonths[i];
      const monthRaw = loadDonations(profile, ym);
      const monthDecorated = decorateWithDisplayName(monthRaw, targetSettings);
      const monthFiltered = PaymentsCsv.filterTransactions(monthDecorated, filterOptions);

      monthFiltered.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
      collectedFiltered = collectedFiltered.concat(monthFiltered);
      totalCount += monthFiltered.length;

      // Early-Exit: If we collected enough items and have unconstrained trailing months, count remaining fast
      if (collectedFiltered.length >= neededCount && !search && !alias && provider === 'all' && !minAmount && !maxAmount && !specificDate) {
        for (let j = i + 1; j < candidateMonths.length; j++) {
          totalCount += countMonthlyTransactionsFast(profile, candidateMonths[j]);
        }
        break;
      }
    }

    const total = totalCount;
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const slice = collectedFiltered.slice(startIndex, startIndex + limit);

    return res.json({
      ok: true,
      profile,
      sort,
      page,
      limit,
      total,
      totalPages,
      transactions: slice
    });
  }

  // Fallback for custom sorts (e.g. amount asc/desc, date asc): load only candidate pruned months
  const rawTransactions = loadDonations(profile, month, { filters: filterOptions });
  const allTransactions = decorateWithDisplayName(rawTransactions, targetSettings);
  const filtered = PaymentsCsv.filterTransactions(allTransactions, filterOptions);

  if (sortBy === 'amount') {
    if (sort === 'asc') {
      filtered.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
    } else {
      filtered.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    }
  } else {
    if (sort === 'asc') {
      filtered.sort((a, b) => (Number(a.timestamp) || 0) - (Number(b.timestamp) || 0));
    } else {
      filtered.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    }
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const startIndex = (page - 1) * limit;
  const slice = filtered.slice(startIndex, startIndex + limit);

  res.json({
    ok: true,
    profile,
    sort,
    page,
    limit,
    total,
    totalPages,
    transactions: slice
  });
});

app.get('/api/donations', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const rawTransactions = loadDonations(profile);
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const transactions = decorateWithDisplayName(rawTransactions, targetSettings);
  const startAmount = parseFloat(targetSettings.widgets?.goal?.startAmount) || 0;
  const metrics = PaymentsCsv.computeMetrics(transactions, { startAmount, includeSimulated: false });
  res.json({
    ok: true,
    profile,
    count: transactions.length,
    transactions,
    metrics
  });
});

// ── Donor Aliases API ──────────────────────────────────────────
app.get('/api/aliases', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  res.json({ ok: true, profile, aliases: aliasesStore.getAliases(profile) });
});

app.get('/api/aliases/csv', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const aliasList = aliasesStore.getAliases(profile);

  let csv = 'sender,alias,updatedAt\n';
  for (const entry of aliasList) {
    csv += `${escapeCsvField(entry.sender)},${escapeCsvField(entry.alias)},${escapeCsvField(entry.updatedAt)}\n`;
  }

  const filename = `aliases_${profile}_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
});

app.post('/api/aliases', (req, res) => {
  const profile = req.body.profile || req.query.profile || profilesStore.activeProfile;
  const { sender, alias, note } = req.body || {};
  if (!sender || !alias) {
    return res.status(400).json({ ok: false, error: 'Sender and alias are required' });
  }
  aliasesStore.setAlias(sender, alias, profile);
  log.info('AliasesStore', `Set donor alias for "${sender}" -> "${alias}" [Profile: ${profile}]`);
  const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
  res.json({ ok: true, profile, aliases: aliasesStore.getAliases(profile), metrics });
});

app.delete('/api/aliases/:sender', (req, res) => {
  const profile = req.query.profile || req.body?.profile || profilesStore.activeProfile;
  const sender = req.params.sender;
  if (!sender) {
    return res.status(400).json({ ok: false, error: 'Sender parameter required' });
  }
  aliasesStore.deleteAlias(sender, profile);
  log.info('AliasesStore', `Deleted donor alias for "${sender}" [Profile: ${profile}]`);
  const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
  res.json({ ok: true, profile, aliases: aliasesStore.getAliases(profile), metrics });
});

function normalizeDateBounds(startDateStr, endDateStr) {
  let startDate = startDateStr || '';
  if (startDate && startDate.length === 7) {
    startDate = `${startDate}-01`;
  }
  let endDate = endDateStr || '';
  if (endDate && endDate.length === 7) {
    const [year, monthVal] = endDate.split('-').map(Number);
    const lastDay = new Date(year, monthVal, 0).getDate();
    endDate = `${endDate}-${String(lastDay).padStart(2, '0')}`;
  }
  return { startDate, endDate };
}

function getMonthsInRange(startDateStr, endDateStr) {
  if (!startDateStr || !endDateStr) return [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];

  const months = [];
  let current = new Date(start.getFullYear(), start.getMonth(), 1);
  const targetEnd = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= targetEnd) {
    const yr = current.getFullYear();
    const mo = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${yr}-${mo}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

app.get('/api/donations/csv', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const month = req.query.month || 'all';
  const provider = req.query.provider || 'all';
  const search = req.query.search || '';
  const minAmount = req.query.minAmount || '';
  const maxAmount = req.query.maxAmount || '';
  const specificDate = req.query.date || req.query.specificDate || '';
  const { startDate, endDate } = normalizeDateBounds(req.query.startDate, req.query.endDate);

  let transactions = [];
  if (startDate && endDate) {
    const months = getMonthsInRange(startDate, endDate);
    for (const ym of months) {
      transactions = transactions.concat(loadDonations(profile, ym));
    }
  } else {
    transactions = loadDonations(profile, month);
  }

  const filtered = PaymentsCsv.filterTransactions(transactions, {
    month,
    provider,
    search,
    minAmount,
    maxAmount,
    specificDate,
    startDate,
    endDate,
    includeSimulated: false
  });

  // Sort descending by timestamp
  filtered.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  const csvContent = PaymentsCsv.serializeCsv(filtered);
  const rangeSuffix = (startDate && endDate) ? `${startDate}_to_${endDate}` : month;
  const filename = `earnings_${profile}_filtered_${rangeSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

function escapeCsvField(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

class ZipBuilder {
  constructor() {
    this.files = [];
  }

  addFile(filename, contentBuffer) {
    const buf = Buffer.isBuffer(contentBuffer) ? contentBuffer : Buffer.from(String(contentBuffer || ''), 'utf8');
    const filenameBuf = Buffer.from(filename, 'utf8');
    const crc = zlib.crc32 ? zlib.crc32(buf) : 0;

    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

    this.files.push({
      name: filename,
      nameBuf: filenameBuf,
      content: buf,
      crc: crc,
      dosTime: dosTime,
      dosDate: dosDate,
      uncompressedSize: buf.length,
      compressedSize: buf.length
    });
  }

  toBuffer() {
    const localHeaders = [];
    const cdEntries = [];
    let offset = 0;

    for (const f of this.files) {
      const header = Buffer.alloc(30 + f.nameBuf.length);
      header.writeUInt32LE(0x04034b50, 0);
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(0, 6);
      header.writeUInt16LE(0, 8);
      header.writeUInt16LE(f.dosTime, 10);
      header.writeUInt16LE(f.dosDate, 12);
      header.writeUInt32LE(f.crc, 14);
      header.writeUInt32LE(f.compressedSize, 18);
      header.writeUInt32LE(f.uncompressedSize, 22);
      header.writeUInt16LE(f.nameBuf.length, 26);
      header.writeUInt16LE(0, 28);
      f.nameBuf.copy(header, 30);

      const cdEntry = Buffer.alloc(46 + f.nameBuf.length);
      cdEntry.writeUInt32LE(0x02014b50, 0);
      cdEntry.writeUInt16LE(20, 4);
      cdEntry.writeUInt16LE(20, 6);
      cdEntry.writeUInt16LE(0, 8);
      cdEntry.writeUInt16LE(0, 10);
      cdEntry.writeUInt16LE(f.dosTime, 12);
      cdEntry.writeUInt16LE(f.dosDate, 14);
      cdEntry.writeUInt32LE(f.crc, 16);
      cdEntry.writeUInt32LE(f.compressedSize, 20);
      cdEntry.writeUInt32LE(f.uncompressedSize, 24);
      cdEntry.writeUInt16LE(f.nameBuf.length, 28);
      cdEntry.writeUInt16LE(0, 30);
      cdEntry.writeUInt16LE(0, 32);
      cdEntry.writeUInt16LE(0, 34);
      cdEntry.writeUInt16LE(0, 36);
      cdEntry.writeUInt32LE(0, 38);
      cdEntry.writeUInt32LE(offset, 42);
      f.nameBuf.copy(cdEntry, 46);

      localHeaders.push(header, f.content);
      cdEntries.push(cdEntry);
      offset += header.length + f.content.length;
    }

    const cdStart = offset;
    let cdSize = 0;
    for (const cd of cdEntries) cdSize += cd.length;

    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(this.files.length, 8);
    eocd.writeUInt16LE(this.files.length, 10);
    eocd.writeUInt32LE(cdSize, 12);
    eocd.writeUInt32LE(cdStart, 16);
    eocd.writeUInt16LE(0, 20);

    return Buffer.concat([...localHeaders, ...cdEntries, eocd]);
  }
}

function parseZipEntries(buffer) {
  const entries = [];
  if (!Buffer.isBuffer(buffer) || buffer.length < 30) return entries;

  let offset = 0;
  while (offset + 30 <= buffer.length) {
    const sig = buffer.readUInt32LE(offset);
    if (sig !== 0x04034b50) break;

    const compMethod = buffer.readUInt16LE(offset + 8);
    const compSize = buffer.readUInt32LE(offset + 18);
    const nameLen = buffer.readUInt16LE(offset + 26);
    const extraLen = buffer.readUInt16LE(offset + 28);

    const name = buffer.toString('utf8', offset + 30, offset + 30 + nameLen);
    const dataStart = offset + 30 + nameLen + extraLen;
    const rawData = buffer.subarray(dataStart, dataStart + compSize);

    let content = '';
    if (compMethod === 0) {
      content = rawData.toString('utf8');
    } else if (compMethod === 8) {
      try { content = zlib.inflateRawSync(rawData).toString('utf8'); } catch (_) { }
    }

    entries.push({ name, content });
    offset = dataStart + compSize;
  }
  return entries;
}

function parseCsvLineSimple(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

app.get('/api/donations/export-zip', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const month = req.query.month || 'all';
  const provider = req.query.provider || 'all';
  const search = req.query.search || '';
  const minAmount = req.query.minAmount || '';
  const maxAmount = req.query.maxAmount || '';
  const specificDate = req.query.date || req.query.specificDate || '';
  const { startDate, endDate } = normalizeDateBounds(req.query.startDate, req.query.endDate);

  let transactions = [];
  if (startDate && endDate) {
    const months = getMonthsInRange(startDate, endDate);
    for (const ym of months) {
      transactions = transactions.concat(loadDonations(profile, ym));
    }
  } else {
    transactions = loadDonations(profile, month);
  }

  const filtered = PaymentsCsv.filterTransactions(transactions, {
    month, provider, search, minAmount, maxAmount, specificDate, startDate, endDate, includeSimulated: false
  });
  filtered.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));

  const csvLedger = PaymentsCsv.serializeCsv(filtered);
  const aliasList = aliasesStore.getAliases(profile);

  let csvAliases = 'sender,alias,updatedAt\n';
  for (const entry of aliasList) {
    csvAliases += `${escapeCsvField(entry.sender)},${escapeCsvField(entry.alias)},${escapeCsvField(entry.updatedAt)}\n`;
  }

  const zip = new ZipBuilder();
  zip.addFile('earnings_ledger.csv', csvLedger);
  zip.addFile('aliases.csv', csvAliases);

  const zipBuf = zip.toBuffer();
  const rangeSuffix = (startDate && endDate) ? `${startDate}_to_${endDate}` : month;
  const filename = `streampe_earnings_backup_${profile}_${rangeSuffix}_${new Date().toISOString().split('T')[0]}.zip`;

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(zipBuf);
});

app.post('/api/donations/import', (req, res) => {
  try {
    const profile = req.body.profile || profilesStore.activeProfile;
    const mode = req.body.mode || 'replace';
    const rawContent = req.body.csv || req.body.data || '';

    if (!rawContent) {
      return res.status(400).json({ ok: false, error: 'Empty import content' });
    }

    let inputBuffer = null;
    if (typeof rawContent === 'string' && (rawContent.startsWith('data:') || /^[A-Za-z0-9+/=]+$/.test(rawContent.trim().substring(0, 100)))) {
      const base64Data = rawContent.includes('base64,') ? rawContent.split('base64,')[1] : rawContent;
      try { inputBuffer = Buffer.from(base64Data, 'base64'); } catch (_) { }
    }

    let importedTxs = [];
    let aliasCount = 0;

    const isZip = (inputBuffer && inputBuffer.length >= 4 && inputBuffer.readUInt32LE(0) === 0x04034b50) ||
      (typeof rawContent === 'string' && rawContent.startsWith('PK\x03\x04'));

    if (isZip) {
      const zipBuf = inputBuffer || Buffer.from(rawContent, 'binary');
      const entries = parseZipEntries(zipBuf);

      for (const entry of entries) {
        if (!entry.content) continue;
        const entryName = (entry.name || '').toLowerCase();
        const firstLine = entry.content.split(/\r?\n/)[0].toLowerCase();

        if (entryName.includes('alias') || (firstLine.includes('alias') && !firstLine.includes('amount'))) {
          const aliasLines = entry.content.split(/\r?\n/).filter(l => l.trim().length > 0);
          const startIdx = aliasLines[0].toLowerCase().startsWith('sender,alias') ? 1 : 0;
          for (let i = startIdx; i < aliasLines.length; i++) {
            const parts = parseCsvLineSimple(aliasLines[i]);
            if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
              aliasesStore.setAlias(parts[0].trim(), parts[1].trim(), profile);
              aliasCount++;
            }
          }
        } else if (entryName.includes('donations') || entryName.includes('ledger') || firstLine.includes('amount') || firstLine.includes('sourceapp')) {
          const txs = PaymentsCsv.parseCsv(entry.content);
          importedTxs = importedTxs.concat(txs);
        }
      }
    } else {
      const text = typeof rawContent === 'string' ? rawContent : rawContent.toString('utf8');
      const firstLine = text.split(/\r?\n/)[0].toLowerCase();
      if (firstLine.includes('alias') && !firstLine.includes('amount')) {
        const aliasLines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const startIdx = aliasLines[0].toLowerCase().startsWith('sender,alias') ? 1 : 0;
        for (let i = startIdx; i < aliasLines.length; i++) {
          const parts = parseCsvLineSimple(aliasLines[i]);
          if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
            aliasesStore.setAlias(parts[0].trim(), parts[1].trim(), profile);
            aliasCount++;
          }
        }
      } else {
        importedTxs = PaymentsCsv.parseCsv(text);
      }
    }

    let finalTxs = importedTxs;
    if (mode === 'replace') {
      clearAllDonationLedgers();
      if (importedTxs.length > 0) {
        saveDonations(profile, finalTxs);
      }
    } else if (importedTxs.length > 0) {
      if (mode === 'merge') {
        const existing = loadDonations(profile);
        const existingMap = new Map(existing.map(t => [t.id, t]));
        importedTxs.forEach(t => existingMap.set(t.id, t));
        finalTxs = Array.from(existingMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      }
      saveDonations(profile, finalTxs);
    }

    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Imported ${importedTxs.length} transactions, ${aliasCount} aliases into profile [${profile}]`);
    res.json({ ok: true, profile, importedCount: importedTxs.length, aliasCount, totalCount: finalTxs.length, metrics });
  } catch (e) {
    log.error('DonationsCSV', 'Import error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── In-App Version & Update Check API ───────────────────────
app.get(['/api/updates/check', '/api/version/check'], async (req, res) => {
  try {
    const forceRefresh = req.query.force === 'true' || req.query.refresh === '1';
    const currentVer = req.query.currentVersion || req.query.version || APP_VERSION;
    const result = await updateManager.checkForUpdates(currentVer, forceRefresh);
    res.json(result);
  } catch (err) {
    log.error('UpdateManager', 'Check updates error: ' + err.message);
    res.status(500).json({ ok: false, error: err.message, currentVersion: APP_VERSION });
  }
});

app.post('/api/donations/record', (req, res) => {
  try {
    const body = req.body || {};
    const profile = body.profile || profilesStore.activeProfile;
    const amountNum = parseFloat(TemplateMatcher.parseAmount(body.amount)) || 0;
    if (amountNum <= 0) return res.status(400).json({ ok: false, error: 'Valid amount is required' });

    const now = new Date();
    const curTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const curDateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const dateVal = PaymentsCsv.normalizeDate(body.date, body.timestamp || now.getTime()) || curDateStr;
    const timeVal = (body.time && String(body.time).trim())
      ? PaymentsCsv.normalizeTime(body.time, body.timestamp || now.getTime())
      : curTimeStr;

    let ts = null;
    const parsedDt = new Date(`${dateVal}T${timeVal}`);
    if (!isNaN(parsedDt.getTime())) {
      ts = parsedDt.getTime();
    } else if (body.timestamp && !isNaN(Number(body.timestamp))) {
      ts = Number(body.timestamp);
    } else {
      ts = now.getTime();
    }

    const currencyCode = (body.currency || 'INR').toUpperCase();

    const tx = {
      id: body.id || `manual_${ts}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: ts,
      date: dateVal,
      time: timeVal,
      sender: (body.sender || 'Anonymous').trim(),
      amount: amountNum,
      currency: currencyCode,
      rawAmount: PaymentsCsv.formatCurrency(amountNum, currencyCode),
      sourceApp: (body.sourceApp || 'Manual Entry').trim(),
      message: (body.message || '').trim(),
      templateId: body.templateId || '',
      simulated: !!body.simulated
    };

    const currentTxs = loadDonations(profile);
    currentTxs.unshift(tx);
    saveDonations(profile, currentTxs);

    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Recorded manual donation: ₹${amountNum} from "${tx.sender}" via ${tx.sourceApp}`);
    res.json({ ok: true, transaction: tx, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.put('/api/donations/:id', (req, res) => {
  try {
    const id = req.params.id;
    const body = req.body || {};
    const profile = body.profile || req.query.profile || profilesStore.activeProfile;
    const currentTxs = loadDonations(profile);

    const idx = currentTxs.findIndex(t => t.id === id);
    if (idx === -1) {
      return res.status(404).json({ ok: false, error: 'Transaction ID not found' });
    }

    const amountNum = parseFloat(TemplateMatcher.parseAmount(body.amount)) || currentTxs[idx].amount || 0;
    if (amountNum <= 0) return res.status(400).json({ ok: false, error: 'Valid amount is required' });

    const currencyCode = (body.currency || currentTxs[idx].currency || 'INR').toUpperCase();
    const existingTs = currentTxs[idx].timestamp || Date.now();
    const updatedDate = body.date !== undefined ? PaymentsCsv.normalizeDate(body.date, existingTs) : currentTxs[idx].date;
    let updatedTime = currentTxs[idx].time;
    if (body.time !== undefined) {
      updatedTime = (body.time && String(body.time).trim())
        ? PaymentsCsv.normalizeTime(body.time, existingTs)
        : currentTxs[idx].time;
    }

    let ts = null;
    const parsedDt = new Date(`${updatedDate}T${updatedTime}`);
    if (!isNaN(parsedDt.getTime())) {
      ts = parsedDt.getTime();
    } else if (body.timestamp && !isNaN(Number(body.timestamp))) {
      ts = Number(body.timestamp);
    } else {
      ts = existingTs;
    }

    currentTxs[idx] = {
      ...currentTxs[idx],
      timestamp: ts,
      sender: (body.sender !== undefined ? body.sender : currentTxs[idx].sender).trim(),
      amount: amountNum,
      currency: currencyCode,
      rawAmount: PaymentsCsv.formatCurrency(amountNum, currencyCode),
      sourceApp: (body.sourceApp !== undefined ? body.sourceApp : currentTxs[idx].sourceApp).trim(),
      date: updatedDate,
      time: updatedTime,
      message: (body.message !== undefined ? body.message : currentTxs[idx].message).trim()
    };

    saveDonations(profile, currentTxs);
    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Updated transaction ${id} in ${profile}: ₹${amountNum} from "${currentTxs[idx].sender}"`);
    res.json({ ok: true, transaction: currentTxs[idx], metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.delete('/api/donations/:id', (req, res) => {
  try {
    const id = req.params.id;
    const profile = req.query.profile || profilesStore.activeProfile;
    const currentTxs = loadDonations(profile);
    const filtered = currentTxs.filter(t => t.id !== id);

    if (filtered.length === currentTxs.length) {
      return res.status(404).json({ ok: false, error: 'Transaction ID not found' });
    }

    saveDonations(profile, filtered);
    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Deleted transaction ${id} from ${profile}`);
    res.json({ ok: true, deletedId: id, remainingCount: filtered.length, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/donations/clear', (req, res) => {
  try {
    const profile = req.body?.profile || profilesStore.activeProfile;
    clearAllDonationLedgers();

    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Cleared all transactions and monthly ledgers for ${profile}`);
    res.json({ ok: true, profile, count: 0, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/goal/reset', (req, res) => {
  try {
    const profile = req.body?.profile || profilesStore.activeProfile;
    const targetSettings = profilesStore.profiles[profile] || alertSettings;

    const meta = loadProfileMetadata(profile);
    if (!meta.goal) meta.goal = {};
    meta.goal.currentAmount = 0;
    saveProfileMetadata(profile, meta);

    if (targetSettings.widgets?.goal) {
      targetSettings.widgets.goal.currentAmount = 0;
    }
    if (profile === profilesStore.activeProfile) {
      alertSettings = targetSettings;
    }
    saveSettings(alertSettings);
    profilesStore.profiles[profile] = targetSettings;
    saveProfilesStore(profilesStore);
    broadcastSettings(alertSettings);

    log.info('Goal', `Reset stream goal for profile "${profile}" to ₹0`);
    res.json({ ok: true, profile, currentAmount: 0 });
  } catch (e) {
    log.error('Goal', 'Error resetting stream goal: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/settings', (req, res) => {
  syncDerivedMetricsToSettings(profilesStore.activeProfile, false);
  res.json({ activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles), settings: alertSettings });
});

app.post('/api/settings', (req, res) => {
  alertSettings = applySettingsPatch(alertSettings, req.body);
  const targetProf = profilesStore.activeProfile || 'Default';
  if (req.body?.widgets?.goal?.currentAmount !== undefined) {
    const meta = loadProfileMetadata(targetProf);
    if (!meta.goal) meta.goal = {};
    meta.goal.currentAmount = parseFloat(req.body.widgets.goal.currentAmount) || 0;
    saveProfileMetadata(targetProf, meta);
  }
  syncDerivedMetricsToSettings(profilesStore.activeProfile, false);
  saveSettings(alertSettings);
  profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: profilesStore.activeProfile, settings: alertSettings });
});

app.get('/api/profiles', (req, res) => {
  res.json({ activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles), profilesMap: profilesStore.profiles });
});

app.get('/api/profiles/default-template', (req, res) => {
  const tpl = getShippedDefaultProfile();
  const metadata = loadProfileMetadata();
  if (tpl && tpl.widgets) {
    if (!tpl.widgets.goal) tpl.widgets.goal = {};
    if (!tpl.widgets.leaderboard) tpl.widgets.leaderboard = {};
    if (!tpl.widgets.recent) tpl.widgets.recent = {};
    tpl.widgets.goal.currentAmount = metadata.goal?.currentAmount || 0;
    tpl.widgets.leaderboard.supporters = metadata.leaderboard?.supporters || {};
    tpl.widgets.recent.recentDonations = metadata.recent?.recentDonations || [];
  }
  res.json({ ok: true, template: tpl });
});

app.post('/api/profiles/switch', (req, res) => {
  const { name } = req.body;
  if (!name || !profilesStore.profiles[name]) return res.status(400).json({ ok: false, error: 'Profile not found' });
  profilesStore.activeProfile = name;
  alertSettings = profilesStore.profiles[name];
  syncDerivedMetricsToSettings(name, false);
  saveSettings(alertSettings); saveProfilesStore(profilesStore); broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: name, settings: alertSettings });
});

app.post('/api/profiles/save', (req, res) => {
  const { name, settings: newSettings } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: 'Profile name required' });
  if (newSettings) alertSettings = ConfigMigration.migrate(newSettings);
  if (newSettings?.widgets?.goal?.currentAmount !== undefined) {
    const meta = loadProfileMetadata(name);
    if (!meta.goal) meta.goal = {};
    meta.goal.currentAmount = parseFloat(newSettings.widgets.goal.currentAmount) || 0;
    saveProfileMetadata(name, meta);
  }
  profilesStore.profiles[name] = alertSettings;
  profilesStore.activeProfile = name;
  syncDerivedMetricsToSettings(name, false);
  saveSettings(alertSettings); saveProfilesStore(profilesStore); broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: name, settings: alertSettings, profiles: Object.keys(profilesStore.profiles) });
});

app.post('/api/profiles/delete', (req, res) => {
  const { name } = req.body;
  if (!name || name === 'Default') return res.status(400).json({ ok: false, error: 'Cannot delete Default profile' });
  delete profilesStore.profiles[name];
  if (profilesStore.activeProfile === name) {
    if (!profilesStore.profiles['Default']) profilesStore.profiles['Default'] = ConfigSchema.createDefaultConfig();
    profilesStore.activeProfile = 'Default';
    alertSettings = profilesStore.profiles['Default'];
    syncDerivedMetricsToSettings('Default', false);
    saveSettings(alertSettings);
  }
  saveProfilesStore(profilesStore); broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles) });
});

app.get('/api/config', (req, res) => {
  syncDerivedMetricsToSettings(profilesStore.activeProfile, false);
  res.json(alertSettings);
});
app.post('/api/config', (req, res) => {
  alertSettings = applySettingsPatch(alertSettings, req.body);
  const targetProf = profilesStore.activeProfile || 'Default';
  if (req.body?.widgets?.goal?.currentAmount !== undefined) {
    const meta = loadProfileMetadata(targetProf);
    if (!meta.goal) meta.goal = {};
    meta.goal.currentAmount = parseFloat(req.body.widgets.goal.currentAmount) || 0;
    saveProfileMetadata(targetProf, meta);
  }
  syncDerivedMetricsToSettings(profilesStore.activeProfile, false);
  saveSettings(alertSettings);
  profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, config: alertSettings });
});

app.get('/api/system/paths', (req, res) => {
  res.json({
    ok: true,
    paths: {
      storageRootDir: customPaths.storageRootDir || ''
    },
    resolved: {
      storageRootDir: storageRoot,
      configDir: SETTINGS_DIR,
      dataDir: DATA_DIR,
      logsDir: LOG_DIR
    }
  });
});

app.post('/api/system/paths', (req, res) => {
  try {
    const body = req.body || {};
    const newTargetRoot = (body.storageRootDir || '').trim();
    const copyCurrentData = body.copyCurrentData === true;

    const resolvedTarget = newTargetRoot ? path.resolve(newTargetRoot) : writableBaseDir;
    const resolvedCurrent = storageRoot;

    if (copyCurrentData && resolvedTarget !== resolvedCurrent) {
      migrateLocalDataIfNeeded(resolvedCurrent, resolvedTarget);
    }

    const newPaths = {
      storageRootDir: newTargetRoot
    };

    fs.writeFileSync(PATH_CONFIG_FILE, JSON.stringify(newPaths, null, 2), 'utf8');
    customPaths = newPaths;

    res.json({
      ok: true,
      message: 'Storage root configured. Please restart the PC Server to apply the new directory locations.'
    });
  } catch (e) {
    log.error('System', 'Failed to save paths: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/system/restart', (req, res) => {
  log.info('System', 'Server restart requested via dashboard UI...');
  res.json({ ok: true, message: 'Server is restarting...' });
  stopMdnsDiscovery();
  setTimeout(() => {
    process.exit(0);
  }, 500);
});

app.get('/api/logs/dates', (req, res) => {
  const dates = getAvailableLogDates();
  res.json({ ok: true, dates, today: getTodayDateStr() });
});

app.get('/api/logs', (req, res) => {
  const targetDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : getTodayDateStr();
  const filePath = path.join(LOG_DIR, `application_${targetDate}.log`);

  if (fs.existsSync(filePath)) {
    const level = (req.query.level || 'ALL').toUpperCase();
    const content = fs.readFileSync(filePath, 'utf8');
    if (level === 'ALL') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="application_${targetDate}_all.log"`);
      return res.send(content);
    }
    const filtered = content.split('\n').filter(line => line.includes(`[${level}]`)).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="application_${targetDate}_${level.toLowerCase()}.log"`);
    res.send(filtered || `No log entries found for level: ${level}`);
  } else {
    res.json({ ok: false, error: `No log file found for date: ${targetDate}` });
  }
});

// ── Active WebSocket count (also prunes dead entries from the Set) ────
function getActiveWsCount(clientSet) {
  let count = 0;
  clientSet.forEach(ws => {
    if (ws.readyState === 1) {
      count++;
    } else if (ws.readyState === 2 || ws.readyState === 3) {
      clientSet.delete(ws);
    }
  });
  return count;
}

app.get('/api/network-info', (req, res) => {
  const interfaces = getLocalIpAddresses();
  const primaryIp = getPrimaryIp();
  const port = server.address() ? server.address().port : (process.env.PORT || 2907);
  res.json({
    primaryIp,
    port,
    mobileAppUrl: `http://${primaryIp}:${port}`,
    mobileWsUrl: `ws://${primaryIp}:${port}/android`,
    configUrl: `http://${primaryIp}:${port}/config`,
    interfaces,
    androidClientsCount: getActiveWsCount(androidClients),
    obsClientsCount: getActiveWsCount(obsClients),
    serverRunning: isServerListening
  });
});

const SYSTEM_CONFIG_FILE = path.join(SETTINGS_DIR, 'system.json');

function loadSystemConfig() {
  try {
    if (fs.existsSync(SYSTEM_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(SYSTEM_CONFIG_FILE, 'utf8'));
    }
  } catch (_) { }
  return { minimizeOnClose: true, startMinimized: false };
}

function saveSystemConfig(cfg) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) { }
}

let systemConfig = loadSystemConfig();

server.getMinimizeOnClose = () => systemConfig.minimizeOnClose;
server.getStartMinimized = () => systemConfig.startMinimized;

process.on('uncaughtException', (err) => {
  console.error('[Node UncaughtException]', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Node UnhandledRejection]', reason);
});



app.get('/api/system/startup', (req, res) => {
  isWindowsStartupEnabled((enabled) => res.json({ enabled, isWindows: process.platform === 'win32' }));
});

app.post('/api/system/startup', (req, res) => {
  const { enabled } = req.body || {};
  setWindowsStartup(!!enabled, (success, error) => {
    if (!success && error) return res.status(500).json({ ok: false, error });
    res.json({ ok: true, enabled: !!enabled });
  });
});

app.get('/api/system/minimize-on-close', (req, res) => {
  res.json({ enabled: systemConfig.minimizeOnClose });
});

app.post('/api/system/minimize-on-close', (req, res) => {
  const { enabled } = req.body || {};
  systemConfig.minimizeOnClose = !!enabled;
  saveSystemConfig(systemConfig);
  res.json({ ok: true, enabled: systemConfig.minimizeOnClose });
});

app.get('/api/system/start-minimized', (req, res) => {
  res.json({ enabled: !!systemConfig.startMinimized });
});

app.post('/api/system/start-minimized', (req, res) => {
  const { enabled } = req.body || {};
  systemConfig.startMinimized = !!enabled;
  saveSystemConfig(systemConfig);
  res.json({ ok: true, enabled: systemConfig.startMinimized });
});

app.post('/api/system/open-browser', (req, res) => {
  const { url } = req.body || {};
  const actualPort = server.address() ? server.address().port : (process.env.PORT || 2907);
  const targetUrl = url || `http://127.0.0.1:${actualPort}/config`;
  if (process.platform === 'win32') {
    exec(`start "" "${targetUrl}"`);
  }
  res.json({ ok: true });
});

app.post('/api/system/open-explorer', (req, res) => {
  const { folderPath } = req.body || {};
  if (!folderPath) return res.status(400).json({ ok: false, error: 'folderPath required' });
  const safePath = path.resolve(folderPath);
  if (process.platform === 'win32') {
    exec(`explorer "${safePath}"`);
  }
  res.json({ ok: true });
});

app.post('/api/system/pick-folder', (req, res) => {
  if (process.platform !== 'win32') {
    return res.status(400).json({ ok: false, error: 'Folder picker only supported on Windows' });
  }

  // Write to a temp .ps1 — avoids all shell-escaping headaches
  const os = require('os');
  const tmpScript = path.join(os.tmpdir(), 'pa-obs-pick-folder.ps1');

  // Uses IFileOpenDialog (modern Windows Explorer UI) via C# COM interop.
  // FOS_PICKFOLDERS (0x20) | FOS_FORCEFILESYSTEM (0x40) = 0x60
  const psScript = `
if (-not ([System.Management.Automation.PSTypeName]'FolderPicker').Type) {
  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class FolderPicker {
  [ComImport, Guid("DC1C5A9C-E88A-4dde-A5A1-60F82A20AEF7")]
  class FileOpenDialog {}

  [ComImport, Guid("42f85136-db7e-439c-85f1-e4075d135fc8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileDialog {
    [PreserveSig] int Show(IntPtr hwnd);
    void m02(uint n, IntPtr p);  void m03(uint i); void m04(out uint i);
    void m05(IntPtr s, out uint c); void m06(uint c);
    void SetOptions(uint fos);
    void m08(out uint fos);
    void m09(IntPtr psi); void m10(IntPtr psi);
    void m11(out IntPtr ppsi); void m12(out IntPtr ppsi);
    void m13([MarshalAs(UnmanagedType.LPWStr)] string n);
    void m14([MarshalAs(UnmanagedType.LPWStr)] out string n);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string title);
    void m16([MarshalAs(UnmanagedType.LPWStr)] string l);
    void m17([MarshalAs(UnmanagedType.LPWStr)] string l);
    void GetResult(out IShellItem ppsi);
    void m19(IntPtr psi, int fdap);
    void m20([MarshalAs(UnmanagedType.LPWStr)] string ext);
    void m21(int hr); void m22(ref Guid g); void m23(); void m24(IntPtr f);
  }

  [ComImport, Guid("43826d1e-e718-42ee-bc55-a1e261c37bfe"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {
    void n01(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void n02(out IShellItem ppsi);
    void GetDisplayName(uint sigdn, [MarshalAs(UnmanagedType.LPWStr)] out string name);
    void n04(uint mask, out uint a); void n05(IShellItem psi, uint h, out int o);
  }

  public static string Pick() {
    try {
      var dlg = (IFileDialog)(new FileOpenDialog());
      dlg.SetOptions(0x60); // FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM
      dlg.SetTitle("Select Storage Root Directory");
      if (dlg.Show(IntPtr.Zero) != 0) return "";
      IShellItem item;
      dlg.GetResult(out item);
      string result;
      item.GetDisplayName(0x80058000, out result); // SIGDN_FILESYSPATH
      return result ?? "";
    } catch { return ""; }
  }
}
"@
}
[FolderPicker]::Pick()
`.trimStart();

  try {
    fs.writeFileSync(tmpScript, psScript, 'utf8');
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -STA -File "${tmpScript}"`, { timeout: 60000 }, (err, stdout) => {
      try { fs.unlinkSync(tmpScript); } catch (_) { }
      if (err) return res.status(500).json({ ok: false, error: err.message });
      res.json({ ok: true, path: stdout.trim() });
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

let isServerListening = true;

app.get('/api/system/server-status', (req, res) => {
  res.json({ ok: true, running: isServerListening });
});

app.post('/api/system/server-stop', (req, res) => {
  if (isServerListening) {
    try {
      server.close(() => {
        isServerListening = false;
        log.info('Server', 'Server listener stopped by user control');
      });
      isServerListening = false;
    } catch (e) {
      log.error('Server', 'Error stopping server: ' + e.message);
    }
  }
  res.json({ ok: true, running: false });
});

app.post('/api/system/server-start', (req, res) => {
  if (!isServerListening) {
    const PORT_NUM = process.env.PORT || 2907;
    try {
      server.listen(PORT_NUM, '0.0.0.0', () => {
        isServerListening = true;
        log.info('Server', 'Server listener started on port ' + PORT_NUM);
      });
      isServerListening = true;
    } catch (e) {
      log.error('Server', 'Error starting server: ' + e.message);
    }
  }
  res.json({ ok: true, running: true });
});

app.post('/api/system/firewall', (req, res) => {
  ensureWindowsFirewallRule((success, error) => {
    if (!success && error) return res.status(500).json({ ok: false, error });
    res.json({ ok: true });
  });
});

app.get('/api/logs/live', (req, res) => {
  try {
    const targetDate = req.query.date && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date) ? req.query.date : getTodayDateStr();
    const filePath = path.join(LOG_DIR, `application_${targetDate}.log`);
    const availableDates = getAvailableLogDates();

    if (!fs.existsSync(filePath)) {
      return res.json({ ok: true, date: targetDate, availableDates, totalLines: 0, lines: [] });
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    const recent = allLines.slice(-300);
    res.json({ ok: true, date: targetDate, availableDates, totalLines: allLines.length, lines: recent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});


app.post('/api/logs/clear', (req, res) => {
  try {
    const targetDate = (req.query.date || (req.body && req.body.date)) && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || req.body.date)
      ? (req.query.date || req.body.date)
      : getTodayDateStr();
    const filePath = path.join(LOG_DIR, `application_${targetDate}.log`);
    if (fs.existsSync(filePath)) fs.writeFileSync(filePath, '');
    res.json({ ok: true, date: targetDate });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

function broadcastSample(sample) {
  const parsed = parsePayment(sample);
  const isSimulated = sample.simulated !== undefined ? !!sample.simulated : true;
  const sampleClean = { ...sample };
  delete sampleClean.settings;
  const decorated = decorateWithTemplate({
    ...sampleClean,
    simulated: isSimulated,
    sender: sample.sender || (parsed ? parsed.sender : 'Test Donor'),
    amount: sample.amount || (parsed ? parsed.amount : '₹500.00'),
    sourceApp: sample.sourceApp || (parsed ? parsed.sourceApp : sample.appName) || 'PhonePe'
  }, '', sample.settings || null);
  delete decorated.settings;
  const payload = JSON.stringify({ type: 'payment_notification', ...decorated });
  let count = 0;
  obsClients.forEach(ws => {
    if (ws.readyState === 1) { ws.send(payload); count++; }
  });
  processPaymentForGoalAndLeaderboard(decorated);
  log.event('TestEvent', `Sample alert triggered (simulated=${isSimulated}): ₹${decorated.amount || '0'} from "${decorated.sender || 'Test'}" [Template: ${decorated.alertTemplateName || 'Default'}]`);
  return { count, templateId: decorated.alertTemplateId, templateName: decorated.alertTemplateName, simulated: isSimulated };
}

app.get('/api/test', (req, res) => {
  const isIsolated = alertSettings.simulation ? alertSettings.simulation.isolatedMode !== false : true;
  const result = broadcastSample({
    type: 'payment_notification',
    simulated: isIsolated,
    packageName: 'com.phonepe.app',
    appName: 'PhonePe',
    title: 'PhonePe',
    text: 'D SINGH has sent Rs. 500.00 to your bank account',
    timestamp: Date.now()
  });
  res.json({ ok: true, sent: result.count, template: result.templateName, templateId: result.templateId, simulated: isIsolated });
});

app.post('/api/test', (req, res) => {
  const body = req.body || {};
  const isIsolated = alertSettings.simulation ? alertSettings.simulation.isolatedMode !== false : true;
  const isSimulated = body.simulated !== undefined ? !!body.simulated : isIsolated;
  if (body.settings) {
    broadcastSettings(body.settings);
  }
  const result = broadcastSample({
    type: 'payment_notification',
    simulated: isSimulated,
    packageName: body.packageName || 'com.phonepe.app',
    appName: body.appName || 'PhonePe',
    title: body.title || 'PhonePe',
    text: body.text || 'D SINGH has sent Rs. 500.00 to your bank account',
    bigText: body.bigText || body.text || 'D SINGH has sent Rs. 500.00 to your bank account',
    sender: body.sender || '',
    amount: body.amount || '',
    sourceApp: body.sourceApp || '',
    alertTemplateId: body.alertTemplateId || null,
    settings: body.settings || null,
    timestamp: Date.now()
  });
  res.json({ ok: true, sent: result.count, template: result.templateName, templateId: result.templateId, simulated: isSimulated });
});

// ── WebSocket Handler ───────────────────────────────────────────────────
wss.on('connection', (ws, req) => {
  const url = req.url ? req.url.split('?')[0] : '/';
  const clientType = url === '/android' ? 'android' : 'obs';
  const remoteIp = req.socket?.remoteAddress || '';

  if (clientType === 'android') {
    const rawIp = req.socket?.remoteAddress || '';
    const normIp = rawIp.replace(/^::ffff:/, '');

    // Evict any stale or duplicate android sockets from the same IP address
    for (const existing of androidClients) {
      if (existing === ws) continue;
      const existingNormIp = (existing.remoteIp || '').replace(/^::ffff:/, '');
      if (existing.readyState !== 1 || (normIp && existingNormIp === normIp)) {
        androidClients.delete(existing);
        try { existing.terminate(); } catch (_) { }
      }
    }
    ws.remoteIp = normIp;
    androidClients.add(ws);
    log.info('WS', `Android connected [IP: ${normIp || 'unknown'}] (${androidClients.size} active)`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const raw = data.toString();
        const notification = JSON.parse(raw);
        const appName = notification.appName || notification.packageName || 'Payment App';
        const title = notification.title || '';
        const text = notification.text || '';

        if (!title && !text) return;

        const parsed = parsePayment(notification);
        if (!parsed && notification.source !== 'tester' && !notification.sender) {
          log.debug('PaymentParser', `Ignored non-payment or unparseable notification from ${appName}: "${title || text}"`);
          return;
        }

        const isIsolated = alertSettings.simulation ? alertSettings.simulation.isolatedMode !== false : true;
        const isFromTester = notification.source === 'tester' || notification.simulated === true;
        const isSimulated = isFromTester ? isIsolated : false;
        const enriched = {
          ...notification,
          simulated: isSimulated,
          appName,
          title,
          text,
          sender: parsed ? parsed.sender : (notification.sender || ''),
          amount: parsed ? parsed.amount : (notification.amount || ''),
          sourceApp: parsed ? parsed.sourceApp : (notification.sourceApp || appName),
          message: parsed && parsed.message ? parsed.message : (notification.message || ''),
        };

        const decorated = decorateWithTemplate(enriched);
        const payload = JSON.stringify({ type: 'payment_notification', ...decorated });

        log.event('PaymentEvent', `Payment received: ${decorated.amount || '₹0'} from "${decorated.sender || 'Unknown'}" via ${decorated.sourceApp} [Template: ${decorated.alertTemplateName || 'Default'}]`);

        obsClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(payload);
          }
        });

        // Always process for leaderboard/goal regardless of overlay status
        processPaymentForGoalAndLeaderboard(decorated);

      } catch (e) {
        log.error('WS', 'Parse error: ' + e.message);
      }
    });

    ws.on('error', (err) => {
      androidClients.delete(ws);
      log.warn('WS', `Android socket error: ${err.message}`);
    });

    ws.on('close', () => {
      androidClients.delete(ws);
      log.info('WS', `Android disconnected (${getActiveWsCount(androidClients)} active)`);
    });

  } else {
    // Evict any stale CLOSING/CLOSED OBS sockets before adding the new one
    getActiveWsCount(obsClients);
    obsClients.add(ws);
    log.info('WS', `OBS overlay connected (${obsClients.size} total)`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.send(JSON.stringify({ type: 'SETTINGS_UPDATED', payload: alertSettings }));
    ws.send(JSON.stringify({ type: 'config', config: alertSettings }));
    ws.on('close', () => { obsClients.delete(ws); log.info('WS', 'OBS overlay disconnected'); });
  }
});

// Fast 5s Heartbeat for Android clients — promptly purge dead/dropped connections
const androidHeartbeat = setInterval(() => {
  getActiveWsCount(androidClients);
  androidClients.forEach(ws => {
    if (ws.isAlive === false || ws.readyState !== 1) {
      androidClients.delete(ws);
      try { ws.terminate(); } catch (_) { }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {
      androidClients.delete(ws);
    }
  });
}, 5000);

// Heartbeat for OBS browser-source clients
const obsHeartbeat = setInterval(() => {
  getActiveWsCount(obsClients);
  obsClients.forEach(ws => {
    if (ws.isAlive === false || ws.readyState !== 1) {
      obsClients.delete(ws);
      try { ws.terminate(); } catch (_) { }
      return;
    }
    ws.isAlive = false;
    try { ws.ping(); } catch (_) {
      obsClients.delete(ws);
    }
  });
}, 15000);

wss.on('close', () => {
  clearInterval(androidHeartbeat);
  clearInterval(obsHeartbeat);
});
wss.on('error', () => { });

// ── Health Check Route ────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'StreamPe',
    version: APP_VERSION,
    hostname: os.hostname(),
    port: activeServerPort || PREFERRED_PORT,
    sessionToken: SESSION_TOKEN,
    primaryIp: getPrimaryIp(),
    wsPath: '/android',
    androidClients: getActiveWsCount(androidClients),
    obsClients: getActiveWsCount(obsClients)
  });
});

// HTTP and WS share the same underlying server — one port covers both.
const PREFERRED_PORT = parseInt(process.env.PORT || String(DEFAULT_PORT), 10);
const SESSION_TOKEN = process.env.STREAMPE_SESSION_TOKEN || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15));
let activeServerPort = PREFERRED_PORT;

// ── mDNS Auto-Discovery & UDP Direct Broadcast ─────────────────────────
let bonjourInstance = null;
let publishedService = null;
let udpSocket = null;

function startUdpBroadcastListener() {
  try {
    if (udpSocket) {
      try { udpSocket.close(); } catch (_) { }
    }
    udpSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
    udpSocket.on('message', (msg, rinfo) => {
      const text = msg.toString().trim();
      if (text.includes('STREAMPE_DISCOVER')) {
        const reply = JSON.stringify({
          type: 'STREAMPE_RESPONSE',
          app: 'StreamPe',
          version: APP_VERSION,
          hostname: os.hostname(),
          port: activeServerPort,
          primaryIp: getPrimaryIp()
        });
        udpSocket.send(reply, 0, reply.length, rinfo.port, rinfo.address, () => { });
      }
    });
    udpSocket.on('error', (err) => {
      log.warn('UDP', `UDP Direct Broadcast notice: ${err.message}`);
    });
    udpSocket.bind(UDP_DISCOVERY_PORT, () => {
      log.info('UDP', `UDP Direct Subnet Discovery listener active on port ${UDP_DISCOVERY_PORT}`);
    });
  } catch (e) {
    log.warn('UDP', `Failed to start UDP discovery listener: ${e.message}`);
  }
}

function stopUdpBroadcastListener() {
  if (udpSocket) {
    try { udpSocket.close(); } catch (_) { }
    udpSocket = null;
  }
}

function ensureWindowsFirewallMdnsRule() {
  if (os.platform() !== 'win32') return;
  try {
    const cmd = 'netsh advfirewall firewall show rule name="StreamPe mDNS (UDP 5353)"';
    child_process.exec(cmd, (err, stdout) => {
      if (err || !stdout || !stdout.includes('StreamPe mDNS')) {
        const addCmd = 'netsh advfirewall firewall add rule name="StreamPe mDNS (UDP 5353)" dir=in action=allow protocol=UDP localport=5353';
        child_process.exec(addCmd, (addErr) => {
          if (!addErr) log.info('Firewall', 'Added Windows Defender Firewall rule for mDNS (UDP 5353)');
        });
      }
    });
  } catch (_) { }
}

function saveActiveInstanceMetadata(port, token) {
  try {
    const activeFile = path.join(SETTINGS_DIR, 'active-instance.json');
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    const meta = {
      port,
      sessionToken: token,
      pid: process.pid,
      primaryIp: getPrimaryIp(),
      hostname: os.hostname(),
      boundAt: Date.now()
    };
    fs.writeFileSync(activeFile, JSON.stringify(meta, null, 2), 'utf8');
  } catch (_) { }
}

let lastPrimaryIp = '';
function startNetworkChangeListener() {
  lastPrimaryIp = getPrimaryIp();
  setInterval(() => {
    const currentIp = getPrimaryIp();
    if (currentIp !== lastPrimaryIp && currentIp !== '127.0.0.1') {
      log.info('Network', `🌐 Primary IP changed: ${lastPrimaryIp} ➔ ${currentIp}. Re-broadcasting mDNS and updating metadata.`);
      lastPrimaryIp = currentIp;
      if (activeServerPort) {
        startMdnsDiscovery(activeServerPort);
        saveActiveInstanceMetadata(activeServerPort, SESSION_TOKEN);
        const payload = JSON.stringify({ type: 'network_changed', primaryIp: currentIp });
        androidClients.forEach(ws => { try { ws.send(payload); } catch (_) { } });
        obsClients.forEach(ws => { try { ws.send(payload); } catch (_) { } });
      }
    }
  }, 10000);
}

function startMdnsDiscovery(port, retryCount = 0) {
  try {
    if (!bonjourInstance) {
      bonjourInstance = new Bonjour();
      if (bonjourInstance._server && typeof bonjourInstance._server.on === 'function') {
        bonjourInstance._server.on('error', () => { });
      }
    }
    const hostName = os.hostname() || 'Streamer-PC';
    let serviceName = `StreamPe - ${hostName}`;
    if (port !== PREFERRED_PORT || retryCount > 0) {
      const instanceIdx = FALLBACK_PORTS.indexOf(port);
      const displayNum = instanceIdx > 0 ? instanceIdx : (retryCount > 0 ? retryCount : 1);
      serviceName += ` (${displayNum})`;
    }

    if (publishedService) {
      try { publishedService.destroy(); } catch (_) { }
    }

    publishedService = bonjourInstance.publish({
      name: serviceName,
      type: 'streampe',
      protocol: 'tcp',
      port: port,
      probe: false,
      txt: {
        version: APP_VERSION,
        server: 'streampe',
        hostname: hostName,
        os: os.platform(),
        wsPath: '/android',
        sessionRequired: 'true'
      }
    });

    publishedService.on('up', () => {
      log.info('mDNS', `Auto-Discovery active: _streampe._tcp.local on port ${port} ("${serviceName}")`);
    });

    publishedService.on('error', (err) => {
      log.warn('mDNS', `Auto-Discovery notice for "${serviceName}": ${err.message}`);
      if (err.message && err.message.includes('already in use') && retryCount < 5) {
        try { if (publishedService) publishedService.destroy(); } catch (_) { }
        setTimeout(() => startMdnsDiscovery(port, retryCount + 1), 300);
      }
    });
  } catch (e) {
    log.warn('mDNS', `Failed to initialize mDNS auto-discovery: ${e.message}`);
  }
}

function stopMdnsDiscovery() {
  if (publishedService) {
    try { publishedService.destroy(); } catch (_) { }
    publishedService = null;
  }
  if (bonjourInstance) {
    try {
      bonjourInstance.unpublishAll();
      bonjourInstance.destroy();
    } catch (_) { }
    bonjourInstance = null;
    log.info('mDNS', 'Auto-Discovery service closed cleanly');
  }
}

process.on('exit', () => stopMdnsDiscovery());

if (process.platform === 'win32' && process.stdin && process.stdin.isTTY) {
  try {
    const readline = require('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.on('SIGINT', () => {
      process.emit('SIGINT');
    });
  } catch (_) { }
}

process.on('SIGINT', () => {
  stopMdnsDiscovery();
  setTimeout(() => process.exit(0), 50);
});

process.on('SIGTERM', () => {
  stopMdnsDiscovery();
  setTimeout(() => process.exit(0), 50);
});

// Nodemon graceful restart handler
process.once('SIGUSR2', () => {
  stopMdnsDiscovery();
  setTimeout(() => {
    process.kill(process.pid, 'SIGUSR2');
  }, 50);
});

function startServer(portIdx = 0) {
  const targetPort = FALLBACK_PORTS[portIdx] !== undefined ? FALLBACK_PORTS[portIdx] : 0;

  server.listen(targetPort, '0.0.0.0');

  server.once('listening', () => {
    activeServerPort = server.address().port;
    console.log(`[INSTANCE_AUTH] PORT=${activeServerPort} TOKEN=${SESSION_TOKEN}`);

    if (activeServerPort !== PREFERRED_PORT) {
      log.warn('Server', `⚠️  Port ${PREFERRED_PORT} was in use — bound to fallback port ${activeServerPort}`);
    }

    saveActiveInstanceMetadata(activeServerPort, SESSION_TOKEN);
    ensureWindowsFirewallMdnsRule();
    autoSyncWindowsStartupPath();
    startMdnsDiscovery(activeServerPort);
    startUdpBroadcastListener();
    startNetworkChangeListener();

    const primaryIp = getPrimaryIp();
    const ips = getLocalIpAddresses();
    log.info('Server', `\n🚀 StreamPe PC Server Running!`);
    log.info('Server', `   -------------------------------------------------`);
    log.info('Server', `   📱 Mobile App Connection IP: http://${primaryIp}:${activeServerPort}`);
    log.info('Server', `   🔍 mDNS Auto-Discovery:      _streampe._tcp (Port ${activeServerPort})`);
    ips.forEach(ip => log.info('Server', `      Network Adapter [${ip.name}]: ${ip.address}`));
    log.info('Server', `   🖥️ OBS Config Dashboard:   http://${primaryIp}:${activeServerPort}/config`);
    log.info('Server', `   📡 OBS Alert Overlay:       http://${primaryIp}:${activeServerPort}/overlay/alerts`);
    log.info('Server', `   -------------------------------------------------`);
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && portIdx + 1 < FALLBACK_PORTS.length) {
      const nextPort = FALLBACK_PORTS[portIdx + 1];
      log.warn('Server', `Port ${targetPort} in use — retrying on fallback port ${nextPort}...`);
      server.close(() => startServer(portIdx + 1));
    } else if (err.code === 'EADDRINUSE') {
      log.warn('Server', `All fallback ports in use — binding to random OS port...`);
      server.close(() => startServer(FALLBACK_PORTS.length - 1));
    } else {
      log.error('Server', `Failed to start server: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer(0);

// Export the http.Server instance
module.exports = server;
