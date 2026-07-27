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

    return {
      version: ConfigSchema.CONFIG_VERSION,
      activeWidget: src.activeWidget,
      activeTemplateId: defaultTemplate.id,
      alertTemplates: [defaultTemplate],
      widgets: {
        alert: alertWidget,
        goal: goalWidget,
        leaderboard: leaderboardWidget,
        recent: ConfigSchema.normalizeWidget('recent', recentWidgetData),
        cycling: ConfigSchema.normalizeWidget('cycling', cyclingWidgetData)
      },
      filter: isObject(src.filter) ? src.filter : { allowedAmounts: [] }
    };
  }

  const ConfigMigration = {
    isVersion2,
    isWidgetConfigJson,
    widgetConfigToV1,

    /** Any generation of config in, normalized v2 config out. */
    migrate(raw) {
      if (!isObject(raw)) return ConfigSchema.createDefaultConfig();
      if (isVersion2(raw)) return ConfigSchema.normalizeConfig(raw);
      const v1 = isWidgetConfigJson(raw) ? widgetConfigToV1(raw) : raw;
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
