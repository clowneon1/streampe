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

    // Heartbeat to detect dead sockets
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
      try {
        const notification = JSON.parse(data.toString());
        console.log(`[NOTIF] ${notification.appName}: ${notification.title} — ${notification.text}`);
        const payload = JSON.stringify(notification);
        obsClients.forEach((client) => {
          if (client.readyState === 1) client.send(payload);
        });
      } catch (e) {
        console.error('Parse error:', e.message);
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
