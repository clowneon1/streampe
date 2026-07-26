# 💸 Payment Alerts for OBS

A free, open-source, and self-hosted solution to display real-time mobile payment alerts, donation goal bars, and top supporter leaderboards directly on your **OBS Studio** or **Streamlabs** live stream.

---

## 📌 Introduction & Key Highlights

**Payment Alerts for OBS** connects your Android phone notifications to your PC live streaming software in real time over your local network.

### 🔒 100% Private & Safe (Local Network Only)
- **Runs Completely Local**: Operates entirely within your local network (`http://<YOUR-PC-IP>:2907`).
- **No External Cloud Servers**: No third-party payment gateways, intermediate servers, subscription fees, or data collection.
- **Data Security**: Your payment amounts, bank notifications, and financial details stay 100% private and secure on your own devices.

### 📱 Recommended Payment App: PhonePe
> [!TIP]
> **PhonePe is Highly Recommended** ⚡
> - **PhonePe** works best because it **ONLY requires Notification Listener Access** on Android.
> - Payment apps like **Amazon Pay** require **Accessibility Service Permissions**, which can interfere with system functions or cause other payment apps on your phone to stop functioning.
> - PhonePe requires zero Accessibility permissions—just basic Notification Access!

### 🔒 Android Permissions & Security Explained

| Permission | Required For | Security & Privacy Note |
| :--- | :--- | :--- |
| **`android.permission.INTERNET`** | **Local Network Communication** | Required by Android OS to open WebSocket TCP connections to your PC (`ws://<YOUR-PC-IP>:3000`). **Zero data is sent to external internet/cloud servers.** |
| **`BIND_NOTIFICATION_LISTENER_SERVICE`** | **Payment Notification Reader** | Allows the companion app to detect incoming payment notifications (PhonePe, GPay, Paytm, BHIM, etc.). |
| **`FOREGROUND_SERVICE`** | **Background Stream Connection** | Keeps the local WebSocket connection active in the background while streaming. |
| **`RECEIVE_BOOT_COMPLETED`** | **Auto Start on Boot** | Automatically restarts the local background service when your Android phone reboots. |
| **`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`** | **Uninterrupted Alert Service** | Prevents Android OS battery saver from putting the background connection to sleep during long streams. |

---

## ⬇️ How to Install & Use (Streamer Setup)

No coding required! Follow these simple steps to get started in minutes.

### 1. Download Pre-Built Release
- Visit the official [GitHub Releases Page](https://github.com/clowneon1/payment-alerts-for-obs/releases).
- Download `Payment Alerts for OBS-1.0.0-win.zip` (or the standalone installer).
- Extract the ZIP file to any folder on your PC.

### 2. Launch the Application
- Double-click **`Payment Alerts for OBS.exe`** to start the app.
- **Run as Administrator**: If the app fails to start or network discovery isn't working, right-click the `.exe` and select **Run as Administrator**.
- **Firewall Permission**: When the Windows Security Alert appears, make sure to check **both Private and Public networks** and click **Allow Access**. This is required for your phone to "see" your PC over Wi-Fi.
- The app starts on **port 2907** by default. If port 2907 is already in use, it automatically picks a random available port.
- The **Widget Customizer Dashboard** will open at `http://127.0.0.1:<PORT>/config` (port is shown in the **Mobile Connection IP** header inside the app).
- The exact **Mobile Connection IP** (e.g., `192.168.1.100:2907`) is always displayed in the top header — copy this to connect your Android phone.

> [!NOTE]
> If the app started on a port other than 2907, check the **Mobile Connection IP** header inside the dashboard for the correct address. Use that same port in your OBS Browser Source URL.

### 3. Connect Your Android Phone
- Download and install the companion **Android App APK** on your phone.
- Enter your PC's **Mobile Connection IP** in the app.
- Grant **Notification Access** when prompted (allows the app to detect incoming payment notifications).

### 4. Add Overlays in OBS Studio
In OBS Studio, click **+ (Add Source)** ➔ **Browser**:

| Overlay Type | URL | Recommended Size |
| :--- | :--- | :--- |
| 📡 **Payment Alert Widget** | `http://<YOUR-PC-IP>:2907/overlay/alerts` | `800 x 600` |
| 🎯 **Payment Goal Bar** | `http://<YOUR-PC-IP>:2907/overlay/goal` | `800 x 120` |
| 🏆 **Top Leaderboard** | `http://<YOUR-PC-IP>:2907/overlay/leaderboard` | `400 x 600` |

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
Open `http://localhost:2907/config` in your browser.

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

### 📱 Android Companion App Build

To compile the Android companion app from source:

1. **Prerequisites**:
   - Download & install [Android Studio](https://developer.android.com/studio) (Hedgehog or newer).
   - Android SDK (API Level 24 / Android 7.0 or higher).

2. **Open Project**:
   - Open Android Studio, select **Open an Existing Project**, and choose the `android-app` directory.

3. **Build APK**:
   - Sync Gradle project (`Sync Project with Gradle Files`).
   - Build Debug APK: Select **Build ➔ Build Bundle(s) / APK(s) ➔ Build APK(s)**, or run via Gradle wrapper:
     ```bash
     cd android-app
     ./gradlew assembleDebug
     ```
   - Compiled APK output: `android-app/app/build/outputs/apk/debug/app-debug.apk`.

4. **Install on Device**:
   - Connect your phone via USB with **USB Debugging** enabled, or transfer `app-debug.apk` directly to your Android device to install.

---

## 🤝 Contributing

Contributions are welcome and highly appreciated!
- **Fork the Repository** on GitHub.
- **Create a Feature Branch** (`git checkout -b feature/amazing-feature`).
- **Commit your changes** (`git commit -m 'Add amazing feature'`).
- **Push to the Branch** (`git push origin feature/amazing-feature`).
- **Open a Pull Request**.

Whether it's adding regex patterns for new payment apps, creating overlay themes, or improving Android connectivity, feel free to submit a PR or open an Issue!

---

## 📄 License & Credits
Developed with ❤️ by [clowneon1](https://github.com/clowneon1).  
Distributed under the [MIT License](LICENSE). ⭐ If you like this project, please give it a star on GitHub!
