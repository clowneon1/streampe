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
| **`http://localhost:3000/overlay`** | Transparent OBS Browser Source overlay |
| **`http://localhost:3000/preview`** | Live preview and manual alert test page |
| **`http://localhost:3000/health`** | Server & WebSocket connection health check |

---

## 🎨 Alert Customization System

Access the editor UI at `http://localhost:3000/config` to customize your alerts with 5 dedicated configuration tabs:

1. **Text Templates**:
   - Customize Title & Subtitle templates using variables: `{{sender}}`, `{{amount}}`, `{{sourceApp}}`, `{{message}}`, `{{timestamp}}`, `{{date}}`.
   - Adjust font sizes and Google Font families (Inter, Outfit, Poppins, Roboto, Montserrat).
2. **Media & Sound**:
   - Add image or GIF URLs, alert sound (MP3/WAV) playback, media sizing, and media layout position (`top`, `left`, `right`, `bottom`).
3. **Style & Colors**:
   - Background color & opacity slider, accent color, text color, border radius, and card padding.
4. **Animations**:
   - Entrance and exit animations (`slide-up`, `slide-down`, `fade-in`, `zoom-in`, `bounce`).
   - Motion speed duration and alert display duration.
5. **Advanced & Layout**:
   - Position X/Y sliders (0-100%), card width, and custom CSS overrides.

### Features
- **Live Preview Sync**: Instant visual preview inside an embedded iframe.
- **Theme Export & Import**: Save custom themes as `.json` files or load existing theme files.
- **Live OBS Reload**: Modifying and saving settings broadcasts updates via WebSocket so OBS overlays update immediately without reloads.

---

## 📡 REST API

- `GET /api/settings`: Returns current configuration stored in `config/settings.json`.
- `POST /api/settings`: Save updated JSON configuration and broadcast `SETTINGS_UPDATED` to all connected clients.
- `GET /api/test`: Trigger a sample payment notification alert to connected OBS overlays.

---

## 🎥 OBS Studio Setup

1. Add a **Browser Source** in OBS.
2. Set URL to: `http://localhost:3000/overlay` (or your PC's IP, e.g. `http://192.168.1.5:3000/overlay`).
3. Set **Width**: `1920`, **Height**: `1080` (or `400` x `200`).
4. Check **Shutdown source when not visible** (optional).
