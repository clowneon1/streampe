const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { exec } = require('child_process');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.get('/favicon.ico', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'icon.png'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'config.html'));
});

// ── Debug Logger ─────────────────────────────────────────────────────
let writableBaseDir = __dirname;
try {
  // In Tauri the TAURI_APP_DATA env var is set by the Rust launcher
  if (process.env.TAURI_APP_DATA) {
    writableBaseDir = process.env.TAURI_APP_DATA;
  }
} catch (e) {}

const LOG_DIR       = path.join(writableBaseDir, 'logs');
const LOG_FILE      = path.join(LOG_DIR, 'events.log');
const LOG_MAX_BYTES = 5 * 1024 * 1024;

try {
  if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
} catch (e) {
  console.error('[Server] Failed to create log directory:', e.message);
}

function rotateLogIfNeeded() {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > LOG_MAX_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE.replace('.log', `_${Date.now()}.log`));
    }
  } catch (_) {}
}

function writeLog(level, tag, message, data) {
  const ts   = new Date().toISOString();
  const line = data !== undefined
    ? `[${ts}] [${level}] [${tag}] ${message}\n${JSON.stringify(data, null, 2)}\n`
    : `[${ts}] [${level}] [${tag}] ${message}\n`;
  const colours = { INFO: '\x1b[36m', WARN: '\x1b[33m', ERROR: '\x1b[31m', EVENT: '\x1b[35m', DEDUP: '\x1b[90m', PARSE: '\x1b[32m' };
  const reset   = '\x1b[0m';
  const col     = colours[level] || '';
  if (data !== undefined) {
    console.log(`${col}[${level}]${reset} [${tag}] ${message}`);
    console.log(JSON.stringify(data, null, 2));
  } else {
    console.log(`${col}[${level}]${reset} [${tag}] ${message}`);
  }
  rotateLogIfNeeded();
  try { fs.appendFileSync(LOG_FILE, line, 'utf8'); } catch (e) { console.error('[LOG] write failed:', e.message); }
}

const log = {
  info  : (tag, msg, data) => writeLog('INFO',  tag, msg, data),
  warn  : (tag, msg, data) => writeLog('WARN',  tag, msg, data),
  error : (tag, msg, data) => writeLog('ERROR', tag, msg, data),
  event : (tag, msg, data) => writeLog('EVENT', tag, msg, data),
  dedup : (tag, msg, data) => writeLog('DEDUP', tag, msg, data),
  parse : (tag, msg, data) => writeLog('PARSE', tag, msg, data),
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

  exec('reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS"', (err, stdout) => {
    if (!err && stdout && (stdout.includes('PaymentAlertsOBS') || stdout.includes('Payment Alerts'))) {
      return callback(true);
    }

    try {
      const path = require('path');
      const fs = require('fs');
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

  // Use registry directly (Tauri handles autostart via tauri-plugin-autostart on the Rust side)
  exec('reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /f', () => {
    if (enable) {
      const exePath = process.execPath;
      const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "PaymentAlertsOBS" /t REG_SZ /d "\"${exePath}\"" /f`;
      exec(cmd, (err) => {
        if (callback) callback(!err, err ? err.message : null);
      });
      return;
    }
    if (!enable) {
      try {
        const path = require('path');
        const fs = require('fs');
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
    } else {
      if (callback) callback(true, null);
    }
  });
}

log.info('Server', `Log file: ${LOG_FILE}`);

// ── Payment Parser (JS) ────────────────────────────────────────────
const STRIP_SUFFIXES = [
  / on amazon pay$/i,
  / to your( bank)? account$/i,
  / via \w+$/i,
];

function cleanSender(name) {
  let s = name.trim();
  for (const rx of STRIP_SUFFIXES) s = s.replace(rx, '');
  return s.trim();
}

function normaliseAmount(raw) {
  const stripped = raw.trim()
    .replace(/^\u20B9\s*/, '')
    .replace(/^[Rr][Ss]\.?\s*/, '')
    .trim();
  return `\u20B9${stripped}`;
}

const RE_PHONEPE_AMOUNT     = /has\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_HAS_SENT           = /^(.+?)\s+has\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_AMT_RECEIVED_FROM  = /(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)/i;
const RE_PAYMENT_OF         = /payment\s+of\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+received\s+from\s+(.+)/i;
const RE_NAME_SENT          = /^(.+?)\s+sent\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)/i;
const RE_YOU_PAID           = /you\s+(?:have\s+)?paid\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+to\s+(.+)/i;
const RE_RECEIVED_FROM      = /received\s+(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+from\s+(.+)/i;
const RE_FROM_NAME          = /^from\s+(.+)/i;
const RE_AMT_TITLE          = /(?:\u20B9|rs\.?\s*)?([\d,.]+(?:\.\d{1,2})?)\s+received/i;
const RE_AMT_FROM_TITLE     = /(?:\u20B9|rs\.?\s*)([\d,.]+(?:\.\d{1,2})?)\s+from\s+(.+)/i;
const RE_AMAZON_SENDER      = /money\s+rec(?:ei)?ved\s+from\s+(.+?)\s+on\s+amazon\s+pay/i;

function parsePayment(notification) {
  const pkg     = (notification.packageName || '').trim().toLowerCase();
  const appName = (notification.appName     || '').trim();
  const title   = (notification.title       || '').trim().toLowerCase();
  const text    = (notification.text        || '').trim().toLowerCase();
  const bigText = (notification.bigText     || '').trim().toLowerCase();

  const isPhonePe = pkg.includes('phonepe') || appName.toLowerCase().includes('phonepe');
  const isAmazon  = pkg.includes('amazon')  || appName.toLowerCase().includes('amazon');

  const body = bigText || text;

  // ─ 1. Amazon Pay ───────────────────────────────────────────────
  if (isAmazon) {
    const senderM = RE_AMAZON_SENDER.exec(body);
    const amtM    = RE_AMT_TITLE.exec(title);
    if (senderM && amtM) {
      return { sender: cleanSender(senderM[1]), amount: normaliseAmount(amtM[1]), sourceApp: 'Amazon Pay' };
    }
    const m = RE_AMT_RECEIVED_FROM.exec(body) || RE_AMT_RECEIVED_FROM.exec(title);
    if (m) return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: 'Amazon Pay' };
  }

  // ─ 2. PhonePe ─────────────────────────────────────────────────
  if (isPhonePe) {
    for (const candidate of [body, text, title].filter(Boolean)) {
      const hasIdx = candidate.indexOf(' has ');
      const amtM   = RE_PHONEPE_AMOUNT.exec(candidate);
      if (hasIdx > 0 && amtM) {
        return {
          sender    : cleanSender(candidate.substring(0, hasIdx)),
          amount    : normaliseAmount(amtM[1]),
          sourceApp : 'PhonePe'
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

  // ─ 3. Generic fallbacks ──────────────────────────────────────────
  for (const candidate of [body, title].filter(Boolean)) {
    let m;
    if ((m = RE_HAS_SENT.exec(candidate)))
      return { sender: cleanSender(m[1]), amount: normaliseAmount(m[2]), sourceApp: appName };
    if ((m = RE_PAYMENT_OF.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName };
    if ((m = RE_RECEIVED_FROM.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName };
    if ((m = RE_AMT_RECEIVED_FROM.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName };
    if ((m = RE_NAME_SENT.exec(candidate)))
      return { sender: cleanSender(m[1]), amount: normaliseAmount(m[2]), sourceApp: appName };
    if ((m = RE_YOU_PAID.exec(candidate)))
      return { sender: cleanSender(m[2]), amount: normaliseAmount(m[1]), sourceApp: appName };
  }

  return null;
}

// ── Configuration Files ───────────────────────────────────────────────
// Schema refreshed for Goal widget opacity and saving persistence
const ConfigSchema    = require('./public/js/lib/config-schema');
const ConfigMigration = require('./public/js/lib/config-migration');
const TemplateMatcher = require('./public/js/lib/template-matcher');
const PaymentsCsv = require('./public/js/lib/payments-csv');

const SETTINGS_DIR = path.join(writableBaseDir, 'config');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, 'widget-config.json');

const DATA_DIR = path.join(writableBaseDir, 'data');
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (_) {}
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
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
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
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2), 'utf8');
  } catch (e) { log.error('Profiles', 'Save error: ' + e.message); }
}

let profilesStore = loadProfilesStore();
let alertSettings = profilesStore.profiles[profilesStore.activeProfile] || loadSettings();

// ── Single Source of Truth: CSV Donations Storage ────────────────────
function getDonationsCsvPath(profileName) {
  const profile = (profileName || (profilesStore && profilesStore.activeProfile) || 'Default')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  return path.join(DATA_DIR, `donations_${profile}.csv`);
}

function loadDonations(profileName) {
  const filePath = getDonationsCsvPath(profileName);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      return PaymentsCsv.parseCsv(content);
    }
  } catch (e) {
    log.error('DonationsCSV', `Failed to load donations CSV (${filePath}): ` + e.message);
  }
  return [];
}

function saveDonations(profileName, transactions) {
  const filePath = getDonationsCsvPath(profileName);
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    const content = PaymentsCsv.serializeCsv(transactions);
    fs.writeFileSync(filePath, content, 'utf8');
    return true;
  } catch (e) {
    log.error('DonationsCSV', `Failed to save donations CSV (${filePath}): ` + e.message);
    return false;
  }
}

function syncDerivedMetricsToSettings(profileName, broadcast = true) {
  const profile = profileName || (profilesStore && profilesStore.activeProfile) || 'Default';
  const targetSettings = profilesStore.profiles[profile] || alertSettings;
  const transactions = loadDonations(profile);
  const startAmount = parseFloat(targetSettings.widgets?.goal?.startAmount) || 0;

  const metrics = PaymentsCsv.computeMetrics(transactions, { startAmount, includeSimulated: false });

  if (!targetSettings.widgets) targetSettings.widgets = {};
  if (!targetSettings.widgets.goal) targetSettings.widgets.goal = {};
  if (!targetSettings.widgets.leaderboard) targetSettings.widgets.leaderboard = {};
  if (!targetSettings.widgets.recent) targetSettings.widgets.recent = {};

  targetSettings.widgets.goal.currentAmount = metrics.goalAmount;
  targetSettings.widgets.leaderboard.supporters = metrics.supporters;
  targetSettings.widgets.recent.recentDonations = metrics.recentDonations;

  if (profile === profilesStore.activeProfile) {
    alertSettings = targetSettings;
  }
  saveSettings(alertSettings);
  profilesStore.profiles[profile] = targetSettings;
  saveProfilesStore(profilesStore);

  if (broadcast) {
    broadcastSettings(alertSettings);
  }
  return metrics;
}

// Initial Auto-Migration from settings.json to donations.csv if CSV doesn't exist
function autoMigrateInitialDonations() {
  try {
    const activeProf = profilesStore.activeProfile || 'Default';
    const filePath = getDonationsCsvPath(activeProf);
    if (!fs.existsSync(filePath)) {
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
            rawAmount: r.amount || `₹${amtNum}`,
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
              rawAmount: `₹${amt}`,
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

    if (isSimulated && isIsolated) {
      log.info('Payment', `[Simulation Mode: Isolated] Skipped live goal/leaderboard/recent updates for ₹${notification.amount || '0'} from "${notification.sender || 'Test'}"`);
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

    const tx = {
      id: alertId || `evt_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      date: !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '',
      time: !isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : '',
      sender: senderName,
      amount: effectiveAmount,
      rawAmount: notification.amount || `₹${effectiveAmount}`,
      sourceApp: notification.sourceApp || notification.appName || 'Unknown',
      message: notification.message || '',
      templateId: notification.alertTemplateId || '',
      simulated: isSimulated
    };

    // Single source of truth: Load, append, save CSV and compute derived metrics
    const currentTxs = loadDonations(profilesStore.activeProfile);
    currentTxs.unshift(tx);
    saveDonations(profilesStore.activeProfile, currentTxs);

    const metrics = syncDerivedMetricsToSettings(profilesStore.activeProfile, true);
    if (alertId) processedAlertIds.add(alertId);

    log.info('Payment', `[CSV Recorded] ₹${effectiveAmount} from "${senderName}" via ${tx.sourceApp} | Total Goal: ₹${metrics.goalAmount} | AlertID=${tx.id}`);
  } catch (e) {
    log.error('Payment', 'Error in processPaymentForGoalAndLeaderboard: ' + e.message);
  }
}

// ── Routes ───────────────────────────────────────────────────────────
app.get('/app',                 (req, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));
app.get('/config',              (req, res) => res.sendFile(path.join(__dirname, 'public', 'config.html')));
app.get('/preview',             (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview.html')));
app.get('/overlay/alerts',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/overlay/alert',       (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/overlay/goal',        (req, res) => res.sendFile(path.join(__dirname, 'public', 'goal.html')));
app.get('/overlay/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));
app.get('/overlay/recent',      (req, res) => res.sendFile(path.join(__dirname, 'public', 'recent.html')));
app.get('/overlay/cycling-widget', (req, res) => res.sendFile(path.join(__dirname, 'public', 'cycling-widget.html')));
app.get('/overlay',             (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/alerts',              (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/alert',               (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/goal',                (req, res) => res.sendFile(path.join(__dirname, 'public', 'goal.html')));
app.get('/leaderboard',         (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));

// ── CSV Donations Endpoints (Single Source of Truth) ──────────────────
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

app.get('/api/donations/csv', (req, res) => {
  const profile = req.query.profile || profilesStore.activeProfile;
  const filePath = getDonationsCsvPath(profile);
  if (!fs.existsSync(filePath)) {
    const defaultCsv = PaymentsCsv.serializeCsv([]);
    fs.writeFileSync(filePath, defaultCsv, 'utf8');
  }
  const filename = `donations_${profile}_${new Date().toISOString().split('T')[0]}.csv`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.sendFile(filePath);
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
    const metrics = syncDerivedMetricsToSettings(profile, true);
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

    const tx = {
      id: body.id || `manual_${now}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: now,
      date: body.date || (!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : ''),
      time: body.time || (!isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : ''),
      sender: (body.sender || 'Anonymous').trim(),
      amount: amountNum,
      rawAmount: body.amount ? `₹${amountNum}` : `₹${amountNum}`,
      sourceApp: (body.sourceApp || 'Manual Entry').trim(),
      message: (body.message || '').trim(),
      templateId: body.templateId || '',
      simulated: !!body.simulated
    };

    const currentTxs = loadDonations(profile);
    currentTxs.unshift(tx);
    saveDonations(profile, currentTxs);

    const metrics = syncDerivedMetricsToSettings(profile, true);
    log.info('DonationsCSV', `Recorded manual donation: ₹${amountNum} from "${tx.sender}" via ${tx.sourceApp}`);
    res.json({ ok: true, transaction: tx, metrics });
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
    const metrics = syncDerivedMetricsToSettings(profile, true);
    log.info('DonationsCSV', `Deleted transaction ${id} from ${profile}`);
    res.json({ ok: true, deletedId: id, remainingCount: filtered.length, metrics });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/donations/clear', (req, res) => {
  try {
    const profile = req.body?.profile || profilesStore.activeProfile;
    saveDonations(profile, []);
    const metrics = syncDerivedMetricsToSettings(profile, true);
    log.info('DonationsCSV', `Cleared all transactions for ${profile}`);
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
  profilesStore.activeProfile  = name;
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

app.get('/api/config',  (req, res) => res.json(alertSettings));
app.post('/api/config', (req, res) => {
  alertSettings = applySettingsPatch(alertSettings, req.body);
  saveSettings(alertSettings);
  profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, config: alertSettings });
});

app.get('/api/logs', (req, res) => {
  if (fs.existsSync(LOG_FILE)) {
    const level = (req.query.level || 'ALL').toUpperCase();
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    if (level === 'ALL') {
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', 'attachment; filename="events_all.log"');
      return res.send(content);
    }
    const filtered = content.split('\n').filter(line => line.includes(`[${level}]`)).join('\n');
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="events_${level.toLowerCase()}.log"`);
    res.send(filtered || `No log entries found for level: ${level}`);
  } else {
    res.json({ ok: false, error: 'No log file yet' });
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
  } catch (_) {}
  return { minimizeOnClose: true, startMinimized: false };
}

function saveSystemConfig(cfg) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    fs.writeFileSync(SYSTEM_CONFIG_FILE, JSON.stringify(cfg, null, 2), 'utf8');
  } catch (_) {}
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

function isWindowsStartupEnabled(callback) {
  if (process.platform !== 'win32') return callback(false);
  exec('reg query HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "PaymentAlertsOBS"', (err, stdout) => {
    callback(!err && typeof stdout === 'string' && stdout.includes('PaymentAlertsOBS'));
  });
}

function setWindowsStartup(enable, callback) {
  if (process.platform !== 'win32') return callback(true);
  const exePath = process.execPath;
  if (enable) {
    const cmd = `reg add HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "PaymentAlertsOBS" /t REG_SZ /d "\\"${exePath}\\"" /f`;
    exec(cmd, (err) => {
      callback(!err, err ? err.message : null);
    });
  } else {
    const cmd = `reg delete HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run /v "PaymentAlertsOBS" /f`;
    exec(cmd, (err) => {
      callback(true);
    });
  }
}

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
    if (!fs.existsSync(LOG_FILE)) return res.json({ ok: true, lines: [] });
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const allLines = content.split('\n').filter(Boolean);
    const recent = allLines.slice(-300);
    res.json({ ok: true, totalLines: allLines.length, lines: recent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/logs/clear', (req, res) => {
  try {
    if (fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, '');
    res.json({ ok: true });
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
    sender   : sample.sender || (parsed ? parsed.sender : 'Test Donor'),
    amount   : sample.amount || (parsed ? parsed.amount : '₹500.00'),
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
  const result = broadcastSample({
    type: 'payment_notification',
    simulated: true,
    packageName: 'com.phonepe.app',
    appName: 'PhonePe',
    title: 'PhonePe',
    text: 'D SINGH has sent Rs. 500.00 to your bank account',
    timestamp: Date.now()
  });
  res.json({ ok: true, sent: result.count, template: result.templateName, templateId: result.templateId, simulated: true });
});

app.post('/api/test', (req, res) => {
  const body = req.body || {};
  const isSimulated = body.simulated !== undefined ? !!body.simulated : true;
  const result = broadcastSample({
    type: 'payment_notification',
    simulated:       isSimulated,
    packageName:     body.packageName     || 'com.phonepe.app',
    appName:         body.appName         || 'PhonePe',
    title:           body.title           || 'PhonePe',
    text:            body.text            || 'D SINGH has sent Rs. 500.00 to your bank account',
    bigText:         body.bigText         || body.text || 'D SINGH has sent Rs. 500.00 to your bank account',
    sender:          body.sender          || '',
    amount:          body.amount          || '',
    sourceApp:       body.sourceApp       || '',
    alertTemplateId: body.alertTemplateId || null,
    timestamp:       Date.now()
  });
  res.json({ ok: true, sent: result.count, template: result.templateName, templateId: result.templateId, simulated: isSimulated });
});

// Fix: use getActiveWsCount() so /health never reports stale/dead sockets
app.get('/health', (req, res) =>
  res.json({ status: 'ok', androidClients: getActiveWsCount(androidClients), obsClients: getActiveWsCount(obsClients) })
);

// ── WebSocket ───────────────────────────────────────────────────────────
const obsClients     = new Set();
const androidClients = new Set();

wss.on('connection', (ws, req) => {
  const url        = req.url ? req.url.split('?')[0] : '/';
  const clientType = url === '/android' ? 'android' : 'obs';

  if (clientType === 'android') {
    // Evict any stale CLOSING/CLOSED sockets before adding the new one
    // so the count is always accurate from the moment of connection.
    getActiveWsCount(androidClients);
    androidClients.add(ws);
    log.info('WS', `Android connected (${androidClients.size} total)`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const raw          = data.toString();
        const notification = JSON.parse(raw);
        const appName      = notification.appName || notification.packageName || 'Payment App';
        const title        = notification.title || '';
        const text         = notification.text  || '';

        if (!title && !text) return;

        const parsed = parsePayment(notification);
        const isSimulated = notification.simulated === true || notification.source === 'tester';
        const enriched = {
          ...notification,
          simulated : isSimulated,
          appName,
          title,
          text,
          sender    : parsed ? parsed.sender    : (notification.sender    || ''),
          amount    : parsed ? parsed.amount    : (notification.amount    || ''),
          sourceApp : parsed ? parsed.sourceApp : (notification.sourceApp || appName),
        };

        const decorated = decorateWithTemplate(enriched);
        const payload   = JSON.stringify({ type: 'payment_notification', ...decorated });

        log.event('PaymentEvent', `Payment received: ₹${decorated.amount || '0'} from "${decorated.sender || 'Unknown'}" via ${decorated.sourceApp} [Template: ${decorated.alertTemplateName || 'Default'}]`, decorated);

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

    ws.on('close', () => { androidClients.delete(ws); log.info('WS', 'Android disconnected'); });

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

// Heartbeat for Android clients — terminate unresponsive sockets within 30 s
const androidHeartbeat = setInterval(() => {
  androidClients.forEach(ws => {
    if (ws.isAlive === false) { androidClients.delete(ws); return ws.terminate(); }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

// Heartbeat for OBS browser-source clients — same logic as Android
const obsHeartbeat = setInterval(() => {
  obsClients.forEach(ws => {
    if (ws.isAlive === false) { obsClients.delete(ws); return ws.terminate(); }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(androidHeartbeat);
  clearInterval(obsHeartbeat);
});
wss.on('error', () => {});

// HTTP and WS share the same underlying server — one port covers both.
const PREFERRED_PORT = parseInt(process.env.PORT || '2907', 10);

function startServer(port) {
  server.listen(port, '0.0.0.0');

  server.once('listening', () => {
    const actualPort = server.address().port;
    if (actualPort !== PREFERRED_PORT) {
      log.warn('Server', `⚠️  Port ${PREFERRED_PORT} was in use — started on fallback port ${actualPort}`);
    }
    ensureWindowsFirewallRule();
    const primaryIp = getPrimaryIp();
    const ips = getLocalIpAddresses();
    log.info('Server', `\n🚀 Payment Alerts for OBS PC Server Running!`);
    log.info('Server', `   -------------------------------------------------`);
    log.info('Server', `   📱 Mobile App Connection IP: http://${primaryIp}:${actualPort}`);
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
