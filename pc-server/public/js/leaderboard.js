(function () {
  let settings = StorageHelper.getDefaultSettings();
  let ws = null;

  function applyLeaderboardSettings(newSettings) {
    settings = StorageHelper.mergeWithDefaults(newSettings);
    const widgetLb = (settings.widgets && settings.widgets.leaderboard) ? settings.widgets.leaderboard : {};
    const lb = { ...settings.leaderboard, ...widgetLb };
    const styleData = widgetLb.style || settings.style || {};
    const textData = widgetLb.text || settings.text || {};
    const advData = widgetLb.advanced || settings.advanced || {};
    const root = document.documentElement;

    root.style.setProperty('--lb-accent-color', styleData.accentColor || lb.accentColor || '#00e5ff');
    root.style.setProperty('--lb-font-family', `'${textData.fontFamily || lb.fontFamily || 'Inter'}', sans-serif`);

    // Apply Custom CSS
    let customStyleEl = document.getElementById('custom-lb-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-lb-css';
      document.head.appendChild(customStyleEl);
    }
    const isCodeEnabled = advData.enableCustomCode !== false;
    const customCssText = advData.customCSS || lb.customCSS || '';
    const isTransparent = lb.isTransparent === true;
    const transparentCss = isTransparent ? `.lb-card { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }\n` : '';
    customStyleEl.textContent = transparentCss + (isCodeEnabled ? customCssText : '');

    renderLeaderboardWidget(lb, textData, advData);
  }

  function renderLeaderboardWidget(lb, textData, advData) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    if (lb.enableLeaderboard === false) {
      container.innerHTML = '';
      return;
    }

    const supportersMap = lb.supporters || {};
    const sorted = Object.keys(supportersMap)
      .map(name => ({ name, amount: parseFloat(supportersMap[name]) || 0 }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const maxCount = parseInt(lb.maxEntries) || 5;
    const topSupporters = sorted.slice(0, maxCount);

    const lbTitle = lb.title || textData.titleTemplate || 'Top Supporters';

    if (topSupporters.length === 0) {
      container.innerHTML = `
        <div class="lb-card">
          <div class="lb-header">
            <span style="font-size: 22px;">🏆</span>
            <div class="lb-title">${TemplateEngine.escapeHtml(lbTitle)}</div>
          </div>
          <div class="lb-empty">No payments received yet</div>
        </div>
      `;
      return;
    }

    const rowsHtml = topSupporters.map((supporter, idx) => {
      const rank = idx + 1;
      const badgeIcon = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : `#${rank}`));
      const formattedAmount = `₹${supporter.amount.toLocaleString('en-IN')}`;

      return `
        <div class="lb-row rank-${rank}">
          <div class="lb-user-info">
            <div class="lb-badge">${badgeIcon}</div>
            <div class="lb-name">${TemplateEngine.escapeHtml(supporter.name)}</div>
          </div>
          ${lb.showAmounts !== false ? `<div class="lb-amount">${formattedAmount}</div>` : ''}
        </div>
      `;
    }).join('');

    container.innerHTML = `
      <div class="lb-card">
        <div class="lb-header">
          <span style="font-size: 22px;">🏆</span>
          <div class="lb-title">${TemplateEngine.escapeHtml(lbTitle)}</div>
        </div>
        <div class="lb-list">
          ${rowsHtml}
        </div>
      </div>
    `;
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/obs`;

    ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) {
          applyLeaderboardSettings(msg.payload);
        } else if (msg.type === 'config' && msg.config) {
          applyLeaderboardSettings(msg.config);
        }
      } catch (e) {
        console.warn('[Leaderboard] WS parse error:', e);
      }
    };

    ws.onclose = () => {
      setTimeout(connectWebSocket, 3000);
    };
  }

  // Listen for iframe postMessage from Config live preview
  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applyLeaderboardSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const serverSettings = await StorageHelper.loadServer();
      applyLeaderboardSettings(serverSettings);
    } catch (e) {}
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'leaderboard' }, '*');
    }
  });
})();
