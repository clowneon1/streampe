document.addEventListener('DOMContentLoaded', () => {
  let configUrl = '/config';

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // 1. Fetch Network Info / Connection URL
  async function fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      const input = document.getElementById('input-connection-url');
      const statusText = document.getElementById('status-text');
      if (data.mobileAppUrl) { if (input) input.value = data.mobileAppUrl; }
      if (statusText && data.port) { statusText.textContent = `Server Active (Port ${data.port})`; }
      if (data.configUrl) { configUrl = data.configUrl; }
    } catch (e) {
      console.warn('[App] Could not fetch network info:', e.message);
    }
  }

  // 2. Copy Connection URL Button
  const copyBtn = document.getElementById('btn-copy-url');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const input = document.getElementById('input-connection-url');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value)
          .then(() => showToast('Copied Connection URL!'))
          .catch(() => showToast('Copied URL!'));
      }
    });
  }

  // 3. Sync Startup Checkbox with Server & Registry
  async function initStartupCheckbox() {
    const chk = document.getElementById('chk-start-startup');
    if (!chk) return;
    try {
      const res = await fetch('/api/system/startup');
      const data = await res.json();
      chk.checked = !!data.enabled;
    } catch (e) {
      console.warn('[App] Could not fetch startup status:', e.message);
    }
    chk.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/api/system/startup', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) { showToast(enabled ? 'Start on Boot Enabled' : 'Start on Boot Disabled'); }
        else { chk.checked = !enabled; showToast('Failed to update boot setting'); }
      } catch (err) { chk.checked = !enabled; showToast('Failed to update boot setting'); }
    });
  }

  // 4. Start Minimized Setting
  async function initStartMinimizedCheckbox() {
    const chk = document.getElementById('chk-start-minimized');
    if (!chk) return;
    try {
      const res = await fetch('/api/system/start-minimized');
      const data = await res.json();
      chk.checked = !!data.enabled;
    } catch (e) {
      console.warn('[App] Could not fetch start-minimized status:', e.message);
    }
    chk.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/api/system/start-minimized', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) { showToast(enabled ? 'Start Minimized Enabled' : 'Start Minimized Disabled'); }
        else { chk.checked = !enabled; showToast('Failed to update setting'); }
      } catch (err) { chk.checked = !enabled; showToast('Failed to update setting'); }
    });
  }

  // 5. Open Control Panel in Default Browser Button
  const openBtn = document.getElementById('btn-open-control-panel');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/system/open-browser', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: configUrl })
        });
      } catch (e) { window.open(configUrl, '_blank'); }
    });
  }

  // 6. Storage Root Directory Setting
  async function initStoragePathSettings() {
    const display   = document.getElementById('display-path-root');
    const browseBtn = document.getElementById('btn-browse-root');
    const resetBtn  = document.getElementById('btn-reset-paths');
    const hint      = document.getElementById('storage-hint');
    if (!display) return;

    let selectedRoot    = '';
    let defaultResolved = { storageRootDir: '', logsDir: '', dataDir: '', configDir: '' };

    function joinPath(root, sub) {
      if (!root) return '';
      const sep = root.includes('/') ? '/' : '\\';
      return root.replace(/[/\\]+$/, '') + sep + sub;
    }

    function applyRoot(root, resolved) {
      selectedRoot = root;
      const rootDisplay = root || (resolved && resolved.storageRootDir) || defaultResolved.storageRootDir || '';
      display.textContent = rootDisplay || 'Default (application folder)';
      display.title = rootDisplay;

      const paths = resolved || (root
        ? { logsDir: joinPath(root, 'logs'), dataDir: joinPath(root, 'data'), configDir: joinPath(root, 'config') }
        : defaultResolved);

      const lb = document.getElementById('btn-open-logs');
      const db = document.getElementById('btn-open-data');
      const cb = document.getElementById('btn-open-config');
      if (lb) { lb.dataset.path = paths.logsDir;   lb.title = paths.logsDir   || ''; }
      if (db) { db.dataset.path = paths.dataDir;   db.title = paths.dataDir   || ''; }
      if (cb) { cb.dataset.path = paths.configDir; cb.title = paths.configDir || ''; }
    }

    async function savePaths(root) {
      try {
        const res  = await fetch('/api/system/paths', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ storageRootDir: root })
        });
        const data = await res.json();
        if (data.ok) {
          defaultResolved = data.resolved || defaultResolved;
          if (hint) hint.style.display = 'block';
          showToast('Saved');
        } else { showToast('Failed to save path'); }
      } catch (e) { showToast('Error saving path'); }
    }

    async function loadPaths() {
      try {
        const res  = await fetch('/api/system/paths');
        const data = await res.json();
        if (data.ok) {
          defaultResolved = data.resolved || defaultResolved;
          applyRoot(data.paths.storageRootDir || '', data.resolved);
        }
      } catch (e) { console.warn('[App] Could not load storage paths:', e.message); }
    }

    if (browseBtn) {
      browseBtn.addEventListener('click', async () => {
        browseBtn.disabled = true;
        browseBtn.textContent = '…';
        try {
          const res  = await fetch('/api/system/pick-folder', { method: 'POST' });
          const data = await res.json();
          if (data.ok && data.path) {
            applyRoot(data.path, null);
            await savePaths(data.path);
          }
        } catch (e) { showToast('Could not open folder picker'); }
        finally {
          browseBtn.disabled = false;
          browseBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg> Browse`;
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        applyRoot('', defaultResolved);
        await savePaths('');
      });
    }

    loadPaths();
  }

  // 7. Folder shortcut buttons (Logs / Data / Config) — open in Explorer
  function initFolderShortcuts() {
    ['btn-open-logs', 'btn-open-data', 'btn-open-config'].forEach(id => {
      const btn = document.getElementById(id);
      if (!btn) return;
      btn.addEventListener('mouseenter', () => {
        btn.style.borderColor = 'var(--accent)';
        btn.style.color       = 'var(--accent)';
      });
      btn.addEventListener('mouseleave', () => {
        btn.style.borderColor = 'var(--border-color)';
        btn.style.color       = 'var(--text-muted)';
      });
      btn.addEventListener('click', () => {
        const fp = btn.dataset.path;
        if (fp) {
          fetch('/api/system/open-explorer', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ folderPath: fp })
          });
        } else {
          showToast('Path not loaded yet');
        }
      });
    });
  }

  // Boot
  fetchNetworkInfo();
  initStartupCheckbox();
  initStartMinimizedCheckbox();
  initStoragePathSettings();
  initFolderShortcuts();
});
