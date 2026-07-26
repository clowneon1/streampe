# 💸 Payment Alerts for OBS

A free, open-source, and self-hosted solution to display real-time mobile payment alerts, donation goal bars, and top supporter leaderboards directly on your **OBS Studio** or **Streamlabs** live stream.

---

## 📌 Introduction & Key Highlights

**Payment Alerts for OBS** connects your Android phone notifications to your PC live streaming software in real time over your local network.

### 🔒 100% Private & Safe (Local Network Only)
- **Runs Completely Local**: Operates entirely within your local network (`http://<YOUR-PC-IP>:3000`).
- **No External Cloud Servers**: No third-party payment gateways, intermediate servers, subscription fees, or data collection.
- **Data Security**: Your payment amounts, bank notifications, and financial details stay 100% private and secure on your own devices.

### 📱 Recommended Payment App: PhonePe
> [!TIP]
> **PhonePe is Highly Recommended** ⚡
> - **PhonePe** works best because it **ONLY requires Notification Listener Access** on Android.
> - Payment apps like **Amazon Pay** require **Accessibility Service Permissions**, which can interfere with system functions or cause other payment apps on your phone to stop functioning.
> - PhonePe requires zero Accessibility permissions—just basic Notification Access!

---

## ⬇️ How to Install & Use (Streamer Setup)

No coding required! Follow these simple steps to get started in minutes.

### 1. Download Pre-Built Release
- Visit the official [GitHub Releases Page](https://github.com/clowneon1/payment-alerts-for-obs/releases).
- Download `Payment Alerts for OBS-1.0.0-win.zip` (or the standalone installer).
- Extract the ZIP file to any folder on your PC.

### 2. Launch the Application
- Double-click **`Payment Alerts for OBS.exe`** to start the app.
- The **Widget Customizer Dashboard** will open automatically at `http://127.0.0.1:3000/config`.
- Take note of your **Mobile Connection IP** displayed at the top header (e.g., `192.168.1.100:3000`).

### 3. Connect Your Android Phone
- Download and install the companion **Android App APK** on your phone.
- Enter your PC's **Mobile Connection IP** in the app.
- Grant **Notification Access** when prompted (allows the app to detect incoming payment notifications).

### 4. Add Overlays in OBS Studio
In OBS Studio, click **+ (Add Source)** ➔ **Browser**:

| Overlay Type | URL | Recommended Size |
| :--- | :--- | :--- |
| 📡 **Payment Alert Widget** | `http://<YOUR-PC-IP>:3000/overlay/alerts` | `800 x 600` |
| 🎯 **Payment Goal Bar** | `http://<YOUR-PC-IP>:3000/overlay/goal` | `800 x 120` |
| 🏆 **Top Leaderboard** | `http://<YOUR-PC-IP>:3000/overlay/leaderboard` | `400 x 600` |

---

## 🛠️ How to Build from Source (Developer Guide)

If you want to customize the codebase or build the standalone application yourself, follow these instructions.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- [Git](https://git-scm.com/)

### 1. Clone Repository & Install Dependencies
```bash
git clone https://github.com/clowneon1/payment-alerts-for-obs.git
cd payment-alerts-for-obs/pc-server
npm install
```

### 2. Run Local Development Server
```bash
npm run dev
```
Open `http://localhost:3000/config` in your browser.

### 3. Run Electron App Desktop Mode
```bash
npm run app:start
```

### 4. Build Standalone Portable ZIP
To build the distribution ZIP package for Windows:
```bash
npm run app:dist
```
The compiled release ZIP will be created in `dist-portable/Payment Alerts for OBS-1.0.0-win.zip`.

---

## 📄 License & Credits
Developed with ❤️ by [clowneon1](https://github.com/clowneon1).  
Distributed under the MIT License. ⭐ If you like this project, please give it a star on GitHub!
