/**
 * Config schema (version 2).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./canvas-presets'), require('./widget-style'), require('./template-matcher'));
  } else {
    root.ConfigSchema = factory(root.CanvasPresets, root.WidgetStyle, root.TemplateMatcher);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (CanvasPresets, WidgetStyle, TemplateMatcher) {
  'use strict';

  const CONFIG_VERSION = 2;
  const WIDGET_KINDS = ['alert', 'goal', 'leaderboard', 'recent', 'cycling'];

  // ── Full Source Default Code ──────────────────────────────────────
  const DEFAULT_CODE = {
    alert: {
      customHTML: `{{mediaHtml}}
<div class="alert-content">
  <div class="alert-title">{{title}}</div>
  <div class="alert-subtitle">{{subtitle}}</div>
  {{#message}}<div class="alert-message">{{message}}</div>{{/message}}
</div>`,
      customCSS: `/* StreamPe Alert Box */
.alert-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  background: rgba(19, 19, 21, calc(var(--bg-opacity, 85) / 100));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-left: var(--border-width, 4px) solid var(--accent-color, #9146ff);
  border-radius: var(--border-radius, 8px);
  padding: var(--padding, 20px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6), 0 0 25px rgba(145, 70, 255, 0.22);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  font-family: 'Inter', -apple-system, sans-serif;
}

/* Media Positioning */
.alert-box.media-pos-top { flex-direction: column; }
.alert-box.media-pos-left { flex-direction: row; text-align: left; gap: 16px; }
.alert-box.media-pos-right { flex-direction: row-reverse; text-align: right; gap: 16px; }
.alert-box.media-pos-bottom { flex-direction: column-reverse; }

/* Media Elements */
.alert-media { max-width: var(--media-size, 100px); max-height: var(--media-size, 100px); object-fit: contain; border-radius: 6px; }

/* Typography */
.alert-title { font-size: 1.1em; font-weight: 800; margin-bottom: 4px; color: var(--text-color, #ffffff); letter-spacing: -0.01em; }
.alert-subtitle { font-size: 0.75em; color: var(--accent-color, #d5baff); font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
.alert-message { font-size: 0.85em; margin-top: 10px; color: rgba(255, 255, 255, 0.85); font-style: italic; background: rgba(255, 255, 255, 0.05); padding: 6px 12px; border-radius: 4px; }

/* Animations */
@keyframes slideUpIn {
  0% { opacity: 0; transform: translateY(60px) scale(0.96); }
  100% { opacity: 1; transform: translateY(0) scale(1); }
}
.anim-enter-slide-up { animation: slideUpIn var(--anim-duration, 600ms) cubic-bezier(0.16, 1, 0.3, 1) forwards; }`,
      customJS: `console.log('[Alert]', notifData.sender, notifData.amount);`
    },
    goal: {
      customHTML: `<div class="goal-card">
  <div class="goal-header">
    <div class="goal-title-group">
      <div class="goal-title">{{title}}</div>
      {{#subtitle}}<div class="goal-subtitle">{{subtitle}}</div>{{/subtitle}}
    </div>
    {{#endDate}}<div class="goal-end-date">Ends: {{endDate}}</div>{{/endDate}}
  </div>
  <div class="goal-bar-wrapper">
    <div class="goal-bar-fill" style="width: {{percent}};"></div>
    <div class="goal-bar-text">
      <span>{{currentAmount}} ({{percent}})</span>
      <span>{{targetAmount}}</span>
    </div>
  </div>
</div>`,
      customCSS: `.goal-card {
  width: 100%;
  background: rgba(19, 19, 21, calc(var(--goal-bg-opacity, 88) / 100));
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--goal-border-radius, 8px);
  padding: var(--goal-padding, 16px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(145, 70, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Inter', -apple-system, sans-serif;
}
.goal-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.goal-title { font-size: 1.05em; font-weight: 800; color: var(--goal-text-color, #ffffff); letter-spacing: -0.01em; }
.goal-subtitle { font-size: 0.8em; color: var(--goal-accent-color, #d5baff); font-weight: 600; }
.goal-subtitle:empty { display: none; }
.goal-end-date { font-size: 0.75em; color: rgba(255, 255, 255, 0.6); font-weight: 500; }
.goal-bar-wrapper {
  position: relative; width: 100%; height: var(--goal-bar-height, 34px);
  background-color: var(--goal-bar-color, #18181b); border-radius: var(--goal-bar-roundness, 6px); overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.goal-bar-fill {
  height: 100%;
  background: var(--goal-bar-fill-style, linear-gradient(90deg, #9146ff, #d5baff));
  transition: width 0.8s cubic-bezier(0.25, 1, 0.5, 1);
  box-shadow: 0 0 14px rgba(145, 70, 255, 0.45);
  border-radius: var(--goal-bar-roundness, 6px);
}
.goal-bar-text {
  position: absolute; top: 0; left: 0; width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 14px; font-size: 13px; font-weight: 700; color: #ffffff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.8); pointer-events: none;
}`,
      customJS: `console.log('[Goal Sync]');`
    },
    leaderboard: {
      customHTML: `<div class="lb-card">
  <div class="lb-header">
    <svg class="widget-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9146ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"></path><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"></path><path d="M4 22h16"></path><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"></path><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"></path><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"></path></svg>
    <div class="lb-title">{{title}}</div>
  </div>
  <div class="lb-list">
    <!-- Rows are injected by the renderer -->
  </div>
</div>`,
      customCSS: `.lb-card {
  width: 100%;
  background: rgba(19, 19, 21, calc(var(--lb-bg-opacity, 88) / 100));
  border: var(--lb-border-width, 1px) solid var(--lb-border-color, rgba(255, 255, 255, 0.1));
  border-radius: var(--lb-border-radius, 8px);
  padding: var(--lb-padding, 16px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(145, 70, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Inter', -apple-system, sans-serif;
}
.lb-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.lb-title { font-size: 1.05em; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }
.lb-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--lb-row-bg-color, #18181b);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 6px;
  transition: all 0.2s ease;
}
.lb-badge { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11.5px; background: rgba(255, 255, 255, 0.08); color: rgba(255, 255, 255, 0.7); flex-shrink: 0; }
.lb-row.rank-1 { background: rgba(255, 183, 3, 0.08); border-color: rgba(255, 183, 3, 0.45); box-shadow: 0 0 14px rgba(255, 183, 3, 0.12); }
.rank-1 .lb-badge { background: #ffb703; color: #131315; font-weight: 900; box-shadow: 0 0 10px rgba(255, 183, 3, 0.6); }
.rank-1 .lb-amount { color: #ffb703; font-weight: 800; }
.lb-row.rank-2 { background: rgba(213, 186, 255, 0.08); border-color: rgba(213, 186, 255, 0.45); }
.rank-2 .lb-badge { background: rgba(213, 186, 255, 0.22); color: #d5baff; border: 1px solid rgba(213, 186, 255, 0.5); }
.rank-2 .lb-amount { color: #d5baff; font-weight: 750; }
.lb-row.rank-3 { background: rgba(145, 70, 255, 0.06); border-color: rgba(145, 70, 255, 0.35); }
.rank-3 .lb-badge { background: rgba(145, 70, 255, 0.2); color: #c499ff; border: 1px solid rgba(145, 70, 255, 0.5); }
.rank-3 .lb-amount { color: #c499ff; font-weight: 750; }
.lb-amount { font-weight: 700; color: var(--lb-accent-color, #d5baff); font-family: 'Fira Code', 'Consolas', monospace; }`,
      customJS: `console.log('[Leaderboard Sync]');`
    },
    recent: {
      customHTML: `<div class="lb-card">
  <div class="lb-header">
    <svg class="widget-title-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#9146ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"></path><path d="M3 3v5h5"></path><path d="M12 7v5l4 2"></path></svg>
    <div class="lb-title">{{title}}</div>
  </div>
  <div class="lb-list">
    <!-- Rows are injected by the renderer -->
  </div>
</div>`,
      customCSS: `.lb-card {
  width: 100%;
  background: rgba(19, 19, 21, calc(var(--recent-bg-opacity, 88) / 100));
  border: var(--recent-border-width, 1px) solid var(--recent-border-color, rgba(255, 255, 255, 0.1));
  border-radius: var(--recent-border-radius, 8px);
  padding: var(--recent-padding, 16px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(145, 70, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Inter', -apple-system, sans-serif;
}
.lb-header { display: flex; align-items: center; gap: 8px; margin-bottom: 12px; }
.lb-title { font-size: 1.05em; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }
.lb-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--recent-row-bg-color, #18181b);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;
  padding: 8px 12px; margin-bottom: 6px;
  transition: all 0.2s ease;
}
.lb-row:hover { border-color: rgba(145, 70, 255, 0.4); box-shadow: 0 0 12px rgba(145, 70, 255, 0.18); }
.lb-badge { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11.5px; background: rgba(145, 70, 255, 0.18); color: #d5baff; border: 1px solid rgba(145, 70, 255, 0.35); flex-shrink: 0; }
.lb-amount { font-weight: 700; color: var(--recent-accent-color, #d5baff); font-family: 'Fira Code', 'Consolas', monospace; }`,
      customJS: `console.log('[Recent Sync]');`
    },
    list: {
      customHTML: `<div class="lb-card">
  <div class="lb-header">
    <div class="lb-title">{{title}}</div>
  </div>
  <div class="lb-list">
    <!-- Rows are injected by the renderer -->
  </div>
</div>`,
      customCSS: `.lb-card {
  width: 100%;
  background: rgba(19, 19, 21, calc(var(--list-bg-opacity, 88) / 100));
  border: var(--list-border-width, 1px) solid var(--list-border-color, rgba(255, 255, 255, 0.1));
  border-radius: var(--list-border-radius, 8px);
  padding: var(--list-padding, 16px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(145, 70, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Inter', -apple-system, sans-serif;
}
.lb-header { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; }
.lb-title { font-size: 1.05em; font-weight: 800; color: #ffffff; letter-spacing: -0.01em; }
.lb-row {
  display: flex; align-items: center; justify-content: space-between;
  background: var(--list-row-bg-color, #18181b);
  border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px;
  padding: 8px 12px; margin-bottom: 6px;
  transition: all 0.2s ease;
}
.lb-badge { width: 24px; height: 24px; border-radius: 4px; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 11.5px; background: rgba(145, 70, 255, 0.18); color: #d5baff; border: 1px solid rgba(145, 70, 255, 0.35); flex-shrink: 0; }
.lb-amount { font-weight: 700; color: var(--list-accent-color, #d5baff); font-family: 'Fira Code', 'Consolas', monospace; }`,
      customJS: `console.log('[List Sync]');`
    },
    cycling: {
      customHTML: `<div class="cycling-card effect-in-{{transitionIn}}">
  <div class="cycling-icon">{{mediaHtml}}</div>
  <div class="cycling-content">
    <div class="cycling-label">{{label}}</div>
    <div class="cycling-text">{{text}}</div>
  </div>
</div>`,
      customCSS: `.cycling-card {
  background: var(--cycling-bg-color, rgba(19, 19, 21, 0.88));
  border: var(--cycling-border-width, 1px) solid var(--cycling-border-color, rgba(255, 255, 255, 0.12));
  border-radius: var(--cycling-border-radius, 8px);
  padding: var(--cycling-padding, 14px);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.5), 0 0 20px rgba(145, 70, 255, 0.15);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  font-family: 'Inter', -apple-system, sans-serif;
}
.cycling-label { font-size: 11px; text-transform: uppercase; color: var(--cycling-accent-color, #d5baff); font-weight: 800; letter-spacing: 0.05em; }
.cycling-text { font-size: var(--cycling-font-size, 18px); color: var(--cycling-text-color, #ffffff); font-weight: 700; }`,
      customJS: `console.log('[Cycling Widget Sync]');`
    }
  };

  // ── Code Studio & Template Variables Constants ───────────────────
  const TEMPLATE_VARIABLES = {
    alerts: [
      { name: 'title', desc: 'Rendered alert title (e.g. Rahul)' },
      { name: 'subtitle', desc: 'Rendered alert subtitle (e.g. sent ₹500)' },
      { name: 'amount', desc: 'Numeric donation amount (e.g. 500)' },
      { name: 'formattedAmount', desc: 'Formatted amount with currency (e.g. ₹500.00)' },
      { name: 'sender', desc: 'Donor name or alias' },
      { name: 'rawSender', desc: 'Original bank sender name' },
      { name: 'message', desc: 'Donor message or payment note' },
      { name: 'currency', desc: 'Currency code (e.g. INR)' },
      { name: 'providerName', desc: 'Payment app name (e.g. PhonePe)' },
      { name: 'providerKey', desc: 'App key (phonepe, gpay, paytm, etc)' },
      { name: 'sourceApp', desc: 'Source app name (e.g. PhonePe)' },
      { name: 'mediaHtml', desc: 'Rendered media element (<img> or video)' },
      { name: 'time', desc: 'Timestamp (e.g. 10:45 AM)' },
      { name: 'date', desc: 'Formatted date (e.g. Sep 13, 2026)' }
    ],
    goal: [
      { name: 'title', desc: 'Goal title' },
      { name: 'subtitle', desc: 'Goal subtitle' },
      { name: 'current', desc: 'Numeric current accumulated amount' },
      { name: 'target', desc: 'Numeric goal target amount' },
      { name: 'currentAmount', desc: 'Formatted current amount (e.g. ₹1,200)' },
      { name: 'targetAmount', desc: 'Formatted target amount (e.g. ₹5,000)' },
      { name: 'formattedCurrent', desc: 'Formatted current amount' },
      { name: 'formattedTarget', desc: 'Formatted target amount' },
      { name: 'percent', desc: 'Progress percentage string (e.g. 50%)' },
      { name: 'percentage', desc: 'Numeric progress percentage (0-100)' },
      { name: 'endDate', desc: 'Goal end date or deadline' }
    ],
    list: [
      { name: 'title', desc: 'List widget header title' },
      { name: 'count', desc: 'Number of donors/rows displayed' },
      { name: 'max', desc: 'Max allowed rows (e.g. 5)' },
      { name: 'maxEntries', desc: 'Max allowed rows alias' },
      { name: 'totalAmount', desc: 'Numeric total sum of listed donations' },
      { name: 'formattedTotal', desc: 'Formatted total sum (e.g. ₹2,500)' },
      { name: 'items', desc: 'Rows container placeholder element' }
    ],
    cycling: [
      { name: 'label', desc: 'Step label (e.g. Top Supporter / Recent Donation)' },
      { name: 'text', desc: 'Combined display text (e.g. Rahul ₹500)' },
      { name: 'name', desc: 'Donor name (for dynamic top/recent donor steps)' },
      { name: 'amount', desc: 'Numeric donation amount (e.g. 500)' },
      { name: 'formattedAmount', desc: 'Formatted amount with currency (e.g. ₹500)' },
      { name: 'transitionIn', desc: 'Active enter transition effect name' },
      { name: 'transitionEffect', desc: 'Active transition effect alias' },
      { name: 'mediaHtml', desc: 'Optional media HTML / icon element' }
    ]
  };

  const CSS_CLASSES_MAP = {
    alerts: [
      '.alert-box', '.alert-media', '.alert-content', '.alert-sender',
      '.alert-amount', '.alert-message', '.alert-time', '.alert-badge'
    ],
    goal: [
      '.goal-container', '.goal-title', '.goal-amount-text',
      '.goal-bar-container', '.goal-bar-fill', '.goal-percentage'
    ],
    list: [
      '.lb-card', '.lb-header', '.lb-title', '.lb-list',
      '.lb-row', '.lb-badge', '.lb-name', '.lb-amount',
      '.rank-1', '.rank-2', '.rank-3'
    ],
    cycling: [
      '.cycling-card', '.cycling-icon', '.cycling-content',
      '.cycling-label', '.cycling-text'
    ]
  };

  const LIST_CONFIG_PRESETS = {
    'top-supporters': {
      presetKey: 'top-supporters',
      name: 'Top Supporters',
      type: 'leaderboard',
      title: 'Top Supporters',
      maxEntries: 5,
      showAmounts: true,
      isDefault: true,
      isBuiltin: true,
      filter: { provider: 'all', minAmount: 0, timeRange: 'all' },
      accentColor: '#9146ff',
      borderColor: 'rgba(255, 255, 255, 0.12)'
    },
    'recent-donations': {
      presetKey: 'recent-donations',
      name: 'Recent Donations',
      type: 'recent',
      title: 'Recent Donations',
      maxEntries: 5,
      showAmounts: true,
      isDefault: true,
      isBuiltin: true,
      filter: { provider: 'all', minAmount: 0, timeRange: 'all' },
      accentColor: '#9146ff',
      borderColor: 'rgba(255, 255, 255, 0.12)'
    },
    'vip-donors': {
      presetKey: 'vip-donors',
      name: 'VIP Donors (₹500+)',
      type: 'leaderboard',
      title: 'VIP Supporters (₹500+)',
      maxEntries: 5,
      showAmounts: true,
      filter: { provider: 'all', minAmount: 500, timeRange: 'all' },
      accentColor: '#ffb703',
      borderColor: 'rgba(255, 183, 3, 0.3)'
    },
    'phonepe-supporters': {
      presetKey: 'phonepe-supporters',
      name: 'PhonePe Supporters',
      type: 'leaderboard',
      title: 'PhonePe Top Donors',
      maxEntries: 5,
      showAmounts: true,
      filter: { provider: 'phonepe', minAmount: 0, timeRange: 'all' },
      accentColor: '#9146ff',
      borderColor: 'rgba(145, 70, 255, 0.3)'
    },
    'gpay-supporters': {
      presetKey: 'gpay-supporters',
      name: 'Google Pay Supporters',
      type: 'leaderboard',
      title: 'Google Pay Top Donors',
      maxEntries: 5,
      showAmounts: true,
      filter: { provider: 'gpay', minAmount: 0, timeRange: 'all' },
      accentColor: '#d5baff',
      borderColor: 'rgba(213, 186, 255, 0.3)'
    },
    'amazon-pay-supporters': {
      presetKey: 'amazon-pay-supporters',
      name: 'Amazon Pay Supporters',
      type: 'leaderboard',
      title: 'Amazon Pay Donors',
      maxEntries: 5,
      showAmounts: true,
      filter: { provider: 'amazon', minAmount: 0, timeRange: 'all' },
      accentColor: '#ffb703',
      borderColor: 'rgba(255, 183, 3, 0.3)'
    },
    'blank-custom': {
      presetKey: 'blank-custom',
      name: 'Custom List',
      type: 'leaderboard',
      title: 'Custom List',
      maxEntries: 5,
      showAmounts: true,
      filter: { provider: 'all', minAmount: 0, timeRange: 'all' },
      accentColor: '#9146ff',
      borderColor: 'rgba(255, 255, 255, 0.12)'
    }
  };

  const DEFAULT_LIST_BASE = {
    name: 'Top Supporters',
    enabled: true,
    isDefault: false,
    type: 'leaderboard',
    title: 'Top Supporters',
    maxEntries: 5,
    showAmounts: true,
    filter: {
      provider: 'all',
      minAmount: 0,
      timeRange: 'all'
    },
    canvas: { preset: '1080p', width: 1920, height: 1080 },
    text: {
      titleTemplate: 'Top Supporters',
      subtitleTemplate: '',
      fontFamily: 'Inter', fontSize: 15, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
      color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
    },
    style: {
      backgroundColor: '#131315', backgroundOpacity: 88,
      accentColor: '#9146ff', borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.12)', padding: 16,
      rowBgColor: '#18181b'
    },
    animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
    layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
    code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
  };

  const WIDGET_DEFAULTS = {
    alert: {
      enabled: true,
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: '{{sender}} sent {{amount}}',
        subtitleTemplate: '{{sourceApp}} payment received',
        fontFamily: 'Inter', fontSize: 24, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'center', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#131315', backgroundOpacity: 85,
        accentColor: '#9146ff', borderRadius: 8, borderWidth: 4, padding: 20
      },
      animation: { type: 'slide-up', duration: 600, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 400 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    goal: {
      enabled: true,
      allowOverflow: false,
      title: 'Payment Goal',
      currentAmount: 0,
      targetAmount: 5000,
      endDate: '2026-12-31',
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Payment Goal',
        subtitleTemplate: 'Target: ₹{{targetAmount}}',
        fontFamily: 'Inter', fontSize: 18, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#131315', backgroundOpacity: 88,
        accentColor: '#9146ff', borderRadius: 8, borderWidth: 1, padding: 16,
        barHeight: 34, barColor: '#18181b', fillColor: '#9146ff',
        barRoundness: 6, barOpacity: 100, useGradient: true, fillColor2: '#d5baff',
        effect: 'none'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 600 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    leaderboard: {
      enabled: true,
      title: 'Top Supporters',
      maxEntries: 5,
      showAmounts: true,
      supporters: {},
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Top Supporters',
        subtitleTemplate: 'Leaderboard',
        fontFamily: 'Inter', fontSize: 15, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#131315', backgroundOpacity: 88,
        accentColor: '#9146ff', borderRadius: 8, borderWidth: 1, padding: 16,
        rowBgColor: '#18181b'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    recent: {
      enabled: true,
      title: 'Recent Donations',
      maxEntries: 5,
      showAmounts: true,
      recentDonations: [],
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: 'Recent Donations',
        subtitleTemplate: 'Last {{count}} payments',
        fontFamily: 'Inter', fontSize: 15, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3
      },
      style: {
        backgroundColor: '#131315', backgroundOpacity: 88,
        accentColor: '#9146ff', borderRadius: 8, borderWidth: 1, padding: 16,
        rowBgColor: '#18181b'
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 450 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    },
    cycling: {
      enabled: true,
      cycleDuration: 5000,
      transitionIn: 'slide-up',
      transitionOut: 'slide-up',
      transitionInDuration: 500,
      transitionOutDuration: 400,
      transitionEffect: 'slide-up',
      items: [
        { type: 'top_supporter', label: 'Top Supporter', mediaType: 'icon', icon: 'trophy', imageUrl: '' },
        { type: 'recent_donation', label: 'Recent Donation', mediaType: 'icon', icon: 'history', imageUrl: '' }
      ],
      canvas: { preset: '1080p', width: 1920, height: 1080 },
      text: {
        titleTemplate: '', subtitleTemplate: '',
        fontFamily: 'Inter', fontSize: 18, fontSizeUnit: 'px', fontWeight: 700, fontStyle: 'normal',
        color: '#ffffff', textAlign: 'left', textTransform: 'none', letterSpacing: 0, letterSpacingUnit: 'px', lineHeight: 1.3,
        labelFontSize: 11, labelFontSizeUnit: 'px', labelFontWeight: 800, labelColor: '#d5baff', labelTransform: 'uppercase'
      },
      style: {
        backgroundColor: '#131315', backgroundOpacity: 85,
        accentColor: '#9146ff', borderColor: '#ffffff22', borderRadius: 8, borderWidth: 1, padding: 14,
        mediaSize: 30, mediaBgColor: 'rgba(145, 70, 255, 0.15)', mediaRadius: 6
      },
      animation: { type: 'fade-in', duration: 400, displayDuration: 5000 },
      layout: { positionPreset: 'center', positionX: 50, positionY: 50, marginX: 0, marginY: 0, width: 350 },
      code: { enableCustomCode: false, customHTML: '', customCSS: '', customJS: '' }
    }
  };

  const TTS_DEFAULTS = {
    enabled: false,
    template: '{{sender}} sent {{amount}} rupees. {{#if message}}They said: {{message}}{{/if}}',
    provider: 'puter',
    voice: 'Aditi',
    language: 'en-IN',
    engine: 'neural',
    instructions: '',
    rate: 1.0,
    volume: 100,
    delay: 400
  };

  const TEMPLATE_DEFAULTS = {
    name: 'Alert Template',
    enabled: true,
    isDefault: false,
    priority: 0,
    amountFilters: [],
    image: { imageUrl: '', gifUrl: '/media/alert-diamond.gif', position: 'top', size: 100 },
    sound: { soundUrl: '/sounds/notification.wav', soundVolume: 80 },
    tts: TTS_DEFAULTS
  };

  const POSITION_PRESETS = {
    'center': { x: 50, y: 50 },
    'top-left': { x: 10, y: 10 },
    'top-center': { x: 50, y: 10 },
    'top-right': { x: 90, y: 10 },
    'bottom-left': { x: 10, y: 90 },
    'bottom-center': { x: 50, y: 90 },
    'bottom-right': { x: 90, y: 90 }
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function num(value, fallback, min, max) {
    const parsed = typeof value === 'number' ? value : parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    if (min !== undefined && parsed < min) return min;
    if (max !== undefined && parsed > max) return max;
    return parsed;
  }

  function int(value, fallback, min, max) {
    return Math.round(num(value, fallback, min, max));
  }

  function bool(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function str(value, fallback) {
    return typeof value === 'string' ? value : fallback;
  }

  function generateId(prefix) {
    return `${prefix || 'tpl'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function normalizeStyle(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = Object.assign({}, src); // Preserve all existing keys to avoid stripping new fields on older servers
    Object.keys(defaults).forEach(key => {
      const def = defaults[key];
      if (out[key] === undefined) {
        out[key] = def;
      } else {
        if (typeof def === 'boolean') out[key] = bool(src[key], def);
        else if (typeof def === 'number') out[key] = num(src[key], def);
        else out[key] = str(src[key], def);
      }
    });

    // Migrate legacy isTransparent to backgroundOpacity
    if (src.isTransparent === true) {
      out.backgroundOpacity = 0;
    } else if (src.isTransparent === false && src.backgroundOpacity === undefined) {
      out.backgroundOpacity = 100;
    }

    return out;
  }

  function normalizeAnimation(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const def = defaults || { type: 'fade-in', duration: 400, displayDuration: 5000 };
    return {
      type: str(src.type, def.type),
      duration: int(src.duration, def.duration, 0, 10000),
      displayDuration: int(src.displayDuration, def.displayDuration, 200, 120000)
    };
  }

  function normalizeLayout(raw, defaults) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const preset = str(src.positionPreset, defaults ? defaults.positionPreset : 'center');
    const anchor = POSITION_PRESETS[preset];
    const posX = anchor ? anchor.x : (src.positionX !== undefined ? src.positionX : (defaults ? defaults.positionX : 50));
    const posY = anchor ? anchor.y : (src.positionY !== undefined ? src.positionY : (defaults ? defaults.positionY : 50));
    return {
      positionPreset: preset,
      positionX: int(posX, anchor ? anchor.x : 50, 0, 100),
      positionY: int(posY, anchor ? anchor.y : 50, 0, 100),
      marginX: int(src.marginX, defaults ? defaults.marginX : 0, -5000, 5000),
      marginY: int(src.marginY, defaults ? defaults.marginY : 0, -5000, 5000),
      width: int(src.width, defaults ? defaults.width : 400, 40, 10000)
    };
  }

  // Stored code defaults to the baseline source code so that enabling it
  // results in a functional widget immediately, but allows saving empty code.
  function normalizeCode(raw, kind) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const defaults = DEFAULT_CODE[kind] || DEFAULT_CODE.alert;
    return {
      enableCustomCode: bool(src.enableCustomCode, false),
      customHTML: typeof src.customHTML === 'string' ? src.customHTML : defaults.customHTML,
      customCSS: typeof src.customCSS === 'string' ? src.customCSS : defaults.customCSS,
      customJS: typeof src.customJS === 'string' ? src.customJS : defaults.customJS
    };
  }

  function normalizeImage(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      imageUrl: str(src.imageUrl, TEMPLATE_DEFAULTS.image.imageUrl),
      gifUrl: str(src.gifUrl, TEMPLATE_DEFAULTS.image.gifUrl),
      position: str(src.position, TEMPLATE_DEFAULTS.image.position),
      size: int(src.size, TEMPLATE_DEFAULTS.image.size, 10, 1000)
    };
  }

  function normalizeSound(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      soundUrl: str(src.soundUrl, TEMPLATE_DEFAULTS.sound.soundUrl),
      soundVolume: int(src.soundVolume, TEMPLATE_DEFAULTS.sound.soundVolume, 0, 100)
    };
  }

  function normalizeTTS(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: bool(src.enabled, TTS_DEFAULTS.enabled),
      template: str(src.template, TTS_DEFAULTS.template),
      provider: str(src.provider, TTS_DEFAULTS.provider),
      voice: str(src.voice, TTS_DEFAULTS.voice),
      language: str(src.language, TTS_DEFAULTS.language),
      engine: str(src.engine, TTS_DEFAULTS.engine),
      instructions: str(src.instructions, TTS_DEFAULTS.instructions),
      rate: num(src.rate, TTS_DEFAULTS.rate, 0.5, 2.0),
      volume: int(src.volume, TTS_DEFAULTS.volume, 0, 100),
      delay: int(src.delay, TTS_DEFAULTS.delay, 0, 10000)
    };
  }

  function normalizeSupporters(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    Object.keys(src).forEach(name => {
      const amount = num(src[name], 0);
      if (amount > 0) out[name] = amount;
    });
    return out;
  }

  function slugifyName(name) {
    if (!name || typeof name !== 'string') return 'list';
    const slug = name
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'list';
  }

  const ConfigSchema = {
    CONFIG_VERSION,
    WIDGET_KINDS,
    WIDGET_DEFAULTS,
    TEMPLATE_DEFAULTS,
    TTS_DEFAULTS,
    DEFAULT_CODE,
    TEMPLATE_VARIABLES,
    CSS_CLASSES_MAP,
    POSITION_PRESETS,
    generateId,
    clone,
    normalizeTTS,

    LIST_CONFIG_PRESETS,
    DEFAULT_LIST_BASE,
    slugifyName,

    /** Create a URL-safe slug from a list name */
    slugify(name) {
      return slugifyName(name);
    },

    /** Build a complete list config, using a preset key or base defaults. */
    createListConfig(presetKey, overrides) {
      let preset = typeof presetKey === 'string' ? (LIST_CONFIG_PRESETS[presetKey] || LIST_CONFIG_PRESETS['blank-custom']) : null;
      let opts = typeof presetKey === 'object' ? presetKey : (overrides || {});
      if (preset) {
        opts = Object.assign({}, preset, opts);
      }
      const name = str(opts.name, DEFAULT_LIST_BASE.name).trim() || DEFAULT_LIST_BASE.name;
      let slug = opts.id ? slugifyName(opts.id) : slugifyName(name);

      if (presetKey === 'top-supporters' || slug === 'top-supporters' || name.toLowerCase() === 'top supporters') {
        slug = 'top-supporters';
        opts.isBuiltin = true;
        opts.isDefault = true;
      } else if (presetKey === 'recent-donations' || slug === 'recent-donations' || name.toLowerCase() === 'recent donations') {
        slug = 'recent-donations';
        opts.isBuiltin = true;
        opts.isDefault = true;
      }

      const base = clone(DEFAULT_LIST_BASE);
      if (opts.type) base.type = opts.type;
      if (opts.title) base.title = opts.title;
      if (opts.title) base.text.titleTemplate = opts.title;
      if (opts.accentColor) base.style.accentColor = opts.accentColor;
      if (opts.borderColor) base.style.borderColor = opts.borderColor;
      if (opts.filter) base.filter = Object.assign({}, base.filter, opts.filter);
      if (opts.maxEntries !== undefined) base.maxEntries = opts.maxEntries;
      if (opts.showAmounts !== undefined) base.showAmounts = opts.showAmounts;

      return this.normalizeListConfig(Object.assign(base, opts, { id: slug, name }));
    },

    normalizeListConfig(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const base = DEFAULT_LIST_BASE;
      const name = str(src.name, base.name).trim() || base.name;
      let id = slugifyName(src.id || name);
      const isRecent = (id === 'recent-donations' || str(src.type, base.type) === 'recent' || name.toLowerCase() === 'recent donations');
      id = isRecent ? 'recent-donations' : 'top-supporters';
      const type = isRecent ? 'recent' : 'leaderboard';
      const codeKind = isRecent ? 'recent' : 'leaderboard';

      const rawFilter = src.filter && typeof src.filter === 'object' ? src.filter : {};

      return {
        id,
        name: isRecent ? 'Recent Donations' : 'Top Supporters',
        enabled: bool(src.enabled, base.enabled),
        isDefault: true,
        isBuiltin: true,
        type,
        title: str(src.title, isRecent ? 'Recent Donations' : 'Top Supporters'),
        maxEntries: int(src.maxEntries, base.maxEntries, 1, 100),
        showAmounts: bool(src.showAmounts, base.showAmounts),
        filter: {
          provider: str(rawFilter.provider, 'all'),
          minAmount: num(rawFilter.minAmount, 0, 0),
          timeRange: str(rawFilter.timeRange, 'all')
        },
        canvas: CanvasPresets.resolve(src.canvas || base.canvas),
        text: WidgetStyle.normalizeText(src.text, base.text),
        style: normalizeStyle(src.style, base.style),
        animation: normalizeAnimation(src.animation, base.animation),
        layout: normalizeLayout(src.layout, base.layout),
        code: normalizeCode(src.code, codeKind)
      };
    },

    /** Build a complete alert template, using the alert widget defaults as base. */
    createTemplate(overrides) {
      const src = overrides && typeof overrides === 'object' ? overrides : {};
      const base = WIDGET_DEFAULTS.alert;
      return this.normalizeTemplate(Object.assign({
        id: src.id || generateId('tpl'),
        name: TEMPLATE_DEFAULTS.name,
        canvas: clone(base.canvas),
        text: clone(base.text),
        style: clone(base.style),
        animation: clone(base.animation),
        layout: clone(base.layout)
      }, src));
    },

    normalizeTemplate(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const base = WIDGET_DEFAULTS.alert;
      return {
        id: str(src.id, '') || generateId('tpl'),
        name: str(src.name, TEMPLATE_DEFAULTS.name).trim() || TEMPLATE_DEFAULTS.name,
        enabled: bool(src.enabled, TEMPLATE_DEFAULTS.enabled),
        isDefault: bool(src.isDefault, TEMPLATE_DEFAULTS.isDefault),
        priority: int(src.priority, TEMPLATE_DEFAULTS.priority, -1000, 1000),
        amountFilters: (Array.isArray(src.amountFilters) ? src.amountFilters : [])
          .map(f => TemplateMatcher.normalizeFilter(f)),
        image: normalizeImage(src.image),
        sound: normalizeSound(src.sound),
        tts: normalizeTTS(src.tts),
        canvas: CanvasPresets.resolve(src.canvas || base.canvas),
        text: WidgetStyle.normalizeText(src.text, base.text),
        style: normalizeStyle(src.style, base.style),
        animation: normalizeAnimation(src.animation, base.animation),
        layout: normalizeLayout(src.layout, base.layout),
        code: normalizeCode(src.code, 'alert')
      };
    },

    normalizeWidget(kind, raw) {
      const defaults = WIDGET_DEFAULTS[kind] || WIDGET_DEFAULTS.alert;
      const src = raw && typeof raw === 'object' ? raw : {};
      const widget = Object.assign({}, src, { // Preserve all fields
        enabled: bool(src.enabled, defaults.enabled),
        canvas: CanvasPresets.resolve(src.canvas || defaults.canvas),
        text: WidgetStyle.normalizeText(src.text, defaults.text),
        style: normalizeStyle(src.style, defaults.style),
        animation: normalizeAnimation(src.animation, defaults.animation),
        layout: normalizeLayout(src.layout, defaults.layout),
        code: normalizeCode(src.code, kind)
      });

      if (kind === 'goal') {
        widget.allowOverflow = bool(src.allowOverflow, defaults.allowOverflow || false);
        widget.title = str(src.title, defaults.title);
        widget.currentAmount = num(src.currentAmount, defaults.currentAmount);
        widget.targetAmount = num(src.targetAmount, defaults.targetAmount);
        widget.endDate = str(src.endDate, defaults.endDate);
      }
      if (kind === 'leaderboard') {
        widget.title = str(src.title, defaults.title);
        widget.maxEntries = int(src.maxEntries, defaults.maxEntries, 1, 100);
        widget.showAmounts = bool(src.showAmounts, defaults.showAmounts);
        widget.supporters = normalizeSupporters(src.supporters);
      }
      if (kind === 'recent') {
        widget.title = str(src.title, defaults.title);
        widget.maxEntries = int(src.maxEntries, defaults.maxEntries, 1, 100);
        widget.showAmounts = bool(src.showAmounts, defaults.showAmounts);
        widget.recentDonations = Array.isArray(src.recentDonations) ? src.recentDonations : [];
      }
      if (kind === 'cycling') {
        widget.cycleDuration = num(src.cycleDuration, defaults.cycleDuration, 1000, 300000);
        widget.transitionIn = str(src.transitionIn || src.transitionEffect, defaults.transitionIn || 'slide-up');
        widget.transitionOut = str(src.transitionOut || src.transitionEffect, defaults.transitionOut || 'slide-up');
        widget.transitionInDuration = num(src.transitionInDuration, defaults.transitionInDuration || 500, 100, 5000);
        widget.transitionOutDuration = num(src.transitionOutDuration, defaults.transitionOutDuration || 400, 100, 5000);
        widget.transitionEffect = widget.transitionIn;
        const rawItems = Array.isArray(src.items) && src.items.length ? src.items : defaults.items;
        widget.items = rawItems.map(item => {
          const type = str(item.type, 'custom');
          const defaultLabel = type === 'top_supporter' ? 'Top Supporter' : (type === 'recent_donation' ? 'Recent Donation' : '');
          const defaultIcon = type === 'top_supporter' ? 'trophy' : (type === 'recent_donation' ? 'history' : 'star');
          return {
            type,
            label: str(item.label, defaultLabel) || defaultLabel,
            text: str(item.text, ''),
            mediaType: str(item.mediaType, item.imageUrl ? 'image' : 'icon'),
            icon: str(item.icon, defaultIcon) || defaultIcon,
            imageUrl: str(item.imageUrl, '')
          };
        });
      }
      return widget;
    },

    createDefaultConfig() {
      const defaultTemplate = this.createTemplate({ id: 'default', name: 'Default Alert', isDefault: false });
      const blankFallback = this.createTemplate({
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
      const topSupporters = this.createListConfig('top-supporters', { id: 'top-supporters', name: 'Top Supporters', isDefault: true, isBuiltin: true });
      const recentDonations = this.createListConfig('recent-donations', { id: 'recent-donations', name: 'Recent Donations', isDefault: true, isBuiltin: true });

      return {
        version: CONFIG_VERSION,
        activeWidget: 'alert',
        activeTemplateId: defaultTemplate.id,
        alertTemplates: [defaultTemplate, blankFallback],
        activeListConfigId: topSupporters.id,
        listConfigs: [topSupporters, recentDonations],
        widgets: {
          alert: this.normalizeWidget('alert', WIDGET_DEFAULTS.alert),
          goal: this.normalizeWidget('goal', WIDGET_DEFAULTS.goal),
          leaderboard: this.normalizeWidget('leaderboard', WIDGET_DEFAULTS.leaderboard),
          recent: this.normalizeWidget('recent', WIDGET_DEFAULTS.recent),
          cycling: this.normalizeWidget('cycling', WIDGET_DEFAULTS.cycling)
        },
        filter: { allowedAmounts: [] },
        simulation: { isolatedMode: true }
      };
    },

    /**
     * Fill in every missing field of a version-2 config. Safe to run repeatedly.
     * Legacy configs must go through ConfigMigration.migrate first.
     */
    normalizeConfig(raw) {
      const src = raw && typeof raw === 'object' ? raw : {};
      const seenIds = new Set();

      let templates = (Array.isArray(src.alertTemplates) ? src.alertTemplates : [])
        .map(t => this.normalizeTemplate(t))
        .map(t => {
          while (seenIds.has(t.id)) t.id = generateId('tpl');
          seenIds.add(t.id);
          return t;
        });

      if (!templates.length) {
        templates = [this.createTemplate({ id: 'default', name: 'Default Alert', isDefault: true })];
      }
      if (!templates.some(t => t.isDefault)) templates[0].isDefault = true;

      const activeTemplateId = templates.some(t => t.id === src.activeTemplateId)
        ? src.activeTemplateId
        : (templates.find(t => t.isDefault) || templates[0]).id;

      // ── List Configs Normalization (Only Top Supporters and Recent Donations) ──
      const rawListConfigs = Array.isArray(src.listConfigs) ? src.listConfigs : [];
      let topSupporters = rawListConfigs.find(l => l && (l.id === 'top-supporters' || l.type === 'leaderboard'));
      let recentDonations = rawListConfigs.find(l => l && (l.id === 'recent-donations' || l.type === 'recent'));

      topSupporters = this.normalizeListConfig(Object.assign({
        id: 'top-supporters',
        name: 'Top Supporters',
        type: 'leaderboard',
        isDefault: true,
        isBuiltin: true,
        style: (src.widgets && src.widgets.leaderboard && src.widgets.leaderboard.style) || undefined,
        text: (src.widgets && src.widgets.leaderboard && src.widgets.leaderboard.text) || undefined,
        code: (src.widgets && src.widgets.leaderboard && src.widgets.leaderboard.code) || undefined,
        layout: (src.widgets && src.widgets.leaderboard && src.widgets.leaderboard.layout) || undefined,
        canvas: (src.widgets && src.widgets.leaderboard && src.widgets.leaderboard.canvas) || undefined
      }, topSupporters || {}, { id: 'top-supporters', name: 'Top Supporters', type: 'leaderboard', isBuiltin: true, isDefault: true }));

      recentDonations = this.normalizeListConfig(Object.assign({
        id: 'recent-donations',
        name: 'Recent Donations',
        type: 'recent',
        isDefault: true,
        isBuiltin: true,
        style: (src.widgets && src.widgets.recent && src.widgets.recent.style) || undefined,
        text: (src.widgets && src.widgets.recent && src.widgets.recent.text) || undefined,
        code: (src.widgets && src.widgets.recent && src.widgets.recent.code) || undefined,
        layout: (src.widgets && src.widgets.recent && src.widgets.recent.layout) || undefined,
        canvas: (src.widgets && src.widgets.recent && src.widgets.recent.canvas) || undefined
      }, recentDonations || {}, { id: 'recent-donations', name: 'Recent Donations', type: 'recent', isBuiltin: true, isDefault: true }));

      const listConfigs = [topSupporters, recentDonations];
      const activeListConfigId = (src.activeListConfigId === 'recent-donations') ? 'recent-donations' : 'top-supporters';

      const allowedAmounts = ((src.filter && Array.isArray(src.filter.allowedAmounts)) ? src.filter.allowedAmounts : [])
        .map(a => num(a, NaN))
        .filter(a => Number.isFinite(a));

      const isolatedMode = (src.simulation && src.simulation.isolatedMode !== undefined)
        ? !!src.simulation.isolatedMode
        : true;

      return {
        version: CONFIG_VERSION,
        activeWidget: WIDGET_KINDS.indexOf(src.activeWidget) !== -1 ? src.activeWidget : 'alert',
        activeTemplateId,
        alertTemplates: templates,
        activeListConfigId,
        listConfigs,
        widgets: {
          alert: this.normalizeWidget('alert', src.widgets && src.widgets.alert),
          goal: this.normalizeWidget('goal', src.widgets && src.widgets.goal),
          leaderboard: this.normalizeWidget('leaderboard', src.widgets && src.widgets.leaderboard),
          recent: this.normalizeWidget('recent', src.widgets && src.widgets.recent),
          cycling: this.normalizeWidget('cycling', src.widgets && src.widgets.cycling)
        },
        filter: { allowedAmounts },
        simulation: { isolatedMode }
      };
    }
  };

  return ConfigSchema;
});
