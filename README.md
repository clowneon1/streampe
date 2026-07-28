# 💸 Payment Alerts for OBS

A free, open-source, ultra-fast, and self-hosted solution to display real-time mobile payment alerts, donation goal bars, top supporter leaderboards, recent donation history, and auto-cycling widgets directly on your **OBS Studio** or **Streamlabs** live stream.

---

## 📸 Previews & Screenshots

### 💻 Desktop Client & Web Control Panel

| 💻 Lightweight Desktop App Window | 🎛️ Live Alert Customizer & OBS Preview |
| :---: | :---: |
| <img src="readme-assets/Screenshot%202026-07-28%20212603.png" width="420" alt="Desktop App Window" /> | <img src="readme-assets/Screenshot%202026-07-28%20212617.png" width="420" alt="Live Alert Customizer" /> |
| *Native Electron app window with IP URL copy & auto-start toggle* | *Real-time alert customizer with live transparent OBS overlay grid* |

| 🎯 Payment Goal Bar Widget | 🏆 Top Supporters Leaderboard |
| :---: | :---: |
| <img src="readme-assets/Screenshot%202026-07-28%20212631.png" width="420" alt="Payment Goal Bar" /> | <img src="readme-assets/Screenshot%202026-07-28%20212639.png" width="420" alt="Top Supporters Leaderboard" /> |
| *Configurable donation goal track, fill colors, and progress percentages* | *Live ranking leaderboard for top payment contributors* |

| 🔄 Auto-Cycling Info Widget | 📱 Android Companion Setup |
| :---: | :---: |
| <img src="readme-assets/Screenshot%202026-07-28%20212647.png" width="420" alt="Auto Cycling Widget" /> | <img src="readme-assets/Screenshot%202026-07-28%20212851.png" width="280" alt="Android Companion Setup" /> |
| *Rotational widget cycling through top supporters & recent donations* | *Android companion app setup for local network connection & listener* |

### 📱 Android Companion App Features

| 🔔 Notification Tester & Preset Selector | 📜 Recent Donations & Retrigger Log |
| :---: | :---: |
| <img src="readme-assets/Screenshot%202026-07-28%20213504.png" width="280" alt="Notification Tester" /> | <img src="readme-assets/Screenshot%202026-07-28%20213516.png" width="280" alt="Recent Donations Log" /> |
| *Test payment notification triggers for PhonePe, Amazon Pay, etc.* | *Local log of received notifications with one-click retrigger to OBS* |

---

## 📌 Key Highlights & Features

### ⚡ Ultra-Lightweight Desktop Client
- **Minimal Resource Footprint**: Native Electron window uses < 20 MB RAM with zero UI rendering lag.
- **System Tray Integration**: Minimizes cleanly to the taskbar system tray so your server stays running invisibly in the background.
- **Windows Start on Boot**: Toggle auto-start on Windows boot directly from the desktop client or web dashboard.
- **One-Click Control Panel**: Launch the full web control panel in your default web browser at `http://127.0.0.1:2907/config`.

### 🎨 Fully Customizable Overlays & Live Preview
- **Live Transparent Grid Preview**: Real-time live preview iframe with transparent checkerboard background.
- **Dynamic Background & Backdrop Blur**: Adjust background opacity from 0% to 100% with automatic backdrop blur scaling (blurs to 0px at 0% opacity to reveal crisp transparency).
- **Customizable Borders**: Adjustable border width (px) and border color for all widgets (set border width to `0` to turn off borders completely).
- **Lucide Icon Picker**: Access 60+ vector icons for Cycling Widgets and custom overlay templates.
- **Cycling Widget**: Automatically cycles between Recent Donation & Top Supporter with configurable In/Out animation effects and duration timings.

### 🔒 100% Private & Safe (Local Network Only)
- **Runs Completely Local**: Operates entirely within your local network (`http://<YOUR-PC-IP>:2907`).
- **No External Cloud Servers**: Zero third-party payment gateways, intermediate cloud servers, or subscription fees.
- **Data Security**: Your payment amounts, bank notifications, and financial details stay 100% private and secure on your own devices.

---

## 📱 Recommended Payment App: PhonePe

> [!TIP]
> **PhonePe is Highly Recommended** ⚡
> - **PhonePe** works best because it **ONLY requires Notification Listener Access** on Android.
> - Payment apps like **Amazon Pay** require **Accessibility Service Permissions**, which can interfere with system functions or cause other payment apps to stop functioning.
> - PhonePe requires zero Accessibility permissions—just basic Notification Access!

### 🔒 Android Permissions & Security Explained

| Permission | Required For | Security & Privacy Note |
| :--- | :--- | :--- |
| **`android.permission.INTERNET`** | **Local Network Communication** | Required by Android OS to open WebSocket TCP connections to your PC (`ws://<YOUR-PC-IP>:2907`). **Zero data is sent to external internet/cloud servers.** |
| **`BIND_NOTIFICATION_LISTENER_SERVICE`** | **Payment Notification Reader** | Allows the companion app to detect incoming payment notifications (PhonePe, GPay, Paytm, BHIM, etc.). |
| **`FOREGROUND_SERVICE`** | **Background Stream Connection** | Keeps the local WebSocket connection active in the background while streaming. |
| **`RECEIVE_BOOT_COMPLETED`** | **Auto Start on Boot** | Automatically restarts the local background service when your Android phone reboots. |
| **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** | **Uninterrupted Alert Service** | Prevents Android OS battery saver from putting the background connection to sleep during long streams. |

---

## ⬇️ How to Install & Use (Streamer Setup)

### 1. Download Pre-Built Release
- Visit the official [GitHub Releases Page](https://github.com/clowneon1/payment-alerts-for-obs/releases).
- Download `Payment Alerts for OBS-1.0.0-win.zip` (or portable `.exe`).
- Extract the ZIP file to any folder on your PC.

### 2. Launch the Application
- Double-click **`Payment Alerts for OBS.exe`** to start the app.
- **Run as Administrator**: If network discovery isn't working, right-click the `.exe` and select **Run as Administrator**.
- **Firewall Permission**: When Windows Security Alert appears, check **both Private and Public networks** and click **Allow Access**.
- The app starts on **port 2907** by default.
- Click **Open Control Panel in Browser** to open the full dashboard in Chrome/Edge/Brave.

### 3. Connect Your Android Phone
- Install the companion **Android App APK** on your phone.
- Enter your PC's **Connection URL** displayed in the desktop app (e.g., `http://192.168.1.5:2907`).
- Grant **Notification Access** when prompted.

### 4. Add Overlays in OBS Studio
In OBS Studio, click **+ (Add Source)** ➔ **Browser**:

| Overlay Type | URL | Recommended Size |
| :--- | :--- | :--- |
| 📡 **Payment Alert Widget** | `http://<YOUR-PC-IP>:2907/overlay/alerts` | `800 x 600` |
| 🎯 **Payment Goal Bar** | `http://<YOUR-PC-IP>:2907/overlay/goal` | `800 x 120` |
| 🏆 **Top Leaderboard** | `http://<YOUR-PC-IP>:2907/overlay/leaderboard` | `400 x 600` |
| 📜 **Recent Donations List** | `http://<YOUR-PC-IP>:2907/overlay/recent` | `400 x 600` |
| 🔄 **Cycling Widget** | `http://<YOUR-PC-IP>:2907/overlay/cycling-widget` | `400 x 140` |

---

## 🐛 Report Issues, FAQ & Feedback

Check our **[Frequently Asked Questions (FAQ) & Troubleshooting Guide](FAQ.md)** for step-by-step help with Android Play Protect, Android 13+ Restricted Settings, battery optimization, and network setup!

- ❓ **FAQ & Troubleshooting**: [Read FAQ.md](FAQ.md)
- 🐛 **Report a Bug**: [Submit an Issue on GitHub](https://github.com/clowneon1/payment-alerts-for-obs/issues)
- 💡 **Feature Requests**: [Propose a Feature](https://github.com/clowneon1/payment-alerts-for-obs/issues/new?title=[Feature]+Your+Feature+Idea)
- 💬 **Discord Support**: Join our [Discord Community Server](https://partially-practical.codepenguin.in/) for live setup assistance.

---

## 🛠️ How to Build from Source (Developer Guide)

```bash
git clone https://github.com/clowneon1/payment-alerts-for-obs.git
cd payment-alerts-for-obs/pc-server
npm install
```

### Development Server:
```bash
npm run dev
```

### Run Electron Desktop Client:
```bash
npm run app:start
```

### Build Distribution ZIP Package:
```bash
npm run app:dist
```

---

## 📄 License & Credits
Developed with ❤️ by [clowneon1](https://github.com/clowneon1).  
Distributed under the [MIT License](LICENSE). ⭐ If you like this project, please give it a star on GitHub!
