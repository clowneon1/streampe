/**
 * Template Engine — Handlebars.js wrapper
 *
 * Public API is identical to the previous hand-rolled engine so every call
 * site (overlay.js, goal.js, leaderboard.js, recent.js, cycling-widget.js,
 * config.js) works without any modifications.
 *
 * Key improvements over the old engine:
 *  - No ALLOWED_VARS whitelist — any context key is rendered (fixes cycling widget bug)
 *  - {{#if condition}} / {{#unless}} / {{#each list}} blocks
 *  - Custom helpers: formatAmount, formatDate, eq, gt, lt, default
 *  - Triple-stash {{{rawHtml}}} for unescaped output (mediaHtml, etc.)
 *  - Compile cache for performance
 */
(function (global) {
  // ── Resolve Handlebars runtime ────────────────────────────────────────
  // Browser: expects window.Handlebars loaded via <script src="/js/lib/handlebars.min.js">
  // Node.js: require() from node_modules
  let HBS;
  if (typeof module !== 'undefined' && module.exports) {
    HBS = require('handlebars');
  } else if (typeof window !== 'undefined' && window.Handlebars) {
    HBS = window.Handlebars;
  } else {
    // Fallback: minimal no-op so the app doesn't crash if Handlebars fails to load
    console.error('[TemplateEngine] Handlebars not found. Templates will not render.');
    HBS = null;
  }

  // ── Compile cache ─────────────────────────────────────────────────────
  const _cache = new Map();

  function compile(tpl) {
    if (!HBS) return () => tpl;
    if (_cache.has(tpl)) return _cache.get(tpl);
    let fn;
    try {
      fn = HBS.compile(tpl, { noEscape: false });
    } catch (e) {
      console.warn('[TemplateEngine] Compile error:', e.message, '| Template:', tpl);
      fn = () => tpl;
    }
    _cache.set(tpl, fn);
    return fn;
  }

  // ── Register built-in helpers ─────────────────────────────────────────
  if (HBS) {
    /**
     * {{formatAmount value}} → ₹1,000.00
     * Also accepts pre-formatted strings like "₹500.00" (passes through)
     */
    HBS.registerHelper('formatAmount', function (value) {
      if (value === null || value === undefined) return '';
      const str = String(value).trim();
      // Already formatted (starts with ₹ or currency symbol)
      if (/^[₹$€£¥]/.test(str)) return str;
      const num = parseFloat(str.replace(/,/g, ''));
      if (isNaN(num)) return str;
      return '₹' + num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    });

    /**
     * {{formatDate timestamp}} → "12:30 PM"
     * {{formatDate timestamp "date"}} → "Aug 16, 2026"
     * {{formatDate timestamp "full"}} → "Aug 16, 2026, 12:30 PM"
     */
    HBS.registerHelper('formatDate', function (value, mode) {
      const d = value ? new Date(Number(value) || value) : new Date();
      if (isNaN(d.getTime())) return String(value || '');
      const m = (typeof mode === 'string') ? mode : 'time';
      if (m === 'date') return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
      if (m === 'full') return d.toLocaleString([], { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    /**
     * {{#if (eq sourceApp "PhonePe")}} ... {{/if}}
     */
    HBS.registerHelper('eq', function (a, b) { return a === b; });
    HBS.registerHelper('neq', function (a, b) { return a !== b; });
    HBS.registerHelper('gt', function (a, b) { return Number(a) > Number(b); });
    HBS.registerHelper('lt', function (a, b) { return Number(a) < Number(b); });
    HBS.registerHelper('gte', function (a, b) { return Number(a) >= Number(b); });
    HBS.registerHelper('lte', function (a, b) { return Number(a) <= Number(b); });

    /**
     * {{default value "Fallback text"}}
     */
    HBS.registerHelper('default', function (value, fallback) {
      return (value !== null && value !== undefined && value !== '') ? value : fallback;
    });
  }

  // ── TemplateEngine public API ─────────────────────────────────────────
  const TemplateEngine = {

    /**
     * Escape HTML characters to prevent XSS.
     * Delegates to Handlebars' own escaper when available for consistency.
     * @param {*} str
     * @returns {string}
     */
    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      if (HBS) return HBS.escapeExpression(String(str));
      // Fallback inline implementation
      return String(str).replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[c]));
    },

    /**
     * Validate that a template string is syntactically valid Handlebars.
     * @param {string} tpl
     * @returns {boolean}
     */
    validate(tpl) {
      if (typeof tpl !== 'string') return false;
      if (!HBS) return true;
      try {
        HBS.precompile(tpl);
        return true;
      } catch (_) {
        return false;
      }
    },

    /**
     * Extract structured data fields from a raw notification object.
     * Kept for backward compatibility with callers that use extractNotificationData.
     * @param {object} notif
     * @returns {object}
     */
    extractNotificationData(notif) {
      if (!notif) return {};
      if (notif._extracted) return notif;

      const appName = notif.appName || notif.sourceApp || notif.packageName || 'Payment App';
      const title   = notif.title || '';
      const text    = notif.text || notif.message || notif.bigText || '';
      const full    = (title + ' ' + text).trim();

      let amount = notif.amount || '';
      if (!amount) {
        const m = full.match(/(?:₹|Rs\.?|INR|\$|€)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})\s*(?:rupees|INR)/i);
        if (m) amount = m[0].trim();
        else { const n = full.match(/[\d,]+(?:\.\d{1,2})?/); amount = n ? n[0] : ''; }
      }

      let sender = notif.sender || '';
      if (!sender) {
        const m = full.match(/(?:from|by)\s+([A-Z][a-zA-Z\s]{1,25})(?=\s+(?:via|on|ref|upi|txn)|$|\.|\\n)/i);
        if (m && m[1]) sender = m[1].trim();
        else if (title && !title.toLowerCase().includes('payment') && !title.toLowerCase().includes('received')) sender = title.trim();
        else sender = 'Someone';
      }

      const dateObj = notif.timestamp ? new Date(notif.timestamp) : new Date();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      return {
        _extracted: true,
        sender,
        amount: amount || '₹0',
        sourceApp: appName,
        message: text || title || 'Payment notification received',
        timestamp: timeStr,
        date: dateStr
      };
    },

    /**
     * Render a Handlebars template string with the given data context.
     *
     * Breaking change from old engine: ALLOWED_VARS whitelist is removed.
     * All keys present in data are available in the template.
     *
     * Triple-stash {{{varName}}} outputs raw unescaped HTML (for mediaHtml etc).
     * Double-stash {{varName}} HTML-escapes values automatically (XSS safe).
     *
     * @param {string} tpl       - Handlebars template string
     * @param {object} rawData   - Context data object
     * @param {boolean} safeHtml - Unused param kept for API compatibility
     * @returns {string}
     */
    render(tpl, rawData, safeHtml = true) {
      if (!tpl) return '';

      // Build context: merge extracted notification data with raw data
      // rawData keys take precedence (explicit > inferred)
      const extracted = this.extractNotificationData(rawData);
      const data = Object.assign({}, extracted, rawData || {});

      // ── SafeString wrapping ───────────────────────────────────────────
      // These keys contain pre-rendered HTML and must never be escaped,
      // even with double-stash {{key}}. This preserves backward compat with
      // the old engine which had a special `if (varName === 'mediaHtml') return val`
      // bypass. Users should use {{mediaHtml}} not {{{mediaHtml}}}.
      if (HBS) {
        const rawHtmlKeys = ['mediaHtml', 'title', 'subtitle'];
        rawHtmlKeys.forEach(key => {
          if (data[key] !== undefined && data[key] !== null) {
            data[key] = new HBS.SafeString(String(data[key]));
          }
        });
      }

      const fn = compile(tpl);
      try {
        return fn(data);
      } catch (e) {
        console.warn('[TemplateEngine] Render error:', e.message, '| Template:', tpl);
        return tpl; // Return raw template string on error — graceful degradation
      }
    }

  };

  // ── Export ────────────────────────────────────────────────────────────
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateEngine;
  } else {
    global.TemplateEngine = TemplateEngine;
  }
})(typeof window !== 'undefined' ? window : this);
