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
  const WIDGET_KINDS = ['alert', 'goal', 'leaderboard'];

  const DEFAULT_CODE = {
    alert: {
      customHTML: '{{mediaHtml}}\n<div class="alert-content">\n  <div class="alert-title">{{sender}} sent {{amount}}</div>\n  <div class="alert-subtitle">{{sourceApp}} payment received</div>\n</div>',
      customCSS: '/* Custom Overlay CSS Reference */\n/* .alert-box { border-left: none !important; } */\n/* .alert-title { font-weight: bold; text-transform: uppercase; } */',
      customJS: '// Custom JavaScript executed on alert trigger\n// Available parameters: notifData, alertBox, settings\nconsole.log(\'[Alert Triggered]\', notifData.sender, notifData.amount);'
    },
    goal: {
      customHTML: '<div class="goal-card">\n  <div class="goal-header">\n    <div class="goal-title">{{title}}</div>\n  </div>\n  <div class="goal-bar-wrapper">\n    <div class="goal-bar-fill" style="width: {{percent}};"></div>\n    <div class="goal-bar-text">\n      <span>{{currentAmount}} ({{percent}})</span>\n      <span>{{targetAmount}}</span>\n    </div>\n  </div>\n</div>',
      customCSS: '/* Custom Goal CSS */\n/* .goal-card { background: rgba(10, 14, 23, 0.95) !important; } */',
      customJS: '// Custom Payment Goal JavaScript Hook\nconsole.log(\'[Goal Widget Sync]\');'
    },
    leaderboard: {
      customHTML: '<div class="lb-card">\n  <div class="lb-header">\n    <span style="font-size: 22px;">🏆</span>\n    <div class="lb-title">{{title}}</div>\n  </div>\n  <div class="lb-list"></div>\n</div>',
      customCSS: '/* Top Supporters Leaderboard Custom CSS */\n/* .lb-card { border-color: rgba(0, 229, 255, 0.4) !important; } */',
      customJS: '// Custom Leaderboard JavaScript Hook\nconsole.log(\'[Leaderboard Widget Sync]\');'
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
      layout: { positionPreset: 'bottom-center', positionX: 50, positionY: 90, marginX: 0, marginY: 0, width: 400 }
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
        backgroundColor: '#0a0e17', backgroundOpacity: 85,
        accentColor: '#00e5ff', borderRadius: 14, borderWidth: 1, padding: 16,
        barHeight: 36, barColor: '#1e2433', fillColor: '#00e5ff'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 600 }
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
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 }
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
    const out = {};
    Object.keys(defaults).forEach(key => {
      const def = defaults[key];
      if (typeof def === 'boolean') out[key] = bool(src[key], def);
      else if (typeof def === 'number') out[key] = num(src[key], def);
      else out[key] = str(src[key], def);
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
    return {
      type: str(src.type, defaults.type),
      duration: int(src.duration, defaults.duration, 0, 10000),
      displayDuration: int(src.displayDuration, defaults.displayDuration, 200, 120000)
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

  // Stored code stays empty unless the user writes some; DEFAULT_CODE is only the
  // editor's reset/snippet content. Seeding it here would make every overlay take
  // the custom-HTML branch instead of its built-in markup.
  function normalizeCode(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enableCustomCode: bool(src.enableCustomCode, true),
      customHTML: str(src.customHTML, ''),
      customCSS: str(src.customCSS, ''),
      customJS: str(src.customJS, '')
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
        code: normalizeCode(src.code)
      };
    },

    normalizeWidget(kind, raw) {
      const defaults = WIDGET_DEFAULTS[kind] || WIDGET_DEFAULTS.alert;
      const src = raw && typeof raw === 'object' ? raw : {};
      const widget = {
        enabled: bool(src.enabled, defaults.enabled),
        canvas: CanvasPresets.resolve(src.canvas || defaults.canvas),
        text: WidgetStyle.normalizeText(src.text, defaults.text),
        style: normalizeStyle(src.style, defaults.style),
        animation: normalizeAnimation(src.animation, defaults.animation),
        layout: normalizeLayout(src.layout, defaults.layout),
        code: normalizeCode(src.code)
      };

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
          leaderboard: this.normalizeWidget('leaderboard', WIDGET_DEFAULTS.leaderboard)
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
          leaderboard: this.normalizeWidget('leaderboard', src.widgets && src.widgets.leaderboard)
        },
        filter: { allowedAmounts }
      };
    }
  };

  return ConfigSchema;
});
