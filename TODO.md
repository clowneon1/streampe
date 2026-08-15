# 📋 TODO & Project Status

---

## 🔄 In Progress / Active Tasks

*All active migration and release tasks are completed!*

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
