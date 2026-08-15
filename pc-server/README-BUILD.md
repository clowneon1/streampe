# Payment Alerts for OBS - Windows Release Builds
 
## Overview
Payment Alerts for OBS is distributed in two formats for Windows:
1. **Windows Setup Installer (`.exe`)**: Standard NSIS installer that creates Start Menu shortcuts and manages installation.
2. **Standalone Portable ZIP (`.zip`)**: Zero installation required — unzip anywhere and double-click `Payment Alerts for OBS.exe`.

## Architecture
- **Desktop Shell**: Tauri v2 (Rust compiled native shell + Windows WebView2).
- **Server Sidecar**: Embedded Express & WebSocket server bundled via Bun into `server-x86_64-pc-windows-msvc.exe`.

## Building Release Packages from Source
To compile the release packages:

1. Install dependencies:
   ```cmd
   npm install
   ```

2. Build Distribution Packages:
   ```cmd
   npm run app:dist
   ```

3. Output Artifacts (generated in `dist/`):
   - `dist/Payment-Alerts-for-OBS-v2.0.0-Setup.exe` (NSIS Installer — ~29 MB)
   - `dist/Payment-Alerts-for-OBS-v2.0.0-Portable.zip` (Portable ZIP — ~41 MB)

## Features Included in Release Builds
- **Native Desktop Window & System Tray Integration**
- **Start Minimized & Start on Boot toggles**
- **Close to Minimize to Tray (toggleable)**
- **Auto-Discovery of PC Local Network IP** for Mobile App pairing
- **1-Click Mobile URL Copy Button**
- **1-Click Open Control Panel in Default Browser**
- **Automatic Windows Defender Firewall Port 2907 Detection**
- **Real-Time Color-Coded Server Log Viewer & Level Filter**
