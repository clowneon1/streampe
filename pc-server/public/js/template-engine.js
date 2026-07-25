/**
 * Safe Template Engine for Payment Alerts
 * Supported variables: sender, amount, sourceApp, message, timestamp, date
 */
(function (global) {
  const ALLOWED_VARS = new Set(['sender', 'amount', 'sourceApp', 'message', 'timestamp', 'date', 'mediaHtml', 'title', 'subtitle']);

  const TemplateEngine = {
    /**
     * Check if a template string only contains allowed variable placeholders
     * @param {string} tpl 
     * @returns {boolean}
     */
    validate(tpl) {
      if (typeof tpl !== 'string') return false;
      const matches = tpl.match(/\{\{\s*(\w+)\s*\}\}/g);
      if (!matches) return true;
      for (const match of matches) {
        const varName = match.replace(/[\{\}\s]/g, '');
        if (!ALLOWED_VARS.has(varName)) return false;
      }
      return true;
    },

    /**
     * Escape HTML characters to prevent XSS
     * @param {string} str 
     * @returns {string}
     */
    escapeHtml(str) {
      if (str === null || str === undefined) return '';
      return String(str).replace(/[&<>"']/g, function (c) {
        return {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[c];
      });
    },

    /**
     * Extract structured data fields from a raw Android notification object
     * @param {object} notif 
     * @returns {object}
     */
    extractNotificationData(notif) {
      if (!notif) notif = {};

      const appName = notif.appName || notif.sourceApp || notif.packageName || 'Payment App';
      const title = notif.title || '';
      const text = notif.text || notif.message || notif.bigText || '';
      const fullContent = (title + ' ' + text).trim();

      // Extract amount using common currency patterns (₹, $, €, Rs, INR, etc.)
      let amount = notif.amount || '';
      if (!amount) {
        const amountRegex = /(?:₹|Rs\.?|INR|\$|€)\s*[\d,]+(?:\.\d{1,2})?|[\d,]+(?:\.\d{1,2})?\s*(?:rupees|INR)/i;
        const match = fullContent.match(amountRegex);
        if (match) {
          amount = match[0].trim();
        } else {
          // Fallback regex for pure digits with currency symbol lookaround
          const standaloneNumber = fullContent.match(/[\d,]+(?:\.\d{1,2})?/);
          amount = standaloneNumber ? standaloneNumber[0] : '';
        }
      }

      // Extract sender name
      let sender = notif.sender || '';
      if (!sender) {
        // Patterns like "received ... from Sender Name" or "from Sender Name"
        const fromMatch = fullContent.match(/(?:from|by)\s+([A-Z][a-zA-Z\s]{1,25})(?=\s+(?:via|on|ref|upi|txn)|$|\.|\n)/i);
        if (fromMatch && fromMatch[1]) {
          sender = fromMatch[1].trim();
        } else if (title && !title.toLowerCase().includes('payment') && !title.toLowerCase().includes('received')) {
          sender = title.trim();
        } else {
          sender = 'Someone';
        }
      }

      // Format date and time
      const dateObj = notif.timestamp ? new Date(notif.timestamp) : new Date();
      const timeStr = dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

      return {
        sender: sender,
        amount: amount || '₹0',
        sourceApp: appName,
        message: text || title || 'Payment notification received',
        timestamp: timeStr,
        date: dateStr
      };
    },

    /**
     * Render a template string replacing {{variable}} placeholders with data
     * @param {string} tpl 
     * @param {object} rawData 
     * @param {boolean} safeHtml Whether to HTML-escape values
     * @returns {string}
     */
    render(tpl, rawData, safeHtml = true) {
      if (!tpl) return '';
      const data = this.extractNotificationData(rawData);

      return tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, varName) => {
        if (!ALLOWED_VARS.has(varName)) return match;
        const val = (rawData && rawData[varName] !== undefined)
          ? rawData[varName]
          : (data[varName] !== undefined ? data[varName] : '');

        if (varName === 'mediaHtml') return val;
        return safeHtml ? this.escapeHtml(val) : val;
      });
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = TemplateEngine;
  } else {
    global.TemplateEngine = TemplateEngine;
  }
})(typeof window !== 'undefined' ? window : this);
