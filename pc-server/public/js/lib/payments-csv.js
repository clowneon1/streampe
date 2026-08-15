/**
 * Payments CSV Engine (Isomorphic - works in Node.js and Browser)
 * Single Source of Truth for all stream donations, leaderboard, goal, and analytics.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.PaymentsCsv = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const CSV_HEADERS = [
    'id',
    'timestamp',
    'date',
    'time',
    'sender',
    'amount',
    'currency',
    'sourceApp',
    'message',
    'templateId',
    'simulated'
  ];

  const CURRENCY_SYMBOLS = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'CA$',
    AUD: 'A$'
  };

  /**
   * Get display symbol for ISO currency code (default: ₹ for INR).
   */
  function getCurrencySymbol(curr) {
    if (!curr) return '₹';
    const code = String(curr).trim().toUpperCase();
    return CURRENCY_SYMBOLS[code] || code;
  }

  /**
   * Format numeric amount with currency symbol.
   */
  function formatCurrency(amount, curr = 'INR') {
    const num = parseFloat(amount) || 0;
    const sym = getCurrencySymbol(curr);
    return `${sym}${num.toLocaleString('en-IN')}`;
  }

  /**
   * Escape a field for CSV (RFC 4180).
   */
  function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  /**
   * Format a single transaction object into a CSV row string.
   */
  function formatCsvRow(tx) {
    const ts = Number(tx.timestamp) || Date.now();
    const d = new Date(ts);
    const dateStr = tx.date || (!isNaN(d.getTime()) ? d.toISOString().split('T')[0] : '');
    const timeStr = tx.time || (!isNaN(d.getTime()) ? d.toTimeString().split(' ')[0] : '');
    const amtNum = parseFloat(tx.amount);
    const effectiveAmount = isFinite(amtNum) ? amtNum.toFixed(2) : '0.00';
    const currCode = (tx.currency ? String(tx.currency).trim().toUpperCase() : 'INR') || 'INR';

    return [
      escapeCsvField(tx.id || `evt_${ts}`),
      escapeCsvField(ts),
      escapeCsvField(dateStr),
      escapeCsvField(timeStr),
      escapeCsvField(tx.sender || 'Unknown'),
      effectiveAmount,
      escapeCsvField(currCode),
      escapeCsvField(tx.sourceApp || 'Unknown'),
      escapeCsvField(tx.message || ''),
      escapeCsvField(tx.templateId || ''),
      tx.simulated ? 'true' : 'false'
    ].join(',');
  }

  /**
   * Parse a CSV string into an array of transaction objects.
   * Handles multi-line quoted fields, escaped quotes, and empty values.
   */
  function parseCsv(csvString) {
    if (!csvString || typeof csvString !== 'string') return [];
    const text = csvString.trim();
    if (!text) return [];

    const rows = [];
    let currentRow = [];
    let currentField = '';
    let insideQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuotes && nextChar === '"') {
          currentField += '"';
          i++; // Skip the escaped quote
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (char === ',' && !insideQuotes) {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if ((char === '\r' || char === '\n') && !insideQuotes) {
        if (char === '\r' && nextChar === '\n') i++;
        currentRow.push(currentField.trim());
        if (currentRow.some(f => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }

    if (currentField.length > 0 || currentRow.length > 0) {
      currentRow.push(currentField.trim());
      if (currentRow.some(f => f.length > 0)) {
        rows.push(currentRow);
      }
    }

    if (rows.length === 0) return [];

    // Header mapping
    const headerRow = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const fieldIndex = {
      id: headerRow.findIndex(h => h === 'id' || h === 'alertid' || h === 'transactionid'),
      timestamp: headerRow.findIndex(h => h === 'timestamp' || h === 'epoch' || h === 'ts'),
      date: headerRow.findIndex(h => h === 'date'),
      time: headerRow.findIndex(h => h === 'time'),
      sender: headerRow.findIndex(h => h === 'sender' || h === 'name' || h === 'donor' || h === 'username'),
      amount: headerRow.findIndex(h => h === 'amount' || h === 'amt' || h === 'value'),
      currency: headerRow.findIndex(h => h === 'currency' || h === 'curr' || h === 'iso'),
      rawAmount: headerRow.findIndex(h => h === 'rawamount' || h === 'rawamt' || h === 'amountformatted'),
      sourceApp: headerRow.findIndex(h => h === 'sourceapp' || h === 'app' || h === 'source' || h === 'appname' || h === 'provider'),
      message: headerRow.findIndex(h => h === 'message' || h === 'msg' || h === 'note' || h === 'comment'),
      templateId: headerRow.findIndex(h => h === 'templateid' || h === 'template'),
      simulated: headerRow.findIndex(h => h === 'simulated' || h === 'simulation' || h === 'istest' || h === 'test')
    };

    const transactions = [];

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length === 0 || (row.length === 1 && !row[0])) continue;

      const get = (idx, fallback = '') => (idx >= 0 && idx < row.length && row[idx] !== undefined) ? row[idx] : fallback;

      const rawAmtStr = get(fieldIndex.amount, get(fieldIndex.rawAmount, '0'));
      const parsedAmount = parseFloat(rawAmtStr.replace(/[^0-9.-]/g, '')) || 0;

      let currencyVal = get(fieldIndex.currency, '').toUpperCase().trim();
      if (!currencyVal) {
        // Detect from symbols if missing
        if (rawAmtStr.includes('$')) currencyVal = 'USD';
        else if (rawAmtStr.includes('€')) currencyVal = 'EUR';
        else if (rawAmtStr.includes('£')) currencyVal = 'GBP';
        else currencyVal = 'INR';
      }

      let ts = Number(get(fieldIndex.timestamp, ''));
      if (!ts || isNaN(ts)) {
        const dStr = get(fieldIndex.date, '');
        const tStr = get(fieldIndex.time, '');
        if (dStr) {
          const parsedDate = new Date(`${dStr} ${tStr}`.trim());
          ts = !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : Date.now();
        } else {
          ts = Date.now();
        }
      }

      const simVal = get(fieldIndex.simulated, 'false').toLowerCase();
      const isSimulated = simVal === 'true' || simVal === '1' || simVal === 'yes';

      transactions.push({
        id: get(fieldIndex.id, `evt_${ts}_${Math.random().toString(36).slice(2, 6)}`),
        timestamp: ts,
        date: get(fieldIndex.date, new Date(ts).toISOString().split('T')[0]),
        time: get(fieldIndex.time, new Date(ts).toTimeString().split(' ')[0]),
        sender: get(fieldIndex.sender, 'Unknown').trim() || 'Unknown',
        amount: parsedAmount,
        currency: currencyVal,
        rawAmount: formatCurrency(parsedAmount, currencyVal),
        sourceApp: get(fieldIndex.sourceApp, 'Manual Entry').trim() || 'Unknown',
        message: get(fieldIndex.message, '').trim(),
        templateId: get(fieldIndex.templateId, '').trim(),
        simulated: isSimulated
      });
    }

    // Sort by timestamp descending (latest first)
    transactions.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    return transactions;
  }

  /**
   * Serialize an array of transaction objects into a standard CSV string.
   */
  function serializeCsv(transactions) {
    const lines = [CSV_HEADERS.join(',')];
    if (Array.isArray(transactions)) {
      transactions.forEach(tx => {
        if (tx && typeof tx === 'object') {
          lines.push(formatCsvRow(tx));
        }
      });
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Compute derived widget metrics and statistics from the single source of truth.
   *
   * @param {Array} transactions - All transactions from CSV
   * @param {Object} options - Calculation options (e.g. startAmount, includeSimulated)
   * @returns {Object} { goalAmount, supportersMap, recentDonations, analytics }
   */
  function computeMetrics(transactions, options = {}) {
    const list = Array.isArray(transactions) ? transactions : [];
    const includeSimulated = !!options.includeSimulated;
    const startAmount = parseFloat(options.startAmount) || 0;

    // Filter out simulated events unless explicitly included
    const validTxs = list.filter(tx => includeSimulated || !tx.simulated);

    let totalRevenue = 0;
    const supportersMap = {};
    const appBreakdown = {};
    const dailyIncome = {};

    validTxs.forEach(tx => {
      const amt = parseFloat(tx.amount) || 0;
      totalRevenue += amt;

      const sender = (tx.sender || 'Unknown').trim() || 'Unknown';
      supportersMap[sender] = (supportersMap[sender] || 0) + amt;

      const app = (tx.sourceApp || 'Other').trim() || 'Other';
      appBreakdown[app] = (appBreakdown[app] || 0) + amt;

      const dateKey = tx.date || (tx.timestamp ? new Date(tx.timestamp).toISOString().split('T')[0] : 'Unknown');
      dailyIncome[dateKey] = (dailyIncome[dateKey] || 0) + amt;
    });

    // Recent donations (latest 50 items)
    const recentDonations = validTxs.slice(0, 50).map(tx => {
      const curr = tx.currency || 'INR';
      return {
        id: tx.id,
        sender: tx.sender || 'Unknown',
        amount: tx.rawAmount || formatCurrency(tx.amount, curr),
        amountValue: tx.amount,
        currency: curr,
        sourceApp: tx.sourceApp || '',
        message: tx.message || '',
        timestamp: tx.timestamp || Date.now(),
        date: tx.date,
        time: tx.time
      };
    });

    // Leaderboard sorted list
    const sortedLeaderboard = Object.entries(supportersMap)
      .map(([name, total]) => ({ name, total }))
      .sort((a, b) => b.total - a.total);

    return {
      goalAmount: startAmount + totalRevenue,
      totalRevenue,
      startAmount,
      totalCount: validTxs.length,
      supporters: supportersMap,
      sortedLeaderboard,
      recentDonations,
      analytics: {
        totalRevenue,
        totalDonationsCount: validTxs.length,
        uniqueDonorsCount: Object.keys(supportersMap).length,
        averageDonation: validTxs.length > 0 ? (totalRevenue / validTxs.length) : 0,
        appBreakdown,
        dailyIncome,
        topSupporters: sortedLeaderboard.slice(0, 10)
      }
    };
  }

  return {
    CSV_HEADERS,
    CURRENCY_SYMBOLS,
    getCurrencySymbol,
    formatCurrency,
    escapeCsvField,
    formatCsvRow,
    parseCsv,
    serializeCsv,
    computeMetrics
  };
});
