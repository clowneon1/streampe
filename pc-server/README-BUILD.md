# StreamPe - Standalone Portable Windows App
 
## Overview
StreamPe is distributed as a **Zero-Install Standalone Portable ZIP** for Windows:
- **Zero Installation Required**: No setup wizard, no UAC prompts, and no registry pollution.
- **Instant Click-to-Run**: Unzip anywhere (e.g. Desktop or StreamTools folder) and double-click `StreamPe.exe`.

## Architecture
- **Desktop Shell**: Tauri v2 (Rust compiled native shell + Windows WebView2).
- **Server Sidecar**: Embedded Express & WebSocket server bundled via Bun into `server.exe`.

## Building Release Package from Source
To compile the portable package:

1. Install dependencies:
   ```cmd
   npm install
   ```

2. Build Portable Package:
   ```cmd
   npm run app:dist
   ```

3. Output Artifact (generated in `dist/`):
   - `dist/StreamPe-v2.0.0-Portable.zip` (~42 MB)

## Features Included in Release Builds
- **Native Desktop Window & System Tray Integration**
- **Start Minimized & Start on Boot toggles**
- **Close to Minimize to Tray (toggleable)**
- **Auto-Discovery of PC Local Network IP** for Mobile App pairing
- **1-Click Mobile URL Copy Button**
- **1-Click Open Control Panel in Default Browser**
- **Automatic Windows Defender Firewall Port 2907 Detection**
- **Real-Time Color-Coded Server Log Viewer & Level Filter**
