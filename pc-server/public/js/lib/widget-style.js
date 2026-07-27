/**
 * Widget text-style normalization helper.
 *
 * There is no shared/global text styling any more: every widget and every alert
 * template carries a complete text block of its own. This module is the single
 * place that knows the shape of that block and how to read legacy variants of it
 * (fontBold / fontItalic / style.textColor).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.WidgetStyle = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TEXT_STYLE = {
    fontFamily: 'Inter',
    fontSize: 24,
    fontSizeUnit: 'px',
    fontWeight: 700,
    fontStyle: 'normal',
    color: '#ffffff',
    textAlign: 'center',
    textTransform: 'none',
    letterSpacing: 0,
    letterSpacingUnit: 'px',
    lineHeight: 1.3
  };

  const TEXT_ALIGNS = ['left', 'center', 'right', 'justify'];
  const TEXT_TRANSFORMS = ['none', 'uppercase', 'lowercase', 'capitalize'];
  const FONT_WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900];
  const UNITS = ['px', '%', 'em', 'rem', 'vw', 'vh'];

  function pickString(value, allowed, fallback) {
    if (typeof value !== 'string') return fallback;
    const v = value.trim().toLowerCase();
    return allowed.indexOf(v) !== -1 ? v : fallback;
  }

  function pickNumber(value, fallback, min, max) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(num)) return fallback;
    if (min !== undefined && num < min) return min;
    if (max !== undefined && num > max) return max;
    return num;
  }

  function pickColor(value, fallback) {
    if (typeof value !== 'string') return fallback;
    const v = value.trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v) ? v : fallback;
  }

  function normalizeFontWeight(value, legacyBold, fallback) {
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'bold') return 700;
      if (v === 'normal') return 400;
      const parsed = parseInt(v, 10);
      if (FONT_WEIGHTS.indexOf(parsed) !== -1) return parsed;
    }
    if (typeof value === 'number' && FONT_WEIGHTS.indexOf(value) !== -1) return value;
    if (legacyBold !== undefined) return legacyBold ? 700 : 400;
    return fallback;
  }

  function normalizeFontStyle(value, legacyItalic, fallback) {
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'italic' || v === 'normal' || v === 'oblique') return v;
    }
    if (legacyItalic !== undefined) return legacyItalic ? 'italic' : 'normal';
    return fallback;
  }

  const WidgetStyle = {
    DEFAULT_TEXT_STYLE,
    TEXT_ALIGNS,
    TEXT_TRANSFORMS,
    FONT_WEIGHTS,
    UNITS,

    defaults(overrides) {
      return Object.assign({}, DEFAULT_TEXT_STYLE, overrides || {});
    },

    /**
     * Normalize the style-only fields of a text block.
     * @param {object} raw     partial/legacy text block
     * @param {object} base    per-widget defaults
     * @param {object} legacy  optional legacy sources ({ style } from old configs)
     */
    normalizeTextStyle(raw, base, legacy) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const def = Object.assign({}, DEFAULT_TEXT_STYLE, base || {});
      const legacyStyle = (legacy && legacy.style) || {};

      return {
        fontFamily: typeof src.fontFamily === 'string' && src.fontFamily.trim()
          ? src.fontFamily.trim()
          : def.fontFamily,
        fontSize: pickNumber(src.fontSize, def.fontSize, 0.1, 2000),
        fontSizeUnit: pickString(src.fontSizeUnit, UNITS, def.fontSizeUnit),
        fontWeight: normalizeFontWeight(src.fontWeight, src.fontBold, def.fontWeight),
        fontStyle: normalizeFontStyle(src.fontStyle, src.fontItalic, def.fontStyle),
        color: pickColor(src.color !== undefined ? src.color : (src.textColor !== undefined ? src.textColor : legacyStyle.textColor), def.color),
        textAlign: pickString(src.textAlign, TEXT_ALIGNS, def.textAlign),
        textTransform: pickString(src.textTransform, TEXT_TRANSFORMS, def.textTransform),
        letterSpacing: pickNumber(src.letterSpacing, def.letterSpacing, -100, 1000),
        letterSpacingUnit: pickString(src.letterSpacingUnit, UNITS, def.letterSpacingUnit),
        lineHeight: pickNumber(src.lineHeight, def.lineHeight, 0.1, 10)
      };
    },

    /** Normalize a full text block: content templates + style fields. */
    normalizeText(raw, base, legacy) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const def = Object.assign({}, DEFAULT_TEXT_STYLE, base || {});
      return Object.assign({
        titleTemplate: typeof src.titleTemplate === 'string' ? src.titleTemplate : (def.titleTemplate || ''),
        subtitleTemplate: typeof src.subtitleTemplate === 'string' ? src.subtitleTemplate : (def.subtitleTemplate || '')
      }, this.normalizeTextStyle(src, def, legacy));
    },

    /**
     * CSS custom properties for a normalized text block.
     * @param {string} prefix e.g. '' for the alert overlay, 'goal' / 'lb' for the others
     */
    toCssVars(text, prefix) {
      const t = this.normalizeTextStyle(text);
      const p = prefix ? `--${prefix}-` : '--';
      const vars = {};
      vars[p + 'font-family'] = `'${t.fontFamily}', sans-serif`;
      vars[p + 'font-size'] = t.fontSize + t.fontSizeUnit;
      vars[p + 'font-weight'] = String(t.fontWeight);
      vars[p + 'font-style'] = t.fontStyle;
      vars[p + 'text-color'] = t.color;
      vars[p + 'text-align'] = t.textAlign;
      vars[p + 'text-transform'] = t.textTransform;
      vars[p + 'letter-spacing'] = t.letterSpacing + t.letterSpacingUnit;
      vars[p + 'line-height'] = String(t.lineHeight);
      return vars;
    },

    /** Apply CSS custom properties onto a DOM element (browser only). */
    applyCssVars(element, vars) {
      if (!element || !element.style) return;
      Object.keys(vars).forEach(name => element.style.setProperty(name, vars[name]));
    }
  };

  return WidgetStyle;
});
