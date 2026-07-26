/**
 * Recent donations overlay. Reads only `widgets.recent` — its text style,
 * canvas and layout are its own and never shared with the other widgets.
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let ws = null;

  function applyRecentSettings(newSettings) {
    config = StorageHelper.mergeWithDefaults(newSettings);
    const recent = config.widgets.recent;
    const root = document.documentElement;

    root.style.setProperty('--recent-bg-opacity', recent.style.backgroundOpacity);
    root.style.setProperty('--recent-accent-color', recent.style.accentColor);
    root.style.setProperty('--recent-row-bg-color', recent.style.rowBgColor);
    root.style.setProperty('--recent-border-radius', recent.style.borderRadius + 'px');
    root.style.setProperty('--recent-padding', recent.style.padding + 'px');
    root.style.setProperty('--recent-width', recent.layout.width + 'px');
    root.style.setProperty('--recent-position-x', recent.layout.positionX);
    root.style.setProperty('--recent-position-y', recent.layout.positionY);
    root.style.setProperty('--recent-margin-x', recent.layout.marginX + 'px');
    root.style.setProperty('--recent-margin-y', recent.layout.marginY + 'px');

    WidgetStyle.applyCssVars(root, WidgetStyle.toCssVars(recent.text, 'recent'));
    WidgetStyle.applyCssVars(root, CanvasPresets.toCssVars(recent.canvas));

    let customStyleEl = document.getElementById('custom-recent-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-recent-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = (recent.code.enableCustomCode !== false ? (recent.code.customCSS || '') : '');

    renderRecentWidget(recent);
  }

  function renderRecentWidget(recent) {
    const container = document.getElementById('recent-container');
    if (!container) return;

    if (recent.enabled === false) {
      container.innerHTML = '';
      return;
    }

    const history = recent.recentDonations || [];
    const displayItems = history.slice(0, parseInt(recent.maxEntries, 10) || 5);

    const recentTitle = TemplateEngine.render(recent.text.titleTemplate || recent.title || 'Recent Donations', {
      title: recent.title,
      count: displayItems.length,
      max: parseInt(recent.maxEntries, 10)
    });

    if (recent.code.enableCustomCode !== false && recent.code.customHTML && recent.code.customHTML.trim()) {
      container.innerHTML = TemplateEngine.render(recent.code.customHTML, {
        title: recentTitle,
        count: displayItems.length
      });
      const list = container.querySelector('.lb-list');
      if (list) list.innerHTML = rowsHtml(displayItems, recent);
      if (window.lucide) lucide.createIcons();
      return;
    }

    if (displayItems.length === 0) {
      container.innerHTML = `
        <div class="lb-card">
          <div class="lb-header">
            <i data-lucide="history" style="width: 22px; height: 22px; color: var(--recent-accent-color);"></i>
            <div class="lb-title">${TemplateEngine.escapeHtml(recentTitle)}</div>
          </div>
          <div class="lb-empty">No payments received yet</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      return;
    }

    container.innerHTML = `
      <div class="lb-card">
        <div class="lb-header">
          <i data-lucide="history" style="width: 22px; height: 22px; color: var(--recent-accent-color);"></i>
          <div class="lb-title">${TemplateEngine.escapeHtml(recentTitle)}</div>
        </div>
        <div class="lb-list">
          ${rowsHtml(displayItems, recent)}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  }

  function rowsHtml(items, recent) {
    return items.map((item, idx) => {
      const formattedAmount = `₹${(parseFloat(item.amountValue) || 0).toLocaleString('en-IN')}`;
      return `
        <div class="lb-row">
          <div class="lb-user-info">
            <div class="lb-badge"><i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i></div>
            <div class="lb-name">${TemplateEngine.escapeHtml(item.sender)}</div>
          </div>
          ${recent.showAmounts !== false ? `<div class="lb-amount">${formattedAmount}</div>` : ''}
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
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) applyRecentSettings(msg.payload);
        else if (msg.type === 'config' && msg.config) applyRecentSettings(msg.config);
      } catch (e) {
        console.warn('[Recent] WS parse error:', e);
      }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  }

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applyRecentSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      applyRecentSettings(await StorageHelper.loadServer());
    } catch (e) { /* keep defaults */ }
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'recent' }, '*');
    }
  });
})();
