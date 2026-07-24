const express    = require('express');
const { WebSocketServer } = require('ws');
const http       = require('http');
const path       = require('path');
const fs         = require('fs');

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CONFIG_FILE = path.join(__dirname, 'widget-config.json');

const DEFAULT_CONFIG = {
  // Layout
  position:        'bottom-right',   // top-left | top-right | bottom-left | bottom-right
  width:           380,
  duration:        5000,

  // Templates — use {variable} placeholders
  lineTop:         '{appName}',
  lineMiddle:      '{title}',
  lineBottom:      '{text}',

  // Styling
  bgColor:         '#1a1a2e',
  bgColor2:        '#16213e',
  accentColor:     '#00ff88',
  textColor:       '#ffffff',
  mutedColor:      '#aaaaaa',
  borderRadius:    10,
  fontSize:        14,

  // Animation
  animationIn:     'slideRight',     // slideRight | slideLeft | slideUp | fadeIn
  animationOut:    'slideRight',

  // Filter
  paymentOnly:     false,
  paymentPackages: [
    'com.google.android.apps.nbu.paisa.user',
    'net.one97.paytm',
    'com.phonepe.app',
    'in.org.npci.upiapp',
    'com.amazon.mShop.android.shopping',
    'com.hdfc.bank',
    'com.axisbank.mobile',
    'com.sbi.lotusintouch',
  ],
};

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch (e) { console.error('Config load error:', e.message); }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
}

let widgetConfig = loadConfig();

// ── REST: config API ────────────────────────────────────────────────
app.get('/api/config', (req, res) => res.json(widgetConfig));

app.post('/api/config', (req, res) => {
  widgetConfig = { ...widgetConfig, ...req.body };
  saveConfig(widgetConfig);
  // Push new config live to all OBS overlays
  obsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'config', config: widgetConfig }));
  });
  res.json({ ok: true, config: widgetConfig });
});

app.get('/api/test', (req, res) => {
  const sample = {
    type:        'notification',
    packageName: 'com.google.android.apps.nbu.paisa.user',
    appName:     'Google Pay',
    title:       'Google Pay',
    text:        'You received \u20b9500 from Rahul Kumar',
    bigText:     'You received \u20b9500 from Rahul Kumar\nUPI Ref: 123456789',
    subText:     'savings@okaxis',
    infoText:    '',
    summaryText: '',
    category:    'msg',
    priority:    1,
    isOngoing:   false,
    isClearable: true,
    actions:     ['View', 'Dismiss'],
    timestamp:   Date.now(),
  };
  obsClients.forEach(ws => {
    if (ws.readyState === 1) ws.send(JSON.stringify(sample));
  });
  res.json({ ok: true, sent: obsClients.size });
});

// ── WebSocket ────────────────────────────────────────────────────────
const obsClients     = new Set();
const androidClients = new Set();

app.get('/health', (req, res) =>
  res.json({ status: 'ok', androidClients: androidClients.size, obsClients: obsClients.size })
);

app.get('/overlay', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'))
);

app.get('/config', (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'config.html'))
);

wss.on('connection', (ws, req) => {
  const url        = req.url.split('?')[0];
  const clientType = url === '/android' ? 'android' : 'obs';

  if (clientType === 'android') {
    androidClients.add(ws);
    console.log(`[+] Android connected (${androidClients.size} total)`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const notification = JSON.parse(data.toString());
        const appName = notification.appName || notification.packageName || 'Unknown';
        const title   = notification.title   || '';
        const text    = notification.text    || '';

        if (!title && !text) return;

        console.log(`[NOTIF] ${appName}: ${title} \u2014 ${text}`);

        const payload = JSON.stringify({ type: 'notification', ...notification, appName, title, text });
        obsClients.forEach(client => {
          if (client.readyState === 1) client.send(payload);
        });
      } catch (e) {
        console.error('[NOTIF] Parse error:', e.message);
      }
    });

    ws.on('close', () => { androidClients.delete(ws); console.log(`[-] Android disconnected`); });

    // Send config immediately on connect so overlay is always in sync
    ws.send(JSON.stringify({ type: 'config', config: widgetConfig }));

  } else {
    obsClients.add(ws);
    console.log(`[+] OBS overlay connected (${obsClients.size} total)`);
    // Send current config immediately
    ws.send(JSON.stringify({ type: 'config', config: widgetConfig }));
    ws.on('close', () => obsClients.delete(ws));
  }
});

const heartbeat = setInterval(() => {
  androidClients.forEach(ws => {
    if (ws.isAlive === false) { androidClients.delete(ws); return ws.terminate(); }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => clearInterval(heartbeat));

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n\uD83D\uDE80 Payment Alerts for OBS`);
  console.log(`   Server      \u2192 http://localhost:${PORT}`);
  console.log(`   OBS Overlay \u2192 http://localhost:${PORT}/overlay`);
  console.log(`   Config UI   \u2192 http://localhost:${PORT}/config`);
  console.log(`   Health      \u2192 http://localhost:${PORT}/health\n`);
});
