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

  function escapeCsvField(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val);
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function getMonthKey(tsOrDate) {
    if (!tsOrDate) {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (typeof tsOrDate === 'string' && /^\d{4}-\d{2}/.test(tsOrDate)) {
      return tsOrDate.substring(0, 7);
    }
    const d = new Date(Number(tsOrDate) || tsOrDate);
    if (isNaN(d.getTime())) {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

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
    if (tx.date && /^\d{4}-\d{2}-\d{2}$/.test(tx.date)) {
      return tx.date;
    }
    const ts = Number(tx.timestamp);
    if (ts && !isNaN(ts)) {
      const d = new Date(ts);
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const da = String(d.getDate()).padStart(2, '0');
      return `${yr}-${mo}-${da}`;
    }
    return '';
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
        if (txDate && txDate < filters.startDate) return false;
      }

      if (filters.endDate) {
        if (txDate && txDate > filters.endDate) return false;
      }

      if (filters.provider && filters.provider !== 'all') {
        const pKey = normalizeProviderKey(tx.sourceApp);
        if (pKey !== filters.provider.toLowerCase()) return false;
      }

      if (filters.search) {
        const q = filters.search.toLowerCase().trim();
        const sMatch = (tx.sender || '').toLowerCase().includes(q);
        const mMatch = (tx.message || '').toLowerCase().includes(q);
        const idMatch = (tx.id || '').toLowerCase().includes(q);
        if (!sMatch && !mMatch && !idMatch) return false;
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
        formattedAmount: formatCurrency(p.totalAmount)
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
      formattedTotal: formatCurrency(totalRevenue),
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
    const supportersMap = {};
    const appBreakdown = {};
    const donorCounts = {};

    filteredTxs.forEach(tx => {
      const amt = parseFloat(tx.amount) || 0;
      totalRevenue += amt;

      const sender = (tx.sender || 'Unknown').trim() || 'Unknown';
      supportersMap[sender] = (supportersMap[sender] || 0) + amt;
      donorCounts[sender] = (donorCounts[sender] || 0) + 1;

      const app = (tx.sourceApp || 'Other').trim() || 'Other';
      appBreakdown[app] = (appBreakdown[app] || 0) + amt;
    });

    const sortedLeaderboard = Object.entries(supportersMap)
      .map(([name, total]) => {
        const donationCount = donorCounts[name] || 1;
        const percentage = totalRevenue > 0 ? (total / totalRevenue) * 100 : 0;
        return {
          name,
          total,
          formattedTotal: formatCurrency(total),
          donationCount,
          percentage: parseFloat(percentage.toFixed(1))
        };
      })
      .sort((a, b) => b.total - a.total);

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
        formattedTotalRevenue: formatCurrency(totalRevenue),
        totalDonationsCount: filteredTxs.length,
        uniqueDonorsCount: Object.keys(supportersMap).length,
        averageDonation: filteredTxs.length > 0 ? (totalRevenue / filteredTxs.length) : 0,
        formattedAverageDonation: formatCurrency(filteredTxs.length > 0 ? (totalRevenue / filteredTxs.length) : 0),
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
    getProviderMeta,
    normalizeProviderKey,
    getCurrencySymbol,
    formatCurrency,
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
