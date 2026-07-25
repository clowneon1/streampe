const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Configuration Files
const SETTINGS_DIR = path.join(__dirname, 'config');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');
const LEGACY_CONFIG_FILE = path.join(__dirname, 'widget-config.json');

const DEFAULT_SETTINGS = {
  text: {
    titleTemplate: "{{sender}} sent {{amount}}",
    subtitleTemplate: "{{sourceApp}} payment received",
    fontSize: 24,
    fontFamily: "Inter",
    fontBold: true,
    fontItalic: false,
    textTransform: "none",
    textAlign: "center"
  },
  media: {
    imageUrl: "",
    gifUrl: "",
    soundUrl: "",
    soundVolume: 80,
    position: "top",
    size: 100
  },
  style: {
    backgroundColor: "#000000",
    backgroundOpacity: 60,
    isTransparent: false,
    accentColor: "#00e5ff",
    textColor: "#ffffff",
    borderRadius: 12,
    borderWidth: 5,
    padding: 20
  },
  animation: {
    type: "slide-up",
    duration: 600,
    displayDuration: 5000
  },
  advanced: {
    canvasWidth: 1920,
    canvasHeight: 1080,
    positionPreset: "bottom-center",
    positionX: 50,
    positionY: 90,
    marginX: 0,
    marginY: 0,
    width: 400,
    enableCustomCode: true,
    customHTML: "",
    customCSS: "",
    customJS: ""
  },
  goal: {
    enableGoal: true,
    title: "Stream Goal",
    startAmount: 0,
    currentAmount: 0,
    targetAmount: 5000,
    endDate: "2026-12-31",
    barHeight: 36,
    barColor: "#1e2433",
    fillColor: "#00e5ff",
    textColor: "#ffffff",
    fontFamily: "Inter",
    customHTML: "",
    customCSS: ""
  },
  leaderboard: {
    enableLeaderboard: true,
    title: "Top Supporters",
    maxEntries: 5,
    showAmounts: true,
    accentColor: "#00e5ff",
    fontFamily: "Inter",
    supporters: {},
    customHTML: "",
    customCSS: ""
  },
  filter: {
    // Empty array = allow all amounts. Add amounts like [1, 500, 1000] to restrict.
    allowedAmounts: []
  }
};

function migrateLegacyConfig(legacy) {
  const merged = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (legacy.lineMiddle || legacy.lineTop) {
    merged.text.titleTemplate = (legacy.lineMiddle || legacy.lineTop || '').replace(/\{/g, '{{').replace(/\}/g, '}}');
  }
  if (legacy.lineBottom) {
    merged.text.subtitleTemplate = legacy.lineBottom.replace(/\{/g, '{{').replace(/\}/g, '}}');
  }
  if (legacy.fontSize) merged.text.fontSize = legacy.fontSize;
  if (legacy.bgColor) merged.style.backgroundColor = legacy.bgColor;
  if (legacy.accentColor) merged.style.accentColor = legacy.accentColor;
  if (legacy.textColor) merged.style.textColor = legacy.textColor;
  if (legacy.borderRadius) merged.style.borderRadius = legacy.borderRadius;
  if (legacy.width) merged.advanced.width = legacy.width;
  if (legacy.duration) merged.animation.displayDuration = legacy.duration;
  return merged;
}

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8'));
      console.log(`[Settings] Loaded configuration from ${SETTINGS_FILE}`);
      return {
        text: { ...DEFAULT_SETTINGS.text, ...(data.text || {}) },
        media: { ...DEFAULT_SETTINGS.media, ...(data.media || {}) },
        style: { ...DEFAULT_SETTINGS.style, ...(data.style || {}) },
        animation: { ...DEFAULT_SETTINGS.animation, ...(data.animation || {}) },
        advanced: { ...DEFAULT_SETTINGS.advanced, ...(data.advanced || {}) },
        goal: { ...DEFAULT_SETTINGS.goal, ...(data.goal || {}) },
        leaderboard: {
          ...DEFAULT_SETTINGS.leaderboard,
          ...(data.leaderboard || {}),
          supporters: { ...(DEFAULT_SETTINGS.leaderboard.supporters || {}), ...((data.leaderboard && data.leaderboard.supporters) || {}) }
        },
        filter: { ...DEFAULT_SETTINGS.filter, ...(data.filter || {}) }
      };
    } else if (fs.existsSync(LEGACY_CONFIG_FILE)) {
      console.log(`[Settings] Migrating legacy configuration from ${LEGACY_CONFIG_FILE}`);
      const legacy = JSON.parse(fs.readFileSync(LEGACY_CONFIG_FILE, 'utf8'));
      const migrated = migrateLegacyConfig(legacy);
      saveSettings(migrated);
      return migrated;
    }
  } catch (e) {
    console.error('[Settings] Load error:', e.message);
  }
  console.log('[Settings] No existing config found, initializing with defaults');
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

function saveSettings(settings) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    console.log(`[Settings] Saved configuration to ${SETTINGS_FILE}`);
  } catch (e) {
    console.error('[Settings] Save error:', e.message);
  }
}

const PROFILES_FILE = path.join(SETTINGS_DIR, 'profiles.json');

function loadProfilesStore() {
  try {
    if (fs.existsSync(PROFILES_FILE)) {
      const store = JSON.parse(fs.readFileSync(PROFILES_FILE, 'utf8'));
      if (store.profiles && store.activeProfile && store.profiles[store.activeProfile]) {
        return store;
      }
    }
  } catch (e) {
    console.error('[Profiles] Load error:', e.message);
  }
  const initialSettings = loadSettings();
  const store = {
    activeProfile: 'Default',
    profiles: {
      'Default': initialSettings
    }
  };
  saveProfilesStore(store);
  return store;
}

function saveProfilesStore(store) {
  try {
    if (!fs.existsSync(SETTINGS_DIR)) {
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
    }
    fs.writeFileSync(PROFILES_FILE, JSON.stringify(store, null, 2), 'utf8');
    console.log(`[Profiles] Saved profiles store to ${PROFILES_FILE}`);
  } catch (e) {
    console.error('[Profiles] Save error:', e.message);
  }
}

let profilesStore = loadProfilesStore();
let alertSettings = profilesStore.profiles[profilesStore.activeProfile] || loadSettings();

function broadcastSettings(settings) {
  const payload = JSON.stringify({ type: 'SETTINGS_UPDATED', payload: settings, activeProfile: profilesStore.activeProfile });
  obsClients.forEach(client => {
    if (client.readyState === 1) {
      client.send(payload);
    }
  });
}

// ── Amount-based filter ──────────────────────────────────────────────
function parseAmount(rawAmount) {
  if (typeof rawAmount === 'number') return rawAmount;
  if (typeof rawAmount === 'string') {
    const match = rawAmount.match(/[\d.,]+/);
    if (match) return parseFloat(match[0].replace(/,/g, '')) || 0;
  }
  return 0;
}

function isAmountAllowed(numAmount) {
  const allowed = alertSettings.filter && Array.isArray(alertSettings.filter.allowedAmounts)
    ? alertSettings.filter.allowedAmounts
    : [];
  if (allowed.length === 0) return true;
  return allowed.some(a => Math.abs(parseFloat(a) - numAmount) < 0.01);
}

function processPaymentForGoalAndLeaderboard(notification) {
  try {
    const numAmount = parseAmount(notification.amount);

    if (!isAmountAllowed(numAmount)) {
      console.log(`[FILTER] Amount ₹${numAmount} not in allowed list — skipping goal/leaderboard update`);
      return;
    }

    const effectiveAmount = numAmount > 0 ? numAmount : 500;

    let senderName = (notification.sender || notification.title || 'Rahul Kumar').trim();
    if (senderName.toLowerCase().includes('received') || senderName.toLowerCase().includes('sent')) {
      senderName = senderName.split(/sent|received/i)[0].trim() || 'Rahul Kumar';
    }

    if (alertSettings.goal) {
      const prevCurrent = parseFloat(alertSettings.goal.currentAmount) || 0;
      alertSettings.goal.currentAmount = prevCurrent + effectiveAmount;
    }

    if (alertSettings.leaderboard) {
      if (!alertSettings.leaderboard.supporters) {
        alertSettings.leaderboard.supporters = {};
      }
      const prevTotal = parseFloat(alertSettings.leaderboard.supporters[senderName]) || 0;
      alertSettings.leaderboard.supporters[senderName] = prevTotal + effectiveAmount;
    }

    saveSettings(alertSettings);
    profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
    saveProfilesStore(profilesStore);
    broadcastSettings(alertSettings);

    console.log(`[PAYMENT] ₹${effectiveAmount} from "${senderName}" processed. Goal current: ₹${alertSettings.goal.currentAmount}`);
  } catch (e) {
    console.error('[PAYMENT] Error processing payment:', e.message);
  }
}

// ── Static & Overlay Routes ──────────────────────────────────────────
app.get('/config', (req, res) => res.sendFile(path.join(__dirname, 'public', 'config.html')));
app.get('/preview', (req, res) => res.sendFile(path.join(__dirname, 'public', 'preview.html')));

app.get('/overlay/alert', (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/overlay/goal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'goal.html')));
app.get('/overlay/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));

app.get('/overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/goal', (req, res) => res.sendFile(path.join(__dirname, 'public', 'goal.html')));
app.get('/leaderboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'leaderboard.html')));

// ── REST APIs ───────────────────────────────────────────────────────
app.get('/api/settings', (req, res) => {
  res.json({
    activeProfile: profilesStore.activeProfile,
    profiles: Object.keys(profilesStore.profiles),
    settings: alertSettings
  });
});

app.post('/api/settings', (req, res) => {
  alertSettings = {
    text: { ...alertSettings.text, ...(req.body.text || {}) },
    media: { ...alertSettings.media, ...(req.body.media || {}) },
    style: { ...alertSettings.style, ...(req.body.style || {}) },
    animation: { ...alertSettings.animation, ...(req.body.animation || {}) },
    advanced: { ...alertSettings.advanced, ...(req.body.advanced || {}) },
    goal: { ...alertSettings.goal, ...(req.body.goal || {}) },
    leaderboard: {
      ...alertSettings.leaderboard,
      ...(req.body.leaderboard || {}),
      supporters: req.body.leaderboard && req.body.leaderboard.supporters ? req.body.leaderboard.supporters : (alertSettings.leaderboard ? alertSettings.leaderboard.supporters : {})
    },
    filter: { ...DEFAULT_SETTINGS.filter, ...(alertSettings.filter || {}), ...(req.body.filter || {}) }
  };

  saveSettings(alertSettings);
  profilesStore.profiles[profilesStore.activeProfile] = alertSettings;
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);

  res.json({ ok: true, activeProfile: profilesStore.activeProfile, settings: alertSettings });
});

// Profile Management APIs
app.get('/api/profiles', (req, res) => {
  res.json({
    activeProfile: profilesStore.activeProfile,
    profiles: profilesStore.profiles
  });
});

app.post('/api/profiles/switch', (req, res) => {
  const { name } = req.body;
  if (!name || !profilesStore.profiles[name]) {
    return res.status(400).json({ ok: false, error: 'Profile not found' });
  }
  profilesStore.activeProfile = name;
  alertSettings = profilesStore.profiles[name];
  saveSettings(alertSettings);
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: name, settings: alertSettings });
});

app.post('/api/profiles/save', (req, res) => {
  const { name, settings: newSettings } = req.body;
  if (!name) return res.status(400).json({ ok: false, error: 'Profile name required' });
  
  if (newSettings) alertSettings = newSettings;
  profilesStore.profiles[name] = alertSettings;
  profilesStore.activeProfile = name;

  saveSettings(alertSettings);
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: name, settings: alertSettings, profiles: Object.keys(profilesStore.profiles) });
});

app.post('/api/profiles/delete', (req, res) => {
  const { name } = req.body;
  if (!name || name === 'Default') {
    return res.status(400).json({ ok: false, error: 'Cannot delete Default profile' });
  }
  delete profilesStore.profiles[name];
  if (profilesStore.activeProfile === name) {
    profilesStore.activeProfile = 'Default';
    alertSettings = profilesStore.profiles['Default'];
    saveSettings(alertSettings);
  }
  saveProfilesStore(profilesStore);
  broadcastSettings(alertSettings);
  res.json({ ok: true, activeProfile: profilesStore.activeProfile, profiles: Object.keys(profilesStore.profiles) });
});

// Legacy API support
app.get('/api/config', (req, res) => res.json(alertSettings));
app.post('/api/config', (req, res) => {
  alertSettings = { ...alertSettings, ...req.body };
  saveSettings(alertSettings);
  broadcastSettings(alertSettings);
  res.json({ ok: true, config: alertSettings });
});

// Test alert endpoints
app.get('/api/test', (req, res) => {
  const sample = {
    type: 'payment_notification',
    packageName: 'com.phonepe.app',
    appName: 'PhonePe',
    sourceApp: 'PhonePe',
    title: 'PhonePe',
    text: 'D SINGH has sent rs1 to your bank account',
    sender: 'D SINGH',
    amount: '₹1',
    timestamp: Date.now()
  };
  let count = 0;
  obsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(sample));
      ws.send(JSON.stringify({ type: 'notification', ...sample }));
      count++;
    }
  });
  res.json({ ok: true, sent: count });
});

app.post('/api/test', (req, res) => {
  const body = req.body || {};
  const sample = {
    type: 'payment_notification',
    packageName: body.packageName || 'com.phonepe.app',
    appName: body.appName || 'PhonePe',
    sourceApp: body.sourceApp || body.appName || 'PhonePe',
    title: body.title || 'PhonePe',
    text: body.text || 'D SINGH has sent rs1 to your bank account',
    sender: body.sender || 'D SINGH',
    amount: body.amount || '₹1',
    timestamp: Date.now()
  };
  let count = 0;
  obsClients.forEach(ws => {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify(sample));
      ws.send(JSON.stringify({ type: 'notification', ...sample }));
      count++;
    }
  });
  res.json({ ok: true, sent: count });
});

app.get('/health', (req, res) =>
  res.json({ status: 'ok', androidClients: androidClients.size, obsClients: obsClients.size })
);

// ── WebSocket Management ─────────────────────────────────────────────
const obsClients = new Set();
const androidClients = new Set();

wss.on('connection', (ws, req) => {
  const url = req.url ? req.url.split('?')[0] : '/';
  const clientType = url === '/android' ? 'android' : 'obs';

  if (clientType === 'android') {
    androidClients.add(ws);
    console.log(`[+] Android connected (${androidClients.size} total)`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const notification = JSON.parse(data.toString());
        const appName = notification.appName || notification.packageName || 'Payment App';
        const title = notification.title || '';
        const text = notification.text || '';

        if (!title && !text) return;

        console.log(`[NOTIF] ${appName}: ${title} — ${text}`);

        processPaymentForGoalAndLeaderboard(notification);

        const payload = JSON.stringify({
          type: 'payment_notification',
          ...notification,
          appName,
          title,
          text
        });

        const legacyPayload = JSON.stringify({
          type: 'notification',
          ...notification,
          appName,
          title,
          text
        });

        obsClients.forEach(client => {
          if (client.readyState === 1) {
            client.send(payload);
            client.send(legacyPayload);
          }
        });
      } catch (e) {
        console.error('[NOTIF] Parse error:', e.message);
      }
    });

    ws.on('close', () => {
      androidClients.delete(ws);
      console.log(`[-] Android disconnected`);
    });

  } else {
    obsClients.add(ws);
    console.log(`[+] OBS overlay connected (${obsClients.size} total)`);

    ws.send(JSON.stringify({ type: 'SETTINGS_UPDATED', payload: alertSettings }));
    ws.send(JSON.stringify({ type: 'config', config: alertSettings }));

    ws.on('close', () => {
      obsClients.delete(ws);
      console.log(`[-] OBS overlay disconnected`);
    });
  }
});

const heartbeat = setInterval(() => {
  androidClients.forEach(ws => {
    if (ws.isAlive === false) {
      androidClients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Payment Alerts for OBS - Server Running`);
  console.log(`   Server      → http://localhost:${PORT}`);
  console.log(`   Config UI   → http://localhost:${PORT}/config`);
  console.log(`   OBS Overlay → http://localhost:${PORT}/overlay`);
  console.log(`   Preview     → http://localhost:${PORT}/preview`);
  console.log(`   Health      → http://localhost:${PORT}/health\n`);
});
