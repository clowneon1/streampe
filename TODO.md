# 📋 TODO & Project Roadmap

---

## 🚀 Upcoming Features & Tasks

- [ ] **1. Manual Entry for Leaderboard & Recent Donations** — Add ability to manually insert, edit, or adjust entries directly from the dashboard for offline donations or custom adjustments.
- [ ] **2. Non-Payment Notification Filter** — Add strict filtering to ignore promotional messages, security/OTP alerts, reward cashbacks, and bank balance updates from supported payment apps (PhonePe, GPay, Paytm, etc.).
- [ ] **3. Isolated Simulation Mode Toggle** — Add a toggle to enable "Simulation Mode" so test alerts can trigger on-screen animations without affecting live data (subgoals, leaderboards, recent donations, and persistent stats).
- [ ] **4. Analytics & Income Dashboard** — Add an interactive analytics tab with charts and filters (date ranges, payment methods, donation distributions, peak stream hours, donor trends, and income breakdowns).
- [ ] **5. Google Pay (GPay) Parser Support** — Add dedicated regex pattern matching and notification listener parser support for Google Pay transactions.
- [ ] **6. Separated Import/Export Architecture (CSV/Excel for Data + JSON for Config)**:
  - 📊 **Tabular Data (Donation History, Top Supporters, Events)**: Export/Import as **CSV / Excel** for spreadsheet analysis, accounting, and bulk edits in Google Sheets/Excel.
  - ⚙️ **System & Theme Config (Profiles, Templates, Overlay Settings)**: Export/Import as **JSON** for complete, lossless configuration backups and profile sharing.

---

## ✅ Completed

### Version 2.0.0 (`feature/electron-tauri-migration`)
- [x] **Electron → Tauri Migration**: Fully migrated from Electron to Tauri v2 native desktop shell.
- [x] **Bun Sidecar Architecture**: Bundled `server.js` with Bun into a fast, standalone, self-contained sidecar binary.
- [x] **System Tray & Window Management**: Single system tray with dynamic context menu, close-to-tray toggle, start-minimized support, and clean process lifecycle termination.
- [x] **Automated Dual-Release Distribution**: `npm run app:dist` generates both NSIS Windows Installer (`.exe`) and Portable ZIP (`.zip`) directly in `dist/`.
- [x] **Unified Version Sync**: `npm version <patch|minor|major>` automatically syncs `package.json`, `Cargo.toml`, and `tauri.conf.json`.
- [x] **V2 Core Features**: Goal widget, Leaderboard, Recent donations, Cycling widget, Multi-profile support, Alert templates, Config schema versioning & migration, Alert deduplication, Log viewer.

---

*Last updated: 2026-08-15*
