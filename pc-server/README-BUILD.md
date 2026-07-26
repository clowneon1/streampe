# Payment Alerts for OBS - Portable Windows App

## Overview
Payment Alerts for OBS is packaged as a **Standalone Portable ZIP Application** for Windows.
- **Zero Installation Required**: No setup wizard, no installation steps, and no registry modification on launch.
- **Instant Click-to-Run**: Unzip and double-click `Payment Alerts for OBS.exe`.

## Building the Portable ZIP
To build the portable ZIP package from source:

1. Install dependencies:
   ```cmd
   npm install
   ```

2. Build Portable ZIP Archive:
   ```cmd
   npm run app:dist
   ```

3. Output Artifact:
   `dist-portable/Payment Alerts for OBS-1.0.0-win.zip`

## Features Included in Portable Build
- **Native Desktop Window & System Tray Minimization**
- **Auto-Discovery of PC Local Network IP** for Mobile App pairing
- **1-Click Mobile URL Copy Button**
- **Automatic Windows Defender Firewall Port 3000 Unblock Rule**
- **Real-Time Color-Coded Server Log Viewer & Level Filter**
- **Optional Start on Windows Boot Checkbox**
