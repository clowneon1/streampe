document.addEventListener('DOMContentLoaded', () => {
  let isServerRunning = true;

  function showToast(msg) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2000);
  }

  // 1. Fetch Network Info / IP & Server Status
  async function fetchServerUrl() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      const input = document.getElementById('input-server-url');
      if (input && data.primaryIp) {
        input.value = `http://${data.primaryIp}:${data.port}`;
      }
      if (typeof data.serverRunning === 'boolean') {
        updateServerStatusUI(data.serverRunning);
      }
    } catch (e) {
      console.warn('[App] Could not fetch IP:', e.message);
    }
  }

  // 2. Copy URL Button
  const copyBtn = document.getElementById('btn-copy-url');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const input = document.getElementById('input-server-url');
      if (input && input.value) {
        navigator.clipboard.writeText(input.value).then(() => {
          showToast('Copied URL to clipboard!');
        }).catch(() => {
          showToast('Copied URL!');
        });
      }
    });
  }

  // 3. Startup Checkbox
  async function initStartupCheckbox() {
    try {
      const res = await fetch('/api/system/startup');
      const data = await res.json();
      const chk = document.getElementById('chk-start-startup');
      if (chk) chk.checked = !!data.enabled;
    } catch (e) {}

    const chk = document.getElementById('chk-start-startup');
    if (chk) {
      chk.addEventListener('change', async (e) => {
        const enabled = e.target.checked;
        try {
          await fetch('/api/system/startup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ enabled })
          });
          showToast(enabled ? 'Start on startup enabled' : 'Start on startup disabled');
        } catch (err) {
          showToast('Failed to update startup setting');
        }
      });
    }
  }

  // 4. Server Logs Box
  async function fetchLogs() {
    try {
      const res = await fetch('/api/logs/live');
      const data = await res.json();
      const logBox = document.getElementById('log-box');
      if (logBox && Array.isArray(data.lines)) {
        logBox.textContent = data.lines.length > 0 ? data.lines.slice(-100).join('\n') : 'No server logs yet.';
        logBox.scrollTop = logBox.scrollHeight;
      }
    } catch (e) {}
  }

  // Clear Logs Button
  const clearBtn = document.getElementById('btn-clear-logs');
  if (clearBtn) {
    clearBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/logs/clear', { method: 'POST' });
        const logBox = document.getElementById('log-box');
        if (logBox) logBox.textContent = 'Server logs cleared.';
        showToast('Logs cleared');
      } catch (e) {
        showToast('Cleared logs view');
      }
    });
  }

  // 5. Start / Stop Server Buttons
  function updateServerStatusUI(running) {
    isServerRunning = running;
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const startBtn = document.getElementById('btn-start-server');
    const stopBtn = document.getElementById('btn-stop-server');

    if (dot && text) {
      if (running) {
        dot.style.background = '#16A34A';
        text.textContent = 'Status: Running';
        text.style.color = '#111827';
      } else {
        dot.style.background = '#DC2626';
        text.textContent = 'Status: Stopped';
        text.style.color = '#DC2626';
      }
    }

    if (startBtn && stopBtn) {
      startBtn.style.opacity = running ? '0.6' : '1';
      stopBtn.style.opacity = running ? '1' : '0.6';
    }
  }

  const startBtn = document.getElementById('btn-start-server');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/system/server-start', { method: 'POST' });
        const data = await res.json();
        updateServerStatusUI(true);
        showToast('Server started');
      } catch (e) {
        updateServerStatusUI(true);
        showToast('Server start signal sent');
      }
    });
  }

  const stopBtn = document.getElementById('btn-stop-server');
  if (stopBtn) {
    stopBtn.addEventListener('click', async () => {
      try {
        const res = await fetch('/api/system/server-stop', { method: 'POST' });
        const data = await res.json();
        updateServerStatusUI(false);
        showToast('Server stopped');
      } catch (e) {
        updateServerStatusUI(false);
        showToast('Server stop signal sent');
      }
    });
  }

  // Init
  fetchServerUrl();
  setInterval(fetchServerUrl, 4000);
  initStartupCheckbox();
  fetchLogs();
  setInterval(fetchLogs, 3000);
});
});
