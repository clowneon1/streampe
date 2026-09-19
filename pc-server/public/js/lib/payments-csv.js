/**
 * Payments CSV Engine (Isomorphic - works in Node.js and Browser)
 * Single Source of Truth for stream donations, leaderboard, goal, and analytics.
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
    'canonicalSender',
    'amount',
    'currency',
    'sourceApp',
    'message'
  ];

  function canonicalDonorKey(name) {
    return String(name || '')
      .trim()
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\.\-_,]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const CURRENCY_SYMBOLS = {
    INR: '₹',
    USD: '$',
    EUR: '€',
    GBP: '£',
    JPY: '¥',
    CAD: 'CA$',
    AUD: 'A$'
  };

  const PROVIDER_METADATA = {
    phonepe: { name: 'PhonePe', color: '#673ab7', glow: 'rgba(103, 58, 183, 0.4)', icon: 'smartphone' },
    gpay: { name: 'Google Pay', color: '#4285f4', glow: 'rgba(66, 133, 244, 0.4)', icon: 'credit-card' },
    paytm: { name: 'Paytm', color: '#00b9f5', glow: 'rgba(0, 185, 245, 0.4)', icon: 'wallet' },
    amazon: { name: 'Amazon Pay', color: '#ff9900', glow: 'rgba(255, 153, 0, 0.4)', icon: 'package' },
    bhim: { name: 'BHIM UPI', color: '#00c853', glow: 'rgba(0, 200, 83, 0.4)', icon: 'landmark' },
    manual: { name: 'Manual Entry', color: '#ffab00', glow: 'rgba(255, 171, 0, 0.4)', icon: 'pencil' },
    other: { name: 'Other', color: '#00e5ff', glow: 'rgba(0, 229, 255, 0.4)', icon: 'circle-dollar-sign' }
  };

  function normalizeProviderKey(sourceApp) {
    if (!sourceApp) return 'other';
    const s = String(sourceApp).toLowerCase();
    if (s.includes('phonepe')) return 'phonepe';
    if (s.includes('google') || s.includes('gpay') || s.includes('paisa')) return 'gpay';
    if (s.includes('paytm')) return 'paytm';
    if (s.includes('amazon')) return 'amazon';
    if (s.includes('bhim') || s.includes('upi') || s.includes('npci')) return 'bhim';
    if (s.includes('manual') || s.includes('offline') || s.includes('cash')) return 'manual';
    return 'other';
  }

  function getProviderMeta(sourceApp) {
    const key = normalizeProviderKey(sourceApp);
    return PROVIDER_METADATA[key] || PROVIDER_METADATA.other;
  }

  function getCurrencySymbol(curr) {
    if (!curr) return '₹';
    const code = String(curr).trim().toUpperCase();
    return CURRENCY_SYMBOLS[code] || code;
  }

  function formatCurrency(amount, curr = 'INR') {
    const num = parseFloat(amount) || 0;
    const sym = getCurrencySymbol(curr);
    return `${sym}${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function formatCompactCurrency(amount, curr = 'INR') {
    const num = parseFloat(amount) || 0;
    const sym = getCurrencySymbol(curr);
    const abs = Math.abs(num);
    const sign = num < 0 ? '-' : '';

    if (abs >= 1000000000) { // 1 Billion+
      const val = (abs / 1000000000).toFixed(abs % 1000000000 === 0 ? 0 : 1);
      return `${sign}${sym}${val}B`;
    }
    if (abs >= 1000000) { // 1 Million+
      const val = (abs / 1000000).toFixed(abs % 1000000 === 0 ? 0 : 1);
      return `${sign}${sym}${val}M`;
    }
    if (abs >= 1000) { // 1 Thousand+
      const val = (abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1);
      return `${sign}${sym}${val}K`;
    }
    return `${sign}${sym}${abs.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function normalizeDate(val, fallbackTs) {
    if (val !== undefined && val !== null) {
      const str = String(val).trim();
      if (str) {
        // 1. YYYY-MM-DD or YYYY-M-D (4-digit year at start, optional time suffix)
        const isoMatch = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
        if (isoMatch) {
          const yr = isoMatch[1];
          const mo = String(isoMatch[2]).padStart(2, '0');
          const da = String(isoMatch[3]).padStart(2, '0');
          return `${yr}-${mo}-${da}`;
        }
        // 2. 4-digit year at end: DD-MM-YYYY or MM-DD-YYYY
        const dmy4Match = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})(?:[T\s].*)?$/);
        if (dmy4Match) {
          const p1 = parseInt(dmy4Match[1], 10);
          const p2 = parseInt(dmy4Match[2], 10);
          const yrStr = dmy4Match[3];
          let da = p1;
          let mo = p2;
          if (p1 <= 12 && p2 > 12) {
            mo = p1;
            da = p2;
          }
          return `${yrStr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
        }
        // 3. 2-digit year combinations: DD-MM-YY, MM-DD-YY, or YY-MM-DD
        const shortMatch = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/);
        if (shortMatch) {
          const p1 = parseInt(shortMatch[1], 10);
          const p2 = parseInt(shortMatch[2], 10);
          const p3 = parseInt(shortMatch[3], 10);
          let yr, mo, da;

          if (p1 <= 12 && p2 > 12) {
            // MM-DD-YY
            mo = p1;
            da = p2;
            yr = 2000 + p3;
          } else if (p1 > 12 && p3 > 12) {
            // Both p1 and p3 > 12 (e.g. 24-08-25 vs 25-08-24):
            // The smaller number is the 2-digit year (e.g. 24 -> 2024), larger is day (e.g. 25)
            const yearNum = Math.min(p1, p3);
            const dayNum = Math.max(p1, p3);
            yr = 2000 + yearNum;
            mo = p2;
            da = dayNum;
          } else if (p1 > 12 && p3 <= 12) {
            // DD-MM-YY (e.g. 25-08-04)
            da = p1;
            mo = p2;
            yr = 2000 + p3;
          } else {
            // Default YY-MM-DD (e.g. 24-08-05)
            yr = 2000 + p1;
            mo = p2;
            da = p3;
          }
          return `${yr}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
        }
        // 4. Textual dates e.g. "15 Aug 2026", "August 15, 2026", "15-Aug-2026", "15-Aug-24"
        const parsed = new Date(str);
        if (!isNaN(parsed.getTime()) && parsed.getFullYear() >= 1970 && parsed.getFullYear() < 3000) {
          const yr = parsed.getFullYear();
          const mo = String(parsed.getMonth() + 1).padStart(2, '0');
          const da = String(parsed.getDate()).padStart(2, '0');
          return `${yr}-${mo}-${da}`;
        }
        // 5. Numeric epoch string
        const num = Number(str);
        if (!isNaN(num) && num > 0) {
          const d = new Date(num < 1e11 ? num * 1000 : num);
          if (!isNaN(d.getTime())) {
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const da = String(d.getDate()).padStart(2, '0');
            return `${yr}-${mo}-${da}`;
          }
        }
      }
    }
    const tsNum = Number(fallbackTs);
    const d = (tsNum && !isNaN(tsNum)) ? new Date(tsNum) : new Date();
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }

  function normalizeTime(val, fallbackTs) {
    if (val !== undefined && val !== null) {
      const str = String(val).trim();
      if (str) {
        // 12-hour AM/PM format (e.g. "02:30 PM", "2:30:15 pm", "12:00 am")
        const ampmMatch = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?\s*(am|pm)$/i);
        if (ampmMatch) {
          let h = parseInt(ampmMatch[1], 10);
          const m = String(ampmMatch[2]).padStart(2, '0');
          const s = String(ampmMatch[3] || '00').padStart(2, '0');
          const ampm = ampmMatch[4].toLowerCase();
          if (ampm === 'pm' && h < 12) h += 12;
          if (ampm === 'am' && h === 12) h = 0;
          return `${String(h).padStart(2, '0')}:${m}:${s}`;
        }
        // 24-hour HH:mm:ss or HH:mm or H:m:s
        const time24Match = str.match(/^(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
        if (time24Match) {
          const h = String(time24Match[1]).padStart(2, '0');
          const m = String(time24Match[2]).padStart(2, '0');
          const s = String(time24Match[3] || '00').padStart(2, '0');
          return `${h}:${m}:${s}`;
        }
      }
    }
    const tsNum = Number(fallbackTs);
    const d = (tsNum && !isNaN(tsNum)) ? new Date(tsNum) : new Date();
    const hr = String(d.getHours()).padStart(2, '0');
    const mn = String(d.getMinutes()).padStart(2, '0');
    const sc = String(d.getSeconds()).padStart(2, '0');
    return `${hr}:${mn}:${sc}`;
  }

  function getMonthKey(tsOrDate) {
    if (!tsOrDate) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    const norm = normalizeDate(tsOrDate, typeof tsOrDate === 'number' ? tsOrDate : null);
    if (norm && /^\d{4}-\d{2}/.test(norm)) {
      return norm.substring(0, 7);
    }
    const d = new Date(Number(tsOrDate) || tsOrDate);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function formatCsvRow(tx) {
    const rawTs = Number(tx.timestamp);
    const dateStr = normalizeDate(tx.date, rawTs);
    const timeStr = normalizeTime(tx.time, rawTs);
    let ts = rawTs;
    if (dateStr && timeStr) {
      const parsedDt = new Date(`${dateStr}T${timeStr}`);
      if (!isNaN(parsedDt.getTime())) {
        ts = parsedDt.getTime();
      }
    }
    if (!ts || isNaN(ts)) {
      ts = (rawTs && !isNaN(rawTs)) ? rawTs : Date.now();
    }
    const rawName = tx.rawSender || tx.sender || 'Unknown';
    const canonicalName = tx.canonicalSender || canonicalDonorKey(rawName);
    const amtNum = parseFloat(tx.amount);
    const effectiveAmount = isFinite(amtNum) ? amtNum.toFixed(2) : '0.00';
    const currCode = (tx.currency ? String(tx.currency).trim().toUpperCase() : 'INR') || 'INR';

    return [
      escapeCsvField(tx.id || `evt_${ts}`),
      escapeCsvField(ts),
      escapeCsvField(dateStr),
      escapeCsvField(timeStr),
      escapeCsvField(rawName),
      escapeCsvField(canonicalName),
      effectiveAmount,
      escapeCsvField(currCode),
      escapeCsvField(tx.sourceApp || 'Unknown'),
      escapeCsvField(tx.message || '')
    ].join(',');
  }

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
          i++;
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

    const headerRow = rows[0].map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));
    const fieldIndex = {
      id: headerRow.findIndex(h => h === 'id' || h === 'alertid' || h === 'transactionid'),
      timestamp: headerRow.findIndex(h => h === 'timestamp' || h === 'epoch' || h === 'ts'),
      date: headerRow.findIndex(h => h === 'date'),
      time: headerRow.findIndex(h => h === 'time'),
      sender: headerRow.findIndex(h => h === 'sender' || h === 'name' || h === 'donor' || h === 'username'),
      canonicalSender: headerRow.findIndex(h => h === 'canonicalsender' || h === 'canonicalkey' || h === 'canonicalname'),
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

      const get = (idx, fallback = '') => {
        if (idx < 0 || idx >= row.length || row[idx] === undefined || row[idx] === null) return fallback;
        const val = String(row[idx]).trim();
        return val !== '' ? val : fallback;
      };

      const rawAmtStr = get(fieldIndex.amount, get(fieldIndex.rawAmount, '0'));
      const parsedAmount = parseFloat(rawAmtStr.replace(/[^0-9.-]/g, '')) || 0;

      let currencyVal = get(fieldIndex.currency, '').toUpperCase().trim();
      if (!currencyVal) {
        if (rawAmtStr.includes('$')) currencyVal = 'USD';
        else if (rawAmtStr.includes('€')) currencyVal = 'EUR';
        else if (rawAmtStr.includes('£')) currencyVal = 'GBP';
        else currencyVal = 'INR';
      }

      let ts = Number(get(fieldIndex.timestamp, ''));
      const rawDateStr = get(fieldIndex.date, '');
      const rawTimeStr = get(fieldIndex.time, '');
      const normalizedDate = normalizeDate(rawDateStr, ts || null);
      const normalizedTime = normalizeTime(rawTimeStr, ts || null);
      if (!ts || isNaN(ts)) {
        const parsedDate = new Date(`${normalizedDate}T${normalizedTime}`);
        ts = !isNaN(parsedDate.getTime()) ? parsedDate.getTime() : Date.now();
      }

      const simVal = get(fieldIndex.simulated, 'false').toLowerCase();
      const isSimulated = simVal === 'true' || simVal === '1' || simVal === 'yes';
      const rawSenderName = get(fieldIndex.sender, 'Unknown').trim() || 'Unknown';
      const canonicalName = get(fieldIndex.canonicalSender, '').trim() || canonicalDonorKey(rawSenderName);

      transactions.push({
        id: get(fieldIndex.id, `evt_${ts}_${Math.random().toString(36).slice(2, 6)}`),
        timestamp: ts,
        date: normalizedDate,
        time: normalizedTime,
        sender: rawSenderName,
        canonicalSender: canonicalName,
        rawSender: rawSenderName,
        amount: parsedAmount,
        currency: currencyVal,
        rawAmount: formatCurrency(parsedAmount, currencyVal),
        sourceApp: get(fieldIndex.sourceApp, 'Manual Entry').trim() || 'Unknown',
        message: get(fieldIndex.message, '').trim(),
        templateId: get(fieldIndex.templateId, '').trim(),
        simulated: isSimulated
      });
    }

    transactions.sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    return transactions;
  }

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

  function getTxLocalDate(tx) {
    if (!tx) return '';
    return normalizeDate(tx.date, tx.timestamp);
  }

  /**
   * Deep filter transaction records by date ranges, month, provider, and search queries.
   */
  function filterTransactions(transactions, filters = {}) {
    const list = Array.isArray(transactions) ? transactions : [];
    return list.filter(tx => {
      if (!filters.includeSimulated && tx.simulated) return false;

      const txDate = getTxLocalDate(tx);

      if (filters.specificDate) {
        if (txDate !== filters.specificDate) return false;
      }

      if (filters.month && filters.month !== 'all' && !filters.startDate && !filters.specificDate) {
        const txMonth = getMonthKey(txDate || tx.timestamp);
        if (txMonth !== filters.month) return false;
      }

      if (filters.startDate) {
        let sBound = filters.startDate;
        if (sBound.length === 7) sBound = `${sBound}-01`;
        if (txDate && txDate < sBound) return false;
      }

      if (filters.endDate) {
        let eBound = filters.endDate;
        if (eBound.length === 7) {
          const [yr, mo] = eBound.split('-').map(Number);
          const lastD = new Date(yr, mo, 0).getDate();
          eBound = `${eBound}-${String(lastD).padStart(2, '0')}`;
        }
        if (txDate && txDate > eBound) return false;
      }

      if (filters.provider && filters.provider !== 'all') {
        const pKey = normalizeProviderKey(tx.sourceApp);
        if (pKey !== filters.provider.toLowerCase()) return false;
      }

      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const sMatch = (tx.sender || '').toLowerCase().includes(q);
        const rMatch = (tx.rawSender || '').toLowerCase().includes(q);
        const dMatch = (tx.displayName || '').toLowerCase().includes(q);
        const mMatch = (tx.message || '').toLowerCase().includes(q);
        const idMatch = (tx.id || '').toLowerCase().includes(q);
        if (!sMatch && !rMatch && !dMatch && !mMatch && !idMatch) return false;
      }

      if (filters.alias) {
        const q = filters.alias.toLowerCase().trim();
        const sMatch = (tx.sender || '').toLowerCase().includes(q);
        const dMatch = (tx.displayName || '').toLowerCase().includes(q);
        if (!sMatch && !dMatch) return false;
      }

      if (filters.minAmount !== undefined && filters.minAmount !== null && filters.minAmount !== '') {
        const min = parseFloat(filters.minAmount);
        if (!isNaN(min) && (parseFloat(tx.amount) || 0) < min) return false;
      }

      if (filters.maxAmount !== undefined && filters.maxAmount !== null && filters.maxAmount !== '') {
        const max = parseFloat(filters.maxAmount);
        if (!isNaN(max) && (parseFloat(tx.amount) || 0) > max) return false;
      }

      return true;
    });
  }

  /**
   * Compute visual Donut/Pie segments with angles, percentages, and branded styling.
   */
  function computeDonutSegments(transactions) {
    const list = Array.isArray(transactions) ? transactions : [];
    let totalRevenue = 0;
    const providerStats = {};

    list.forEach(tx => {
      const amt = parseFloat(tx.amount) || 0;
      totalRevenue += amt;
      const key = normalizeProviderKey(tx.sourceApp);
      if (!providerStats[key]) {
        const meta = PROVIDER_METADATA[key] || PROVIDER_METADATA.other;
        providerStats[key] = {
          key,
          name: meta.name,
          color: meta.color,
          glow: meta.glow,
          icon: meta.icon,
          totalAmount: 0,
          count: 0
        };
      }
      providerStats[key].totalAmount += amt;
      providerStats[key].count += 1;
    });

    const segments = Object.values(providerStats).map(p => {
      const percentage = totalRevenue > 0 ? (p.totalAmount / totalRevenue) * 100 : 0;
      return {
        ...p,
        percentage: parseFloat(percentage.toFixed(1)),
        formattedAmount: formatCompactCurrency(p.totalAmount)
      };
    }).sort((a, b) => b.totalAmount - a.totalAmount);

    let cumulativeAngle = 0;
    segments.forEach(seg => {
      const angle = (seg.percentage / 100) * 360;
      seg.startAngle = cumulativeAngle;
      seg.angle = angle;
      seg.endAngle = cumulativeAngle + angle;
      cumulativeAngle += angle;
    });

    return {
      totalRevenue,
      formattedTotal: formatCompactCurrency(totalRevenue),
      totalCount: list.length,
      segments
    };
  }

  /**
   * Filter transactions by timeframe resolution ('week', 'month', 'year', 'all').
   */
  function filterByTimeframe(transactions, mode = 'all', referenceDate = new Date()) {
    const list = Array.isArray(transactions) ? transactions : [];
    if (!mode || mode === 'all') return list.filter(t => !t.simulated);

    const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
    const validRef = isNaN(ref.getTime()) ? new Date() : ref;
    const yr = validRef.getFullYear();
    const mo = validRef.getMonth();

    return list.filter(t => {
      if (t.simulated) return false;
      const dateStr = getTxLocalDate(t);
      if (!dateStr) return false;
      const parts = dateStr.split('-').map(Number);
      if (parts.length < 3) return false;
      const [tY, tM, tD] = parts;

      if (mode === 'week') {
        const currentDay = validRef.getDay();
        const distanceToMon = (currentDay + 6) % 7;
        const monday = new Date(validRef);
        monday.setDate(validRef.getDate() - distanceToMon);
        monday.setHours(0, 0, 0, 0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23, 59, 59, 999);

        const txDate = new Date(tY, tM - 1, tD);
        return txDate >= monday && txDate <= sunday;
      }

      if (mode === 'year') {
        return tY === yr;
      }

      // mode === 'month'
      return tY === yr && tM === (mo + 1);
    });
  }

  /**
   * Compute multi-resolution revenue timeline (week = 7 days, month = 4-5 weeks, year = 12 months).
   */
  function computeTimelineData(transactions, mode = 'month', referenceDate = new Date()) {
    const list = Array.isArray(transactions) ? transactions : [];
    const ref = referenceDate instanceof Date ? referenceDate : new Date(referenceDate || Date.now());
    const validRef = isNaN(ref.getTime()) ? new Date() : ref;
    const yr = validRef.getFullYear();
    const mo = validRef.getMonth();

    const validTxs = list.filter(t => !t.simulated);

    if (mode === 'week') {
      const currentDay = validRef.getDay();
      const distanceToMon = (currentDay + 6) % 7;
      const monday = new Date(validRef);
      monday.setDate(validRef.getDate() - distanceToMon);

      const dayNames = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const trends = [];

      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const yStr = d.getFullYear();
        const mStr = String(d.getMonth() + 1).padStart(2, '0');
        const dStr = String(d.getDate()).padStart(2, '0');
        const dateKey = `${yStr}-${mStr}-${dStr}`;

        let daySum = 0;
        let dayCount = 0;
        validTxs.forEach(t => {
          const tDate = getTxLocalDate(t);
          if (tDate === dateKey) {
            daySum += (parseFloat(t.amount) || 0);
            dayCount += 1;
          }
        });

        trends.push({
          date: dateKey,
          dayLabel: `${dayNames[i]} ${d.getDate()}`,
          amount: daySum,
          count: dayCount,
          formattedAmount: formatCurrency(daySum)
        });
      }
      return trends;
    }

    if (mode === 'year') {
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const trends = [];

      for (let m = 0; m < 12; m++) {
        const mKey = `${yr}-${String(m + 1).padStart(2, '0')}`;
        let mSum = 0;
        let mCount = 0;

        validTxs.forEach(t => {
          const tDate = getTxLocalDate(t);
          if (tDate && tDate.startsWith(mKey)) {
            mSum += (parseFloat(t.amount) || 0);
            mCount += 1;
          }
        });

        trends.push({
          date: mKey,
          dayLabel: monthNames[m],
          amount: mSum,
          count: mCount,
          formattedAmount: formatCurrency(mSum)
        });
      }
      return trends;
    }

    // Default: Month mode (4 - 5 weeks of current month)
    const daysInMonth = new Date(yr, mo + 1, 0).getDate();
    const weeks = [
      { label: 'Week 1', sub: '1-7', start: 1, end: 7 },
      { label: 'Week 2', sub: '8-14', start: 8, end: 14 },
      { label: 'Week 3', sub: '15-21', start: 15, end: 21 },
      { label: 'Week 4', sub: '22-28', start: 22, end: 28 }
    ];
    if (daysInMonth > 28) {
      weeks.push({ label: 'Week 5', sub: `29-${daysInMonth}`, start: 29, end: daysInMonth });
    }

    const trends = weeks.map(w => {
      let wSum = 0;
      let wCount = 0;

      validTxs.forEach(t => {
        const tDate = getTxLocalDate(t);
        if (tDate) {
          const parts = tDate.split('-').map(Number);
          if (parts[0] === yr && parts[1] === (mo + 1) && parts[2] >= w.start && parts[2] <= w.end) {
            wSum += (parseFloat(t.amount) || 0);
            wCount += 1;
          }
        }
      });

      return {
        date: `${yr}-${String(mo + 1).padStart(2, '0')} (${w.label}: ${w.sub})`,
        dayLabel: w.label,
        amount: wSum,
        count: wCount,
        formattedAmount: formatCurrency(wSum)
      };
    });

    return trends;
  }

  /**
   * Compute daily revenue trends for timeline bar/line charts.
   */
  function computeDailyTrends(transactions, monthKey) {
    const list = Array.isArray(transactions) ? transactions : [];
    const dailyMap = {};

    list.forEach(tx => {
      const amt = parseFloat(tx.amount) || 0;
      const dateStr = getTxLocalDate(tx);
      if (dateStr) {
        dailyMap[dateStr] = (dailyMap[dateStr] || 0) + amt;
      }
    });

    const days = Object.keys(dailyMap).sort();
    let peakDay = { date: 'N/A', amount: 0 };

    const trends = days.map(date => {
      const amount = dailyMap[date];
      if (amount > peakDay.amount) {
        peakDay = { date, amount };
      }
      return {
        date,
        dayLabel: date.split('-').slice(1).join('/'),
        amount,
        formattedAmount: formatCurrency(amount)
      };
    });

    return {
      trends,
      peakDay: {
        ...peakDay,
        formattedAmount: formatCurrency(peakDay.amount)
      }
    };
  }

  /**
   * Compute full widget and analytics metrics.
   */
  function computeMetrics(transactions, options = {}) {
    const list = Array.isArray(transactions) ? transactions : [];
    const includeSimulated = !!options.includeSimulated;
    const startAmount = parseFloat(options.startAmount) || 0;

    const validTxs = list.filter(tx => includeSimulated || !tx.simulated);
    const filteredTxs = filterTransactions(validTxs, options.filters || {});

    let totalRevenue = 0;
    const canonicalSupporters = {}; // canonicalKey -> { name, total, count }
    const appBreakdown = {};

    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount) || 0;
      totalRevenue += amt;

      const rawName = (tx.displayName || tx.sender || 'Unknown').trim() || 'Unknown';
      const cKey = tx.canonicalSender || canonicalDonorKey(tx.rawSender || rawName) || 'unknown';

      if (!canonicalSupporters[cKey]) {
        canonicalSupporters[cKey] = { name: rawName, total: 0, count: 0 };
      }
      canonicalSupporters[cKey].total += amt;
      canonicalSupporters[cKey].count += 1;

      // Prefer display alias / non-punctuated cleaner name
      if (rawName && canonicalSupporters[cKey].name !== rawName) {
        canonicalSupporters[cKey].name = rawName;
      }

      const app = (tx.sourceApp || 'Other').trim() || 'Other';
      appBreakdown[app] = (appBreakdown[app] || 0) + amt;
    });

    const supportersMap = {};
    const donorCounts = {};
    Object.values(canonicalSupporters).forEach(entry => {
      supportersMap[entry.name] = entry.total;
      donorCounts[entry.name] = entry.count;
    });

    const sortedLeaderboard = Object.entries(supportersMap)
      .map(([name, total]) => {
        const donationCount = donorCounts[name] || 1;
        const percentage = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
        return {
          name,
          total,
          formattedTotal: formatCompactCurrency(total),
          donationCount,
          percentage: parseFloat(percentage.toFixed(1))
        };
      })
      .sort((a, b) => b.total - a.total);

    const sortedForRecent = [...validTxs].sort((a, b) => (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0));
    const recentDonations = sortedForRecent.slice(0, 50).map(tx => {
      const curr = tx.currency || 'INR';
      return {
        id: tx.id,
        sender: tx.displayName || tx.sender || 'Unknown',
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

    const donut = computeDonutSegments(filteredTxs);
    const daily = computeDailyTrends(filteredTxs, options.filters?.month);

    return {
      goalAmount: startAmount + totalRevenue,
      totalRevenue,
      startAmount,
      totalCount: filteredTxs.length,
      supporters: supportersMap,
      sortedLeaderboard,
      recentDonations,
      analytics: {
        totalRevenue,
        formattedTotalRevenue: formatCompactCurrency(totalRevenue),
        totalDonationsCount: filteredTxs.length,
        uniqueDonorsCount: Object.keys(supportersMap).length,
        averageDonation: filteredTxs.length > 0 ? (totalRevenue / filteredTxs.length) : 0,
        formattedAverageDonation: formatCompactCurrency(filteredTxs.length > 0 ? (totalRevenue / filteredTxs.length) : 0),
        peakDay: daily.peakDay,
        donut,
        dailyTrends: daily.trends,
        topSupporters: sortedLeaderboard.slice(0, 10),
        appBreakdown
      }
    };
  }

  return {
    CSV_HEADERS,
    CURRENCY_SYMBOLS,
    PROVIDER_METADATA,
    canonicalDonorKey,
    getProviderMeta,
    normalizeProviderKey,
    getCurrencySymbol,
    formatCurrency,
    formatCompactCurrency,
    normalizeDate,
    normalizeTime,
    getMonthKey,
    escapeCsvField,
    formatCsvRow,
    parseCsv,
    serializeCsv,
    filterTransactions,
    filterByTimeframe,
    computeDonutSegments,
    computeDailyTrends,
    computeTimelineData,
    computeMetrics
  };
});
