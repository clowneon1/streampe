/**
 * Cycling Info Widget Overlay.
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let currentIndex = 0;
  let cycleTimer = null;
  let ws = null;

  function applySettings(newSettings) {
    const oldDuration = config.widgets.cycling?.cycleDuration;
    const oldEnabled = config.widgets.cycling?.enabled;
    const oldItemsLength = config.widgets.cycling?.items?.length;

    config = StorageHelper.mergeWithDefaults(newSettings);
    const widget = config.widgets.cycling;
    const root = document.documentElement;

    const [r, g, b] = hexToRgb(widget.style.backgroundColor);
    const opacityVal = Number.isFinite(parseFloat(widget.style?.backgroundOpacity)) ? parseFloat(widget.style.backgroundOpacity) : 85;
    const bgOpacity = opacityVal / 100;
    root.style.setProperty('--cycling-bg-color', `rgba(${r}, ${g}, ${b}, ${bgOpacity})`);
    root.style.setProperty('--cycling-bg-opacity', bgOpacity);
    root.style.setProperty('--cycling-accent-color', widget.style.accentColor || '#00e5ff');
    root.style.setProperty('--cycling-text-color', widget.text.color || '#ffffff');
    root.style.setProperty('--cycling-border-radius', (widget.style.borderRadius ?? 14) + 'px');
    root.style.setProperty('--cycling-border-width', (widget.style.borderWidth ?? 1) + 'px');
    root.style.setProperty('--cycling-border-color', widget.style.borderColor || 'rgba(255, 255, 255, 0.1)');
    root.style.setProperty('--cycling-padding', (widget.style.padding ?? 16) + 'px');
    root.style.setProperty('--cycling-width', (widget.layout.width ?? 350) + 'px');
    root.style.setProperty('--cycling-font-size', (widget.text.fontSize ?? 18) + (widget.text.fontSizeUnit || 'px'));
    root.style.setProperty('--cycling-position-x', widget.layout.positionX ?? 10);
    root.style.setProperty('--cycling-position-y', widget.layout.positionY ?? 90);

    // Media properties
    root.style.setProperty('--cycling-media-size', (widget.style.mediaSize ?? 32) + 'px');
    root.style.setProperty('--cycling-media-bg', widget.style.mediaBgColor || 'rgba(0, 229, 255, 0.1)');
    root.style.setProperty('--cycling-media-radius', (widget.style.mediaRadius ?? 8) + 'px');

    // Label properties
    root.style.setProperty('--cycling-label-font-size', (widget.text.labelFontSize ?? 11) + (widget.text.labelFontSizeUnit || 'px'));
    root.style.setProperty('--cycling-label-color', widget.text.labelColor || widget.style.accentColor || '#00e5ff');
    root.style.setProperty('--cycling-label-weight', widget.text.labelFontWeight ?? 800);
    root.style.setProperty('--cycling-label-transform', widget.text.labelTransform || 'uppercase');

    // Transition Duration properties
    const inDur = widget.transitionInDuration ?? 500;
    const outDur = widget.transitionOutDuration ?? 400;
    root.style.setProperty('--cycling-in-duration', inDur + 'ms');
    root.style.setProperty('--cycling-out-duration', outDur + 'ms');

    // Dynamic transform calculation based on position coordinates
    const posX = widget.layout.positionX ?? 10;
    const posY = widget.layout.positionY ?? 90;
    const transX = posX === 50 ? '-50%' : (posX > 50 ? '-100%' : '0%');
    const transY = posY === 50 ? '-50%' : (posY > 50 ? '-100%' : '0%');
    root.style.setProperty('--cycling-transform', `translate(${transX}, ${transY})`);

    // Custom CSS Injection
    let customStyleEl = document.getElementById('custom-cycling-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-cycling-css';
      document.head.appendChild(customStyleEl);
    }
    customStyleEl.textContent = (widget.code && widget.code.enableCustomCode !== false) ? (widget.code.customCSS || '') : '';

    // Restart timer if timer is not running or if critical parameters change
    if (!cycleTimer || widget.cycleDuration !== oldDuration || widget.enabled !== oldEnabled || widget.items?.length !== oldItemsLength) {
      startCycling();
    }
  }

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

  function getLiveData(type) {
    if (type === 'top_supporter') {
      const supportersMap = config.widgets?.leaderboard?.supporters || {};
      const sorted = Object.keys(supportersMap)
        .map(name => ({ name, amount: parseFloat(supportersMap[name]) || 0 }))
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount);

      if (sorted.length > 0) {
        return { name: sorted[0].name, amount: `₹${sorted[0].amount.toLocaleString('en-IN')}` };
      }
      return { name: 'No Top Supporter', amount: '₹0' };
    }

    if (type === 'recent_donation') {
      const recent = config.widgets?.recent?.recentDonations || [];
      if (recent.length > 0) {
        const first = recent[0];
        const sender = first.sender || 'Donor';
        const amtVal = parseFloat(first.amountValue || first.amount || 0);
        return { name: sender, amount: `₹${amtVal.toLocaleString('en-IN')}` };
      }
      return { name: 'No Recent Donations', amount: '₹0' };
    }

    return null;
  }

  function renderItem() {
    const container = document.getElementById('cycling-container');
    const widget = config.widgets.cycling;

    if (!widget || widget.enabled === false || !widget.items || !widget.items.length) {
      if (container) container.innerHTML = '';
      return;
    }

    if (currentIndex >= widget.items.length) currentIndex = 0;
    const item = widget.items[currentIndex];

    let label = item.label || (item.type === 'top_supporter' ? 'Top Supporter' : (item.type === 'recent_donation' ? 'Recent Donation' : ''));
    let text = item.text || '';
    let icon = item.icon || (item.type === 'top_supporter' ? 'trophy' : (item.type === 'recent_donation' ? 'history' : 'star'));
    let imageUrl = item.imageUrl || '';
    let mediaType = item.mediaType || (imageUrl ? 'image' : 'icon');

    if (item.type === 'top_supporter' || item.type === 'recent_donation') {
      const data = getLiveData(item.type);
      text = `${data.name} ${data.amount}`;
    }

    let mediaHtml = '';
    if (mediaType === 'image' && imageUrl) {
      mediaHtml = `<img src="${imageUrl}" alt="Item Media" class="cycling-media-img" />`;
    } else {
      mediaHtml = `<i data-lucide="${icon || 'star'}"></i>`;
    }

    const inEffect = widget.transitionIn || widget.transitionEffect || 'slide-up';

    if (widget.code && widget.code.enableCustomCode !== false && widget.code.customHTML && widget.code.customHTML.trim()) {
      const rendered = TemplateEngine.render(widget.code.customHTML, {
        label: TemplateEngine.escapeHtml(label),
        text: TemplateEngine.escapeHtml(text),
        transitionEffect: inEffect,
        transitionIn: inEffect,
        mediaHtml
      });
      container.innerHTML = rendered;
    } else {
      container.innerHTML = `
        <div class="cycling-card effect-in-${inEffect}">
          <div class="cycling-icon">${mediaHtml}</div>
          <div class="cycling-content">
            <div class="cycling-label">${TemplateEngine.escapeHtml(label)}</div>
            <div class="cycling-text">${TemplateEngine.escapeHtml(text)}</div>
          </div>
        </div>
      `;
    }

    if (window.lucide) lucide.createIcons();
  }

  function transitionToNextItem() {
    const container = document.getElementById('cycling-container');
    const card = container ? container.querySelector('.cycling-card') : null;
    const widget = config.widgets.cycling;
    const items = widget?.items || [];
    if (!widget || widget.enabled === false || !items.length) return;

    const inEffect = widget.transitionIn || widget.transitionEffect || 'slide-up';
    const outEffect = widget.transitionOut || widget.transitionEffect || 'slide-up';
    const outDur = widget.transitionOutDuration ?? 400;

    if (card && items.length > 1) {
      card.classList.remove(`effect-in-${inEffect}`, `effect-${inEffect}`);
      card.classList.add(`effect-out-${outEffect}`, `exit-${outEffect}`);
      setTimeout(() => {
        currentIndex = (currentIndex + 1) % items.length;
        renderItem();
      }, outDur);
    } else {
      if (items.length > 0) currentIndex = (currentIndex + 1) % items.length;
      renderItem();
    }
  }

  function startCycling() {
    if (cycleTimer) clearInterval(cycleTimer);
    const widget = config.widgets.cycling;
    if (!widget || widget.enabled === false || !widget.items || !widget.items.length) {
      const container = document.getElementById('cycling-container');
      if (container) container.innerHTML = '';
      return;
    }

    renderItem();
    const duration = Math.max(1500, widget.cycleDuration || 5000);
    cycleTimer = setInterval(transitionToNextItem, duration);
  }

  function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/obs`);
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'SETTINGS_UPDATED' && msg.payload) applySettings(msg.payload);
        else if (msg.type === 'config' && msg.config) applySettings(msg.config);
      } catch (e) {}
    };
    ws.onclose = () => setTimeout(connectWebSocket, 3000);
  }

  window.addEventListener('message', (event) => {
    if (event.data && (event.data.type === 'SETTINGS_UPDATED' || event.data.type === 'config')) {
      const payload = event.data.payload || event.data.config;
      if (payload) applySettings(payload);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      applySettings(await StorageHelper.loadServer());
    } catch (e) {}
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', widget: 'cycling' }, '*');
    }
  });
})();
