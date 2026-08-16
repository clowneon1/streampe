/**
 * Unified List Widget Overlay.
 * Supports customizable List Configs (Leaderboard & Recent Donations with custom filters and styles).
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let ws = null;

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string') return [10, 14, 23];
    const clean = hex.trim();
    if (clean.startsWith('rgba') || clean.startsWith('rgb')) {
      const nums = clean.match(/\d+/g);
      if (nums && nums.length >= 3) return [parseInt(nums[0], 10), parseInt(nums[1], 10), parseInt(nums[2], 10)];
    }
    const match = clean.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
    if (match) return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
    const shortMatch = clean.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
    if (shortMatch) return [parseInt(shortMatch[1] + shortMatch[1], 16), parseInt(shortMatch[2] + shortMatch[2], 16), parseInt(shortMatch[3] + shortMatch[3], 16)];
    return [10, 14, 23];
  }

  function getTargetListId() {
    const params = new URLSearchParams(window.location.search);
    const queryId = params.get('id') || params.get('name');
    if (queryId) return queryId;

    const path = window.location.pathname.toLowerCase();
    if (path.includes('/leaderboard')) return 'top-supporters';
    if (path.includes('/recent')) return 'recent-donations';

    return null;
  }

  function resolveListConfig(cfg) {
    const targetId = getTargetListId();
    const lists = Array.isArray(cfg.listConfigs) ? cfg.listConfigs : [];

    if (targetId && lists.length > 0) {
      const match = lists.find(l =>
        l.id === targetId ||
        l.name.toLowerCase() === targetId.toLowerCase() ||
        (ConfigSchema && ConfigSchema.slugifyName && ConfigSchema.slugifyName(l.name) === ConfigSchema.slugifyName(targetId))
      );
      if (match) return match;
    }

    if (cfg.activeListConfigId) {
      const active = lists.find(l => l.id === cfg.activeListConfigId);
      if (active) return active;
    }

    if (lists.length > 0) return lists[0];

    // Fallback if no listConfigs exists yet
    return (ConfigSchema && ConfigSchema.DEFAULT_LIST_CONFIGS)
      ? ConfigSchema.DEFAULT_LIST_CONFIGS['top-supporters']
      : {
          id: 'top-supporters',
          name: 'Top Supporters',
          type: 'leaderboard',
          title: 'Top Supporters',
          maxEntries: 5,
          showAmounts: true,
          style: { backgroundColor: '#0a0e17', backgroundOpacity: 88, accentColor: '#00e5ff', rowBgColor: '#1a1e2b', borderRadius: 16, borderWidth: 1, padding: 18 },
          layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
          text: { titleTemplate: 'Top Supporters', fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: '#ffffff' },
          canvas: { preset: '1080p', width: 1920, height: 1080 },
          code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
        };
  }

  function applyListSettings(newSettings) {
    config = StorageHelper.mergeWithDefaults(newSettings);
    const listConfig = resolveListConfig(config);
    const root = document.documentElement;

    const [r, g, b] = hexToRgb(listConfig.style.backgroundColor || '#0a0e17');
    const opacityVal = Number.isFinite(parseFloat(listConfig.style?.backgroundOpacity)) ? parseFloat(listConfig.style.backgroundOpacity) : 88;
    const bgOpacity = opacityVal / 100;

    root.style.setProperty('--list-bg-color', `rgba(${r}, ${g}, ${b}, ${bgOpacity})`);
    root.style.setProperty('--list-bg-opacity', bgOpacity);
    root.style.setProperty('--list-accent-color', listConfig.style.accentColor || '#00e5ff');
    root.style.setProperty('--list-row-bg-color', listConfig.style.rowBgColor || '#1a1e2b');
    root.style.setProperty('--list-border-radius', (listConfig.style.borderRadius ?? 16) + 'px');
    root.style.setProperty('--list-border-width', (listConfig.style.borderWidth ?? 1) + 'px');
    root.style.setProperty('--list-border-color', listConfig.style.borderColor || 'rgba(255, 255, 255, 0.12)');
    root.style.setProperty('--list-padding', (listConfig.style.padding ?? 18) + 'px');
    root.style.setProperty('--list-width', (listConfig.layout?.width ?? 450) + 'px');
    root.style.setProperty('--list-position-x', listConfig.layout?.positionX ?? 50);
    root.style.setProperty('--list-position-y', listConfig.layout?.positionY ?? 50);
    root.style.setProperty('--list-margin-x', (listConfig.layout?.marginX ?? 0) + 'px');
    root.style.setProperty('--list-margin-y', (listConfig.layout?.marginY ?? 0) + 'px');

    WidgetStyle.applyCssVars(root, WidgetStyle.toCssVars(listConfig.text, 'list'));
    WidgetStyle.applyCssVars(root, CanvasPresets.toCssVars(listConfig.canvas));

    let customStyleEl = document.getElementById('custom-list-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-list-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = (listConfig.code?.enableCustomCode !== false ? (listConfig.code?.customCSS || '') : '');

    renderListWidget(listConfig);
  }

  function renderListWidget(listConfig) {
    const container = document.getElementById('list-container');
    if (!container) return;

    if (listConfig.enabled === false) {
      container.innerHTML = '';
      return;
    }

    const isRecent = listConfig.type === 'recent';
    const filter = listConfig.filter || {};
    const max = parseInt(listConfig.maxEntries, 10) || 5;

    let items = [];

    if (isRecent) {
      const rawRecent = (config.widgets && config.widgets.recent && Array.isArray(config.widgets.recent.recentDonations))
        ? config.widgets.recent.recentDonations
        : [];

      items = rawRecent.filter(tx => {
        const amt = parseFloat(tx.amountValue || tx.amount || 0);
        if (filter.minAmount > 0 && amt < filter.minAmount) return false;
        if (filter.provider && filter.provider !== 'all') {
          const app = (tx.sourceApp || tx.appName || '').toLowerCase();
          if (filter.provider === 'phonepe' && !app.includes('phonepe')) return false;
          if (filter.provider === 'gpay' && !app.includes('google') && !app.includes('gpay')) return false;
          if (filter.provider === 'amazon' && !app.includes('amazon')) return false;
          if (filter.provider === 'cash' && !app.includes('cash') && !app.includes('manual')) return false;
        }
        return true;
      }).slice(0, max);
    } else {
      // Leaderboard
      const supportersMap = (config.widgets && config.widgets.leaderboard && config.widgets.leaderboard.supporters)
        ? config.widgets.leaderboard.supporters
        : {};

      items = Object.keys(supportersMap)
        .map(name => ({ name, amount: parseFloat(supportersMap[name]) || 0 }))
        .filter(item => item.amount > 0 && (filter.minAmount <= 0 || item.amount >= filter.minAmount))
        .sort((a, b) => b.amount - a.amount)
        .slice(0, max);
    }

    const listTitle = TemplateEngine.render(listConfig.text?.titleTemplate || listConfig.title || listConfig.name, {
      title: listConfig.title || listConfig.name,
      count: items.length,
      max: max
    });

    if (listConfig.code?.enableCustomCode === true && listConfig.code?.customHTML && listConfig.code.customHTML.trim()) {
      container.innerHTML = TemplateEngine.render(listConfig.code.customHTML, {
        title: listTitle,
        count: items.length,
        items: items
      });
      const listEl = container.querySelector('.lb-list');
      if (listEl) listEl.innerHTML = isRecent ? renderRecentRows(items, listConfig) : renderLeaderboardRows(items, listConfig);
      if (window.lucide) lucide.createIcons();
      executeCustomJS(listConfig, items);
      return;
    }

    const headerIcon = isRecent
      ? '<i data-lucide="history" style="width: 22px; height: 22px; color: var(--list-accent-color);"></i>'
      : '<span style="font-size: 22px;">🏆</span>';

    if (items.length === 0) {
      container.innerHTML = `
        <div class="lb-card">
          <div class="lb-header">
            ${headerIcon}
            <div class="lb-title">${TemplateEngine.escapeHtml(listTitle)}</div>
          </div>
          <div class="lb-empty">No payments received yet</div>
        </div>
      `;
      if (window.lucide) lucide.createIcons();
      executeCustomJS(listConfig, items);
      return;
    }

    container.innerHTML = `
      <div class="lb-card">
        <div class="lb-header">
          ${headerIcon}
          <div class="lb-title">${TemplateEngine.escapeHtml(listTitle)}</div>
        </div>
        <div class="lb-list">
          ${isRecent ? renderRecentRows(items, listConfig) : renderLeaderboardRows(items, listConfig)}
        </div>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    executeCustomJS(listConfig, items);
  }

  function renderLeaderboardRows(supporters, listConfig) {
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
          ${listConfig.showAmounts !== false ? `<div class="lb-amount">${formattedAmount}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderRecentRows(items, listConfig) {
    return items.map((item) => {
      const amtVal = parseFloat(item.amountValue || item.amount || 0);
      const formattedAmount = `₹${amtVal.toLocaleString('en-IN')}`;
      return `
        <div class="lb-row">
          <div class="lb-user-info">
            <div class="lb-badge"><i data-lucide="arrow-right" style="width: 14px; height: 14px;"></i></div>
            <div class="lb-name">${TemplateEngine.escapeHtml(item.sender || 'Anonymous')}</div>
          </div>
          ${listConfig.showAmounts !== false ? `<div class="lb-amount">${formattedAmount}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function executeCustomJS(listConfig, items) {
    if (listConfig.code?.enableCustomCode === false || !listConfig.code?.customJS || !listConfig.code.customJS.trim()) return;
    try {
      const fn = new Function('context', 'listContainer', listConfig.code.customJS);
      fn({ config: listConfig, items, count: items.length }, document.getElementById('list-container'));
    } catch (err) {
      console.warn('[List] Custom JS execution error:', err);
    }
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/obs`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) applyListSettings(msg.payload);
        else if (msg.type === 'config' && msg.config) applyListSettings(msg.config);
      } catch (e) {
        console.warn('[List] WS parse error:', e);
      }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  }

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applyListSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const saved = await StorageHelper.loadServer();
      applyListSettings(saved || {});
    } catch {
      applyListSettings({});
    }
    connectWebSocket();
  });
})();
