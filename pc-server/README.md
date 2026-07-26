# Payment Alerts for OBS - PC Server

The Node.js WebSocket & REST server providing real-time mobile payment alert customization and overlay rendering for OBS Studio.

---

## 🚀 Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm run start
   # or for development auto-reload:
   npm run dev
   ```

The server will start on port `3000` (or `process.env.PORT`).

---

## 🌐 Web Routes

| Route | Description |
| :--- | :--- |
| **`http://localhost:3000/config`** | StreamLabs-style alert customization editor UI |
| **`http://localhost:3000/overlay`** | Transparent OBS Browser Source alert overlay |
| **`http://localhost:3000/goal`** | Payment goal overlay |
| **`http://localhost:3000/leaderboard`** | Top supporters overlay |
| **`http://localhost:3000/preview`** | Live preview and manual alert test page |
| **`http://localhost:3000/health`** | Server & WebSocket connection health check |

---

## 🎨 Alert Customization System

Access the editor UI at `http://localhost:3000/config`.

### Alert templates

Alerts are driven by **templates**. Each entry in `alertTemplates` owns its own
image, sound, text style, animation, layout and canvas, and declares which
payment amounts it applies to:

```jsonc
{
  "id": "vip",
  "name": "VIP Alert",
  "enabled": true,
  "isDefault": false,      // the fallback used when nothing matches
  "priority": 0,           // tie-breaker, higher wins
  "amountFilters": [{ "type": "min", "min": 1000 }],
  "image":     { "imageUrl": "", "gifUrl": "", "position": "top", "size": 100 },
  "sound":     { "soundUrl": "", "soundVolume": 80 },
  "canvas":    { "preset": "1080p", "width": 1920, "height": 1080 },
  "text":      { "titleTemplate": "…", "subtitleTemplate": "…", "fontFamily": "Inter", … },
  "style":     { … }, "animation": { … }, "layout": { … }, "code": { … }
}
```

Filter types are `any`, `exact` (`value`), `min`, `max` and `range`
(`min`+`max`). A template with no filters matches every amount.

**Matching rule.** Every enabled template whose filters accept the amount is
scored by how *narrow* its filter is — `exact` (0) beats `range` (`max - min`)
beats `max`/`min` beats `any`. Ties break on the higher `priority`, then on the
earlier position in the array. If nothing matches, the fallback is the enabled
template flagged `isDefault`, else the first enabled template, else the first
template. The server stamps the template it picked onto the broadcast
(`alertTemplateId`) so overlays never disagree with it.

### Per-widget settings

The alert, payment goal and leaderboard widgets are fully independent. Each has
its own `text` style (font family/size/weight/style, colour, align, transform,
letter spacing, line height) and its own `canvas` — `1080p`, `720p` or `custom`
width/height. Changing one widget's canvas never affects another's.

Alert templates layer on top of `widgets.alert`, which acts as the base and
seeds newly created templates.

### Config tabs

1. **Alert Templates** — template CRUD (create / rename / duplicate / delete /
   enable / set fallback), title & subtitle templates using `{{sender}}`,
   `{{amount}}`, `{{sourceApp}}`, `{{message}}`, `{{timestamp}}`, `{{date}}`,
   amount filters with a live match tester, and custom HTML/CSS/JS.
2. **Media & Sound** — image/GIF URL, alert sound, volume, media position and size.
3. **Style & Canvas** — template typography, canvas preset, colours, border, padding, position and width.
4. **Animations** — entrance/exit animation, motion speed and display duration.
5. **Alert Widget Base** — the base typography and canvas that templates inherit.
6. **Payment Goal** / 7. **Top Leaderboard** — widget fields plus their own typography and canvas.
8. **Amount Filter** — an optional allowlist of amounts that may trigger alerts.

### Features
- **Live Preview Sync**: Instant visual preview inside an embedded iframe.
- **Profiles**: Named configurations in `config/profiles.json`, storing every template and widget setting.
- **Theme Export & Import**: Save configurations as `.json` files or load existing ones. Older files are migrated on import.
- **Live OBS Reload**: Saving broadcasts `SETTINGS_UPDATED` over WebSocket so overlays update without a reload.

### Config format & migration

Configs are versioned (`version: 2`). Older files — the pre-template global
`text`/`media`/`style`/`animation`/`advanced` layout, and the original flat
`widget-config.json` — are migrated on every load, import and profile switch:
the global alert/media setup becomes a single `Default Alert` template and the
global text styling is copied into each widget's own text block. Migration is
idempotent and loss-free, so existing profiles keep working unchanged.

---

## 📡 REST API

- `GET /api/settings`: Returns the active profile, the profile list and the current (migrated) configuration.
- `POST /api/config`: Patch the active configuration, persist it to the active profile and broadcast `SETTINGS_UPDATED`.
- `POST /api/settings`: Replace the configuration and broadcast `SETTINGS_UPDATED`.
- `GET /api/profiles` / `POST /api/profiles/switch` / `POST /api/profiles/save` / `POST /api/profiles/delete`: Profile management.
- `GET /api/test`: Trigger a sample payment notification alert to connected OBS overlays.
- `POST /api/test`: Trigger a custom sample notification; the response reports which alert template matched.

---

## 🎥 OBS Studio Setup

1. Add a **Browser Source** in OBS.
2. Set URL to: `http://localhost:3000/overlay` (or your PC's IP, e.g. `http://192.168.1.5:3000/overlay`).
3. Set **Width**: `1920`, **Height**: `1080` (or `400` x `200`).
4. Check **Shutdown source when not visible** (optional).
