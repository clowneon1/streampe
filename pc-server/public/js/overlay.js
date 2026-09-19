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

  /** Store a new config and apply default settings render with active template. */
  function applySettings(newSettings) {
    if (!newSettings) return;
    config = StorageHelper.mergeWithDefaults(newSettings);
    applyRenderConfig(TemplateMatcher.resolve(config, 0, config.activeTemplateId));
  }

  let activeTTSAudio = null;
  let activeTTSTimeout = null;
  let activeTTSBlobUrl = null;

  // Unlock Web Audio context on user interaction for browsers with strict autoplay policies
  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          ctx.resume().catch(() => {});
        }
      }
    } catch (_) {}
  }
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
    window.addEventListener(evt, unlockAudio, { once: true, passive: true });
  });

  function stopTTS() {
    if (activeTTSTimeout) {
      clearTimeout(activeTTSTimeout);
      activeTTSTimeout = null;
    }
    if (activeTTSAudio) {
      try {
        activeTTSAudio.pause();
        activeTTSAudio.currentTime = 0;
      } catch (_) {}
      activeTTSAudio = null;
    }
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch (_) {}
    }
  }

  function playBrowserSpeech(text, opts) {
    if (typeof window === 'undefined' || !window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return;
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.volume = opts.volume !== undefined ? opts.volume : 1.0;
      utter.rate = opts.rate !== undefined ? opts.rate : 1.0;
      if (opts.pitch !== undefined) utter.pitch = opts.pitch;

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length && opts.voice) {
        const targetVoice = opts.voice.toLowerCase();
        const match = voices.find(v => v.name.toLowerCase().includes(targetVoice));
        if (match) utter.voice = match;
      }
      console.log(`[Overlay:TTS] Speaking via browser speech synthesis (Voice: "${utter.voice ? utter.voice.name : 'Default'}", Rate: ${utter.rate}x, Pitch: ${utter.pitch})`);
      window.speechSynthesis.speak(utter);
    } catch (e) {
      console.warn('[Overlay:TTS] Browser speech synthesis error:', e.message);
    }
  }

  /**
   * Download Microsoft Edge Neural audio via fetch before displaying the alert overlay.
   * Resolves only when the full MP3 payload is downloaded into memory and decoded as an Audio object.
   */
  async function downloadNeuralTTSAudio(ttsText, ttsConfig) {
    const voice = ttsConfig.voice || 'en-IN-NeerjaNeural';
    const rate = Math.max(0.5, Math.min(2.0, parseFloat(ttsConfig.rate) || 1.0));
    const pitch = parseInt(ttsConfig.pitch, 10) || 0;
    const url = `/api/tts/edge?text=${encodeURIComponent(ttsText)}&voice=${encodeURIComponent(voice)}&rate=${encodeURIComponent(rate)}&pitch=${encodeURIComponent(pitch)}`;

    console.log(`[Overlay:TTS] ⏳ Downloading Edge Neural speech: voice="${voice}", rate=${rate}x, pitch=${pitch}Hz | Text: "${ttsText}"`);
    const startTime = performance.now();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout guard

    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}: ${res.statusText}`);
      }

      const blob = await res.blob();
      if (!blob || blob.size === 0) {
        throw new Error('Received empty audio payload from server');
      }

      const elapsed = Math.round(performance.now() - startTime);
      console.log(`[Overlay:TTS] ⚡ Downloaded audio payload (${blob.size} bytes) in ${elapsed}ms. Initializing audio element.`);

      if (activeTTSBlobUrl) {
        try { URL.revokeObjectURL(activeTTSBlobUrl); } catch (_) {}
      }

      activeTTSBlobUrl = URL.createObjectURL(blob);
      const audio = new Audio(activeTTSBlobUrl);

      // Preload metadata to capture duration for dynamic alert display extension
      await new Promise((resolve) => {
        let resolved = false;
        const finish = () => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        };
        audio.onloadedmetadata = finish;
        audio.oncanplaythrough = finish;
        audio.onerror = finish;
        setTimeout(finish, 500);
        audio.load();
      });

      return audio;
    } catch (err) {
      clearTimeout(timeoutId);
      const elapsed = Math.round(performance.now() - startTime);
      console.warn(`[Overlay:TTS] ⚠️ Edge audio download failed in ${elapsed}ms: ${err.message}`);
      throw err;
    }
  }

  function playSound(url) {
    if (!url) return;
    try {
      if (activeAudio) {
        activeAudio.pause();
        activeAudio.currentTime = 0;
        activeAudio = null;
      }
      activeAudio = new Audio(url);
      activeAudio.volume = activeVolume;
      console.log(`[Overlay:Sound] 🔊 Playing alert chime (Volume: ${Math.round(activeVolume * 100)}%): ${url}`);
      const playPromise = activeAudio.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(err => console.warn('[Overlay:Sound] ⚠️ Sound play was blocked or failed:', err.message));
      }
    } catch (e) {
      console.warn('[Overlay:Sound] Sound initialization error:', e.message);
    }
  }

  /**
   * Main alert entrypoint.
   * If Edge TTS is enabled, downloads the audio first.
   * - If response succeeds: audio is ready in memory -> fires the alert overlay.
   * - If response fails / times out: fires the alert overlay immediately with local speech fallback.
   */
  async function triggerAlert(notifData) {
    console.log('[Overlay] 🔔 Triggering alert for payment:', notifData);

    const amount = TemplateMatcher.parseAmount(
      notifData.amountValue !== undefined ? notifData.amountValue : notifData.amount
    );
    const resolved = TemplateMatcher.resolve(config, amount, notifData.alertTemplateId || config.activeTemplateId);

    // Resolve TTS message and prefetch audio if enabled
    const ttsConfig = resolved.tts;
    let preloadedAudio = null;
    let ttsText = '';
    const isTTSEnabled = ttsConfig && ttsConfig.enabled;

    if (isTTSEnabled) {
      const templateStr = (ttsConfig.template || '').trim();
      if (templateStr) {
        ttsText = TemplateEngine.render(templateStr, notifData).trim().slice(0, 300);
      }
    }

    if (isTTSEnabled && ttsText && (!ttsConfig.provider || ttsConfig.provider === 'edge')) {
      console.log(`[Overlay:TTS] Edge TTS enabled. Downloading audio before showing alert overlay...`);
      try {
        preloadedAudio = await downloadNeuralTTSAudio(ttsText, ttsConfig);
        console.log(`[Overlay:TTS] ✅ Audio download complete! Firing alert overlay now.`);
      } catch (err) {
        console.warn(`[Overlay:TTS] ⚠️ Edge TTS download failed (${err.message}). Firing alert overlay immediately with local speech fallback.`);
      }
    } else if (isTTSEnabled && ttsText && ttsConfig.provider === 'local') {
      console.log(`[Overlay:TTS] Local System Speech enabled. Firing alert overlay immediately.`);
    }

    displayAlert(resolved, notifData, preloadedAudio, ttsText);
  }

  /**
   * Render and animate the visual alert onto the DOM, play chime and scheduled TTS audio.
   */
  function displayAlert(resolved, notifData, preloadedAudio, ttsText) {
    const container = document.getElementById('overlay-container');
    if (!container) return;

    applyRenderConfig(resolved);

    container.innerHTML = '';
    if (activeAlertTimeout) clearTimeout(activeAlertTimeout);
    stopTTS();

    const animType = resolved.animation.type || 'slide-up';
    const mediaPos = resolved.image.position || 'top';

    const mediaUrl = resolved.image.imageUrl || resolved.image.gifUrl || '';
    const mediaHtml = mediaUrl
      ? `<img class="alert-media" src="${TemplateEngine.escapeHtml(mediaUrl)}" alt="Alert Media" />`
      : '';

    const titleText = TemplateEngine.render(resolved.text.titleTemplate, notifData);
    const subtitleText = TemplateEngine.render(resolved.text.subtitleTemplate, notifData);
    const code = resolved.code || {};
    const isCodeEnabled = code.enableCustomCode !== false;

    let alertBoxNode = null;

    if (isCodeEnabled) {
      const customHtmlTrimmed = (typeof code.customHTML === 'string') ? code.customHTML.trim() : '';
      if (!customHtmlTrimmed) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = TemplateEngine.render(customHtmlTrimmed, {
        ...notifData,
        mediaHtml,
        title: titleText,
        subtitle: subtitleText
      });
      alertBoxNode = container.firstElementChild || container;
    } else {
      const alertBox = document.createElement('div');
      alertBox.className = `alert-box media-pos-${mediaPos} anim-enter-${animType}`;
      const messageHtml = notifData.message ? `<div class="alert-message">${TemplateEngine.escapeHtml(notifData.message)}</div>` : '';
      alertBox.innerHTML = `
        ${mediaHtml}
        <div class="alert-content">
          <div class="alert-title">${titleText}</div>
          <div class="alert-subtitle">${subtitleText}</div>
          ${messageHtml}
        </div>
      `;
      container.appendChild(alertBox);
      alertBoxNode = alertBox;
    }

    if (isCodeEnabled && code.customJS && code.customJS.trim()) {
      try {
        new Function('notifData', 'alertBox', 'settings', code.customJS)(notifData, alertBoxNode, resolved);
      } catch (e) {
        console.warn('[Overlay] Custom JS execution error:', e.message);
      }
    }

    // 1. Play alert chime sound
    if (resolved.sound && resolved.sound.soundUrl) {
      playSound(resolved.sound.soundUrl);
    }

    // 2. Play scheduled TTS speech
    const ttsConfig = resolved.tts;
    const delay = Math.max(0, parseInt(ttsConfig ? ttsConfig.delay : 0, 10) || 0);
    const volume = Math.max(0, Math.min(1, (ttsConfig && ttsConfig.volume !== undefined ? ttsConfig.volume : 100) / 100));
    const rate = Math.max(0.5, Math.min(2.0, parseFloat(ttsConfig ? ttsConfig.rate : 1.0) || 1.0));
    const pitch = parseInt(ttsConfig ? ttsConfig.pitch : 0, 10) || 0;
    const voice = (ttsConfig && ttsConfig.voice) || 'en-IN-NeerjaNeural';

    if (ttsConfig && ttsConfig.enabled && ttsText) {
      if (preloadedAudio) {
        activeTTSAudio = preloadedAudio;
        preloadedAudio.volume = volume;
        activeTTSTimeout = setTimeout(() => {
          console.log(`[Overlay:TTS] Playing preloaded Edge Neural audio (Volume: ${Math.round(volume * 100)}%, Delay: ${delay}ms)`);
          preloadedAudio.play().catch(e => {
            console.warn('[Overlay:TTS] Audio play error, falling back to local speech:', e.message);
            playBrowserSpeech(ttsText, { voice, volume, rate, pitch });
          });
        }, delay);
      } else {
        // Local speech synthesis or fallback
        activeTTSTimeout = setTimeout(() => {
          console.log(`[Overlay:TTS] Playing local speech synthesis (Voice: ${voice}, Rate: ${rate}x, Pitch: ${pitch}, Delay: ${delay}ms)`);
          playBrowserSpeech(ttsText, { voice, volume, rate, pitch });
        }, delay);
      }
    }

    // 3. Dynamic display duration calculation: ensure alert does not disappear before TTS finishes
    let displayDur = parseInt(resolved.animation.displayDuration, 10) || 5000;
    if (preloadedAudio && preloadedAudio.duration && isFinite(preloadedAudio.duration)) {
      const requiredTime = delay + Math.ceil(preloadedAudio.duration * 1000) + 800;
      if (requiredTime > displayDur) {
        console.log(`[Overlay] Dynamically extending alert display duration from ${displayDur}ms to ${requiredTime}ms to match TTS audio length`);
        displayDur = requiredTime;
      }
    }

    const animDur = parseInt(resolved.animation.duration, 10) || 600;

    activeAlertTimeout = setTimeout(() => {
      console.log('[Overlay] Alert display duration elapsed. Exiting alert.');
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
      stopTTS();
      if (alertBoxNode) {
        alertBoxNode.classList.remove(`anim-enter-${animType}`);
        alertBoxNode.classList.add(`anim-exit-${animType}`);
      }
      setTimeout(() => {
        if (container.contains(alertBoxNode)) container.innerHTML = '';
      }, animDur);
    }, displayDur);
  }

  // ── WebSocket Handler ─────────────────────────────────────────
  let ws = null;
  const isIframePreview = window.parent && window.parent !== window;

  function connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      ws = new WebSocket(`${protocol}//${location.host}/obs`);
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
          else if (msg.type === 'payment_notification' || msg.type === 'notification') {
            // If running inside dashboard live preview iframe, ignore broadcasted duplicate test alerts
            if (isIframePreview && msg.simulated) return;
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

  // ── PostMessage listener (preview iframe) ──────────────────
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
      if (!sample.alertTemplateId && config.activeTemplateId) {
        sample.alertTemplateId = config.activeTemplateId;
      }
      triggerAlert(sample);
    }
  });

  document.addEventListener('DOMContentLoaded', async () => {
    applySettings(await StorageHelper.loadServer());
    connectWebSocket();
    if (isIframePreview) {
      window.parent.postMessage({ type: 'OVERLAY_READY', overlay: 'alert' }, '*');
    }
  });

  window.OverlayRenderer = { applySettings, triggerAlert };
})();
