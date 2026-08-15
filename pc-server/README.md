# Payment Alerts for OBS - PC Server & Desktop App

The core server and Tauri v2 desktop client for **Payment Alerts for OBS**.

## Features
- **Embedded Express & WebSocket Server**: Powered by a high-performance **Bun** binary sidecar listening on port 2907 (or fallback port) for real-time mobile payment events.
- **Lightweight Native Desktop Shell**: Built with **Tauri v2** (Rust + WebView2), providing a < 25 MB RAM footprint, Start on Boot toggle, Start Minimized toggle, system tray integration, and native browser opener.
- **Web Control Panel Dashboard**: Complete theme customizer, profile manager, Lucide icon picker, live transparent grid preview, and custom HTML/CSS/JS editor.
- **Overlays Supported**:
  - `/overlay/alerts`: Payment Alert Box
  - `/overlay/goal`: Payment Goal Bar
  - `/overlay/leaderboard`: Top Supporter Leaderboard
  - `/overlay/recent`: Recent Donations History
  - `/overlay/cycling-widget`: Auto-Cycling Widget (Recent & Top Supporter)

## Development Commands

```bash
# Install dependencies
npm install

# Start local Node.js server (nodemon)
npm run dev

# Compile Bun sidecar manually
npm run bun:build

# Run Tauri desktop app in development mode
npm run app:dev

# Build release distribution (NSIS Installer + Portable ZIP in dist/)
npm run app:dist

# Bump version across package.json, Cargo.toml & tauri.conf.json
npm version patch # (or minor / major)
```

## Bug Reports & Support
- 🐛 **GitHub Issues**: [Report an Issue](https://github.com/clowneon1/payment-alerts-for-obs/issues)
- 💬 **Discord**: [Community Support Server](https://partially-practical.codepenguin.in/)
