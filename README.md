# Payment Alerts for OBS

A free, self-hosted solution to show mobile payment (or any) notifications on your OBS stream.

## Architecture

```
Android Phone
  └─ NotificationListenerService
       └─ WebSocket Client
            └─► PC WebSocket Server (Node.js)
                     └─► OBS Browser Source (HTML overlay)
```

## Setup

### 1. PC Server
```bash
cd pc-server
npm install
node server.js
```
Server runs on port `3000`. OBS Browser Source URL: `http://localhost:3000/overlay`

### 2. Android App
- Open the `android-app` folder in Android Studio
- Change `WS_SERVER_URL` in `MainActivity.kt` to your PC's local IP (e.g. `ws://192.168.1.5:3000`)
- Build & install on your phone
- Grant **Notification Access** permission when prompted

### 3. OBS Setup
- Add a **Browser Source**
- URL: `http://YOUR_PC_IP:3000/overlay`
- Width: 400, Height: 150 (adjust as needed)
- Check "Shutdown source when not visible"

## Filtering for Payment Notifications
The Android app currently forwards ALL notifications. To filter only payment apps (GPay, PhonePe, Paytm, BHIM), edit the `PAYMENT_PACKAGES` list in `NotificationService.kt`.
