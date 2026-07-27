/**
 * Canvas preset resolution helper.
 *
 * Every widget (alert templates included) owns an independent canvas:
 *   { preset: '1080p' | '720p' | 'custom', width: Number, height: Number }
 *
 * Resolving a canvas always returns a complete, valid triple so callers never
 * have to guard against missing width/height.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.CanvasPresets = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PRESET_DIMENSIONS = {
    '1080p': { width: 1920, height: 1080 },
    '720p': { width: 1280, height: 720 }
  };

  const CUSTOM = 'custom';
  const DEFAULT_PRESET = '1080p';

  function toPositiveInt(value, fallback) {
    const num = parseInt(value, 10);
    return Number.isFinite(num) && num > 0 ? num : fallback;
  }

  const CanvasPresets = {
    CUSTOM,
    DEFAULT_PRESET,
    PRESET_DIMENSIONS,

    list() {
      return Object.keys(PRESET_DIMENSIONS).concat([CUSTOM]);
    },

    /** Name of the preset matching the given dimensions, or 'custom'. */
    detect(width, height) {
      const w = toPositiveInt(width, 0);
      const h = toPositiveInt(height, 0);
      const found = Object.keys(PRESET_DIMENSIONS)
        .find(name => PRESET_DIMENSIONS[name].width === w && PRESET_DIMENSIONS[name].height === h);
      return found || CUSTOM;
    },

    /** Build a canvas object from raw dimensions (preset auto-detected). */
    fromDimensions(width, height) {
      const w = toPositiveInt(width, PRESET_DIMENSIONS[DEFAULT_PRESET].width);
      const h = toPositiveInt(height, PRESET_DIMENSIONS[DEFAULT_PRESET].height);
      return { preset: this.detect(w, h), width: w, height: h };
    },

    /**
     * Resolve any partial/legacy canvas description into { preset, width, height }.
     * Named presets always win over stored width/height so a preset can never drift.
     */
    resolve(canvas) {
      const raw = canvas && typeof canvas === 'object' ? canvas : {};
      const fallback = PRESET_DIMENSIONS[DEFAULT_PRESET];
      const width = toPositiveInt(raw.width !== undefined ? raw.width : raw.canvasWidth, fallback.width);
      const height = toPositiveInt(raw.height !== undefined ? raw.height : raw.canvasHeight, fallback.height);

      let preset = typeof raw.preset === 'string' ? raw.preset.trim() : '';
      if (!preset) preset = this.detect(width, height);
      if (preset !== CUSTOM && !PRESET_DIMENSIONS[preset]) preset = this.detect(width, height);

      if (preset === CUSTOM) return { preset: CUSTOM, width, height };
      return { preset, width: PRESET_DIMENSIONS[preset].width, height: PRESET_DIMENSIONS[preset].height };
    },

    /** CSS custom properties describing the canvas, for overlay pages. */
    toCssVars(canvas) {
      const resolved = this.resolve(canvas);
      return {
        '--canvas-width': resolved.width + 'px',
        '--canvas-height': resolved.height + 'px'
      };
    }
  };

  return CanvasPresets;
});
