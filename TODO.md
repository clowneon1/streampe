# 📋 TODO & Project Roadmap

---

## 🚀 Upcoming Features & Tasks

- [ ] **1. Non-Payment Notification Filter** — Add strict filtering to ignore promotional messages, security/OTP alerts, reward cashbacks, and bank balance updates from supported payment apps (PhonePe, GPay, Paytm, etc.).
- [ ] **4. Google Pay (GPay) Parser Support** — Add dedicated regex pattern matching and notification listener parser support for Google Pay transactions.
- [ ] **6. Server Auto-Discovery (mDNS/Bonjour)** — Implement mDNS/Bonjour-based server discovery so the Android app can automatically find the PC server on the local network without manual IP entry. Also allow users to manually add a server by IP/port, with saved servers persisted in local storage for quick reconnection.
- [ ] **10. Unified List Widget System (Leaderboard + Recent → List Configs)** — Leaderboard and Recent Donations are fundamentally the same widget: a sorted/filtered list of transactions with a title. Instead of two hardcoded widget types, introduce a single **List Widget** with a config system modelled on Alert Templates — users can create multiple named list configs (e.g. "Top Supporters", "Recent Donations", "Top by PhonePe", "Last 10 Transactions"), each with its own: sort key (total amount vs. recency), filter (provider, min amount, date range), max entries, display style, and custom HTML/CSS. Each list config gets its own OBS browser source URL (e.g. `/overlay/list?id=<configId>`). Retire the separate `/overlay/leaderboard` and `/overlay/recent` routes once migrated.
- [ ] **12. Defaults & Payment App Cleanup (Support PhonePe, Amazon Pay, GPay & Cash Only)** — Streamline supported payment apps across the entire application for v2. Officially support only **PhonePe**, **Amazon Pay**, **Google Pay (GPay)**, and **Cash / Manual Entry** (for offline donations/ledger). Remove legacy/unused apps and tags like Paytm, BHIM UPI, and other third-party UPI apps from default alert templates, simulation dropdowns, tag pickers, preset badges, and analytics filters.

---

## ✅ Completed

### Version 2.0.0 (`feature/version-2`)

- [x] **11. Goal Widget — Allow Percentage Overflow Beyond 100%** — Added a checkbox setting in the Goal setup: **"Allow Percentage Overflow (Exceed 100%)"**. When checked, the progress bar and `{{percent}}` template variable can visually exceed 100% (e.g. 140%) when donations surpass the goal target, allowing streamers to celebrate exceeding goals live on stream. When unchecked (default), progress is clamped to 100%.

- [x] **2. Isolated Simulation Mode Toggle** — Added an isolated "Simulation Mode" toggle in the dashboard so test alerts can trigger on-screen animations without corrupting live data (subgoals, leaderboards, recent donations, and persistent CSV stats).
- [x] **3. Analytics & Income Dashboard (Earning Overview)** — Comprehensive income reporting tab with interactive Center-Total Donut chart, branded payment method breakdowns, daily revenue timelines, Top Supporters Hall of Fame, paginated transaction ledger with vertical resizer, and monthly CSV multi-part partitioning.
- [x] **5. Single Source of Truth CSV & Separated Import/Export Architecture (CSV for Data + JSON for Config)**:
  - 📊 **Tabular Data (`donations.csv`)**: Single source of truth for Stream Goal, Top Supporters Leaderboard, and Recent Donations with live CSV Export/Import for Excel and Google Sheets.
  - ⚙️ **System & Theme Config (Profiles, Templates, Overlay Settings)**: Separated JSON for lossless configuration backups and profile sharing.
- [x] **7. Fix Cycling Widget Advanced Settings (Template Engine)** — Resolved the `{{variable}}` substitution bug for `label`, `text`, `transitionEffect`, and `mediaHtml` in custom code templates.
- [x] **8. Handlebars.js Template Engine Migration** — Migrated from hand-rolled regex engine to **Handlebars.js** v4.7.8 with self-hosted offline browser bundle (`handlebars.min.js`). Unlocked `{{#if}}`, `{{#each}}`, `{{#unless}}`, custom helpers (`formatAmount`, `formatDate`, `eq`, `gt`, `lt`), and triple-stash `{{{rawHtml}}}` with default XSS escaping.
- [x] **9. Refactor Logger — Day-Based Log Rotation with 7-Day Retention** — Migrated server logger to **Winston** with **`winston-daily-rotate-file`**. Daily rolling log files named `application_YYYY-MM-DD.log` with automated 7-day retention (`maxFiles: '7d'`). Added multi-day log selection, color-coded level badges (`INFO`, `WARN`, `ERROR`, `EVENT`, `PARSE`, `DEDUP`), and full-width layout for the Logs tab.
- [x] **Electron → Tauri Migration**: Fully migrated from Electron to Tauri v2 native desktop shell.
- [x] **Bun Sidecar Architecture**: Bundled `server.js` with Bun into a fast, standalone, self-contained sidecar binary.
- [x] **System Tray & Window Management**: Single system tray with dynamic context menu, close-to-tray toggle, start-minimized support, and clean process lifecycle termination.
- [x] **Automated Portable Release Distribution**: `npm run app:dist` generates a standalone, zero-install Portable ZIP (`Payment-Alerts-for-OBS-v2.0.0-Portable.zip` — ~42 MB) centrally collected in `dist/`.
- [x] **Unified Version Sync**: `npm version <patch|minor|major>` automatically syncs `package.json`, `Cargo.toml`, and `tauri.conf.json`.
- [x] **V2 Core Features**: Goal widget, Leaderboard, Recent donations, Cycling widget, Multi-profile support, Alert templates, Config schema versioning & migration, Alert deduplication, Log viewer.

---

*Last updated: 2026-08-16*
