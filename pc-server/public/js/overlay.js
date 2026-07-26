/**
 * Alert overlay renderer.
 *
 * Every alert resolves its own template (image, sound, text style, animation,
 * canvas, layout) via TemplateMatcher, layered on top of `widgets.alert`. The
 * server tells us which template it picked (`alertTemplateId`) so the overlay
 * and the server never disagree; without that hint we match on the amount
 * ourselves using the same deterministic rule.
 */
(function () {
  let config = StorageHelper.getDefaultSettings();
  let activeAlertTimeout = null;
  let activeAudio = null;
  let activeVolume = 0.8;

  function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    let c = String(hex).replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return { r: 0, g: 0, b: 0 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  /** Push one resolved render config (widget base + template) into CSS variables. */
  function applyRenderConfig(resolved) {
    const root = document.documentElement;
    const style = resolved.style || {};
    const layout = resolved.layout || {};
    const animation = resolved.animation || {};
    const image = resolved.image || {};
    const sound = resolved.sound || {};

    const rgb = hexToRgb(style.backgroundColor);
    root.style.setProperty('--bg-r', rgb.r);
    root.style.setProperty('--bg-g', rgb.g);
    root.style.setProperty('--bg-b', rgb.b);
    root.style.setProperty('--bg-opacity', style.backgroundOpacity);
    root.style.setProperty('--accent-color', style.accentColor);
    root.style.setProperty('--border-radius', style.borderRadius + 'px');
    root.style.setProperty('--border-width', style.borderWidth + 'px');
    root.style.setProperty('--padding', style.padding + 'px');

    root.style.setProperty('--position-x', layout.positionX);
    root.style.setProperty('--position-y', layout.positionY);
    root.style.setProperty('--margin-x', layout.marginX + 'px');
    root.style.setProperty('--margin-y', layout.marginY + 'px');
    root.style.setProperty('--width', layout.width + 'px');

    root.style.setProperty('--anim-duration', animation.duration + 'ms');
    root.style.setProperty('--media-size', (image.size || 100) + 'px');

    WidgetStyle.applyCssVars(root, WidgetStyle.toCssVars(resolved.text));
    WidgetStyle.applyCssVars(root, CanvasPresets.toCssVars(resolved.canvas));

    activeVolume = Math.max(0, Math.min(1, (sound.soundVolume !== undefined ? sound.soundVolume : 80) / 100));
    root.style.setProperty('--sound-volume', String(activeVolume));

    let customStyleEl = document.getElementById('custom-alert-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-alert-css';
      document.head.appendChild(customStyleEl);
    }
    const code = resolved.code || {};
    customStyleEl.textContent = code.enableCustomCode !== false ? (code.customCSS || '') : '';
  }

  /** Store a new config and apply default settings render (no forced template). */
  function applySettings(newSettings) {
    if (!newSettings) return;
    config = StorageHelper.mergeWithDefaults(newSettings);
    applyRenderConfig(TemplateMatcher.resolve(config, 0));
  }

  function playSound(url) {
    if (!url) return;
    try {
      if (activeAudio) { activeAudio.pause(); activeAudio.currentTime = 0; }
      activeAudio = new Audio(url);
      activeAudio.volume = activeVolume;
      activeAudio.play().catch(err => console.warn('[Overlay] Sound play blocked or failed:', err.message));
    } catch (e) {
      console.warn('[Overlay] Sound initialization error:', e.message);
    }
  }

  function triggerAlert(notifData) {
    const container = document.getElementById('overlay-container');
    if (!container) return;

    const amount = TemplateMatcher.parseAmount(
      notifData.amountValue !== undefined ? notifData.amountValue : notifData.amount
    );
    const resolved = TemplateMatcher.resolve(config, amount, notifData.alertTemplateId);
    applyRenderConfig(resolved);

    container.innerHTML = '';
    if (activeAlertTimeout) clearTimeout(activeAlertTimeout);

    const alertBox = document.createElement('div');
    const animType = resolved.animation.type || 'slide-up';
    const mediaPos = resolved.image.position || 'top';
    alertBox.className = `alert-box media-pos-${mediaPos} anim-enter-${animType}`;

    const mediaUrl = resolved.image.gifUrl || resolved.image.imageUrl;
    const mediaHtml = mediaUrl
      ? `<img class="alert-media" src="${TemplateEngine.escapeHtml(mediaUrl)}" alt="Alert Media" />`
      : '';

    const titleText = TemplateEngine.render(resolved.text.titleTemplate, notifData);
    const subtitleText = TemplateEngine.render(resolved.text.subtitleTemplate, notifData);
    const code = resolved.code || {};
    const isCodeEnabled = code.enableCustomCode !== false;

    if (isCodeEnabled && code.customHTML && code.customHTML.trim()) {
      alertBox.innerHTML = TemplateEngine.render(code.customHTML, {
        ...notifData, mediaHtml, title: titleText, subtitle: subtitleText
      });
    } else {
      const messageHtml = notifData.message ? `<div class="alert-message">${TemplateEngine.escapeHtml(notifData.message)}</div>` : '';
      alertBox.innerHTML = `
        ${mediaHtml}
        <div class="alert-content">
          <div class="alert-title">${titleText}</div>
          <div class="alert-subtitle">${subtitleText}</div>
          ${messageHtml}
        </div>
      `;
    }

    container.appendChild(alertBox);

    if (isCodeEnabled && code.customJS && code.customJS.trim()) {
      try {
        new Function('notifData', 'alertBox', 'settings', code.customJS)(notifData, alertBox, resolved);
      } catch (e) {
        console.warn('[Overlay] Custom JS execution error:', e.message);
      }
    }

    if (resolved.sound.soundUrl) playSound(resolved.sound.soundUrl);

    const displayDur = parseInt(resolved.animation.displayDuration, 10) || 5000;
    const animDur = parseInt(resolved.animation.duration, 10) || 600;

    activeAlertTimeout = setTimeout(() => {
      if (activeAudio) {
        const fadeOut = setInterval(() => {
          if (activeAudio && activeAudio.volume > 0.05) {
            activeAudio.volume = Math.max(0, activeAudio.volume - 0.05);
          } else {
            if (activeAudio) { activeAudio.pause(); activeAudio = null; }
            clearInterval(fadeOut);
          }
        }, 30);
      }
      alertBox.classList.remove(`anim-enter-${animType}`);
      alertBox.classList.add(`anim-exit-${animType}`);
      setTimeout(() => {
        if (container.contains(alertBox)) container.removeChild(alertBox);
      }, animDur);
    }, displayDur);
  }

  // ── WebSocket client ───────────────────────────────────────
  let ws = null;
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${protocol}//${location.host}`);
      ws.onopen = () => console.log('[Overlay] Connected to WebSocket');
      ws.onclose = () => {
        console.warn('[Overlay] WebSocket disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
      };
      ws.onerror = (err) => console.error('[Overlay] WebSocket error:', err);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SETTINGS_UPDATED') applySettings(msg.payload);
          else if (msg.type === 'config') applySettings(msg.config);
          else if (msg.type === 'payment_notification' || msg.type === 'notification') triggerAlert(msg);
        } catch (e) {
          console.error('[Overlay] Message parse error:', e);
        }
      };
    } catch (e) {
      console.error('[Overlay] WebSocket initialization failed:', e);
    }
  }

  // ── PostMessage listener (preview iframe) ──────────────────
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;
    if (data.type === 'SETTINGS_UPDATED') {
      applySettings(data.payload);
    } else if (data.type === 'TRIGGER_TEST_ALERT') {
      triggerAlert(data.data || {
        sender: 'Rahul Kumar',
        amount: '₹500',
        sourceApp: 'Google Pay',
        message: 'Coffee Payment Received',
        timestamp: Date.now()
      });
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    applySettings(await StorageHelper.loadServer());
    connectWebSocket();
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'OVERLAY_READY', overlay: 'alert' }, '*');
    }
  });

  window.OverlayRenderer = { applySettings, triggerAlert };
})();
