/**
 * Overlay Renderer Logic for Payment Alerts
 */
(function () {
  let settings = StorageHelper.getDefaultSettings();
  let activeAlertTimeout = null;
  let activeAudio = null;

  function hexToRgb(hex) {
    if (!hex) return { r: 0, g: 0, b: 0 };
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    if (isNaN(num)) return { r: 0, g: 0, b: 0 };
    return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
  }

  function applySettings(newSettings) {
    if (!newSettings) return;
    settings = StorageHelper.mergeWithDefaults(newSettings);
    const root = document.documentElement;

    // Apply styles to CSS variables
    const rgb = hexToRgb(settings.style.backgroundColor);
    const opacity = settings.style.isTransparent ? 0 : (settings.style.backgroundOpacity !== undefined ? settings.style.backgroundOpacity : 60);
    const borderWidth = settings.style.borderWidth !== undefined ? settings.style.borderWidth : 5;

    root.style.setProperty('--bg-r', rgb.r);
    root.style.setProperty('--bg-g', rgb.g);
    root.style.setProperty('--bg-b', rgb.b);
    root.style.setProperty('--bg-opacity', opacity);
    root.style.setProperty('--accent-color', settings.style.accentColor);
    root.style.setProperty('--text-color', settings.style.textColor);
    root.style.setProperty('--border-radius', (settings.style.borderRadius !== undefined ? settings.style.borderRadius : 12) + 'px');
    root.style.setProperty('--border-width', borderWidth + 'px');
    root.style.setProperty('--padding', (settings.style.padding || 20) + 'px');
    root.style.setProperty('--position-x', settings.advanced.positionX !== undefined ? settings.advanced.positionX : 50);
    root.style.setProperty('--position-y', settings.advanced.positionY !== undefined ? settings.advanced.positionY : 90);
    root.style.setProperty('--width', (settings.advanced.width || 400) + 'px');
    root.style.setProperty('--font-size', (settings.text.fontSize || 24) + 'px');
    root.style.setProperty('--font-family', `'${settings.text.fontFamily || 'Inter'}', sans-serif`);
    root.style.setProperty('--font-weight', settings.text.fontBold ? 'bold' : 'normal');
    root.style.setProperty('--font-style', settings.text.fontItalic ? 'italic' : 'normal');
    root.style.setProperty('--text-transform', settings.text.textTransform || 'none');
    root.style.setProperty('--text-align', settings.text.textAlign || 'center');
    root.style.setProperty('--margin-x', (settings.advanced.marginX || 0) + 'px');
    root.style.setProperty('--margin-y', (settings.advanced.marginY || 0) + 'px');
    root.style.setProperty('--anim-duration', (settings.animation.duration || 600) + 'ms');
    root.style.setProperty('--media-size', (settings.media.size || 100) + 'px');
    root.style.setProperty('--sound-volume', ((settings.media.soundVolume !== undefined ? settings.media.soundVolume : 80) / 100).toString());

    // Apply Custom CSS (if enabled)
    let customStyleEl = document.getElementById('custom-alert-css');
    if (!customStyleEl) {
      customStyleEl = document.createElement('style');
      customStyleEl.id = 'custom-alert-css';
      document.head.appendChild(customStyleEl);
    }
    const isCodeEnabled = settings.advanced.enableCustomCode !== undefined ? settings.advanced.enableCustomCode : (settings.advanced.enableCustomCSS !== undefined ? settings.advanced.enableCustomCSS : true);
    customStyleEl.textContent = isCodeEnabled ? (settings.advanced.customCSS || '') : '';
  }

  function playSound(url) {
    if (!url) return;
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
      }
      activeAudio = new Audio(url);
      const vol = (settings.media && settings.media.soundVolume !== undefined ? settings.media.soundVolume : 80) / 100;
      activeAudio.volume = Math.max(0, Math.min(1, vol));
      activeAudio.play().catch(err => {
        console.warn('[Overlay] Sound play blocked or failed:', err.message);
      });
    } catch (e) {
      console.warn('[Overlay] Sound initialization error:', e.message);
    }
  }

  function triggerAlert(notifData) {
    const container = document.getElementById('overlay-container');
    if (!container) return;

    // Clear existing alert
    container.innerHTML = '';
    if (activeAlertTimeout) clearTimeout(activeAlertTimeout);

    const alertBox = document.createElement('div');
    const animType = settings.animation.type || 'slide-up';
    const mediaPos = settings.media.position || 'top';

    alertBox.className = `alert-box media-pos-${mediaPos} anim-enter-${animType}`;

    // Media element (GIF priority, then Image)
    const mediaUrl = settings.media.gifUrl || settings.media.imageUrl;
    let mediaHtml = '';
    if (mediaUrl) {
      mediaHtml = `<img class="alert-media" src="${TemplateEngine.escapeHtml(mediaUrl)}" alt="Alert Media" />`;
    }

    // Render templates
    const titleText = TemplateEngine.render(settings.text.titleTemplate, notifData);
    const subtitleText = TemplateEngine.render(settings.text.subtitleTemplate, notifData);

    const isCodeEnabled = settings.advanced.enableCustomCode !== undefined ? settings.advanced.enableCustomCode : (settings.advanced.enableCustomCSS !== undefined ? settings.advanced.enableCustomCSS : true);

    if (isCodeEnabled && settings.advanced && settings.advanced.customHTML && settings.advanced.customHTML.trim()) {
      const renderData = {
        ...notifData,
        mediaHtml: mediaHtml,
        title: titleText,
        subtitle: subtitleText
      };
      alertBox.innerHTML = TemplateEngine.render(settings.advanced.customHTML, renderData);
    } else {
      alertBox.innerHTML = `
        ${mediaHtml}
        <div class="alert-content">
          <div class="alert-title">${titleText}</div>
          ${subtitleText ? `<div class="alert-subtitle">${subtitleText}</div>` : ''}
        </div>
      `;
    }

    container.appendChild(alertBox);

    // Custom JS execution hook (if enabled)
    if (isCodeEnabled && settings.advanced && settings.advanced.customJS && settings.advanced.customJS.trim()) {
      try {
        const userFn = new Function('notifData', 'alertBox', 'settings', settings.advanced.customJS);
        userFn(notifData, alertBox, settings);
      } catch (e) {
        console.warn('[Overlay] Custom JS execution error:', e.message);
      }
    }

    // Play Sound
    if (settings.media.soundUrl) {
      playSound(settings.media.soundUrl);
    }

    // Schedule exit animation and cleanup
    const displayDur = parseInt(settings.animation.displayDuration) || 5000;
    const animDur = parseInt(settings.animation.duration) || 600;

    activeAlertTimeout = setTimeout(() => {
      alertBox.classList.remove(`anim-enter-${animType}`);
      alertBox.classList.add(`anim-exit-${animType}`);
      setTimeout(() => {
        if (container.contains(alertBox)) {
          container.removeChild(alertBox);
        }
      }, animDur);
    }, displayDur);
  }

  // ── WebSocket Client ───────────────────────────────────────
  let ws = null;
  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => console.log('[Overlay] Connected to WebSocket');
      ws.onclose = () => {
        console.warn('[Overlay] WebSocket disconnected, reconnecting in 3s...');
        setTimeout(connectWebSocket, 3000);
      };
      ws.onerror = (err) => console.error('[Overlay] WebSocket error:', err);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SETTINGS_UPDATED') {
            applySettings(msg.payload);
          } else if (msg.type === 'config') {
            applySettings(msg.config);
          } else if (msg.type === 'payment_notification' || msg.type === 'notification') {
            triggerAlert(msg);
          }
        } catch (e) {
          console.error('[Overlay] Message parse error:', e);
        }
      };
    } catch (e) {
      console.error('[Overlay] WebSocket initialization failed:', e);
    }
  }

  // ── Window PostMessage Listener (Preview mode / iframe sync) ─
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (!data) return;

    if (data.type === 'SETTINGS_UPDATED') {
      applySettings(data.payload);
    } else if (data.type === 'TRIGGER_TEST_ALERT') {
      const sample = data.data || {
        sender: 'Rahul Kumar',
        amount: '₹500',
        sourceApp: 'Google Pay',
        message: 'Coffee Payment Received',
        timestamp: Date.now()
      };
      triggerAlert(sample);
    }
  });

  // Initialization
  document.addEventListener('DOMContentLoaded', async () => {
    const initialSettings = await StorageHelper.loadServer();
    applySettings(initialSettings);
    connectWebSocket();
  });

  // Expose triggers for direct script call
  window.OverlayRenderer = {
    applySettings,
    triggerAlert
  };
})();
