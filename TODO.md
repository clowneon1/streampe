# 📋 TODO & Project Roadmap

---

## 🚀 Upcoming Features & Tasks

- [ ] **1. Non-Payment Notification Filter** — Add strict filtering to ignore promotional messages, security/OTP alerts, reward cashbacks, and bank balance updates from supported payment apps (PhonePe, GPay, Paytm, etc.).
- [ ] **4. Google Pay (GPay) Parser Support** — Add dedicated regex pattern matching and notification listener parser support for Google Pay transactions.
- [ ] **12. Defaults & Payment App Cleanup (Support PhonePe, Amazon Pay, GPay & Cash Only)** — Streamline supported payment apps across the entire application for v2. Officially support only **PhonePe**, **Amazon Pay**, **Google Pay (GPay)**, and **Cash / Manual Entry** (for offline donations/ledger). Remove legacy/unused apps and tags like Paytm, BHIM UPI, and other third-party UPI apps from default alert templates, simulation dropdowns, tag pickers, preset badges, and analytics filters.
- [ ] **19. Security & Access Control (PIN / Password / 2FA Authentication)** — Add optional password/PIN protection for the PC Dashboard (`/config`) and the Android companion connection (`ws://.../android` & `/api/*`). Prevents unauthorized devices on shared Wi-Fi networks (roommates, shared studios, public Wi-Fi) from accessing financial analytics, triggering bogus alerts, or connecting without entering the streamer's configured PIN/password.

---

## ✅ Completed

### Version 2.0.0 (`feature/version-2`)

- [x] **18. Live Connection State & Real-Time Disconnect Monitoring (Zero Restart Auto-Recovery)** — Implemented real-time connection state listeners in [WebSocketManager.kt](file:///d:/xwork/projects/payment-alerts-for-obs/android-app/app/src/main/java/com/clowneon1/paymentalertsobs/WebSocketManager.kt) and live status badge in [AppSelectorActivity.kt](file:///d:/xwork/projects/payment-alerts-for-obs/android-app/app/src/main/java/com/clowneon1/paymentalertsobs/AppSelectorActivity.kt):
  - Automatically detects PC server closures, network drops, or socket terminations within 1 second.
  - Flips UI dynamically to 🔴 *Server Closed / Reconnecting...* without freezing or requiring an app restart.
  - Automatically reconnects within 3 seconds when the PC server restarts, flipping back to 🟢 *Connected*.

- [x] **17. Dedicated Permissions & Setup Onboarding Screen for Android App** — Separated permission requests into a concise 3-slide swipeable carousel ([PermissionsActivity.kt](file:///d:/xwork/projects/payment-alerts-for-obs/android-app/app/src/main/java/com/clowneon1/paymentalertsobs/PermissionsActivity.kt)):
  - **Slide 1 (Notification Access - Required)**: Clear instructions with quick Android 13/14/15 "Restricted setting" fix guide.
  - **Slide 2 (Battery Keepalive - Recommended)**: Explains background sleep prevention for long stream continuity.
  - **Slide 3 (Accessibility Reader - Optional / Caution)**: Highlights why PhonePe is preferred (no accessibility needed), warns about banking UPI interference, and clarifies Amazon Pay / Android 15 fallback usage.
  - **Clean Connection Dashboard**: Streamlined [MainActivity.kt](file:///d:/xwork/projects/payment-alerts-for-obs/android-app/app/src/main/java/com/clowneon1/paymentalertsobs/MainActivity.kt) purely for server discovery and connection.

- [x] **6. Server Auto-Discovery (mDNS/Bonjour)**:
  - **PC Server (`server.js`)**: Integrated `bonjour-service` to broadcast `_payment-alerts._tcp` on local Wi-Fi, supporting dynamic fallback ports (`Port 58024`), collision auto-recovery, and clean teardown on app exit / nodemon restarts (`SIGINT`, `SIGTERM`, `SIGUSR2`).
  - **Android Companion (`ServerDiscoveryManager.kt`)**: Native `NsdManager` discovery with on-demand timed scanning (stops automatically after 5 seconds to conserve battery) and saved server history chips for quick reconnection.
- [x] **16. Sidebar Navigation Restructure (Earning Overview as Default Home Landing Tab)** — Placed Earning Overview at the top of the sidebar navigation as the default landing view upon dashboard boot, followed by overlay customization widgets and diagnostic tools.
- [x] **15. Default Collapsed State for Secondary Setting Panels** — Collapsed all settings sections (`<details class="collapsible-advanced">`) by default except the first section in each configuration tab (Alert Templates, Alert Style & Animations, Payment Goal, List Widgets, and Cycling Widget), giving streamers a sleek, focused, and uncluttered dashboard experience.
- [x] **13. Remove Alert Widget Base Tab & Redundant Controls** — Removed the obsolete "Alert Widget Base" sidebar tab, duplicate canvas dimensions, and duplicate baseline typography controls. Alert templates are now the sole source of truth for alert appearance and canvas setup.
- [x] **14. Merge Animations into Alert Style (Alert Style & Animations)** — Consolidated the "Animations" tab into "Alert Style & Colors" as a collapsible `Motion & Entry Animations` section, renaming the unified sidebar tab to **"Alert Style & Animations"** (`data-tab="style"`). Streamlined the alert configuration workflow into 2 cohesive tabs: **Alert Templates** (Rules, Text, Media/Sound) and **Alert Style & Animations** (Cards, Colors, Animations, Canvas & Custom Code).

- [x] **10. Unified List Widget System (Leaderboard + Recent → List Configs)** — Leaderboard and Recent Donations have been unified into a clean **List Widget** system. Streamers can customize the two default lists (**"Top Supporters"** at `/overlay/list?id=top-supporters` and **"Recent Donations"** at `/overlay/list?id=recent-donations`) with provider/minAmount filters, card styling, typography, canvas dimensions, and custom HTML/CSS/JS with Handlebars support. Legacy overlay routes (`/overlay/leaderboard`, `/overlay/recent`) are preserved with automatic backward compatibility.

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
