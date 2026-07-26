/**
 * Top supporters overlay. Reads only `widgets.leaderboard` — its text style,
 * canvas and layout are its own and never shared with the other widgets.
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let ws = null;

  function applyLeaderboardSettings(newSettings) {
    config = StorageHelper.mergeWithDefaults(newSettings);
    const lb = config.widgets.leaderboard;
    const root = document.documentElement;

    root.style.setProperty('--lb-bg-opacity', lb.style.backgroundOpacity);
    root.style.setProperty('--lb-accent-color', lb.style.accentColor);
    root.style.setProperty('--lb-row-bg-color', lb.style.rowBgColor);
    root.style.setProperty('--lb-border-radius', lb.style.borderRadius + 'px');
    root.style.setProperty('--lb-padding', lb.style.padding + 'px');
    root.style.setProperty('--lb-width', lb.layout.width + 'px');
    root.style.setProperty('--lb-position-x', lb.layout.positionX);
    root.style.setProperty('--lb-position-y', lb.layout.positionY);
    root.style.setProperty('--lb-margin-x', lb.layout.marginX + 'px');
    root.style.setProperty('--lb-margin-y', lb.layout.marginY + 'px');

    WidgetStyle.applyCssVars(root, WidgetStyle.toCssVars(lb.text, 'lb'));
    WidgetStyle.applyCssVars(root, CanvasPresets.toCssVars(lb.canvas));

    let customStyleEl = document.getElementById('custom-lb-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-lb-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = (lb.code.enableCustomCode !== false ? (lb.code.customCSS || '') : '');

    renderLeaderboardWidget(lb);
  }

  function renderLeaderboardWidget(lb) {
    const container = document.getElementById('leaderboard-container');
    if (!container) return;

    if (lb.enabled === false) {
      container.innerHTML = '';
      return;
    }

    const supportersMap = lb.supporters || {};
    const topSupporters = Object.keys(supportersMap)
      .map(name => ({ name, amount: parseFloat(supportersMap[name]) || 0 }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, parseInt(lb.maxEntries, 10) || 5);

    const lbTitle = TemplateEngine.render(lb.text.titleTemplate || lb.title || 'Top Supporters', {
      title: lb.title,
      count: topSupporters.length,
      max: parseInt(lb.maxEntries, 10)
    });

    if (lb.code.enableCustomCode !== false && lb.code.customHTML && lb.code.customHTML.trim()) {
      container.innerHTML = TemplateEngine.render(lb.code.customHTML, {
        title: lbTitle,
        count: topSupporters.length
      });
      const list = container.querySelector('.lb-list');
      if (list) list.innerHTML = rowsHtml(topSupporters, lb);
      return;
    }

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

    container.innerHTML = `
      <div class="lb-card">
        <div class="lb-header">
          <span style="font-size: 22px;">🏆</span>
          <div class="lb-title">${TemplateEngine.escapeHtml(lbTitle)}</div>
        </div>
        <div class="lb-list">
          ${rowsHtml(topSupporters, lb)}
        </div>
      </div>
    `;
  }

  function rowsHtml(supporters, lb) {
    return supporters.map((supporter, idx) => {
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
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/obs`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) applyLeaderboardSettings(msg.payload);
        else if (msg.type === 'config' && msg.config) applyLeaderboardSettings(msg.config);
      } catch (e) {
        console.warn('[Leaderboard] WS parse error:', e);
      }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  }

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applyLeaderboardSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      applyLeaderboardSettings(await StorageHelper.loadServer());
    } catch (e) { /* keep defaults */ }
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'leaderboard' }, '*');
    }
  });
})();
