# 📋 TODO & Project Roadmap

---

## 🚀 Upcoming Features & Tasks

- [ ] **1. Non-Payment Notification Filter** — Add strict filtering to ignore promotional messages, security/OTP alerts, reward cashbacks, and bank balance updates from supported payment apps (PhonePe, GPay, Paytm, etc.).
- [x] **2. Isolated Simulation Mode Toggle** — Add a toggle to enable "Simulation Mode" so test alerts can trigger on-screen animations without affecting live data (subgoals, leaderboards, recent donations, and persistent stats).
- [x] **3. Analytics & Income Dashboard (Earning Overview)** — Comprehensive income reporting tab with interactive Center-Total Donut chart, branded payment method breakdowns, daily revenue timelines, Top Supporters Hall of Fame, paginated transaction ledger, and monthly CSV multi-part partitioning.
- [ ] **4. Google Pay (GPay) Parser Support** — Add dedicated regex pattern matching and notification listener parser support for Google Pay transactions.
- [ ] **6. Server Auto-Discovery (mDNS/Bonjour)** — Implement mDNS/Bonjour-based server discovery so the Android app can automatically find the PC server on the local network without manual IP entry. Also allow users to manually add a server by IP/port, with saved servers persisted in local storage for quick reconnection.
- [ ] **7. Fix Cycling Widget Advanced Settings (Template Engine)** — The advanced settings panel for the cycling widget is not applying correctly (custom HTML/CSS via the template engine is broken). Investigate and fix the `{{variable}}` substitution for `label`, `text`, `transitionEffect`, and `mediaHtml` context variables in the cycling widget's custom code path.
- [ ] **8. Evaluate Robust Template Engine Replacement** — Assess replacing the current hand-rolled `{{variable}}` template engine (`template-engine.js`) with a more robust, battle-tested library (e.g., **Handlebars.js**, **Mustache.js**, or **Nunjucks**). Consider: security (sandbox/escaping), conditional blocks (`{{#if}}`), loops (`{{#each}}`), partial support, and browser + Node.js dual compatibility. Document findings and a migration plan.
- [ ] **9. Refactor Logger — Day-Based Log Rotation with 7-Day Retention** — Replace the current single `events.log` file with daily rolling log files named `application_YYYY-MM-DD.log`. On each server start (and midnight), open a new file for the current day. At startup and daily, scan the logs directory and automatically delete any log files older than 7 days. Update the in-app log viewer (`/api/logs/live`) and download endpoints to read from the current day's file by default, with optional date query param to fetch older archived days.
- [x] **5. Single Source of Truth CSV & Separated Import/Export Architecture (CSV for Data + JSON for Config)**:
  - 📊 **Tabular Data (`donations.csv`)**: Single source of truth for Stream Goal, Top Supporters Leaderboard, and Recent Donations with live CSV Export/Import for Excel and Google Sheets.
  - ⚙️ **System & Theme Config (Profiles, Templates, Overlay Settings)**: Separated JSON for lossless configuration backups and profile sharing.

---

## ✅ Completed

### Version 2.0.0 (`feature/electron-tauri-migration`)
- [x] **Electron → Tauri Migration**: Fully migrated from Electron to Tauri v2 native desktop shell.
- [x] **Bun Sidecar Architecture**: Bundled `server.js` with Bun into a fast, standalone, self-contained sidecar binary.
- [x] **System Tray & Window Management**: Single system tray with dynamic context menu, close-to-tray toggle, start-minimized support, and clean process lifecycle termination.
- [x] **Automated Portable Release Distribution**: `npm run app:dist` generates a standalone, zero-install Portable ZIP (`Payment-Alerts-for-OBS-v2.0.0-Portable.zip` — ~42 MB) centrally collected in `dist/`.
- [x] **Unified Version Sync**: `npm version <patch|minor|major>` automatically syncs `package.json`, `Cargo.toml`, and `tauri.conf.json`.
- [x] **V2 Core Features**: Goal widget, Leaderboard, Recent donations, Cycling widget, Multi-profile support, Alert templates, Config schema versioning & migration, Alert deduplication, Log viewer.

---

*Last updated: 2026-08-15*
