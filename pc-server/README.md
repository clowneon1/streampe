# Payment Alerts for OBS - PC Server & Windows App

Author: **clowneon1**

The Node.js WebSocket & REST server + Windows Desktop Application providing real-time mobile payment alert customization and overlay rendering for OBS Studio.

---

## 🚀 Quick Start

### 1. Run Desktop Application
```bash
npm run app:start
```
Launches the native Windows Application with the **Server Control Panel** UI.
> [!IMPORTANT]
> **Run as Administrator**: For automatic Firewall rule configuration and startup settings, it is recommended to run the terminal or IDE as Administrator.
> **Network Access**: Always **Allow Access** when prompted by Windows Firewall to ensure mobile connectivity.

### 2. Run Headless Server
```bash
npm run start
# or auto-reload in dev mode:
npm run dev
```

### 3. Build Portable ZIP Archive
```bash
npm run app:dist
```
Output: `dist-portable/Payment Alerts for OBS-1.0.0-win.zip` (Portable click-to-run release, zero installation required).

---

## 🌐 Web & Overlay Routes

| Route | Description |
| :--- | :--- |
| **`http://<YOUR-PC-IP>:2907/`** | Server Control Panel UI (Server URL, Startup Checkbox, Live Log Terminal) |
| **`http://<YOUR-PC-IP>:2907/config`** | Full OBS Theme & Template Editor UI |
| **`http://<YOUR-PC-IP>:2907/overlay/alerts`** | Transparent OBS Browser Source Alert Overlay (also `/overlay`, `/overlay/alert`) |
| **`http://<YOUR-PC-IP>:2907/overlay/goal`** | Payment Goal Widget Overlay (also `/goal`) |
| **`http://<YOUR-PC-IP>:2907/overlay/leaderboard`** | Top Supporters Leaderboard Overlay (also `/leaderboard`) |
| **`http://<YOUR-PC-IP>:2907/preview`** | Live preview and manual alert test page |

---

## 🎥 OBS Studio Setup

1. Add a **Browser Source** in OBS Studio.
2. Set URL to your PC Network IP:
   - **Payment Alerts Overlay**: `http://<YOUR-PC-IP>:2907/overlay/alerts`
   - **Payment Goal Widget**: `http://<YOUR-PC-IP>:2907/overlay/goal`
   - **Leaderboard Widget**: `http://<YOUR-PC-IP>:2907/overlay/leaderboard`
3. Set **Width**: `1920`, **Height**: `1080` (or `400` x `200`).

---

## 📡 REST API

- `GET /api/network-info`: Auto-detected local network IP addresses, server port, and connection counts.
- `GET /api/logs/live`: Real-time server log output array for log viewer.
- `POST /api/logs/clear`: Clear live log buffer.
- `GET /api/system/startup` / `POST /api/system/startup`: Windows startup registry configuration.
- `POST /api/system/firewall`: Automatic unblock of port 2907 in Windows Defender Firewall (`netsh advfirewall firewall add rule...`).
- `GET /api/settings`: Returns active profile list and current configuration schema.
- `POST /api/config`: Patch active configuration and broadcast `SETTINGS_UPDATED`.
- `POST /api/test`: Trigger a custom sample notification; returns matched template details.
