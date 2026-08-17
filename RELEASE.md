# 🚀 Release Notes - Version 2.0.0 (Beta 2)

We are proud to present **Version 2.0.0 (Beta 2)** of **StreamPe**! This release contains a complete structural overhaul, transitioning from Electron to a modern **Tauri v2 + Bun sidecar architecture** while introducing a rich suite of new features, widgets, analytics dashboards, and parser optimizations.

Below is the comprehensive list of changes implemented in the Version 2 codebase, synced directly from our project roadmap.

---

## ⚡ Major Architecture Overhaul (Electron ➡️ Tauri v2 + Bun)

* **Tauri v2 Desktop Shell**: Fully migrated the desktop app wrapper from Electron to Tauri v2. This reduces the application's RAM usage to **less than 25 MB** and significantly improves start times.
* **Bun Sidecar Server**: Replaced the Node.js runner with a compiled **Bun background sidecar**. The Node.js Express server (`server.js`) is bundled into a lightweight, self-contained binary running natively without external dependencies.
* **Compact Portable Releases**: The workspace now generates a standalone, zero-install **Portable ZIP** (`StreamPe-v2.0.0-Portable.zip` — `~42 MB`, down from Electron's `~150+ MB`), centrally collected in the `dist/` directory via `npm run app:dist`.
* **System Tray & Window Controls**: Added native system tray integration. Minimizing the application hides it in the tray for uninterrupted background hosting. Includes start-minimized and launch-on-boot configuration flags.
* **Unified Version Syncing**: Built a version sync utility (`npm version <patch|minor|major>`) to automatically align versions across `package.json`, `Cargo.toml`, and `tauri.conf.json`.

---

## 📱 Rebuilt Android Companion App (Native Kotlin)

* **Server Auto-Discovery (mDNS/Bonjour)**: 
  * The PC server now integrates `bonjour-service` to broadcast `_payment-alerts._tcp` over the local network (with automatic port collision recovery to fallbacks like `58024`).
  * The Android app uses native `NsdManager` for on-demand local network scanning (automatically stopping after 5 seconds to conserve battery) and displays connection history chips for quick re-entry.
* **Dedicated Onboarding Carousel**: A new 3-slide swipable onboarding setup (`PermissionsActivity.kt`) guides streamers through necessary permissions:
  * **Slide 1**: *Notification Access* (required for PhonePe / Google Pay alerts) with quick tips for Android 13+ Restricted Settings.
  * **Slide 2**: *Battery Keepalive* (disables battery optimization to prevent streams from falling asleep).
  * **Slide 3**: *Accessibility Reader* (explains when to use it as a fallback for apps like Amazon Pay).
* **Zero-Restart Auto-Recovery**: Re-engineered real-time WebSocket connection state listeners. The app instantly detects PC server restarts or network drops, updating the UI state dynamically (🔴 *Server Closed / Reconnecting...*) and restoring connections in under 3 seconds without freezing or requiring an app restart.
* **Alert History & Retriggering**: Implemented permanent local atomic storage (`alert_log.json`). Streamers can view a historical list of all mobile payments received and re-trigger any alert to OBS with a single click.

---

## 📊 Analytics & Income Dashboard (Earning Overview)

* **Separated Data Architecture**: Split configuration parameters (JSON format for lossless profile backup and sharing) from transaction ledgers (stored in a single tabular `donations.csv` for easy analysis in Google Sheets/Excel).
* **Interactive Earning Overview**: A new dashboard tab featuring:
  * A central total **Donut Chart** with branded payment method breakdowns.
  * **Daily income timeline graphs**.
  * **Top Supporters Hall of Fame**.
  * A **paginated transaction log** with a resizeable interface.
  * **Monthly CSV partitioning** to split data by month.
* **Isolated Simulation Mode**: Added a dedicated simulation toggle in the control panel. Streamers can trigger simulated test notifications without corrupting actual ledger stats, subgoals, leaderboards, or top supporter metrics.

---

## 🎨 Overlay Widgets & Styling Customizations

* **Handlebars.js Template Engine Migration**: Replaced the legacy, hand-rolled regex substitution with **Handlebars.js v4.7.8** (using a fully self-hosted offline browser bundle). Streamers can now use loops (`{{#each}}`), conditional logic (`{{#if}}`, `{{#unless}}`), and custom helper operations (`formatAmount`, `formatDate`, `eq`, `gt`, `lt`) with default XSS protection.
* **Unified List Widget System**: Combined the legacy Recent Donations and Top Supporters systems into a modular **List Widget** format (`/overlay/list?id=top-supporters` and `/overlay/list?id=recent-donations`). Streamers can customize filters, minAmount thresholds, typography, dimensions, and layout cards using custom Handlebars HTML templates. Legacy endpoints are automatically backward-compatible.
* **Goal Percentage Overflow**: Added a checkbox config setting to allow the Stream Goal progress bar and percentages (e.g. `{{percent}}`) to exceed 100% to help celebrate stretch goals.
* **Streamlined Settings Sidebars**:
  * Moved the **Earning Overview** to the top navigation landing position.
  * Consolidated the "Animations" and "Alert Style & Colors" tabs into a single unified tab called **"Alert Style & Animations"**.
  * Collapsed advanced secondary settings panels by default to provide an uncluttered design.
  * Removed the redundant base "Alert Widget Base" tab (Alert templates are now the single source of truth for alerts).
  * Fixed templating variables rendering inside Cycling Widget configurations.

---

## ⚙️ Core Engine, Parsers & Security

* **Dedicated Google Pay (GPay) Parser**: Parses transaction lines matching `<Name> paid you ₹<Amount>` and `<Name> paid you <Amount> rupees`, with advanced extraction of custom donor messages from the sub-text.
* **Spam & Non-Payment Filter**: Automatically filters out bank balance notifications, system OTP alerts, cashbacks, scratch cards, and bill reminders via regex checks.
* **App List Cleanup**: Officially narrowed payment app support to **PhonePe**, **Google Pay**, **Amazon Pay**, and **Cash/Manual Entry** to simplify operations and testing.
* **Fast WebSocket Heartbeat**: Implemented a 5-second WebSocket ping/pong heartbeat and client IP deduplication to prevent phantom connections from building up in the client counter.
* **Winston Daily Rotate File Logger**: Migrated to a daily rolling logger (`application_YYYY-MM-DD.log`) with an automated 7-day retention cleanup rule.
* **Boot Synchronization Fix**: Resolved a critical race condition where the web dashboard would load the default profile's CSV data on boot before the active profile context API resolved. Added helper context hooks to ensure active profiles load instantly.
