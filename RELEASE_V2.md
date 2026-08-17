# 🚀 Release Verification & Notes - StreamPe v2.0.0

**StreamPe v2.0.0** represents a major evolution of the platform — transitioning from Electron to a native **Tauri v2 + Bun sidecar architecture**, introducing a native **Android Companion App** with auto-discovery and dark mode, and launching a **GitHub Pages landing page** at `streampe.codepenguin.in`.

---

## ✅ Pre-Release Verification Checklist

| Verification Category | Sub-system / Target | Status | Verification Details |
| :--- | :--- | :---: | :--- |
| **Android Versioning** | `build.gradle` | ✅ Passed | `versionCode 2`, `versionName "2.0.0"` verified |
| **Android Package Name** | Kotlin Source Files (16) | ✅ Passed | 100% migrated to `com.clowneon1.streampe` |
| **Android Dark Theme** | Activities (5) | ✅ Passed | Forced `Theme.MaterialComponents.NoActionBar` & `AppCompatDelegate.MODE_NIGHT_YES` |
| **Connection Stability** | `WebSocketManager.kt` | ✅ Passed | Fixed connection loop with `isConnecting` atomic guard |
| **Server Eviction Logic** | `pc-server/server.js` | ✅ Passed | IP-filtered socket cleanup prevents kicking active clients |
| **Desktop Architecture** | Tauri v2 + Bun | ✅ Passed | Memory usage < 25 MB RAM, instant boot, system tray |
| **Documentation & Assets**| `README.md` | ✅ Passed | All 11 new v2 asset screenshots & unified list URLs updated |
| **Landing Page** | `docs/` | ✅ Passed | Static glassmorphism landing page with custom domain (`streampe.codepenguin.in`) |
| **Git Tree & History** | `feature/version-2` | ✅ Passed | Clean, squashed commit history synced with `origin` |

---

## ⚡ Key Highlights of Release v2.0.0

### 1. Tauri v2 + Bun Sidecar Desktop Architecture
- **Ultra-Lightweight Footprint**: RAM footprint reduced to **< 25 MB RAM** with instant startup and zero lag during stream gameplay.
- **Portable Distribution**: Generates zero-install portable ZIP archives (`StreamPe-v2.0.0-Portable.zip`, ~42 MB).
- **System Tray Hosting**: Runs quietly in the Windows system tray with start-on-boot and close-to-tray configuration.

### 2. Native Android Companion App (`com.clowneon1.streampe`)
- **mDNS Auto-Discovery**: Native `NsdManager` scanning automatically detects the PC server on local Wi-Fi in under 3 seconds.
- **Strict Dark Theme**: Locked to Dark Mode across all 5 Activities (`MainActivity`, `PermissionsActivity`, `AppSelectorActivity`, `AlertLogActivity`, `NotificationTesterActivity`) regardless of device system light/dark theme settings.
- **Zero-Flicker Connection Manager**: Atomic `isConnecting` state guard prevents duplicate socket creation and connection status flickering.
- **Permanent Alert History**: Local storage (`alert_log.json`) allows streamers to view history and re-trigger any alert to OBS with 1 click.

### 3. Analytics & Overlay Customization
- **Earning Overview & Analytics**: Interactive revenue graphs, daily timeline charts, donor rankings, and tabular payment ledgers.
- **Unified List Widget System**: Modular list overlays (`/overlay/list?id=top-supporters` & `/overlay/list?id=recent-donations`) with Handlebars.js template support.
- **Goal Percentage Overflow**: Goal bar progress percentages can exceed 100% to celebrate stretch goals live on stream.

### 4. Official GitHub Pages Landing Page (`docs/`)
- **Custom Domain**: Bound to `streampe.codepenguin.in` via `docs/CNAME`.
- **Interactive Screenshot Carousel**: 6-slide carousel featuring high-resolution v2 screenshots with auto-play, navigation controls, and mobile touch swipe.
- **Dynamic Release Link Integration**: Download buttons automatically resolve to the latest release tag published on GitHub.

---

## 📄 License & Credits
Developed with ❤️ by [clowneon1](https://github.com/clowneon1).  
Distributed under the [MIT License](LICENSE).
