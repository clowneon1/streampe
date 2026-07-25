(function () {
  let settings = StorageHelper.getDefaultSettings();
  let ws = null;

  function applyGoalSettings(newSettings) {
    settings = StorageHelper.mergeWithDefaults(newSettings);
    const widgetGoal = (settings.widgets && settings.widgets.goal) ? settings.widgets.goal : {};
    const goal = { ...settings.goal, ...widgetGoal };
    const styleData = widgetGoal.style || settings.style || {};
    const textData = widgetGoal.text || settings.text || {};
    const advData = widgetGoal.advanced || settings.advanced || {};
    const root = document.documentElement;

    root.style.setProperty('--goal-bar-color', styleData.barColor || goal.barColor || '#1e2433');
    root.style.setProperty('--goal-fill-color', styleData.fillColor || goal.fillColor || '#00e5ff');
    root.style.setProperty('--goal-text-color', styleData.textColor || styleData.color || goal.textColor || '#ffffff');
    root.style.setProperty('--goal-font-family', `'${textData.fontFamily || goal.fontFamily || 'Inter'}', sans-serif`);
    root.style.setProperty('--goal-bar-height', (styleData.barHeight || goal.barHeight || 36) + 'px');

    // Apply Custom CSS
    let customStyleEl = document.getElementById('custom-goal-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-goal-css';
      document.head.appendChild(customStyleEl);
    }
    const isCodeEnabled = advData.enableCustomCode !== false;
    const customCssText = advData.customCSS || goal.customCSS || '';
    const isTransparent = goal.isTransparent === true;
    const transparentCss = isTransparent ? `.goal-card { background: transparent !important; border-color: transparent !important; box-shadow: none !important; }\n` : '';
    customStyleEl.textContent = transparentCss + (isCodeEnabled ? customCssText : '');

    renderGoalWidget(goal, textData, advData);
  }

  function renderGoalWidget(goal, textData, advData) {
    const container = document.getElementById('goal-container');
    if (!container) return;

    if (goal.enableGoal === false) {
      container.innerHTML = '';
      return;
    }

    const start = parseFloat(goal.startAmount) || 0;
    const current = parseFloat(goal.currentAmount) || 0;
    const target = Math.max(start + 1, parseFloat(goal.targetAmount) || 5000);
    const range = Math.max(1, target - start);
    const percent = Math.min(100, Math.max(0, ((current - start) / range) * 100)).toFixed(1);

    const formattedCurrent = `₹${current.toLocaleString('en-IN')}`;
    const formattedTarget = `₹${target.toLocaleString('en-IN')}`;
    const goalTitle = goal.title || textData.titleTemplate || 'Payment Goal';

    if (advData && advData.enableCustomCode && advData.customHTML && advData.customHTML.trim()) {
      const renderData = {
        title: goalTitle,
        currentAmount: formattedCurrent,
        targetAmount: formattedTarget,
        percent: `${percent}%`,
        endDate: goal.endDate || ''
      };
      container.innerHTML = TemplateEngine.render(advData.customHTML, renderData);
      return;
    }

    container.innerHTML = `
      <div class="goal-card">
        <div class="goal-header">
          <div class="goal-title">${TemplateEngine.escapeHtml(goalTitle)}</div>
          ${goal.endDate ? `<div class="goal-end-date">Ends: ${TemplateEngine.escapeHtml(goal.endDate)}</div>` : ''}
        </div>
        <div class="goal-bar-wrapper">
          <div class="goal-bar-fill" style="width: ${percent}%;"></div>
          <div class="goal-bar-text">
            <span>${formattedCurrent} (${percent}%)</span>
            <span>${formattedTarget}</span>
          </div>
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
          applyGoalSettings(msg.payload);
        } else if (msg.type === 'config' && msg.config) {
          applyGoalSettings(msg.config);
        }
      } catch (e) {
        console.warn('[Goal] WS parse error:', e);
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
      if (payload) applyGoalSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const serverSettings = await StorageHelper.loadServer();
      applyGoalSettings(serverSettings);
    } catch (e) {}
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'goal' }, '*');
    }
  });
})();
