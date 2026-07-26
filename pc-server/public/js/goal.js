/**
 * Payment goal overlay. Reads only `widgets.goal` — its text style, canvas and
 * layout are its own and are never shared with the alert or leaderboard widget.
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let ws = null;

  function applyGoalSettings(newSettings) {
    config = StorageHelper.mergeWithDefaults(newSettings);
    const goal = config.widgets.goal;
    const root = document.documentElement;

    root.style.setProperty('--goal-bg-opacity', goal.style.backgroundOpacity);
    root.style.setProperty('--goal-bar-color', goal.style.barColor);
    root.style.setProperty('--goal-fill-color', goal.style.fillColor);
    root.style.setProperty('--goal-accent-color', goal.style.accentColor);
    root.style.setProperty('--goal-bar-height', goal.style.barHeight + 'px');
    root.style.setProperty('--goal-border-radius', goal.style.borderRadius + 'px');
    root.style.setProperty('--goal-padding', goal.style.padding + 'px');
    root.style.setProperty('--goal-width', goal.layout.width + 'px');
    root.style.setProperty('--goal-position-x', goal.layout.positionX);
    root.style.setProperty('--goal-position-y', goal.layout.positionY);
    root.style.setProperty('--goal-margin-x', goal.layout.marginX + 'px');
    root.style.setProperty('--goal-margin-y', goal.layout.marginY + 'px');

    WidgetStyle.applyCssVars(root, WidgetStyle.toCssVars(goal.text, 'goal'));
    WidgetStyle.applyCssVars(root, CanvasPresets.toCssVars(goal.canvas));

    let customStyleEl = document.getElementById('custom-goal-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-goal-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = (goal.code.enableCustomCode !== false ? (goal.code.customCSS || '') : '');

    renderGoalWidget(goal);
  }

  function renderGoalWidget(goal) {
    const container = document.getElementById('goal-container');
    if (!container) return;

    if (goal.enabled === false) {
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
    const goalTitle = TemplateEngine.render(goal.text.titleTemplate || goal.title || 'Payment Goal', {
      title: goal.title,
      targetAmount: formattedTarget,
      currentAmount: formattedCurrent
    });

    if (goal.code.enableCustomCode !== false && goal.code.customHTML && goal.code.customHTML.trim()) {
      container.innerHTML = TemplateEngine.render(goal.code.customHTML, {
        title: goalTitle,
        currentAmount: formattedCurrent,
        targetAmount: formattedTarget,
        percent: `${percent}%`,
        endDate: goal.endDate || ''
      });
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
    ws = new WebSocket(`${protocol}//${window.location.host}/obs`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) applyGoalSettings(msg.payload);
        else if (msg.type === 'config' && msg.config) applyGoalSettings(msg.config);
      } catch (e) {
        console.warn('[Goal] WS parse error:', e);
      }
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  }

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applyGoalSettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      applyGoalSettings(await StorageHelper.loadServer());
    } catch (e) { /* keep defaults */ }
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'goal' }, '*');
    }
  });
})();
