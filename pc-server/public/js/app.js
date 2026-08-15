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

      if (data.mobileAppUrl) {
        if (input) input.value = data.mobileAppUrl;
      }
      if (statusText && data.port) {
        statusText.textContent = `Server Active (Port ${data.port})`;
      }
      if (data.configUrl) {
        configUrl = data.configUrl;
      }
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
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('Copied Connection URL!');
        }).catch(() => {
          showToast('Copied URL!');
        });
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(enabled ? 'Start on Boot Enabled' : 'Start on Boot Disabled');
        } else {
          chk.checked = !enabled;
          showToast('Failed to update boot setting');
        }
      } catch (err) {
        chk.checked = !enabled;
        showToast('Failed to update boot setting');
      }
    });
  }

  // 4. Minimize on Close Setting
  async function initMinimizeOnCloseCheckbox() {
    const chk = document.getElementById('chk-minimize-on-close');
    if (!chk) return;

    try {
      const res = await fetch('/api/system/minimize-on-close');
      const data = await res.json();
      chk.checked = typeof data.enabled === 'boolean' ? data.enabled : true;
    } catch (e) {
      console.warn('[App] Could not fetch minimize-on-close status:', e.message);
    }

    chk.addEventListener('change', async (e) => {
      const enabled = e.target.checked;
      try {
        if (window.__TAURI__ && window.__TAURI__.core) {
          window.__TAURI__.core.invoke('set_minimize_on_close', { enabled });
        }
        const res = await fetch('/api/system/minimize-on-close', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(enabled ? 'Minimize to Tray Enabled' : 'Close Button Quits App');
        } else {
          chk.checked = !enabled;
          showToast('Failed to update setting');
        }
      } catch (err) {
        chk.checked = !enabled;
        showToast('Failed to update setting');
      }
    });
  }

  // 5. Start Minimized Setting
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(enabled ? 'Start Minimized Enabled' : 'Start Minimized Disabled');
        } else {
          chk.checked = !enabled;
          showToast('Failed to update setting');
        }
      } catch (err) {
        chk.checked = !enabled;
        showToast('Failed to update setting');
      }
    });
  }

  // 6. Open Control Panel in Default Browser Button
  const openBtn = document.getElementById('btn-open-control-panel');
  if (openBtn) {
    openBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/system/open-browser', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: configUrl })
        });
      } catch (e) {
        window.open(configUrl, '_blank');
      }
    });
  }

  // Initial loads
  fetchNetworkInfo();
  initStartupCheckbox();
  initMinimizeOnCloseCheckbox();
  initStartMinimizedCheckbox();
});
