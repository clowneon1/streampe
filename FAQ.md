# ❓ Frequently Asked Questions (FAQ) & Troubleshooting Guide

Common solutions for Android installation, permissions, background execution, and OBS connectivity.

---

## 📱 Android App Installation & Permissions FAQ

### 1. 🛡️ "Blocked by Play Protect" Warning During Installation

**Problem**: When installing `streampe.apk`, Android shows a modal saying *"Blocked by Play Protect"*.

**Why this happens**: Android flags sideloaded APKs built outside Google Play Store.

**Solutions**:
- **Quick Bypass (5 Seconds)**:
  1. On the Play Protect popup, tap **"More details"** (down arrow at the bottom).
  2. Tap **"Install anyway (unsafe)"**. The app will install immediately.
- **Pause / Temporarily Turn Off Play Protect Scanning**:
  1. Open **Google Play Store** ➔ Tap your **Profile Icon** (top right).
  2. Tap **Play Protect** ➔ Tap **Settings (⚙️)** (top right).
  3. Toggle OFF **"Scan apps with Play Protect"** to temporarily pause Play Protect scanning for the day during installation. You can turn it back ON anytime after installation completes.

---

### 2. ⚠️ "Restricted Setting: For your security, this setting is currently unavailable"

**Problem**: When trying to enable **Notification Access** on Android 13, 14, or 15, Android blocks the toggle and displays a *"Restricted setting"* warning message.

**Why this happens**: Android 13+ automatically restricts Notification Listener access for sideloaded APKs until manually unlocked by the user.

**Solution**:
1. Open your phone's **Settings** ➔ **Apps** (or *App Management* / *See all apps*).
2. Find and tap **StreamPe**.
3. Tap the **3 Dots (⋮)** icon in the **top-right corner** of the App Info page.
4. Tap **"Allow restricted settings"** (authenticate with your Fingerprint, Face ID, or PIN if prompted).
5. Open **StreamPe** app again and click **Grant Notification Access**. The permission toggle will now be unlocked!

---

### 3. 🔋 Alerts Stop Forwarding After 10–15 Minutes (Battery Optimization / Sleep Mode)

**Problem**: Payment alerts work initially, but stop when the phone screen turns off or during long live streams.

**Why this happens**: Android OS battery saver puts background WebSocket connections to sleep to conserve battery.

**Solution**:
1. Open **Settings ➔ Apps ➔ StreamPe ➔ Battery**.
2. Change battery setting from *Optimized / Intelligent* to **Unrestricted** (or *Don't Optimize*).
3. **Xiaomi / Redmi (MIUI / HyperOS)**: Go to App Info ➔ enable **Autostart**. Set Battery Saver to **No restrictions**.
4. **OnePlus / Realme / Oppo (OxygenOS / ColorOS)**: Go to App Info ➔ Battery usage ➔ enable **Allow background activity** and **Allow auto-launch**.
5. **Samsung (One UI)**: Go to Settings ➔ Battery ➔ Background usage limits ➔ add *StreamPe* to **Never sleeping apps**.

---

### 4. 💳 Which Payment Apps Work Best?

| Payment App | Recommended Status | Required Permissions | Features & Notes |
| :--- | :---: | :--- | :--- |
| **Google Pay (GPay)** | 💬 **Highly Recommended** | **Notification Access ONLY** | **Full Support for Amount + Custom Donor Messages/Notes** (Zero Accessibility required) |
| **PhonePe** | ⚡ **Highly Recommended** | **Notification Access ONLY** | **Full Support for Amount** (Fast alerts; PhonePe notifications do not include donor notes) |
| **Amazon Pay** | 🛒 **Supported** | Notification Access | May require Accessibility fallback if your OS vendor masks payment amounts |
| **Cash / Manual** | 💵 **Supported** | None | Record manual cash donations directly into the stream ledger & goal bar |
| **WhatsApp** | 🧪 **Testing Only** | Notification Access | Used for test message dispatch (automatically tagged as simulated alerts) |

> [!TIP]
> **Google Pay and PhonePe are both strongly recommended** because they work 100% reliably using basic Notification Access without requiring Accessibility Service permissions. If your donors want to attach custom messages with their payments, encourage them to use **Google Pay**!

---

## 💻 Desktop App & OBS Connection FAQ

### 5. 🔌 "Failed to connect to server: http://192.168.1.x:2907"

**Problem**: The Android app fails to connect to the PC server.

**Solutions**:
1. **Same Wi-Fi Network**: Ensure your Android phone and streaming PC are connected to the **same local Wi-Fi router** (avoid guest networks or cellular data).
2. **Windows Defender Firewall**: When launching `StreamPe.exe`, make sure Windows Security Alert allows access on **both Private and Public networks**.
3. **Verify Connection IP**: Check the top header of the Desktop App or Control Panel (`http://127.0.0.1:2907/config`) to copy the exact **Mobile Connection IP**.
4. **Port In Use**: If port `2907` is blocked by another app on your PC, the desktop server automatically selects an alternate port (e.g. `2908`). Use the exact port shown in your Desktop App header.

---

### 6. 🎥 Overlay Transparency background in OBS Studio

**Problem**: The widget background shows a black or grey box instead of a transparent background on stream.

**Solution**:
1. In OBS Studio, right-click your Browser Source ➔ select **Properties**.
2. Ensure the URL matches `http://<YOUR-PC-IP>:2907/overlay/alerts` (or goal / leaderboard / cycling-widget).
3. In the Web Control Panel (`/config`), check the **Background Opacity** slider. Setting opacity to `0%` renders a 100% transparent overlay.

---

## 💬 Still Having Issues?

- 🐛 **Report a Bug**: [Open an Issue on GitHub](https://github.com/clowneon1/payment-alerts-for-obs/issues)
- 💬 **Discord Support**: Join our [Discord Server](https://partially-practical.codepenguin.in/) for live setup assistance.
