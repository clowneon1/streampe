/**
 * Config migration helpers.
 *
 * Three input generations are supported:
 *   v0 — `widget-config.json` (flat: lineTop/lineMiddle/lineBottom, bgColor, …)
 *   v1 — global `text` / `media` / `style` / `animation` / `advanced` blocks with
 *        `goal` + `leaderboard` siblings, optionally mirrored under `widgets.*`
 *   v2 — the current per-widget + alertTemplates schema
 *
 * `migrate()` always returns a fully normalized v2 config, so it can be run on
 * every load, import and profile switch without data loss.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./canvas-presets'), require('./widget-style'), require('./config-schema'));
  } else {
    root.ConfigMigration = factory(root.CanvasPresets, root.WidgetStyle, root.ConfigSchema);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CanvasPresets, WidgetStyle, ConfigSchema) {
  'use strict';

  function isObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function compact(obj) {
    const out = {};
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach(k => {
        if (obj[k] !== undefined) out[k] = obj[k];
      });
    }
    return out;
  }

  function isVersion2(raw) {
    return isObject(raw) && (raw.version >= ConfigSchema.CONFIG_VERSION || Array.isArray(raw.alertTemplates));
  }

  function isWidgetConfigJson(raw) {
    if (!isObject(raw)) return false;
    if (isObject(raw.text) || isObject(raw.style) || isObject(raw.widgets)) return false;
    return ['lineTop', 'lineMiddle', 'lineBottom', 'bgColor', 'accentColor', 'borderRadius']
      .some(key => raw[key] !== undefined);
  }

  function toMustache(value) {
    return String(value || '').replace(/\{/g, '{{').replace(/\}/g, '}}');
  }

  /** v0 (`widget-config.json`) -> v1 shaped object. */
  function widgetConfigToV1(legacy) {
    const src = isObject(legacy) ? legacy : {};
    const v1 = { text: {}, media: {}, style: {}, animation: {}, advanced: {} };
    if (src.lineMiddle || src.lineTop) v1.text.titleTemplate = toMustache(src.lineMiddle || src.lineTop);
    if (src.lineBottom) v1.text.subtitleTemplate = toMustache(src.lineBottom);
    if (src.fontSize !== undefined) v1.text.fontSize = src.fontSize;
    if (src.bgColor) v1.style.backgroundColor = src.bgColor;
    if (src.accentColor) v1.style.accentColor = src.accentColor;
    if (src.textColor) v1.style.textColor = src.textColor;
    if (src.borderRadius !== undefined) v1.style.borderRadius = src.borderRadius;
    if (src.width !== undefined) v1.advanced.width = src.width;
    if (src.duration !== undefined) v1.animation.displayDuration = src.duration;
    return v1;
  }

  /** Drop keys that carry no value so they cannot clobber defaults on merge. */
  function compact(source) {
    const out = {};
    Object.keys(source || {}).forEach(key => {
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') out[key] = value;
    });
    return out;
  }

  /** Legacy `advanced` block -> { canvas, layout, code }. */
  function splitAdvanced(advanced) {
    const adv = isObject(advanced) ? advanced : {};
    return {
      canvas: CanvasPresets.resolve({ preset: adv.canvasPreset, width: adv.canvasWidth, height: adv.canvasHeight }),
      layout: {
        positionPreset: adv.positionPreset,
        positionX: adv.positionX,
        positionY: adv.positionY,
        marginX: adv.marginX,
        marginY: adv.marginY,
        width: adv.width
      },
      code: compact({
        enableCustomCode: adv.enableCustomCode !== undefined ? adv.enableCustomCode : adv.enableCustomCSS,
        customHTML: adv.customHTML,
        customCSS: adv.customCSS,
        customJS: adv.customJS
      })
    };
  }

  function legacyCode(source) {
    const src = isObject(source) ? source : {};
    return compact({
      enableCustomCode: src.enableCustomCode,
      customHTML: src.customHTML,
      customCSS: src.customCSS,
      customJS: src.customJS
    });
  }

  function firstDefined() {
    for (let i = 0; i < arguments.length; i++) {
      if (arguments[i] !== undefined && arguments[i] !== null && arguments[i] !== '') return arguments[i];
    }
    return undefined;
  }

  /** v1 -> v2. Global text/media/style become per-widget copies + one alert template. */
  function v1ToV2(legacy) {
    const src = isObject(legacy) ? legacy : {};
    const legacyWidgets = isObject(src.widgets) ? src.widgets : {};

    const globalText = isObject(src.text) ? src.text : {};
    const globalStyle = isObject(src.style) ? src.style : {};
    const globalMedia = isObject(src.media) ? src.media : {};
    const globalAnimation = isObject(src.animation) ? src.animation : {};
    const globalAdvanced = isObject(src.advanced) ? src.advanced : {};

    const legacyGoal = isObject(src.goal) ? src.goal : {};
    const legacyLb = isObject(src.leaderboard) ? src.leaderboard : {};

    function widgetSource(kind) {
      return isObject(legacyWidgets[kind]) ? legacyWidgets[kind] : {};
    }

    // Global text styling is copied into each widget's own text block.
    function textFor(kind, extras) {
      const w = widgetSource(kind);
      const text = Object.assign({}, globalText, isObject(w.text) ? w.text : {}, compact(extras));
      const style = Object.assign({}, globalStyle, isObject(w.style) ? w.style : {});
      return WidgetStyle.normalizeText(text, ConfigSchema.WIDGET_DEFAULTS[kind].text, { style });
    }

    function advancedFor(kind) {
      const w = widgetSource(kind);
      return splitAdvanced(isObject(w.advanced) ? w.advanced : globalAdvanced);
    }

    function styleFor(kind, extras) {
      const w = widgetSource(kind);
      return Object.assign({}, globalStyle, isObject(w.style) ? w.style : {}, compact(extras));
    }

    function animationFor(kind) {
      const w = widgetSource(kind);
      return Object.assign({}, globalAnimation, isObject(w.animation) ? w.animation : {});
    }

    // Legacy media lived either under `widgets.alert.media` or as a global block.
    const alertMedia = Object.assign({}, globalMedia, compact(widgetSource('alert').media));

    const alertAdvanced = advancedFor('alert');
    const goalAdvanced = advancedFor('goal');
    const lbAdvanced = advancedFor('leaderboard');

    const alertWidget = {
      enabled: true,
      canvas: alertAdvanced.canvas,
      text: textFor('alert'),
      style: styleFor('alert'),
      animation: animationFor('alert'),
      layout: alertAdvanced.layout,
      code: alertAdvanced.code
    };

    // The single global alert/media setup becomes one default alert template.
    const defaultTemplate = ConfigSchema.createTemplate({
      id: 'default',
      name: 'Default Alert',
      isDefault: true,
      enabled: true,
      amountFilters: [],
      image: {
        imageUrl: alertMedia.imageUrl,
        gifUrl: alertMedia.gifUrl,
        position: alertMedia.position,
        size: alertMedia.size
      },
      sound: {
        soundUrl: alertMedia.soundUrl,
        soundVolume: alertMedia.soundVolume
      },
      canvas: alertWidget.canvas,
      text: alertWidget.text,
      style: alertWidget.style,
      animation: alertWidget.animation,
      layout: alertWidget.layout,
      code: alertWidget.code
    });

    const goalWidget = {
      enabled: legacyGoal.enableGoal !== undefined ? legacyGoal.enableGoal !== false : widgetSource('goal').enableGoal !== false,
      title: firstDefined(legacyGoal.title, widgetSource('goal').title),
      startAmount: firstDefined(legacyGoal.startAmount, widgetSource('goal').startAmount),
      currentAmount: firstDefined(legacyGoal.currentAmount, widgetSource('goal').currentAmount, 0),
      targetAmount: firstDefined(legacyGoal.targetAmount, widgetSource('goal').targetAmount),
      endDate: firstDefined(legacyGoal.endDate, widgetSource('goal').endDate),
      canvas: goalAdvanced.canvas,
      text: textFor('goal', {
        fontFamily: legacyGoal.fontFamily,
        color: legacyGoal.textColor,
        titleTemplate: legacyGoal.title
      }),
      style: styleFor('goal', {
        barHeight: legacyGoal.barHeight,
        barColor: legacyGoal.barColor,
        fillColor: legacyGoal.fillColor,
        isTransparent: legacyGoal.isTransparent
      }),
      animation: animationFor('goal'),
      layout: goalAdvanced.layout,
      code: Object.assign({}, goalAdvanced.code, legacyCode(legacyGoal))
    };

    const leaderboardWidget = {
      enabled: legacyLb.enableLeaderboard !== undefined ? legacyLb.enableLeaderboard !== false : widgetSource('leaderboard').enableLeaderboard !== false,
      title: firstDefined(legacyLb.title, widgetSource('leaderboard').title),
      maxEntries: firstDefined(legacyLb.maxEntries, widgetSource('leaderboard').maxEntries),
      showAmounts: legacyLb.showAmounts !== undefined ? legacyLb.showAmounts !== false : undefined,
      supporters: Object.assign({}, widgetSource('leaderboard').supporters, legacyLb.supporters),
      canvas: lbAdvanced.canvas,
      text: textFor('leaderboard', {
        fontFamily: legacyLb.fontFamily,
        titleTemplate: legacyLb.title
      }),
      style: styleFor('leaderboard', {
        accentColor: legacyLb.accentColor,
        rowBgColor: legacyLb.rowBgColor,
        isTransparent: legacyLb.isTransparent
      }),
      animation: animationFor('leaderboard'),
      layout: lbAdvanced.layout,
      code: Object.assign({}, lbAdvanced.code, legacyCode(legacyLb))
    };

    const recentWidgetData = (src.widgets && src.widgets.recent) || {};
    const cyclingWidgetData = (src.widgets && src.widgets.cycling) || {};

    const blankFallback = ConfigSchema.createTemplate({
      id: 'blank-fallback',
      name: 'Blank Alert',
      isDefault: true,
      priority: -100,
      amountFilters: [],
      text: { titleTemplate: '', subtitleTemplate: '' },
      style: { backgroundOpacity: 0, borderWidth: 0, padding: 0 },
      image: { imageUrl: '', gifUrl: '', size: 0 },
      sound: { soundUrl: '', soundVolume: 0 },
      code: { enableCustomCode: true, customHTML: '', customCSS: '', customJS: '' }
    });

    return {
      version: ConfigSchema.CONFIG_VERSION,
      activeWidget: src.activeWidget,
      activeTemplateId: defaultTemplate.id,
      alertTemplates: [defaultTemplate, blankFallback],
      widgets: {
        alert: alertWidget,
        goal: goalWidget,
        leaderboard: leaderboardWidget,
        recent: ConfigSchema.normalizeWidget('recent', recentWidgetData),
        cycling: ConfigSchema.normalizeWidget('cycling', cyclingWidgetData)
      },
      filter: isObject(src.filter) ? src.filter : { allowedAmounts: [] },
      simulation: isObject(src.simulation) ? src.simulation : { isolatedMode: true }
    };
  }

  function upgradeLegacyTokens(config) {
    if (!isObject(config)) return config;
    const jsonStr = JSON.stringify(config);
    let upgraded = jsonStr
      .replace(/#00e5ff/gi, '#9146ff')
      .replace(/#00f4fe/gi, '#9146ff')
      .replace(/#0a0e17/gi, '#131315')
      .replace(/#1e2433/gi, '#18181b')
      .replace(/#1a1e2b/gi, '#18181b')
      .replace(/rgba\(10,\s*14,\s*23/gi, 'rgba(19, 19, 21')
      .replace(/rgba\(0,\s*229,\s*255/gi, 'rgba(145, 70, 255')
      .replace(/rgba\(0,\s*244,\s*254/gi, 'rgba(145, 70, 255');

    const parsed = JSON.parse(upgraded);
    if (parsed.widgets) {
      if (parsed.widgets.goal && parsed.widgets.goal.style) {
        if (parsed.widgets.goal.style.barRoundness === 40) parsed.widgets.goal.style.barRoundness = 6;
        if (parsed.widgets.goal.style.borderRadius === 14) parsed.widgets.goal.style.borderRadius = 8;
        if (parsed.widgets.goal.style.fillColor2 === '#7ce3ff' || parsed.widgets.goal.style.fillColor2 === '#00f4fe') parsed.widgets.goal.style.fillColor2 = '#d5baff';
        if (parsed.widgets.goal.style.fillColor === '#00f4fe') parsed.widgets.goal.style.fillColor = '#9146ff';
      }
      if (parsed.widgets.alert && parsed.widgets.alert.style) {
        if (parsed.widgets.alert.style.borderRadius === 14) parsed.widgets.alert.style.borderRadius = 8;
      }
      if (parsed.widgets.leaderboard && parsed.widgets.leaderboard.style) {
        if (parsed.widgets.leaderboard.style.borderRadius === 16) parsed.widgets.leaderboard.style.borderRadius = 8;
      }
      if (parsed.widgets.recent && parsed.widgets.recent.style) {
        if (parsed.widgets.recent.style.borderRadius === 16) parsed.widgets.recent.style.borderRadius = 8;
      }
      if (parsed.widgets.cycling && parsed.widgets.cycling.style) {
        if (parsed.widgets.cycling.style.borderRadius === 14) parsed.widgets.cycling.style.borderRadius = 8;
      }
    }

    if (Array.isArray(parsed.alertTemplates)) {
      parsed.alertTemplates.forEach(t => {
        if (t && t.style && t.style.borderRadius === 14) t.style.borderRadius = 8;
        if (t && t.image && !t.image.gifUrl && !t.image.imageUrl && t.isDefault) {
          t.image.gifUrl = '/media/alert-diamond.gif';
        }
        if (t && t.sound && !t.sound.soundUrl && t.isDefault) {
          t.sound.soundUrl = '/sounds/notification.wav';
        }
      });
    }

    return parsed;
  }

  const ConfigMigration = {
    isVersion2,
    isWidgetConfigJson,
    widgetConfigToV1,
    upgradeLegacyTokens,

    /** Any generation of config in, normalized v2 config out. */
    migrate(raw) {
      if (!isObject(raw)) return ConfigSchema.createDefaultConfig();
      const upgraded = upgradeLegacyTokens(raw);
      if (isVersion2(upgraded)) return ConfigSchema.normalizeConfig(upgraded);
      const v1 = isWidgetConfigJson(upgraded) ? widgetConfigToV1(upgraded) : upgraded;
      return ConfigSchema.normalizeConfig(v1ToV2(v1));
    },

    /** Migrate a whole profile store ({ activeProfile, profiles }). */
    migrateProfileStore(store) {
      const src = isObject(store) ? store : {};
      const rawProfiles = isObject(src.profiles) ? src.profiles : {};
      const profiles = {};
      Object.keys(rawProfiles).forEach(name => { profiles[name] = this.migrate(rawProfiles[name]); });
      if (!Object.keys(profiles).length) profiles.Default = ConfigSchema.createDefaultConfig();
      const activeProfile = profiles[src.activeProfile] ? src.activeProfile : Object.keys(profiles)[0];
      return { activeProfile, profiles };
    }
  };

  return ConfigMigration;
});
