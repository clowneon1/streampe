# 📖 Complete Setup & Troubleshooting Guide

This guide covers everything from downloading the application to configuring your Android phone for real-time payment alerts.

---

## 💻 Part 1: PC Setup (Windows)

### 1. Download and Extract
- Download the latest **`StreamPe-v2.0.0-Portable.zip`** from the [GitHub Releases](https://github.com/clowneon1/streampe/releases) page.
- Extract the ZIP file to any folder on your PC (e.g., `C:\StreamTools\PaymentAlerts` or your Desktop).
- Double-click **`StreamPe.exe`** to run.

### 2. Run as Administrator
- If you have network discovery issues, right-click **`StreamPe.exe`** and select **Run as Administrator**.
- **Why?** This allows the app to automatically configure the Windows Firewall and setup "Run on Startup" if you choose to enable it.

### 3. Allow Network Access (Firewall)
- When you first run the app, a Windows Security Alert (Firewall) will pop up.
- **IMPORTANT**: Check **both** "Private networks" and "Public networks".
- Click **Allow Access**.
- If you miss this, your phone will not be able to connect to your PC.

---

## 📱 Part 2: Android App Setup

### 1. Install the APK
- Transfer the `app-debug.apk` to your phone.
- Tap the file to install it.
- If asked to "Allow installation from unknown sources", toggle it **ON** for your File Manager/Browser.

### 2. Bypass Google Play Protect
- During installation, you may see a red warning: *"Unsafe app blocked"* or *"Play Protect doesn't recognize this app's developer"*.
- **Why?** This is a custom open-source app and is not published on the Play Store.
- **Action**: Tap **"More details"** or the small arrow, then tap **"Install anyway"**.

### 3. Fix "Restricted Setting" (Android 13+)
Android 13 and newer restricts sensitive permissions for side-loaded apps. When you try to enable Notification Access, it might say **"Restricted Setting"**.

**How to unlock it:**
1. Open your phone **Settings**.
2. Go to **Apps** ➔ **See all apps**.
3. Find and tap **StreamPe**.
4. Tap the **⋮ (three-dot menu)** in the top-right corner.
5. Tap **Allow restricted settings**.
6. Confirm with your phone PIN/Pattern.
7. Now return to the app and you can successfully enable **Notification Access**.

---

## 💸 Part 3: Recommended Apps — Google Pay & PhonePe
We highly recommend using **Google Pay** or **PhonePe** for the best streaming experience.

### Why Google Pay & PhonePe?
- **Zero Friction**: Both only require basic **Notification Access** on Android (No Accessibility required!).
- **Safe & Private**: Neither requires intrusive Accessibility Services that could interfere with banking PIN entries.
- **💬 Google Pay Supports Custom Donor Messages**: If a donor includes a note/message with their GPay payment (e.g., *"GG WP next game!"*), it will automatically display on your stream overlay.
- **⚡ PhonePe Supports Fast Amount Alerts**: PhonePe notifications are fast and reliable, though PhonePe notification banners only contain the amount.

### Setup Workflow:
1. Open the **Payment Alerts** app on Android.
2. Complete the 3-step setup carousel to grant **Notification Access** (and optional battery keepalive).
3. Connect to your PC Server (via automatic Wi-Fi discovery or manual IP).
4. Tap **Select Apps to Monitor**.
5. Toggle **Google Pay** and/or **PhonePe** to **ON**.
6. That's it! Any incoming payment notification will now trigger your OBS overlay in real-time.

---

## 🎨 Part 4: Control Panel & Customization

Open `http://127.0.0.1:2907/config` on your PC to access the dashboard.

### 🛠️ Alert Templates
- **Create Multiple**: You can have different images/sounds for different donation amounts (e.g., a "Small Tip" for ₹10 and a "Big Whale" for ₹1000).
- **Auto-Matching**: The app automatically selects the best template based on the "Amount Filter" you set in the template.

### 💾 Data Management (Import/Export)
- **Backup**: Use the **Export** button at the bottom of the dashboard to save your entire configuration (templates, colors, goal progress) to a `.json` file.
- **Profiles**: You can create different profiles for different games or stream themes and switch between them instantly.
- **Leaderboard & Recent List**: You can manually edit, clear, or import supporter data and donation history if you need to migrate from another tool.

### 📡 Event Simulator
- Use the **Event Simulator** tab to test your overlays without sending actual money.
- You can simulate notifications from PhonePe, GPay, Paytm, etc., to see how the parser handles them.

---

## ❓ FAQ & Common Issues

- **Phone is not connecting?**
  - Ensure both devices are on the **same Wi-Fi**.
  - Check if your PC's IP address has changed (it happens!).
  - Re-run the PC app as Administrator to ensure the Firewall rule is active.
- **Alerts not showing in OBS?**
  - Verify the **Browser Source URL** in OBS matches the one shown in the dashboard.
  - Make sure the "Enable Alert Widget" switch is ON in the dashboard.
- **Notification settings are restricted?**
  - See [Part 2: Step 3](#3-fix-restricted-setting-android-13) above. Some phones (Xiaomi, Realme, Oppo) may hide this setting under "App Info".
