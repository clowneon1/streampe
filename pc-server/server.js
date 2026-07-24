const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const obsClients = new Set();
const androidClients = new Set();

app.use(express.static(path.join(__dirname, 'public')));

// Health check endpoint — used by Android app before connecting
app.get('/health', (req, res) => {
  res.json({ status: 'ok', androidClients: androidClients.size, obsClients: obsClients.size });
});

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

wss.on('connection', (ws, req) => {
  const clientType = req.url === '/android' ? 'android' : 'obs';

  if (clientType === 'android') {
    androidClients.add(ws);
    console.log(`[+] Android connected. Clients: ${androidClients.size}`);

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const notification = JSON.parse(data.toString());

        // Guard: skip if required fields are missing or empty
        const appName = notification.appName || notification.packageName || 'Unknown';
        const title   = notification.title   || '';
        const text    = notification.text    || '';

        if (!title && !text) {
          console.log('[NOTIF] Skipped — empty title and text');
          return;
        }

        console.log(`[NOTIF] ${appName}: ${title} — ${text}`);

        // Normalise before forwarding so overlay always gets clean fields
        const clean = {
          packageName: notification.packageName || '',
          appName,
          title,
          text,
          timestamp: notification.timestamp || Date.now(),
        };

        const payload = JSON.stringify(clean);
        obsClients.forEach((client) => {
          if (client.readyState === 1) client.send(payload);
        });
      } catch (e) {
        console.error('[NOTIF] Parse error:', e.message, '| Raw:', data.toString().slice(0, 120));
      }
    });

    ws.on('close', () => {
      androidClients.delete(ws);
      console.log(`[-] Android disconnected.`);
    });

  } else {
    obsClients.add(ws);
    console.log(`[+] OBS overlay connected. Clients: ${obsClients.size}`);
    ws.on('close', () => obsClients.delete(ws));
  }
});

// Heartbeat interval — cleans up dead Android sockets every 30s
const heartbeat = setInterval(() => {
  androidClients.forEach((ws) => {
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
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`   Health check → http://localhost:${PORT}/health`);
  console.log(`   OBS Overlay  → http://localhost:${PORT}/overlay`);
  console.log(`   Android WS   → ws://YOUR_PC_IP:${PORT}/android\n`);
});
