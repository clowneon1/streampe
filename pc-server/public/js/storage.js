/**
 * Storage helper for payment alert settings.
 *
 * Persistence only — the schema itself lives in `lib/config-schema.js` and every
 * value that enters (localStorage, server, imported file) is passed through
 * `ConfigMigration.migrate`, so legacy files load as normalized v2 configs.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./lib/config-schema'), require('./lib/config-migration'));
  } else {
    root.StorageHelper = factory(root.ConfigSchema, root.ConfigMigration);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (ConfigSchema, ConfigMigration) {
  'use strict';

  const LOCAL_STORAGE_KEY = 'streamlabs_alert_settings';

  const StorageHelper = {
    LOCAL_STORAGE_KEY,

    getDefaultSettings() {
      return ConfigSchema.createDefaultConfig();
    },

    /** Normalize + migrate any generation of config into a complete v2 config. */
    mergeWithDefaults(settings) {
      return ConfigMigration.migrate(settings);
    },

    // ── Local storage ───────────────────────────────────────────
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
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        this.saveLocal(settings);
        return settings;
      }
      try {
        const res = await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(settings)
        });
        if (res.ok) {
          const data = await res.json();
          const merged = this.mergeWithDefaults(data && data.settings ? data.settings : data);
          if (data && data.activeProfile) merged._activeProfile = data.activeProfile;
          this.saveLocal(merged);
          return merged;
        }
        return settings;
      } catch (e) {
        console.warn('[Storage] Server save failed, saved locally only:', e.message);
        this.saveLocal(settings);
        return settings;
      }
    },

    async loadServer() {
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        return this.loadLocal() || this.getDefaultSettings();
      }
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error(`HTTP error ${res.status}`);
        const data = await res.json();
        const merged = this.mergeWithDefaults(data && data.settings ? data.settings : data);
        if (data && data.activeProfile) merged._activeProfile = data.activeProfile;
        this.saveLocal(merged);
        return merged;
      } catch (e) {
        console.warn('[Storage] Server load failed, falling back to localStorage/defaults:', e.message);
        return this.loadLocal() || this.getDefaultSettings();
      }
    },

    loadSettings() {
      return this.loadServer();
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
        if (!file) return reject(new Error('No file provided'));
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            resolve(this.mergeWithDefaults(JSON.parse(event.target.result)));
          } catch (err) {
            reject(new Error('Invalid JSON file format'));
          }
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }
  };

  return StorageHelper;
});
