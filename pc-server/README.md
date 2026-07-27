# Payment Alerts for OBS - PC Server & Desktop App

The core server and Electron desktop client for **Payment Alerts for OBS**.

## Features
- **Embedded Express & WebSocket Server**: Listens on port 2907 (or fallback port) for real-time mobile payment events.
- **Lightweight Desktop Window**: Built with Electron, providing a < 20 MB RAM footprint, Start on Boot toggle, system tray integration, and browser launcher.
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

# Start local dev server (nodemon)
npm run dev

# Start Electron desktop client
npm run app:start

# Build portable distribution ZIP
npm run app:dist
```

## Bug Reports & Support
- 🐛 **GitHub Issues**: [Report an Issue](https://github.com/clowneon1/payment-alerts-for-obs/issues)
- 💬 **Discord**: [Community Support Server](https://partially-practical.codepenguin.in/)
