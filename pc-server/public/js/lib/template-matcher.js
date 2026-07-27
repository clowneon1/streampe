/**
 * Alert template matching by payment amount.
 *
 * Deterministic selection rule
 * ----------------------------
 * 1. Only `enabled` templates are considered.
 * 2. A template matches when at least one of its amount filters matches the
 *    incoming amount. A template with no filters behaves as a single `any`
 *    filter (it matches every amount).
 * 3. Every matching filter has a *width* — how much of the amount axis it
 *    covers. The narrower the filter, the more specific it is:
 *      exact        -> 0
 *      max only     -> max            (covers 0..max)
 *      range        -> max - min
 *      min only     -> UNBOUNDED - min
 *      any          -> UNBOUNDED
 *    A template's score is the width of its narrowest matching filter.
 * 4. Candidates are ordered by: narrowest width first, then highest
 *    `priority`, then earliest position in the `alertTemplates` array.
 *    The first candidate wins. The ordering is a total order, so the same
 *    amount always resolves to the same template.
 * 5. If nothing matches, the fallback template is used: the enabled template
 *    flagged `isDefault`, otherwise the first enabled template, otherwise the
 *    first template in the list.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.TemplateMatcher = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const UNBOUNDED = Number.MAX_SAFE_INTEGER;
  const EPSILON = 0.005;
  const FILTER_TYPES = ['any', 'exact', 'min', 'max', 'range'];

  function toNumber(value, fallback) {
    const num = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
  }

  const TemplateMatcher = {
    UNBOUNDED,
    FILTER_TYPES,

    /** Extract a numeric amount from "₹1,500.50", 1500.5, "Rs. 1500" … */
    parseAmount(raw) {
      if (typeof raw === 'number') return Number.isFinite(raw) ? raw : 0;
      if (typeof raw !== 'string') return 0;
      const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      return match ? parseFloat(match[0]) || 0 : 0;
    },

    /** Coerce any filter description (incl. bare numbers) into the canonical shape. */
    normalizeFilter(raw) {
      if (typeof raw === 'number' || typeof raw === 'string') {
        return { type: 'exact', value: toNumber(raw, 0), min: 0, max: 0 };
      }
      const src = raw && typeof raw === 'object' ? raw : {};
      let type = typeof src.type === 'string' ? src.type.trim().toLowerCase() : '';

      if (FILTER_TYPES.indexOf(type) === -1) {
        const hasMin = src.min !== undefined && src.min !== null && src.min !== '';
        const hasMax = src.max !== undefined && src.max !== null && src.max !== '';
        if (hasMin && hasMax) type = 'range';
        else if (hasMin) type = 'min';
        else if (hasMax) type = 'max';
        else if (src.value !== undefined) type = 'exact';
        else type = 'any';
      }

      let min = toNumber(src.min, 0);
      let max = toNumber(src.max, 0);
      if (type === 'range' && max < min) { const t = min; min = max; max = t; }

      return { type, value: toNumber(src.value, type === 'min' ? min : max), min, max };
    },

    matches(filter, amount) {
      const f = this.normalizeFilter(filter);
      switch (f.type) {
        case 'exact': return Math.abs(amount - f.value) <= EPSILON;
        case 'min': return amount >= (f.min || f.value) - EPSILON;
        case 'max': return amount <= (f.max || f.value) + EPSILON;
        case 'range': return amount >= f.min - EPSILON && amount <= f.max + EPSILON;
        default: return true;
      }
    },

    /** How much of the amount axis a filter covers — smaller means more specific. */
    width(filter) {
      const f = this.normalizeFilter(filter);
      switch (f.type) {
        case 'exact': return 0;
        case 'max': return Math.max(0, f.max || f.value);
        case 'range': return Math.max(0, f.max - f.min);
        case 'min': return UNBOUNDED - Math.max(0, f.min || f.value);
        default: return UNBOUNDED;
      }
    },

    filtersOf(template) {
      const filters = template && Array.isArray(template.amountFilters) ? template.amountFilters : [];
      return filters.length ? filters.map(f => this.normalizeFilter(f)) : [{ type: 'any', value: 0, min: 0, max: 0 }];
    },

    /** Narrowest matching filter width, or null when the template does not match. */
    score(template, amount) {
      const widths = this.filtersOf(template)
        .filter(f => this.matches(f, amount))
        .map(f => this.width(f));
      return widths.length ? Math.min.apply(null, widths) : null;
    },

    /** All enabled templates that match, best candidate first. */
    rank(templates, amount) {
      const list = Array.isArray(templates) ? templates : [];
      return list
        .map((template, index) => ({ template, index, score: this.score(template, amount) }))
        .filter(entry => entry.template && entry.template.enabled !== false && entry.score !== null)
        .sort((a, b) => {
          if (a.score !== b.score) return a.score - b.score;
          const pa = toNumber(a.template.priority, 0);
          const pb = toNumber(b.template.priority, 0);
          if (pa !== pb) return pb - pa;
          return a.index - b.index;
        });
    },

    fallback(templates) {
      const list = Array.isArray(templates) ? templates : [];
      return list.find(t => t && t.enabled !== false && t.isDefault)
        || list.find(t => t && t.enabled !== false)
        || list[0]
        || null;
    },

    /**
     * Pick the template for an amount.
     * @param {Array}  templates
     * @param {number} amount
     * @param {string} [preferredId] force a specific template (used by the UI preview
     *                               and by overlays replaying a server decision)
     */
    select(templates, amount, preferredId) {
      const list = Array.isArray(templates) ? templates : [];
      if (preferredId) {
        const forced = list.find(t => t && t.id === preferredId);
        if (forced) return forced;
      }
      const ranked = this.rank(list, amount);
      return ranked.length ? ranked[0].template : this.fallback(list);
    },

    /**
     * Resolve the effective render config for an alert: the chosen template
     * layered on top of the alert widget's own settings.
     */
    resolve(config, amount, preferredId) {
      const cfg = config && typeof config === 'object' ? config : {};
      const base = (cfg.widgets && cfg.widgets.alert) || {};
      const template = this.select(cfg.alertTemplates, amount, preferredId) || {};

      return {
        templateId: template.id || null,
        templateName: template.name || '',
        canvas: Object.assign({}, base.canvas, template.canvas),
        text: Object.assign({}, base.text, template.text),
        style: Object.assign({}, base.style, template.style),
        animation: Object.assign({}, base.animation, template.animation),
        layout: Object.assign({}, base.layout, template.layout),
        code: Object.assign({}, base.code, template.code),
        image: Object.assign({}, template.image),
        sound: Object.assign({}, template.sound)
      };
    }
  };

  return TemplateMatcher;
});
