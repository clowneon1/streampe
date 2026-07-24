const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Store connected OBS overlay clients separately
const obsClients = new Set();
const androidClients = new Set();

app.use(express.static(path.join(__dirname, 'public')));

app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

wss.on('connection', (ws, req) => {
  const clientType = req.url === '/android' ? 'android' : 'obs';

  if (clientType === 'android') {
    androidClients.add(ws);
    console.log(`[+] Android app connected. Total android clients: ${androidClients.size}`);

    ws.on('message', (data) => {
      try {
        const notification = JSON.parse(data.toString());
        console.log(`[NOTIFICATION] ${notification.appName}: ${notification.title} - ${notification.text}`);

        // Broadcast to all OBS overlay clients
        const payload = JSON.stringify(notification);
        obsClients.forEach((client) => {
          if (client.readyState === 1) client.send(payload);
        });
      } catch (e) {
        console.error('Failed to parse notification:', e.message);
      }
    });

    ws.on('close', () => {
      androidClients.delete(ws);
      console.log(`[-] Android client disconnected.`);
    });
  } else {
    obsClients.add(ws);
    console.log(`[+] OBS overlay connected. Total obs clients: ${obsClients.size}`);

    ws.on('close', () => {
      obsClients.delete(ws);
    });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log(`   OBS Overlay → http://localhost:${PORT}/overlay`);
  console.log(`   Android WS  → ws://YOUR_PC_IP:${PORT}/android\n`);
});
