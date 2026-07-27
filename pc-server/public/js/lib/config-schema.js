/**
 * Config schema (version 2).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./canvas-presets'), require('./widget-style'), require('./template-matcher'));
  } else {
    root.ConfigSchema = factory(root.CanvasPresets, root.WidgetStyle, root.TemplateMatcher);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CanvasPresets, WidgetStyle, TemplateMatcher) {
  'use strict';

  const CONFIG_VERSION = 2;
  const WIDGET_KINDS = ['alert', 'goal', 'leaderboard', 'recent', 'cycling'];

  // ── Full Source Default Code ──────────────────────────────────────
  const DEFAULT_CODE = {
    alert: {
      customHTML: `{{mediaHtml}}
<div class="alert-content">
  <div class="alert-title">{{title}}</div>
  <div class="alert-subtitle">{{subtitle}}</div>
  {{#message}}<div class="alert-message">{{message}}</div>{{/message}}
</div>`,
      customCSS: `/* Alert Container */
.alert-box {
  display: flex; flex-direction: column; align-items: center; width: 100%;
  background-color: rgba(var(--bg-r, 0), var(--bg-g, 0), var(--bg-b, 0), calc(var(--bg-opacity, 60) / 100));
  border-left: var(--border-width, 5px) solid var(--accent-color);
  border-radius: var(--border-radius, 12px); padding: var(--padding, 20px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 15px rgba(0, 229, 255, 0.2);
  backdrop-filter: blur(8px);
}

/* Media Positioning */
.alert-box.media-pos-top { flex-direction: column; }
.alert-box.media-pos-left { flex-direction: row; text-align: left; gap: 16px; }
.alert-box.media-pos-right { flex-direction: row-reverse; text-align: right; gap: 16px; }
.alert-box.media-pos-bottom { flex-direction: column-reverse; }

/* Media Elements */
.alert-media { max-width: var(--media-size, 100px); max-height: var(--media-size, 100px); object-fit: contain; border-radius: 8px; }

/* Typography */
.alert-title { font-size: 1em; font-weight: bold; margin-bottom: 4px; color: var(--text-color); }
.alert-subtitle { font-size: 0.65em; color: var(--accent-color); text-transform: uppercase; letter-spacing: 1px; }
.alert-message { font-size: 0.8em; margin-top: 8px; opacity: 0.8; font-style: italic; }

/* Animations */
@keyframes slideUpIn { from { opacity: 0; transform: translateY(80px); } to { opacity: 1; transform: translateY(0); } }
.anim-enter-slide-up { animation: slideUpIn var(--anim-duration, 600ms) cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }`,
      customJS: `console.log('[Alert]', notifData.sender, notifData.amount);`
    },
    goal: {
      customHTML: `<div class="goal-card">
  <div class="goal-header">
    <div class="goal-title-group">
      <div class="goal-title">{{title}}</div>
      {{#subtitle}}<div class="goal-subtitle">{{subtitle}}</div>{{/subtitle}}
    </div>
    {{#endDate}}<div class="goal-end-date">Ends: {{endDate}}</div>{{/endDate}}
  </div>
  <div class="goal-bar-wrapper">
    <div class="goal-bar-fill" style="width: {{percent}};"></div>
    <div class="goal-bar-text">
      <span>{{currentAmount}} ({{percent}})</span>
      <span>{{targetAmount}}</span>
    </div>
  </div>
</div>`,
      customCSS: `.goal-card {
  width: 100%; background: rgba(10, 14, 23, calc(var(--goal-bg-opacity, 85) / 100));
  border: 1px solid rgba(255, 255, 255, 0.1); border-radius: var(--goal-border-radius, 14px);
  padding: var(--goal-padding, 16px); box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}
.goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.goal-title { font-size: 1em; font-weight: bold; color: var(--goal-text-color); }
.goal-subtitle { font-size: 0.8em; opacity: 0.7; }
.goal-subtitle:empty { display: none; }
.goal-bar-wrapper {
  position: relative; width: 100%; height: var(--goal-bar-height, 36px);
  background-color: var(--goal-bar-color, #1e2433); border-radius: 40px; overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);
}
.goal-bar-fill {
  height: 100%; background: var(--goal-bar-fill-style, var(--goal-fill-color, #00e5ff));
  transition: width 0.8s cubic-bezier(0.25, 1, 0.5, 1);
  box-shadow: 0 0 12px var(--goal-fill-color);
}
.goal-bar-text {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 16px; font-size: 14px; font-weight: 700; color: #fff;
  text-shadow: 0 1px 4px #000; pointer-events: none;
}`,
      customJS: `console.log('[Goal Sync]');`
    },
    leaderboard: {
      customHTML: `<div class="lb-card">
  <div class="lb-header">
    <span style="font-size: 22px;">🏆</span>
    <div class="lb-title">{{title}}</div>
  </div>
  <div class="lb-list">
    <!-- Rows are injected by the renderer -->
  </div>
</div>`,
      customCSS: `.lb-card {
  width: 100%; background: rgba(10, 14, 23, calc(var(--lb-bg-opacity, 88) / 100));
  border: var(--lb-border-width, 1px) solid var(--lb-border-color, rgba(255, 255, 255, 0.12)); border-radius: var(--lb-border-radius, 16px);
  padding: var(--lb-padding, 18px); box-shadow: 0 12px 36px rgba(0, 0, 0, calc(var(--lb-bg-opacity, 88) / 100 * 0.5));
  backdrop-filter: blur(calc(var(--lb-bg-opacity, 88) / 100 * 12px));
  -webkit-backdrop-filter: blur(calc(var(--lb-bg-opacity, 88) / 100 * 12px));
}
.lb-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.lb-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--lb-row-bg-color, rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px;
  padding: 8px 14px; margin-bottom: 8px;
}
.lb-row.rank-1 { background: rgba(255, 215, 0, 0.12); border-color: #ffd70066; }
.lb-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; background: rgba(255,255,255,0.1); }
.rank-1 .lb-badge { background: #ffd700; color: #000; box-shadow: 0 0 10px #ffd700; }
.lb-amount { font-weight: 700; color: var(--lb-accent-color); font-family: monospace; }`,
      customJS: `console.log('[Leaderboard Sync]');`
    },
    recent: {
      customHTML: `<div class="lb-card">
  <div class="lb-header">
    <i data-lucide="history" style="width: 22px; height: 22px; color: var(--recent-accent-color);"></i>
    <div class="lb-title">{{title}}</div>
  </div>
  <div class="lb-list">
    <!-- Rows are injected by the renderer -->
  </div>
</div>`,
      customCSS: `.lb-card {
  width: 100%; background: rgba(10, 14, 23, calc(var(--recent-bg-opacity, 88) / 100));
  border: var(--recent-border-width, 1px) solid var(--recent-border-color, rgba(255, 255, 255, 0.12)); border-radius: var(--recent-border-radius, 16px);
  padding: var(--recent-padding, 18px); box-shadow: 0 12px 36px rgba(0, 0, 0, calc(var(--recent-bg-opacity, 88) / 100 * 0.5));
  backdrop-filter: blur(calc(var(--recent-bg-opacity, 88) / 100 * 12px));
  -webkit-backdrop-filter: blur(calc(var(--recent-bg-opacity, 88) / 100 * 12px));
}
.lb-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.lb-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--recent-row-bg-color, rgba(255, 255, 255, 0.04));
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px;
  padding: 8px 14px; margin-bottom: 8px;
}
.lb-badge { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; background: rgba(255,255,255,0.1); }
.lb-amount { font-weight: 700; color: var(--recent-accent-color); font-family: monospace; }`,
      customJS: `console.log('[Recent Sync]');`
    },
    cycling: {
      customHTML: `<div class="cycling-card effect-in-{{transitionIn}}">
  <div class="cycling-icon">{{mediaHtml}}</div>
  <div class="cycling-content">
    <div class="cycling-label">{{label}}</div>
    <div class="cycling-text">{{text}}</div>
  </div>
</div>`,
      customCSS: `.cycling-card {
  background: var(--cycling-bg-color);
  border: var(--cycling-border-width, 1px) solid var(--cycling-border-color, rgba(255, 255, 255, 0.1));
  border-radius: var(--cycling-border-radius, 14px);
  padding: var(--cycling-padding, 16px);
  box-shadow: 0 8px 32px rgba(0, 0, 0, var(--cycling-bg-opacity, 0.85));
  backdrop-filter: blur(calc(var(--cycling-bg-opacity, 0.85) * 10px));
  -webkit-backdrop-filter: blur(calc(var(--cycling-bg-opacity, 0.85) * 10px));
}
.cycling-label { font-size: 11px; text-transform: uppercase; color: var(--cycling-accent-color); font-weight: 800; }
.cycling-text { font-size: var(--cycling-font-size, 18px); color: var(--cycling-text-color, #ffffff); font-weight: 700; }`,
      customJS: `console.log('[Cycling Widget Sync]');`
    }
  };

  const WIDGET_DEFAULTS = {
    alert: {
      enabled: true,
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: '{{sender}} sent {{amount}}',
        subtitleTemplate: '{{sourceApp}} payment received',
        fontFamily: 'Inter', fontSize: 24, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'center', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#000000', backgroundOpacity: 60,
        accentColor: '#00e5ff', borderRadius: 12, borderWidth: 5, padding: 20
      },
      animation: { type: 'slide-up', duration: 600, displayDuration: 5000 },
      layout: { positionPreset: 'bottom-center', positionX: 50, positionY: 90, marginX: 0, marginY: 0, width: 400 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    goal: {
      enabled: true,
      title: 'Payment Goal',
      startAmount: 0,
      currentAmount: 0,
      targetAmount: 5000,
      endDate: '2026-12-31',
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Payment Goal',
        subtitleTemplate: 'Target: ₹{{targetAmount}}',
        fontFamily: 'Inter', fontSize: 18, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#0a0e17', backgroundOpacity: 100,
        accentColor: '#00e5ff', borderRadius: 14, borderWidth: 1, padding: 16,
        barHeight: 36, barColor: '#1e2433', fillColor: '#00e5ff',
        barRoundness: 40, barOpacity: 100, useGradient: true, fillColor2: '#7ce3ff',
        effect: 'none'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 600 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    leaderboard: {
      enabled: true,
      title: 'Top Supporters',
      maxEntries: 5,
      showAmounts: true,
      supporters: {},
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Top Supporters',
        subtitleTemplate: 'Leaderboard',
        fontFamily: 'Inter', fontSize: 15, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#0a0e17', backgroundOpacity: 88,
        accentColor: '#00e5ff', borderRadius: 16, borderWidth: 1, padding: 18,
        rowBgColor: '#1a1e2b'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    recent: {
      enabled: true,
      title: 'Recent Donations',
      maxEntries: 5,
      showAmounts: true,
      recentDonations: [],
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Recent Donations',
        subtitleTemplate: 'Last {{count}} payments',
        fontFamily: 'Inter', fontSize: 15, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#0a0e17', backgroundOpacity: 88,
        accentColor: '#00e5ff', borderRadius: 16, borderWidth: 1, padding: 18,
        rowBgColor: '#1a1e2b'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    cycling: {
      enabled: true,
      cycleDuration: 5000,
      transitionIn: 'slide-up',
      transitionOut: 'slide-up',
      transitionInDuration: 500,
      transitionOutDuration: 400,
      transitionEffect: 'slide-up',
      items: [
        { type: 'top_supporter', label: 'Top Supporter', mediaType: 'icon', icon: 'trophy', imageUrl: '' },
        { type: 'recent_donation', label: 'Recent Donation', mediaType: 'icon', icon: 'history', imageUrl: '' }
      ],
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: '', subtitleTemplate: '',
        fontFamily: 'Inter', fontSize: 18, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3,
        labelFontSize: 11, labelFontSizeUnit: 'px', labelFontWeight: 800, labelColor: '#00e5ff', labelTransform: 'uppercase'
      },
      style: {
        backgroundColor: '#0a0e17', backgroundOpacity: 85,
        accentColor: '#00e5ff', borderColor: '#ffffff22', borderRadius: 14, borderWidth: 1, padding: 16,
        mediaSize: 32, mediaBgColor: '#00e5ff1a', mediaRadius: 8
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'bottom-left', positionX: 10, positionY: 90, marginX: 0, marginY: 0, width: 350 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    }
  };

  const TEMPLATE_DEFAULTS = {
    name: 'Alert Template',
    enabled: true,
    isDefault: false,
    priority: 0,
    amountFilters: [],
    image: { imageUrl: '', gifUrl: '', position: 'top', size: 100 },
    sound: { soundUrl: '', soundVolume: 80 }
  };

  const POSITION_PRESETS = {
    'center': { x: 50, y: 50 },
    'top-left': { x: 10, y: 10 },
    'top-center': { x: 50, y: 10 },
    'top-right': { x: 90, y: 10 },
    'bottom-left': { x: 10, y: 90 },
    'bottom-center': { x: 50, y: 90 },
    'bottom-right': { x: 90, y: 90 }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function num(value, fallback, min, max) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (min !== undefined && parsed < min) return min;
    if (max !== undefined && parsed > max) return max;
    return parsed;
  }

  function int(value, fallback, min, max) {
    return Math.round(num(value, fallback, min, max));
  }

  function bool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function str(value, fallback) {
    return typeof value === 'string' ? value : fallback;
  }

  function generateId(prefix) {
    return `${prefix || 'tpl'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeStyle(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = Object.assign({}, src); // Preserve all existing keys to avoid stripping new fields on older servers
    Object.keys(defaults).forEach(key => {
      const def = defaults[key];
      if (out[key] === undefined) {
        out[key] = def;
      } else {
        if (typeof def === 'boolean') out[key] = bool(src[key], def);
        else if (typeof def === 'number') out[key] = num(src[key], def);
        else out[key] = str(src[key], def);
      }
    });

    // Migrate legacy isTransparent to backgroundOpacity
    if (src.isTransparent === true) {
      out.backgroundOpacity = 0;
    } else if (src.isTransparent === false && src.backgroundOpacity === undefined) {
      out.backgroundOpacity = 100;
    }

    return out;
  }

  function normalizeAnimation(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const def = defaults || { type: 'fade-in', duration: 400, displayDuration: 5000 };
    return {
      type: str(src.type, def.type),
      duration: int(src.duration, def.duration, 0, 10000),
      displayDuration: int(src.displayDuration, def.displayDuration, 200, 120000)
    };
  }

  function normalizeLayout(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const preset = str(src.positionPreset, defaults.positionPreset);
    const anchor = POSITION_PRESETS[preset];
    return {
      positionPreset: preset,
      positionX: int(src.positionX, anchor ? anchor.x : defaults.positionX, 0, 100),
      positionY: int(src.positionY, anchor ? anchor.y : defaults.positionY, 0, 100),
      marginX: int(src.marginX, defaults.marginX, -5000, 5000),
      marginY: int(src.marginY, defaults.marginY, -5000, 5000),
      width: int(src.width, defaults.width, 40, 10000)
    };
  }

  // Stored code defaults to the baseline source code so that enabling it
  // results in a functional widget immediately.
  function normalizeCode(raw, kind) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const defaults = DEFAULT_CODE[kind] || DEFAULT_CODE.alert;
    return {
      enableCustomCode: bool(src.enableCustomCode, false),
      customHTML: (typeof src.customHTML === 'string' && src.customHTML.trim()) ? src.customHTML : defaults.customHTML,
      customCSS: (typeof src.customCSS === 'string' && src.customCSS.trim()) ? src.customCSS : defaults.customCSS,
      customJS: (typeof src.customJS === 'string' && src.customJS.trim()) ? src.customJS : defaults.customJS
    };
  }

  function normalizeImage(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      imageUrl: str(src.imageUrl, TEMPLATE_DEFAULTS.image.imageUrl),
      gifUrl: str(src.gifUrl, TEMPLATE_DEFAULTS.image.gifUrl),
      position: str(src.position, TEMPLATE_DEFAULTS.image.position),
      size: int(src.size, TEMPLATE_DEFAULTS.image.size, 10, 1000)
    };
  }

  function normalizeSound(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      soundUrl: str(src.soundUrl, TEMPLATE_DEFAULTS.sound.soundUrl),
      soundVolume: int(src.soundVolume, TEMPLATE_DEFAULTS.sound.soundVolume, 0, 100)
    };
  }

  function normalizeSupporters(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    Object.keys(src).forEach(name => {
      const amount = num(src[name], 0);
      if (amount > 0) out[name] = amount;
    });
    return out;
  }

  const ConfigSchema = {
    CONFIG_VERSION,
    WIDGET_KINDS,
    WIDGET_DEFAULTS,
    TEMPLATE_DEFAULTS,
    DEFAULT_CODE,
    POSITION_PRESETS,
    generateId,
    clone,

    /** Build a complete alert template, using the alert widget defaults as base. */
    createTemplate(overrides) {
      const src = overrides && typeof overrides === 'object' ? overrides : {};
      const base = WIDGET_DEFAULTS.alert;
      return this.normalizeTemplate(Object.assign({
        id: src.id || generateId('tpl'),
        name: TEMPLATE_DEFAULTS.name,
        canvas: clone(base.canvas),
        text: clone(base.text),
        style: clone(base.style),
        animation: clone(base.animation),
        layout: clone(base.layout)
      }, src));
    },

    normalizeTemplate(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const base = WIDGET_DEFAULTS.alert;
      return {
        id: str(src.id, '') || generateId('tpl'),
        name: str(src.name, TEMPLATE_DEFAULTS.name).trim() || TEMPLATE_DEFAULTS.name,
        enabled: bool(src.enabled, TEMPLATE_DEFAULTS.enabled),
        isDefault: bool(src.isDefault, TEMPLATE_DEFAULTS.isDefault),
        priority: int(src.priority, TEMPLATE_DEFAULTS.priority, -1000, 1000),
        amountFilters: (Array.isArray(src.amountFilters) ? src.amountFilters : [])
          .map(f => TemplateMatcher.normalizeFilter(f)),
        image: normalizeImage(src.image),
        sound: normalizeSound(src.sound),
        canvas: CanvasPresets.resolve(src.canvas || base.canvas),
        text: WidgetStyle.normalizeText(src.text, base.text),
        style: normalizeStyle(src.style, base.style),
        animation: normalizeAnimation(src.animation, base.animation),
        layout: normalizeLayout(src.layout, base.layout),
        code: normalizeCode(src.code, 'alert')
      };
    },

    normalizeWidget(kind, raw) {
      const defaults = WIDGET_DEFAULTS[kind] || WIDGET_DEFAULTS.alert;
      const src = raw && typeof raw === 'object' ? raw : {};
      const widget = Object.assign({}, src, { // Preserve all fields
        enabled: bool(src.enabled, defaults.enabled),
        canvas: CanvasPresets.resolve(src.canvas || defaults.canvas),
        text: WidgetStyle.normalizeText(src.text, defaults.text),
        style: normalizeStyle(src.style, defaults.style),
        animation: normalizeAnimation(src.animation, defaults.animation),
        layout: normalizeLayout(src.layout, defaults.layout),
        code: normalizeCode(src.code, kind)
      });

      if (kind === 'goal') {
        widget.title = str(src.title, defaults.title);
        widget.startAmount = num(src.startAmount, defaults.startAmount);
        widget.currentAmount = num(src.currentAmount, defaults.currentAmount);
        widget.targetAmount = num(src.targetAmount, defaults.targetAmount);
        widget.endDate = str(src.endDate, defaults.endDate);
      }
      if (kind === 'leaderboard') {
        widget.title = str(src.title, defaults.title);
        widget.maxEntries = int(src.maxEntries, defaults.maxEntries, 1, 100);
        widget.showAmounts = bool(src.showAmounts, defaults.showAmounts);
        widget.supporters = normalizeSupporters(src.supporters);
      }
      if (kind === 'recent') {
        widget.title = str(src.title, defaults.title);
        widget.maxEntries = int(src.maxEntries, defaults.maxEntries, 1, 100);
        widget.showAmounts = bool(src.showAmounts, defaults.showAmounts);
        widget.recentDonations = Array.isArray(src.recentDonations) ? src.recentDonations : [];
      }
      if (kind === 'cycling') {
        widget.cycleDuration = num(src.cycleDuration, defaults.cycleDuration, 1000, 300000);
        widget.transitionIn = str(src.transitionIn || src.transitionEffect, defaults.transitionIn || 'slide-up');
        widget.transitionOut = str(src.transitionOut || src.transitionEffect, defaults.transitionOut || 'slide-up');
        widget.transitionInDuration = num(src.transitionInDuration, defaults.transitionInDuration || 500, 100, 5000);
        widget.transitionOutDuration = num(src.transitionOutDuration, defaults.transitionOutDuration || 400, 100, 5000);
        widget.transitionEffect = widget.transitionIn;
        const rawItems = Array.isArray(src.items) && src.items.length ? src.items : defaults.items;
        widget.items = rawItems.map(item => {
          const type = str(item.type, 'custom');
          const defaultLabel = type === 'top_supporter' ? 'Top Supporter' : (type === 'recent_donation' ? 'Recent Donation' : '');
          const defaultIcon = type === 'top_supporter' ? 'trophy' : (type === 'recent_donation' ? 'history' : 'star');
          return {
            type,
            label: str(item.label, defaultLabel) || defaultLabel,
            text: str(item.text, ''),
            mediaType: str(item.mediaType, item.imageUrl ? 'image' : 'icon'),
            icon: str(item.icon, defaultIcon) || defaultIcon,
            imageUrl: str(item.imageUrl, '')
          };
        });
      }
      return widget;
    },

    createDefaultConfig() {
      const template = this.createTemplate({ id: 'default', name: 'Default Alert', isDefault: true });
      return {
        version: CONFIG_VERSION,
        activeWidget: 'alert',
        activeTemplateId: template.id,
        alertTemplates: [template],
        widgets: {
          alert: this.normalizeWidget('alert', WIDGET_DEFAULTS.alert),
          goal: this.normalizeWidget('goal', WIDGET_DEFAULTS.goal),
          leaderboard: this.normalizeWidget('leaderboard', WIDGET_DEFAULTS.leaderboard),
          recent: this.normalizeWidget('recent', WIDGET_DEFAULTS.recent),
          cycling: this.normalizeWidget('cycling', WIDGET_DEFAULTS.cycling)
        },
        filter: { allowedAmounts: [] }
      };
    },

    /**
     * Fill in every missing field of a version-2 config. Safe to run repeatedly.
     * Legacy configs must go through ConfigMigration.migrate first.
     */
    normalizeConfig(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const seenIds = new Set();

      let templates = (Array.isArray(src.alertTemplates) ? src.alertTemplates : [])
        .map(t => this.normalizeTemplate(t))
        .map(t => {
          while (seenIds.has(t.id)) t.id = generateId('tpl');
          seenIds.add(t.id);
          return t;
        });

      if (!templates.length) {
        templates = [this.createTemplate({ id: 'default', name: 'Default Alert', isDefault: true })];
      }
      if (!templates.some(t => t.isDefault)) templates[0].isDefault = true;

      const activeTemplateId = templates.some(t => t.id === src.activeTemplateId)
        ? src.activeTemplateId
        : (templates.find(t => t.isDefault) || templates[0]).id;

      const allowedAmounts = ((src.filter && Array.isArray(src.filter.allowedAmounts)) ? src.filter.allowedAmounts : [])
        .map(a => num(a, NaN))
        .filter(a => Number.isFinite(a));

      return {
        version: CONFIG_VERSION,
        activeWidget: WIDGET_KINDS.indexOf(src.activeWidget) !== -1 ? src.activeWidget : 'alert',
        activeTemplateId,
        alertTemplates: templates,
        widgets: {
          alert: this.normalizeWidget('alert', src.widgets && src.widgets.alert),
          goal: this.normalizeWidget('goal', src.widgets && src.widgets.goal),
          leaderboard: this.normalizeWidget('leaderboard', src.widgets && src.widgets.leaderboard),
          recent: this.normalizeWidget('recent', src.widgets && src.widgets.recent),
          cycling: this.normalizeWidget('cycling', src.widgets && src.widgets.cycling)
        },
        filter: { allowedAmounts }
      };
    }
  };

  return ConfigSchema;
});
