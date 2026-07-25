/**
 * Storage Helper for Payment Alerts Settings
 * Manages localStorage, server REST endpoints, and JSON import/export
 */
(function (global) {
  const LOCAL_STORAGE_KEY = 'streamlabs_alert_settings';

  const DEFAULT_SETTINGS = {
    activeWidget: "alert",
    widgets: {
      alert: {
        text: { titleTemplate: "{{sender}} sent {{amount}}", subtitleTemplate: "{{sourceApp}} payment received", fontSize: 24, fontFamily: "Inter", fontBold: true, fontItalic: false, textTransform: "none", textAlign: "center" },
        media: { imageUrl: "", gifUrl: "", soundUrl: "", soundVolume: 80, position: "top", size: 100 },
        style: { backgroundColor: "#000000", backgroundOpacity: 60, isTransparent: false, accentColor: "#00e5ff", textColor: "#ffffff", borderRadius: 12, borderWidth: 5, padding: 20 },
        animation: { type: "slide-up", duration: 600, displayDuration: 5000 },
        advanced: { canvasWidth: 1920, canvasHeight: 1080, positionPreset: "bottom-center", positionX: 50, positionY: 90, marginX: 0, marginY: 0, width: 400, enableCustomCode: true, customHTML: "", customCSS: "", customJS: "" }
      },
      goal: {
        enableGoal: true,
        title: "Payment Goal",
        startAmount: 0,
        currentAmount: 0,
        targetAmount: 5000,
        endDate: "2026-12-31",
        text: { titleTemplate: "Payment Goal", subtitleTemplate: "Target: ₹{{targetAmount}}", fontSize: 18, fontFamily: "Inter", fontBold: true, fontItalic: false, textTransform: "none", textAlign: "left" },
        media: { imageUrl: "", gifUrl: "", soundUrl: "", soundVolume: 80, position: "top", size: 100 },
        style: { backgroundColor: "#0a0e17", backgroundOpacity: 85, isTransparent: false, accentColor: "#00e5ff", textColor: "#ffffff", borderRadius: 14, borderWidth: 1, padding: 16, barHeight: 36, barColor: "#1e2433", fillColor: "#00e5ff" },
        animation: { type: "fade-in", duration: 400, displayDuration: 5000 },
        advanced: { canvasWidth: 1920, canvasHeight: 1080, positionPreset: "center", positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 600, enableCustomCode: true, customHTML: "", customCSS: "", customJS: "" }
      },
      leaderboard: {
        enableLeaderboard: true,
        title: "Top Supporters",
        maxEntries: 5,
        showAmounts: true,
        supporters: {},
        text: { titleTemplate: "Top Supporters", subtitleTemplate: "Leaderboard", fontSize: 15, fontFamily: "Inter", fontBold: true, fontItalic: false, textTransform: "none", textAlign: "left" },
        media: { imageUrl: "", gifUrl: "", soundUrl: "", soundVolume: 80, position: "top", size: 100 },
        style: { backgroundColor: "#0a0e17", backgroundOpacity: 88, isTransparent: false, accentColor: "#00e5ff", textColor: "#ffffff", borderRadius: 16, borderWidth: 1, padding: 18 },
        animation: { type: "fade-in", duration: 400, displayDuration: 5000 },
        advanced: { canvasWidth: 1920, canvasHeight: 1080, positionPreset: "center", positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450, enableCustomCode: true, customHTML: "", customCSS: "", customJS: "" }
      }
    },
    // Top-level fallbacks
    text: { titleTemplate: "{{sender}} sent {{amount}}", subtitleTemplate: "{{sourceApp}} payment received", fontSize: 24, fontFamily: "Inter", fontBold: true, fontItalic: false, textTransform: "none", textAlign: "center" },
    media: { imageUrl: "", gifUrl: "", soundUrl: "", soundVolume: 80, position: "top", size: 100 },
    style: { backgroundColor: "#000000", backgroundOpacity: 60, isTransparent: false, accentColor: "#00e5ff", textColor: "#ffffff", borderRadius: 12, borderWidth: 5, padding: 20 },
    animation: { type: "slide-up", duration: 600, displayDuration: 5000 },
    advanced: { canvasWidth: 1920, canvasHeight: 1080, positionPreset: "bottom-center", positionX: 50, positionY: 90, marginX: 0, marginY: 0, width: 400, enableCustomCode: true, customHTML: "", customCSS: "", customJS: "" },
    goal: { enableGoal: true, title: "Payment Goal", startAmount: 0, currentAmount: 0, targetAmount: 5000, endDate: "2026-12-31", barHeight: 36, barColor: "#1e2433", fillColor: "#00e5ff", textColor: "#ffffff", fontFamily: "Inter", customHTML: "", customCSS: "" },
    leaderboard: { enableLeaderboard: true, title: "Top Supporters", maxEntries: 5, showAmounts: true, accentColor: "#00e5ff", fontFamily: "Inter", supporters: {}, customHTML: "", customCSS: "" }
  };

  const StorageHelper = {
    getDefaultSettings() {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    },

    mergeWithDefaults(settings) {
      const defaults = this.getDefaultSettings();
      if (!settings || typeof settings !== 'object') return defaults;
      const merged = {
        ...defaults,
        ...settings,
        activeWidget: settings.activeWidget || defaults.activeWidget,
        widgets: {
          alert: { ...defaults.widgets.alert, ...(settings.widgets && settings.widgets.alert ? settings.widgets.alert : {}) },
          goal: { ...defaults.widgets.goal, ...(settings.widgets && settings.widgets.goal ? settings.widgets.goal : {}), ...(settings.goal || {}) },
          leaderboard: { ...defaults.widgets.leaderboard, ...(settings.widgets && settings.widgets.leaderboard ? settings.widgets.leaderboard : {}), ...(settings.leaderboard || {}) }
        },
        text: { ...defaults.text, ...(settings.text || {}) },
        media: { ...defaults.media, ...(settings.media || {}) },
        style: { ...defaults.style, ...(settings.style || {}) },
        animation: { ...defaults.animation, ...(settings.animation || {}) },
        advanced: { ...defaults.advanced, ...(settings.advanced || {}) },
        goal: { ...defaults.goal, ...(settings.goal || {}) },
        leaderboard: {
          ...defaults.leaderboard,
          ...(settings.leaderboard || {}),
          supporters: { ...(defaults.leaderboard.supporters || {}), ...((settings.leaderboard && settings.leaderboard.supporters) || {}) }
        }
      };
      return merged;
    },

    // ── Local Storage ───────────────────────────────────────────
    saveLocal(settings) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(settings));
        return true;
      } catch (e) {
        console.error('[Storage] Save to localStorage failed:', e);
        return false;
      }
    },

    loadLocal() {
      try {
        const item = localStorage.getItem(LOCAL_STORAGE_KEY);
        if (!item) return null;
        return this.mergeWithDefaults(JSON.parse(item));
      } catch (e) {
        console.error('[Storage] Load from localStorage failed:', e);
        return null;
      }
    },

    // ── Server API ──────────────────────────────────────────────
    async saveServer(settings) {
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        if (data.ok && data.settings) {
          this.saveLocal(data.settings);
          return data.settings;
        }
        return settings;
      } catch (e) {
        console.warn('[Storage] Server save failed, saved locally only:', e.message);
        this.saveLocal(settings);
        return settings;
      }
    },

    async loadServer() {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        // API returns { activeProfile, profiles, settings } — extract the actual settings
        const rawSettings = (data && data.settings) ? data.settings : data;
        const merged = this.mergeWithDefaults(rawSettings);
        // Preserve the active profile name in the merged settings
        if (data && data.activeProfile) merged._activeProfile = data.activeProfile;
        this.saveLocal(merged);
        return merged;
      } catch (e) {
        console.warn('[Storage] Server load failed, falling back to localStorage/defaults:', e.message);
        return this.loadLocal() || this.getDefaultSettings();
      }
    },

    exportToFile(settings, filename = 'alert-theme.json') {
      try {
        const jsonStr = JSON.stringify(settings, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute('href', url);
        downloadAnchor.setAttribute('download', filename);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } catch (err) {
        console.error('[Storage] Export failed:', err);
      }
    },

    importFromFile(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          return reject(new Error('No file provided'));
        }
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const json = JSON.parse(event.target.result);
            const validated = this.mergeWithDefaults(json);
            resolve(validated);
          } catch (err) {
            reject(new Error('Invalid JSON file format'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = StorageHelper;
  } else {
    global.StorageHelper = StorageHelper;
  }
})(typeof window !== 'undefined' ? window : this);
