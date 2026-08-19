const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');
const winston = require('winston');
require('winston-daily-rotate-file');
const { Bonjour } = require('bonjour-service');

const isCompiled = !process.execPath.endsWith('node') &&
  !process.execPath.endsWith('node.exe') &&
  !process.execPath.endsWith('bun') &&
  !process.execPath.endsWith('bun.exe');

let baseDir = isCompiled ? path.dirname(process.execPath) : __dirname;
let PUBLIC_DIR = path.join(baseDir, 'public');
if (!fs.existsSync(PUBLIC_DIR)) {
  PUBLIC_DIR = path.join(__dirname, 'public');
}

let writableBaseDir = baseDir;

// If compiled and running from a system/read-only location (e.g. Program Files), fall back to AppData Roaming
if (isCompiled && (writableBaseDir.toLowerCase().includes('program files') || writableBaseDir.toLowerCase().includes('system32'))) {
  try {
    const appData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : path.join(process.env.HOME || '', '.local', 'share'));
    writableBaseDir = path.join(appData, 'com.clowneon1.streampe');
  } catch (e) { }
}

try {
  // In Tauri the TAURI_APP_DATA env var is set by the Rust launcher
  if (process.env.TAURI_APP_DATA) {
    writableBaseDir = process.env.TAURI_APP_DATA;
  }
} catch (e) { }

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(PUBLIC_DIR));

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'icon.png'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'config.html'));
});

// ── Path Config Bootstrapping ──
const PATH_CONFIG_FILE = path.join(writableBaseDir, 'path-config.json');
let customPaths = { storageRootDir: '' };
try {
  if (fs.existsSync(PATH_CONFIG_FILE)) {
    customPaths = JSON.parse(fs.readFileSync(PATH_CONFIG_FILE, 'utf8')) || {};
  }
} catch (e) {
  console.error('[Server] Failed to read path-config.json:', e.message);
}

const storageRoot = customPaths.storageRootDir && customPaths.storageRootDir.trim()
  ? path.resolve(customPaths.storageRootDir.trim())
  : writableBaseDir;

const LOG_DIR = path.join(storageRoot, 'logs');
const SETTINGS_DIR = path.join(storageRoot, 'config');
const DATA_DIR = path.join(storageRoot, 'data');

for (const dir of [LOG_DIR, SETTINGS_DIR, DATA_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.error(`[Server] Failed to create directory ${dir}:`, e.message);
  }
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

function isWindowsStartupEnabled(callback) {
  if (process.platform !== 'win32') return callback(false);

  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run"', (err, stdout) => {
    let hasStreamPe = !err && stdout && stdout.includes('StreamPe');

    // Clean up legacy registry keys silently without forcing startup enabled
    if (!err && stdout && (stdout.includes('PaymentAlertsOBS') || stdout.includes('Payment Alerts') || stdout.includes('electron.app.Payment Alerts'))) {
      exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Payment Alerts for OBS" /f 2>nul & reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "electron.app.Payment Alerts for OBS" /f 2>nul', () => {});
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
  exec('netsh advfirewall firewall show rule name="PaymentAlertsOBS"', (err, stdout) => {
    if (err || !stdout || stdout.includes('No rules match')) {
      const psCmd = 'powershell -Command "Start-Process netsh -ArgumentList \'advfirewall firewall add rule name=\\\"PaymentAlertsOBS\\\" protocol=TCP dir=in localport=2907 action=allow\' -Verb RunAs -WindowStyle Hidden"';
      exec(psCmd, (psErr) => {
        if (psErr) log.warn('Firewall', 'Firewall auto-rule error:', psErr.message);
        else log.info('Firewall', 'Windows Firewall rule for port 2907 created successfully');
        if (callback) callback(!psErr, psErr ? psErr.message : null);
      });
    }
  });
}

function registerWindowsAppUserModelId() {
  if (process.platform !== 'win32') return;
  const appId = 'com.clowneon1.streampe';
  const mainExe = getMainAppExePath();
  if (!mainExe || !fs.existsSync(mainExe)) return;

  const regCmd = [
    `reg add "HKCU\\Software\\Classes\\AppUserModelId\\${appId}" /v "DisplayName" /t REG_SZ /d "StreamPe" /f`,
    `reg add "HKCU\\Software\\Classes\\AppUserModelId\\${appId}" /v "IconUri" /t REG_SZ /d "\"${mainExe}\"" /f`,
    `reg add "HKCU\\Software\\Classes\\AppUserModelId\\${appId}" /v "IconBackgroundColor" /t REG_SZ /d "00000000" /f`,
    `reg add "HKCU\\Software\\Classes\\AppUserModelId\\${appId}" /v "ShowInSettings" /t REG_DWORD /d 1 /f`,
    `reg add "HKCU\\Software\\Classes\\${appId}" /ve /t REG_SZ /d "StreamPe" /f`,
    `reg add "HKCU\\Software\\Classes\\${appId}\\DefaultIcon" /ve /t REG_SZ /d "\"${mainExe}\",0" /f`
  ].join(' & ');

  exec(regCmd, () => {});

  try {
    const startMenuDir = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
    const shortcutPath = path.join(startMenuDir, 'StreamPe.lnk');
    const psScript = `$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${shortcutPath}'); $s.TargetPath = '${mainExe}'; $s.IconLocation = '${mainExe},0'; $s.Save();`.replace(/\r?\n/g, ' ');

    exec(`powershell -Command "${psScript}"`, () => {});
  } catch (_) {}
}

registerWindowsAppUserModelId();

log.info('Server', `Log directory: ${LOG_DIR} (daily rotating with 7-day retention)`);

// ── Payment Parser (JS) ────────────────────────────────────────────
const STRIP_SUFFIXES = [
  / on amazon pay$/i,
  / on google pay$/i,
  / using upi$/i,
  / on upi$/i,
  / to your( bank)? account$/i,
  / via \w+$/i,
];

function cleanSender(name) {
  let s = name.trim();
  for (const rx of STRIP_SUFFIXES) s = s.replace(rx, '');
  return s.trim();
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
  if (!raw) return '₹0';
  const stripped = String(raw).trim()
    .replace(/^\u20B9\s*/, '')
    .replace(/^[Rr][Ss]\.?\s*/, '')
    .replace(/\s*rupees$/i, '')
    .trim();
  return `\u20B9${stripped}`;
}

const RE_PHONEPE_AMOUNT = /has\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_HAS_SENT = /^(.+?)\s+has\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_AMT_RECEIVED_FROM = /(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)/i;
const RE_PAYMENT_OF = /payment\s+of\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)/i;
const RE_NAME_SENT = /^(.+?)\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_YOU_PAID = /you\s+(?:have\s+)?paid\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+to\s+(.+)/i;
const RE_RECEIVED_FROM = /received\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+from\s+(.+)/i;
const RE_FROM_NAME = /^from\s+(.+)/i;
const RE_AMT_TITLE = /(?:\u20B9|rs\.?\s*)?([\d,.]+(?:\.\d{1,2})?)\s+received/i;
const RE_AMT_FROM_TITLE = /(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+from\s+(.+)/i;
const RE_AMAZON_SENDER = /money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay/i;

// Google Pay (GPay) Patterns
const RE_GPAY_PAID_YOU_SYMBOL = /^(.+?)\s+paid\s+you\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_GPAY_PAID_YOU_WORDS = /^(.+?)\s+paid\s+you\s+([\d,.]+(?:\.\d{1,2})?)\s+rupees/i;
const RE_GPAY_YOU_RECEIVED = /you\s+received\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+from\s+(.+)/i;

// Non-payment filter regex
const RE_NON_PAYMENT = /(?:otp|verification code|one time password|security code|cashback won|scratch card|reward earned|reward points|congratulations.*reward|bank balance|available balance|account balance|bill due|bill generated|recharge successful|recharge of|check your credit score|exclusive offer|flat .* off|discount on|special offer)/i;

function parsePayment(notification) {
  const pkg = (notification.packageName || '').trim().toLowerCase();
  const appName = (notification.appName || '').trim();
  const title = (notification.title || '').trim();
  const titleBig = (notification.titleBig || '').trim();
  const text = (notification.text || '').trim();
  const bigText = (notification.bigText || '').trim();

  // Combine content for non-payment filtering
  const allContent = `${title} ${titleBig} ${text} ${bigText}`;
  if (RE_NON_PAYMENT.test(allContent)) {
    const isPaymentMatch = RE_GPAY_PAID_YOU_SYMBOL.test(title) || RE_GPAY_PAID_YOU_SYMBOL.test(titleBig) || RE_GPAY_PAID_YOU_SYMBOL.test(bigText) ||
      RE_PHONEPE_AMOUNT.test(title) || RE_PHONEPE_AMOUNT.test(text) || RE_PHONEPE_AMOUNT.test(bigText);
    if (!isPaymentMatch) {
      return null; // Ignore promotional, OTP, or balance alert
    }
  }

  const isGPay = pkg.includes('paisa') || pkg.includes('gpay') || appName.toLowerCase().includes('google pay') || appName.toLowerCase().includes('gpay');
  const isPhonePe = pkg.includes('phonepe') || appName.toLowerCase().includes('phonepe');
  const isAmazon = pkg.includes('amazon') || appName.toLowerCase().includes('amazon');

  const body = bigText || text;

  // ─ 1. Google Pay (GPay) ───────────────────────────────────────────
  if (isGPay) {
    for (const candidate of [title, titleBig, bigText, text].filter(Boolean)) {
      let m;
      if ((m = RE_GPAY_PAID_YOU_SYMBOL.exec(candidate))) {
        const sender = cleanSender(m[1]);
        const amount = normaliseAmount(m[2]);
        const rawMsg = (text && text !== candidate && !RE_GPAY_PAID_YOU_SYMBOL.test(text)) ? text : (notification.message || '');
        return { sender, amount, sourceApp: 'Google Pay', message: cleanMessage(rawMsg) };
      }
      if ((m = RE_GPAY_PAID_YOU_WORDS.exec(candidate))) {
        const sender = cleanSender(m[1]);
        const amount = normaliseAmount(m[2]);
        const rawMsg = (text && text !== candidate && !RE_GPAY_PAID_YOU_WORDS.test(text)) ? text : (notification.message || '');
        return { sender, amount, sourceApp: 'Google Pay', message: cleanMessage(rawMsg) };
      }
      if ((m = RE_GPAY_YOU_RECEIVED.exec(candidate))) {
        const sender = cleanSender(m[2]);
        const amount = normaliseAmount(m[1]);
        return { sender, amount, sourceApp: 'Google Pay', message: cleanMessage(notification.message || '') };
      }
      if ((m = RE_AMT_RECEIVED_FROM.exec(candidate))) {
        const sender = cleanSender(m[2]);
        const amount = normaliseAmount(m[1]);
        return { sender, amount, sourceApp: 'Google Pay', message: cleanMessage(notification.message || '') };
      }
    }
  }

  // ─ 2. Amazon Pay ───────────────────────────────────────────────
  if (isAmazon) {
    const senderM = RE_AMAZON_SENDER.exec(body);
    const amtM = RE_AMT_TITLE.exec(title);
    if (senderM && amtM) {
      return { sender: cleanSender(senderM[1]), amount: normaliseAmount(amtM[1]), sourceApp: 'Amazon Pay' };
    }
    const m = RE_AMT_RECEIVED_FROM.exec(body) || RE_AMT_RECEIVED_FROM.exec(title);
    if (m) return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: 'Amazon Pay' };
  }

  // ─ 3. PhonePe ─────────────────────────────────────────────────
  if (isPhonePe) {
    for (const candidate of [body, text, title].filter(Boolean)) {
      const hasIdx = candidate.indexOf(' has ');
      const amtM = RE_PHONEPE_AMOUNT.exec(candidate);
      if (hasIdx > 0 && amtM) {
        return {
          sender: cleanSender(candidate.substring(0, hasIdx)),
          amount: normaliseAmount(amtM[1]),
          sourceApp: 'PhonePe'
        };
      }
    }
    const amtTitleM = RE_AMT_TITLE.exec(title);
    const fromTextM = RE_FROM_NAME.exec(text);
    if (amtTitleM && fromTextM) {
      return { sender: cleanSender(fromTextM[1]), amount: normaliseAmount(amtTitleM[1]), sourceApp: 'PhonePe' };
    }
    const compactM = RE_AMT_FROM_TITLE.exec(title);
    if (compactM) {
      return { sender: cleanSender(compactM[2]), amount: normaliseAmount(compactM[1]), sourceApp: 'PhonePe' };
    }
  }

  // ─ 4. Generic fallbacks ──────────────────────────────────────────
  for (const candidate of [body, title].filter(Boolean)) {
    let m;
    if ((m = RE_HAS_SENT.exec(candidate)))
      return { sender: cleanSender(m[1]), amount: normaliseAmount(m[2]), sourceApp: appName || 'UPI' };
    if ((m = RE_PAYMENT_OF.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName || 'UPI' };
    if ((m = RE_RECEIVED_FROM.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName || 'UPI' };
    if ((m = RE_AMT_RECEIVED_FROM.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName || 'UPI' };
    if ((m = RE_NAME_SENT.exec(candidate)))
      return { sender: cleanSender(m[1]), amount: normaliseAmount(m[2]), sourceApp: appName || 'UPI' };
    if ((m = RE_YOU_PAID.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName || 'UPI' };
  }

  return null;
}

// ── Configuration Files ───────────────────────────────────────────────
// Schema refreshed for Goal widget opacity and saving persistence
const ConfigSchema = require('./public/js/lib/config-schema');
const ConfigMigration = require('./public/js/lib/config-migration');
const TemplateMatcher = require('./public/js/lib/template-matcher');
const PaymentsCsv = require('./public/js/lib/payments-csv');

const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const LEGACY_CONFIG_FILE = fs.existsSync(path.join(baseDir, 'widget-config.json')) ? path.join(baseDir, 'widget-config.json') : path.join(__dirname, 'widget-config.json');

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
  log.info('Settings', 'No config found, using defaults');
  return ConfigSchema.createDefaultConfig();
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

function getDonationsCsvPath(profileName, yearMonth) {
  const profile = (profileName || (profilesStore && profilesStore.activeProfile) || 'Default')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const ym = yearMonth || getTodayYearMonth();
  const [year, month] = ym.split('-');
  return path.join(DATA_DIR, profile, year, `${month}.csv`);
}

function getAvailableProfileMonths(profileName) {
  const profile = (profileName || (profilesStore && profilesStore.activeProfile) || 'Default')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const profileDir = path.join(DATA_DIR, profile);
  if (!fs.existsSync(profileDir)) return [];

  const months = [];
  try {
    const years = fs.readdirSync(profileDir).filter(y => /^\d{4}$/.test(y));
    for (const yr of years) {
      const yearDir = path.join(profileDir, yr);
      const files = fs.readdirSync(yearDir).filter(f => /^\d{2}\.csv$/.test(f));
      for (const f of files) {
        const mo = f.replace('.csv', '');
        months.push(`${yr}-${mo}`);
      }
    }
  } catch (e) {
    log.error('Database', 'Error scanning profile months: ' + e.message);
  }
  return months.sort().reverse();
}

function loadDonations(profileName, monthKey) {
  const profile = profileName || (profilesStore && profilesStore.activeProfile) || 'Default';

  // If specific month is requested
  if (monthKey && monthKey !== 'all') {
    const cacheKey = `${profile}_${monthKey}`;
    if (donationsCache[cacheKey]) {
      return donationsCache[cacheKey];
    }
    const filePath = getDonationsCsvPath(profile, monthKey);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf8');
        const txs = PaymentsCsv.parseCsv(content);
        donationsCache[cacheKey] = txs;
        return txs;
      }
    } catch (e) {
      log.error('DonationsCSV', `Failed to load donations CSV (${filePath}): ` + e.message);
    }
    donationsCache[cacheKey] = [];
    return [];
  }

  // If all history is requested
  const allMonths = getAvailableProfileMonths(profile);
  let allTxs = [];
  for (const ym of allMonths) {
    const monthTxs = loadDonations(profile, ym);
    allTxs = allTxs.concat(monthTxs);
  }
  allTxs.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
  return allTxs;
}

function saveDonations(profileName, transactions) {
  const profile = profileName || (profilesStore && profilesStore.activeProfile) || 'Default';
  try {
    const groups = {};
    const realTransactions = (transactions || []).filter(t => !t.simulated);

    realTransactions.forEach(t => {
      let ym = PaymentsCsv.getMonthKey(t.timestamp || t.date);
      if (!ym) ym = getTodayYearMonth();
      if (!groups[ym]) groups[ym] = [];
      groups[ym].push(t);
    });

    const cacheKeys = Object.keys(donationsCache).filter(k => k.startsWith(`${profile}_`));
    cacheKeys.forEach(k => delete donationsCache[k]);

    const existingMonths = getAvailableProfileMonths(profile);
    existingMonths.forEach(ym => {
      if (!groups[ym]) {
        const filePath = getDonationsCsvPath(profile, ym);
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch (_) { }
        }
      }
    });

    for (const [ym, txs] of Object.entries(groups)) {
      const filePath = getDonationsCsvPath(profile, ym);
      const fileDir = path.dirname(filePath);
      if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });
      const content = PaymentsCsv.serializeCsv(txs);
      fs.writeFileSync(filePath, content, 'utf8');
      donationsCache[`${profile}_${ym}`] = txs;
    }

    return true;
  } catch (e) {
    log.error('DonationsCSV', `Failed to save donations CSV for ${profile}: ` + e.message);
    return false;
  }
}

function appendDonation(profileName, tx) {
  const profile = profileName || (profilesStore && profilesStore.activeProfile) || 'Default';
  if (tx.simulated) return;

  let ym = PaymentsCsv.getMonthKey(tx.timestamp || tx.date);
  if (!ym) ym = getTodayYearMonth();

  const filePath = getDonationsCsvPath(profile, ym);
  const cacheKey = `${profile}_${ym}`;

  try {
    const fileDir = path.dirname(filePath);
    if (!fs.existsSync(fileDir)) fs.mkdirSync(fileDir, { recursive: true });

    const row = PaymentsCsv.formatCsvRow(tx) + '\n';

    if (!fs.existsSync(filePath)) {
      saveDonations(profile, [tx]);
    } else {
      fs.appendFileSync(filePath, row, 'utf8');
      if (donationsCache[cacheKey]) {
        donationsCache[cacheKey].unshift(tx);
      } else {
        loadDonations(profile, ym);
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
    const files = fs.readdirSync(DATA_DIR);
    for (const file of files) {
      const match = file.match(/^donations_(.+?)\.csv$/);
      if (match) {
        const profile = match[1];
        const filePath = path.join(DATA_DIR, file);
        log.info('Migration', `Found legacy CSV database for profile "${profile}": ${file}`);
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          const txs = PaymentsCsv.parseCsv(content);
          if (txs.length > 0) {
            log.info('Migration', `Migrating ${txs.length} legacy transactions to month-sharded structure...`);
            saveDonations(profile, txs);
          }
          fs.renameSync(filePath, filePath + '.bak');
          log.info('Migration', `Legacy file renamed to ${file}.bak`);
        } catch (err) {
          log.error('Migration', `Failed to migrate legacy CSV ${file}: ` + err.message);
        }
      }
    }
  } catch (e) {
    log.error('Migration', 'Error listing legacy CSV files: ' + e.message);
  }
}

migrateLegacyCsvDatabases();

// ── Metadata Cache Helpers (data/[profile]/metadata.json) ──────────
function getMetadataPath(profileName) {
  const profile = (profileName || (profilesStore && profilesStore.activeProfile) || 'Default')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, profile, 'metadata.json');
}

function loadProfileMetadata(profileName) {
  const filePath = getMetadataPath(profileName);
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
  const filePath = getMetadataPath(profileName);
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

    const supporters = metadata.leaderboard.supporters || {};
    supporters[newTx.sender] = (parseFloat(supporters[newTx.sender]) || 0) + amt;
    metadata.leaderboard.supporters = supporters;

    let recent = metadata.recent.recentDonations || [];
    if (!Array.isArray(recent)) recent = [];
    const decorated = decorateWithTemplate(newTx);
    recent.unshift(decorated);
    if (recent.length > 50) recent = recent.slice(0, 50);
    metadata.recent.recentDonations = recent;

    saveProfileMetadata(profile, metadata);
  } else {
    // Full sync from disk files (triggered on startup, profile switch, manual edit, delete, or import)
    const metadataPath = getMetadataPath(profile);
    if (!forceRebuild && fs.existsSync(metadataPath)) {
      metadata = loadProfileMetadata(profile);
    } else {
      const transactions = loadDonations(profile);
      const metrics = PaymentsCsv.computeMetrics(transactions, { startAmount, includeSimulated: false });

      metadata = {
        goal: { currentAmount: metrics.goalAmount },
        leaderboard: { supporters: metrics.supporters },
        recent: { recentDonations: metrics.recentDonations }
      };

      saveProfileMetadata(profile, metadata);
    }
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
  const payload = JSON.stringify({ type: 'SETTINGS_UPDATED', payload: settings, activeProfile: profilesStore.activeProfile });
  obsClients.forEach(c => { if (c.readyState === 1) c.send(payload); });
}

// ── Amount filter ─────────────────────────────────────────────────────
const parseAmountNum = (rawAmount) => TemplateMatcher.parseAmount(rawAmount);

function decorateWithTemplate(event) {
  const amount = parseAmountNum(event.amount);
  if (event.alertTemplateId) {
    const template = alertSettings.alertTemplates.find(t => t.id === event.alertTemplateId);
    return {
      ...event,
      amountValue: amount,
      alertTemplateId: template ? template.id : event.alertTemplateId,
      alertTemplateName: template ? template.name : ''
    };
  }
  const template = TemplateMatcher.select(alertSettings.alertTemplates, amount);
  return {
    ...event,
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
    let senderName = (notification.sender || notification.title || 'Unknown').trim();
    if (/received|sent/i.test(senderName))
      senderName = senderName.split(/sent|received/i)[0].trim() || 'Unknown';

    const now = Number(notification.timestamp) || Date.now();
    const d = new Date(now);

    const currencyCode = (notification.currency || 'INR').toUpperCase();
    const tx = {
      id: alertId || `evt_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      date: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '',
      time: !isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : '',
      sender: senderName,
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

    log.info('Payment', `[CSV Recorded] ₹${effectiveAmount} from "${senderName}" via ${tx.sourceApp} | Total Goal: ₹${metrics.goalAmount} | AlertID=${tx.id}`);
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
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';

  const transactions = loadDonations(profile, month);
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const startAmount = parseFloat(targetSettings.widgets?.goal?.startAmount) || 0;

  const metrics = PaymentsCsv.computeMetrics(transactions, {
    startAmount,
    includeSimulated: false,
    filters: {
      month,
      provider,
      search,
      minAmount,
      maxAmount,
      specificDate,
      startDate,
      endDate
    }
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
  const minAmount = req.query.minAmount || '';
  const maxAmount = req.query.maxAmount || '';
  const specificDate = req.query.date || req.query.specificDate || '';
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';
  const sort = (req.query.sort || 'desc').toLowerCase();
  const sortBy = (req.query.sortBy || 'date').toLowerCase();
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(10, parseInt(req.query.limit, 10) || 50));

  const allTransactions = loadDonations(profile, month);
  const filtered = PaymentsCsv.filterTransactions(allTransactions, {
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
  const transactions = loadDonations(profile);
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
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
  let startDate = req.query.startDate || '';
  let endDate = req.query.endDate || '';

  // Normalize YYYY-MM inputs to full YYYY-MM-DD bounds so string comparisons are inclusive
  if (startDate && startDate.length === 7) {
    startDate = `${startDate}-01`;
  }
  if (endDate && endDate.length === 7) {
    const [year, monthVal] = endDate.split('-').map(Number);
    const lastDay = new Date(year, monthVal, 0).getDate();
    endDate = `${endDate}-${String(lastDay).padStart(2, '0')}`;
  }

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
  const filename = `donations_${profile}_filtered_${rangeSuffix}_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

app.post('/api/donations/import', (req, res) => {
  try {
    const profile = req.body.profile || profilesStore.activeProfile;
    const mode = req.body.mode || 'replace';
    const csvContent = req.body.csv || '';

    if (!csvContent.trim()) {
      return res.status(400).json({ ok: false, error: 'Empty CSV content' });
    }

    const importedTxs = PaymentsCsv.parseCsv(csvContent);
    let finalTxs = importedTxs;

    if (mode === 'merge') {
      const existing = loadDonations(profile);
      const existingMap = new Map(existing.map(t => [t.id, t]));
      importedTxs.forEach(t => existingMap.set(t.id, t));
      finalTxs = Array.from(existingMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    }

    saveDonations(profile, finalTxs);
    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Imported ${importedTxs.length} transactions (mode: ${mode}) into ${profile}`);
    res.json({ ok: true, profile, importedCount: importedTxs.length, totalCount: finalTxs.length, metrics });
  } catch (e) {
    log.error('DonationsCSV', 'Import error: ' + e.message);
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/donations/record', (req, res) => {
  try {
    const body = req.body || {};
    const profile = body.profile || profilesStore.activeProfile;
    const amountNum = parseFloat(TemplateMatcher.parseAmount(body.amount)) || 0;
    if (amountNum <= 0) return res.status(400).json({ ok: false, error: 'Valid amount is required' });

    const now = Number(body.timestamp) || Date.now();
    const d = new Date(now);

    const currencyCode = (body.currency || 'INR').toUpperCase();
    const tx = {
      id: body.id || `manual_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      date: body.date || (!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : ''),
      time: body.time || (!isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : ''),
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
    const now = body.timestamp || currentTxs[idx].timestamp || Date.now();

    currentTxs[idx] = {
      ...currentTxs[idx],
      sender: (body.sender !== undefined ? body.sender : currentTxs[idx].sender).trim(),
      amount: amountNum,
      currency: currencyCode,
      rawAmount: PaymentsCsv.formatCurrency(amountNum, currencyCode),
      sourceApp: (body.sourceApp !== undefined ? body.sourceApp : currentTxs[idx].sourceApp).trim(),
      date: body.date !== undefined ? body.date : currentTxs[idx].date,
      time: body.time !== undefined ? body.time : currentTxs[idx].time,
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
    const profileDir = path.join(DATA_DIR, profile.replace(/[^a-zA-Z0-9_-]/g, '_'));
    if (fs.existsSync(profileDir)) {
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch (_) { }
    }
    const cacheKeys = Object.keys(donationsCache).filter(k => k.startsWith(`${profile}_`));
    cacheKeys.forEach(k => delete donationsCache[k]);

    const metrics = syncDerivedMetricsToSettings(profile, true, null, true);
    log.info('DonationsCSV', `Cleared all transactions and directories for ${profile}`);
    res.json({ ok: true, profile, count: 0, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/settings', (req, res) => {
  res.json({ activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles), settings: alertSettings });
});

app.post('/api/settings', (req, res) => {
  alertSettings = applySettingsPatch(alertSettings, req.body);
  saveSettings(alertSettings);
  profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: profilesStore.activeProfile, settings: alertSettings });
});

app.get('/api/profiles', (req, res) => {
  res.json({ activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles), profilesMap: profilesStore.profiles });
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
    saveSettings(alertSettings);
  }
  saveProfilesStore(profilesStore); broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles) });
});

app.get('/api/config', (req, res) => res.json(alertSettings));
app.post('/api/config', (req, res) => {
  alertSettings = applySettingsPatch(alertSettings, req.body);
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
    const newPaths = {
      storageRootDir: (body.storageRootDir || '').trim()
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
  const decorated = decorateWithTemplate({
    ...sample,
    simulated: isSimulated,
    sender: sample.sender || (parsed ? parsed.sender : 'Test Donor'),
    amount: sample.amount || (parsed ? parsed.amount : '₹500.00'),
    sourceApp: sample.sourceApp || (parsed ? parsed.sourceApp : sample.appName) || 'PhonePe'
  });
  const payload = JSON.stringify({ type: 'payment_notification', ...decorated });
  let count = 0;
  obsClients.forEach(ws => {
    if (ws.readyState === 1) { ws.send(payload); count++; }
  });
  processPaymentForGoalAndLeaderboard(decorated);
  log.event('TestEvent', `Sample alert triggered (simulated=${isSimulated}): ₹${decorated.amount || '0'} from "${decorated.sender || 'Test'}"`, decorated);
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
    timestamp: Date.now()
  });
  res.json({ ok: true, sent: result.count, template: result.templateName, templateId: result.templateId, simulated: isSimulated });
});

// ── WebSocket Helpers ───────────────────────────────────────────────────
const obsClients = new Set();
const androidClients = new Set();

function getActiveWsCount(clientSet) {
  if (!clientSet) return 0;
  for (const client of clientSet) {
    if (!client || client.readyState === 2 || client.readyState === 3) {
      clientSet.delete(client);
    }
  }
  return clientSet.size;
}

// Fix: use getActiveWsCount() so /health never reports stale/dead sockets
app.get('/health', (req, res) =>
  res.json({ status: 'ok', androidClients: getActiveWsCount(androidClients), obsClients: getActiveWsCount(obsClients) })
);

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

        log.event('PaymentEvent', `Payment received: ${decorated.amount || '₹0'} from "${decorated.sender || 'Unknown'}" via ${decorated.sourceApp} [Template: ${decorated.alertTemplateName || 'Default'}]`, decorated);

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

// HTTP and WS share the same underlying server — one port covers both.
const PREFERRED_PORT = parseInt(process.env.PORT || '2907', 10);

// ── mDNS Auto-Discovery (Bonjour / Zeroconf) ─────────────────────────
let bonjourInstance = null;
let publishedService = null;

function startMdnsDiscovery(port, retryCount = 0) {
  try {
    if (!bonjourInstance) {
      bonjourInstance = new Bonjour();
      // Catch any unexpected socket errors on the underlying registry
      if (bonjourInstance._server && typeof bonjourInstance._server.on === 'function') {
        bonjourInstance._server.on('error', () => { });
      }
    }
    const hostName = os.hostname() || 'Streamer-PC';
    let serviceName = `StreamPe - ${hostName}`;
    if (port !== PREFERRED_PORT || retryCount > 0) {
      serviceName += ` (Port ${port}${retryCount > 0 ? ` #${retryCount}` : ''})`;
    }

    publishedService = bonjourInstance.publish({
      name: serviceName,
      type: 'payment-alerts',
      protocol: 'tcp',
      port: port,
      probe: false,
      txt: {
        version: '2.1.0',
        server: 'streampe',
        hostname: hostName,
        wsPath: '/android'
      }
    });

    publishedService.on('up', () => {
      log.info('mDNS', `Auto-Discovery active: _payment-alerts._tcp.local on port ${port} ("${serviceName}")`);
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

function startServer(port) {
  server.listen(port, '0.0.0.0');

  server.once('listening', () => {
    const actualPort = server.address().port;
    if (actualPort !== PREFERRED_PORT) {
      log.warn('Server', `⚠️  Port ${PREFERRED_PORT} was in use — started on fallback port ${actualPort}`);
    }
    ensureWindowsFirewallRule();
    startMdnsDiscovery(actualPort);
    const primaryIp = getPrimaryIp();
    const ips = getLocalIpAddresses();
    log.info('Server', `\n🚀 StreamPe PC Server Running!`);
    log.info('Server', `   -------------------------------------------------`);
    log.info('Server', `   📱 Mobile App Connection IP: http://${primaryIp}:${actualPort}`);
    log.info('Server', `   🔍 mDNS Auto-Discovery:      _payment-alerts._tcp (Port ${actualPort})`);
    ips.forEach(ip => log.info('Server', `      Network Adapter [${ip.name}]: ${ip.address}`));
    log.info('Server', `   🖥️ OBS Config Dashboard:   http://${primaryIp}:${actualPort}/config`);
    log.info('Server', `   📡 OBS Alert Overlay:       http://${primaryIp}:${actualPort}/overlay/alerts`);
    log.info('Server', `   -------------------------------------------------`);
  });

  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      log.warn('Server', `Port ${port} is already in use — retrying on a random available port...`);
      server.close(() => startServer(0));
    } else {
      log.error('Server', `Failed to start server: ${err.message}`);
      process.exit(1);
    }
  });
}

startServer(PREFERRED_PORT);

// Export the http.Server instance so Electron's main.js can read
// server.address().port after the server has started listening —
// this works for both the preferred port and any random fallback port.
module.exports = server;
