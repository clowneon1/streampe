/**
 * Config Editor UI Controller
 */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  let settings = StorageHelper.getDefaultSettings();
  let activeTextInput = null;
  let currentWidgetKey = 'alert';

  // ── Cache DOM elements (safe — DOM is fully ready here) ──────
  const elements = {
    iframe: document.getElementById('preview-iframe'),
    btnSave: document.getElementById('btn-save'),
    btnTest: document.getElementById('btn-test'),
    btnExport: document.getElementById('btn-export'),
    btnImport: document.getElementById('btn-import'),
    btnReset: document.getElementById('btn-reset'),
    fileInput: document.getElementById('file-import-input'),
    toast: document.getElementById('toast'),

    // Target Widget Selector
    selectTargetWidget: document.getElementById('select-target-widget'),
    widgetUrlDisplay: document.getElementById('widget-url-display'),

    // Profile Controls
    selectProfile: document.getElementById('select-profile'),
    btnProfileNew: document.getElementById('btn-profile-new'),
    btnProfileRename: document.getElementById('btn-profile-rename'),
    btnProfileDelete: document.getElementById('btn-profile-delete'),
    btnProfileExport: document.getElementById('btn-profile-export'),
    btnProfileImport: document.getElementById('btn-profile-import'),
    fileProfileInput: document.getElementById('file-import-profile-input'),

    // Dedicated Goal & Leaderboard Export/Import
    btnGoalExport: document.getElementById('btn-goal-export'),
    btnGoalImport: document.getElementById('btn-goal-import'),
    fileGoalInput: document.getElementById('file-import-goal-input'),
    btnLbExport: document.getElementById('btn-lb-export'),
    btnLbImport: document.getElementById('btn-lb-import'),
    fileLbInput: document.getElementById('file-import-lb-input'),

    // Text Tab
    titleTemplate: document.getElementById('input-title-template'),
    subtitleTemplate: document.getElementById('input-subtitle-template'),
    fontSize: document.getElementById('input-font-size'),
    fontFamily: document.getElementById('input-font-family'),
    fontBold: document.getElementById('chk-font-bold'),
    fontItalic: document.getElementById('chk-font-italic'),
    textTransform: document.getElementById('select-text-transform'),
    textAlign: document.getElementById('select-text-align'),

    // Media Tab
    imageUrl: document.getElementById('input-image-url'),
    soundUrl: document.getElementById('input-sound-url'),
    soundVolume: document.getElementById('input-sound-volume'),
    btnTestSound: document.getElementById('btn-test-sound'),
    mediaPosition: document.getElementById('select-media-position'),
    mediaSize: document.getElementById('input-media-size'),

    // Style Tab
    bgColor: document.getElementById('input-bg-color'),
    bgColorHex: document.getElementById('input-bg-color-hex'),
    bgOpacity: document.getElementById('input-bg-opacity'),
    chkTransparentBg: document.getElementById('chk-transparent-bg'),
    accentColor: document.getElementById('input-accent-color'),
    accentColorHex: document.getElementById('input-accent-color-hex'),
    textColor: document.getElementById('input-text-color'),
    textColorHex: document.getElementById('input-text-color-hex'),
    borderWidth: document.getElementById('input-border-width'),
    borderRadius: document.getElementById('input-border-radius'),
    padding: document.getElementById('input-padding'),

    // Animation Tab
    animType: document.getElementById('select-anim-type'),
    animDuration: document.getElementById('input-anim-duration'),
    displayDuration: document.getElementById('input-display-duration'),

    // Advanced Tab
    canvasPreset: document.getElementById('select-canvas-preset'),
    canvasWidth: document.getElementById('input-canvas-width'),
    canvasHeight: document.getElementById('input-canvas-height'),
    positionPreset: document.getElementById('select-position-preset'),
    positionX: document.getElementById('input-position-x'),
    positionY: document.getElementById('input-position-y'),
    marginX: document.getElementById('input-margin-x'),
    marginY: document.getElementById('input-margin-y'),
    width: document.getElementById('input-width'),
    chkEnableCustomCode: document.getElementById('chk-enable-custom-code'),
    customHTML: document.getElementById('input-custom-html'),
    customCSS: document.getElementById('input-custom-css'),
    customJS: document.getElementById('input-custom-js'),
    btnResetAlertCode: document.getElementById('btn-reset-alert-code'),

    // Goal Tab
    chkEnableGoal: document.getElementById('chk-enable-goal'),
    goalTitle: document.getElementById('input-goal-title'),
    goalTarget: document.getElementById('input-goal-target'),
    goalCurrent: document.getElementById('input-goal-current'),
    goalStart: document.getElementById('input-goal-start'),
    goalEndDate: document.getElementById('input-goal-end-date'),
    goalFillColor: document.getElementById('input-goal-fill-color'),
    goalFillColorHex: document.getElementById('input-goal-fill-color-hex'),
    goalBarColor: document.getElementById('input-goal-bar-color'),
    goalBarColorHex: document.getElementById('input-goal-bar-color-hex'),
    goalBarHeight: document.getElementById('input-goal-bar-height'),
    goalFont: document.getElementById('select-goal-font'),
    chkGoalTransparentBg: document.getElementById('chk-goal-transparent-bg'),
    chkEnableGoalCustomCode: document.getElementById('chk-enable-goal-custom-code'),
    goalCustomHTML: document.getElementById('input-goal-custom-html'),
    goalCustomCSS: document.getElementById('input-goal-custom-css'),
    goalCustomJS: document.getElementById('input-goal-custom-js'),
    btnGoalTestAdd: document.getElementById('btn-goal-test-add'),
    btnGoalReset: document.getElementById('btn-goal-reset'),
    btnResetGoalCode: document.getElementById('btn-reset-goal-code'),

    // Leaderboard Tab
    chkEnableLb: document.getElementById('chk-enable-lb'),
    lbTitle: document.getElementById('input-lb-title'),
    lbMax: document.getElementById('select-lb-max'),
    lbAccentColor: document.getElementById('input-lb-accent-color'),
    lbAccentColorHex: document.getElementById('input-lb-accent-color-hex'),
    lbFont: document.getElementById('select-lb-font'),
    lbRowBgColor: document.getElementById('input-lb-row-bg-color'),
    lbRowBgColorHex: document.getElementById('input-lb-row-bg-color-hex'),
    chkLbShowAmounts: document.getElementById('chk-lb-show-amounts'),
    chkLbTransparentBg: document.getElementById('chk-lb-transparent-bg'),
    chkEnableLbCustomCode: document.getElementById('chk-enable-lb-custom-code'),
    lbCustomHTML: document.getElementById('input-lb-custom-html'),
    lbCustomCSS: document.getElementById('input-lb-custom-css'),
    lbCustomJS: document.getElementById('input-lb-custom-js'),
    lbTableBody: document.getElementById('lb-table-body'),
    btnLbClearAll: document.getElementById('btn-lb-clear-all'),
    btnResetLbCode: document.getElementById('btn-reset-lb-code')
  };

  const DEFAULT_CUSTOM_HTML = `{{mediaHtml}}\n<div class="alert-content">\n  <div class="alert-title">{{sender}} sent {{amount}}</div>\n  <div class="alert-subtitle">{{sourceApp}} payment received</div>\n</div>`;
  const DEFAULT_CUSTOM_CSS = `/* Custom Overlay CSS Reference */\n/* .alert-box { border-left: none !important; } */\n/* .alert-title { font-weight: bold; text-transform: uppercase; } */\n/* .alert-subtitle { color: var(--accent-color); } */\n/* .alert-media { max-width: 150px; } */`;
  const DEFAULT_CUSTOM_JS = `// Custom JavaScript executed on alert trigger\n// Available parameters: notifData, alertBox, settings\nconsole.log('[Alert Triggered]', notifData.sender, notifData.amount);`;

  const DEFAULT_GOAL_HTML = `<div class="goal-card">\n  <div class="goal-header">\n    <div class="goal-title">{{title}}</div>\n    {{#endDate}}<div class="goal-end-date">Ends: {{endDate}}</div>{{/endDate}}\n  </div>\n  <div class="goal-bar-wrapper">\n    <div class="goal-bar-fill" style="width: {{percent}};"></div>\n    <div class="goal-bar-text">\n      <span>{{currentAmount}} ({{percent}})</span>\n      <span>{{targetAmount}}</span>\n    </div>\n  </div>\n</div>`;
  const DEFAULT_GOAL_CSS = `/* Custom Goal CSS */\n/* .goal-card { background: rgba(10, 14, 23, 0.95) !important; } */\n/* .goal-bar-fill { background: linear-gradient(90deg, #00e5ff, #7ce3ff) !important; } */`;
  const DEFAULT_GOAL_JS = `// Custom Payment Goal JavaScript Hook\nconsole.log('[Goal Widget Sync]');`;

  const DEFAULT_LB_HTML = `<div class="lb-card">\n  <div class="lb-header">\n    <span style="font-size: 22px;">🏆</span>\n    <div class="lb-title">{{title}}</div>\n  </div>\n  <div class="lb-list">\n    <!-- Supporters rows dynamically loaded -->\n  </div>\n</div>`;
  const DEFAULT_LB_CSS = `/* Top Supporters Leaderboard Custom CSS */\n/* .lb-card { border-color: rgba(0, 229, 255, 0.4) !important; } */\n/* .lb-row.rank-1 { background: rgba(255, 215, 0, 0.15) !important; } */`;
  const DEFAULT_LB_JS = `// Custom Leaderboard JavaScript Hook\nconsole.log('[Leaderboard Widget Sync]');`;

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => {
      elements.toast.classList.remove('show');
    }, 3000);
  }



  function readFormValues() {
    const currentWidgetData = {
      text: {
        titleTemplate: elements.titleTemplate.value,
        subtitleTemplate: elements.subtitleTemplate.value,
        fontSize: parseInt(elements.fontSize.value) || 24,
        fontFamily: elements.fontFamily.value,
        fontBold: elements.fontBold ? elements.fontBold.checked : true,
        fontItalic: elements.fontItalic ? elements.fontItalic.checked : false,
        textTransform: elements.textTransform ? elements.textTransform.value : 'none',
        textAlign: elements.textAlign ? elements.textAlign.value : 'center'
      },
      media: {
        imageUrl: elements.imageUrl.value.trim(),
        soundUrl: elements.soundUrl.value.trim(),
        soundVolume: elements.soundVolume ? (!isNaN(parseInt(elements.soundVolume.value)) ? parseInt(elements.soundVolume.value) : 80) : 80,
        position: elements.mediaPosition.value,
        size: parseInt(elements.mediaSize.value) || 100
      },
      style: {
        backgroundColor: elements.bgColor.value,
        backgroundOpacity: parseInt(elements.bgOpacity.value) || 60,
        isTransparent: elements.chkTransparentBg.checked,
        accentColor: elements.accentColor.value,
        textColor: elements.textColor.value,
        borderRadius: parseInt(elements.borderRadius.value) !== undefined ? parseInt(elements.borderRadius.value) : 12,
        borderWidth: parseInt(elements.borderWidth.value) !== undefined ? parseInt(elements.borderWidth.value) : 5,
        padding: parseInt(elements.padding.value) || 20,
        barHeight: elements.goalBarHeight ? parseInt(elements.goalBarHeight.value) || 36 : 36,
        barColor: elements.goalBarColor ? elements.goalBarColor.value : '#1e2433',
        fillColor: elements.goalFillColor ? elements.goalFillColor.value : '#00e5ff'
      },
      animation: {
        type: elements.animType.value,
        duration: parseInt(elements.animDuration.value) || 600,
        displayDuration: parseInt(elements.displayDuration.value) || 5000
      },
      advanced: {
        canvasWidth: elements.canvasWidth ? (parseInt(elements.canvasWidth.value) || 1920) : 1920,
        canvasHeight: elements.canvasHeight ? (parseInt(elements.canvasHeight.value) || 1080) : 1080,
        positionPreset: elements.positionPreset ? elements.positionPreset.value : 'center',
        positionX: elements.positionX ? (parseInt(elements.positionX.value) || 50) : 50,
        positionY: elements.positionY ? (parseInt(elements.positionY.value) || 50) : 50,
        marginX: elements.marginX ? (parseInt(elements.marginX.value) || 0) : 0,
        marginY: elements.marginY ? (parseInt(elements.marginY.value) || 0) : 0,
        width: elements.width ? (parseInt(elements.width.value) || 400) : 400,
        enableCustomCode: elements.chkEnableCustomCode ? elements.chkEnableCustomCode.checked : true,
        customHTML: elements.customHTML ? elements.customHTML.value : '',
        customCSS: elements.customCSS ? elements.customCSS.value : '',
        customJS: elements.customJS ? elements.customJS.value : ''
      }
    };

    if (!settings.widgets) settings.widgets = {};
    settings.widgets[currentWidgetKey] = {
      ...(settings.widgets[currentWidgetKey] || {}),
      ...currentWidgetData
    };

    // Keep top-level compatibility for active widget
    settings.text = currentWidgetData.text;
    settings.media = currentWidgetData.media;
    settings.style = currentWidgetData.style;
    settings.animation = currentWidgetData.animation;
    settings.advanced = currentWidgetData.advanced;

    settings.goal = {
      enableGoal: elements.chkEnableGoal ? elements.chkEnableGoal.checked : true,
      title: elements.goalTitle ? elements.goalTitle.value : 'Payment Goal',
      startAmount: elements.goalStart ? parseFloat(elements.goalStart.value) || 0 : 0,
      currentAmount: elements.goalCurrent ? parseFloat(elements.goalCurrent.value) || 0 : 0,
      targetAmount: elements.goalTarget ? parseFloat(elements.goalTarget.value) || 5000 : 5000,
      endDate: elements.goalEndDate ? elements.goalEndDate.value : '',
      barHeight: elements.goalBarHeight ? parseInt(elements.goalBarHeight.value) || 36 : 36,
      barColor: elements.goalBarColor ? elements.goalBarColor.value : '#1e2433',
      fillColor: elements.goalFillColor ? elements.goalFillColor.value : '#00e5ff',
      textColor: elements.textColor.value,
      fontFamily: elements.fontFamily.value,
      isTransparent: elements.chkGoalTransparentBg ? elements.chkGoalTransparentBg.checked : false,
      enableCustomCode: elements.chkEnableGoalCustomCode ? elements.chkEnableGoalCustomCode.checked : true,
      customHTML: elements.goalCustomHTML ? elements.goalCustomHTML.value : (elements.customHTML ? elements.customHTML.value : ''),
      customCSS: elements.goalCustomCSS ? elements.goalCustomCSS.value : (elements.customCSS ? elements.customCSS.value : ''),
      customJS: elements.goalCustomJS ? elements.goalCustomJS.value : (elements.customJS ? elements.customJS.value : '')
    };

    settings.leaderboard = {
      enableLeaderboard: elements.chkEnableLb ? elements.chkEnableLb.checked : true,
      title: elements.lbTitle ? elements.lbTitle.value : 'Top Supporters',
      maxEntries: elements.lbMax ? parseInt(elements.lbMax.value) || 5 : 5,
      showAmounts: elements.chkLbShowAmounts ? elements.chkLbShowAmounts.checked : true,
      accentColor: elements.lbAccentColor ? elements.lbAccentColor.value : '#00e5ff',
      rowBgColor: elements.lbRowBgColor ? elements.lbRowBgColor.value : '#1a1e2b',
      fontFamily: elements.fontFamily.value,
      supporters: settings.leaderboard ? settings.leaderboard.supporters || {} : {},
      isTransparent: elements.chkLbTransparentBg ? elements.chkLbTransparentBg.checked : false,
      enableCustomCode: elements.chkEnableLbCustomCode ? elements.chkEnableLbCustomCode.checked : true,
      customHTML: elements.lbCustomHTML ? elements.lbCustomHTML.value : (elements.customHTML ? elements.customHTML.value : ''),
      customCSS: elements.lbCustomCSS ? elements.lbCustomCSS.value : (elements.customCSS ? elements.customCSS.value : ''),
      customJS: elements.lbCustomJS ? elements.lbCustomJS.value : (elements.customJS ? elements.customJS.value : '')
    };

    settings.activeWidget = currentWidgetKey;
    return settings;
  }

  function renderSupportersTable() {
    if (!elements.lbTableBody) return;
    const supporters = settings.leaderboard ? settings.leaderboard.supporters || {} : {};
    const sorted = Object.keys(supporters)
      .map(name => ({ name, amount: parseFloat(supporters[name]) || 0 }))
      .filter(item => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    if (sorted.length === 0) {
      elements.lbTableBody.innerHTML = `<tr><td colspan="3" style="padding: 10px; text-align: center; color: var(--text-muted);">No supporters recorded yet.</td></tr>`;
      return;
    }

    elements.lbTableBody.innerHTML = sorted.map(item => `
      <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
        <td style="padding: 6px; font-weight: 600;">${TemplateEngine.escapeHtml(item.name)}</td>
        <td style="padding: 6px; color: var(--accent); font-weight: 700;">₹${item.amount.toLocaleString('en-IN')}</td>
        <td style="padding: 6px; text-align: right;">
          <button class="snippet-btn btn-delete-supporter" data-name="${TemplateEngine.escapeHtml(item.name)}" style="padding: 2px 6px; font-size: 10px;">🗑️ Delete</button>
        </td>
      </tr>
    `).join('');

    elements.lbTableBody.querySelectorAll('.btn-delete-supporter').forEach(btn => {
      btn.addEventListener('click', () => {
        const name = btn.dataset.name;
        if (name && settings.leaderboard && settings.leaderboard.supporters) {
          delete settings.leaderboard.supporters[name];
          renderSupportersTable();
          syncLivePreview();
        }
      });
    });
  }

  function populateForm(s) {
    settings = StorageHelper.mergeWithDefaults(s);
    if (elements.selectTargetWidget) {
      currentWidgetKey = elements.selectTargetWidget.value || settings.activeWidget || 'alert';
    }

    const widgetData = (settings.widgets && settings.widgets[currentWidgetKey]) ? settings.widgets[currentWidgetKey] : settings;
    const textData = widgetData.text || settings.text;
    const mediaData = widgetData.media || settings.media;
    const styleData = widgetData.style || settings.style;
    const animData = widgetData.animation || settings.animation;
    const advData = widgetData.advanced || settings.advanced;

    // Text Tab
    elements.titleTemplate.value = textData.titleTemplate || '';
    elements.subtitleTemplate.value = textData.subtitleTemplate || '';
    elements.fontSize.value = textData.fontSize || 24;
    elements.fontFamily.value = textData.fontFamily || 'Inter';
    if (elements.fontBold) elements.fontBold.checked = textData.fontBold !== undefined ? !!textData.fontBold : true;
    if (elements.fontItalic) elements.fontItalic.checked = !!textData.fontItalic;
    if (elements.textTransform) elements.textTransform.value = textData.textTransform || 'none';
    if (elements.textAlign) elements.textAlign.value = textData.textAlign || 'center';

    // Media Tab
    elements.imageUrl.value = mediaData.imageUrl || mediaData.gifUrl || '';
    elements.soundUrl.value = mediaData.soundUrl || '';
    if (elements.soundVolume) elements.soundVolume.value = mediaData.soundVolume !== undefined ? mediaData.soundVolume : 80;
    elements.mediaPosition.value = mediaData.position || 'top';
    elements.mediaSize.value = mediaData.size || 100;

    // Style Tab
    elements.bgColor.value = styleData.backgroundColor || '#000000';
    elements.bgColorHex.value = styleData.backgroundColor || '#000000';
    elements.bgOpacity.value = styleData.backgroundOpacity !== undefined ? styleData.backgroundOpacity : 60;
    elements.chkTransparentBg.checked = !!styleData.isTransparent;
    elements.accentColor.value = styleData.accentColor || '#00e5ff';
    elements.accentColorHex.value = styleData.accentColor || '#00e5ff';
    elements.textColor.value = styleData.textColor || '#ffffff';
    elements.textColorHex.value = styleData.textColor || '#ffffff';
    elements.borderWidth.value = styleData.borderWidth !== undefined ? styleData.borderWidth : 5;
    elements.borderRadius.value = styleData.borderRadius !== undefined ? styleData.borderRadius : 12;
    elements.padding.value = styleData.padding || 20;

    // Animation Tab
    elements.animType.value = animData.type || 'slide-up';
    elements.animDuration.value = animData.duration || 600;
    elements.displayDuration.value = animData.displayDuration || 5000;

    // Advanced Section
    if (elements.canvasWidth) elements.canvasWidth.value = advData.canvasWidth || 1920;
    if (elements.canvasHeight) elements.canvasHeight.value = advData.canvasHeight || 1080;
    if (elements.positionPreset) elements.positionPreset.value = advData.positionPreset || 'center';
    if (elements.marginX) elements.marginX.value = advData.marginX || 0;
    if (elements.marginY) elements.marginY.value = advData.marginY || 0;
    if (elements.chkEnableCustomCode) {
      elements.chkEnableCustomCode.checked = advData.enableCustomCode !== undefined ? !!advData.enableCustomCode : true;
    }
    if (elements.customHTML) elements.customHTML.value = advData.customHTML !== undefined && advData.customHTML !== null && advData.customHTML.trim() !== '' ? advData.customHTML : DEFAULT_CUSTOM_HTML;
    if (elements.customCSS) elements.customCSS.value = advData.customCSS !== undefined && advData.customCSS !== null && advData.customCSS.trim() !== '' ? advData.customCSS : DEFAULT_CUSTOM_CSS;
    if (elements.customJS) elements.customJS.value = advData.customJS !== undefined && advData.customJS !== null && advData.customJS.trim() !== '' ? advData.customJS : DEFAULT_CUSTOM_JS;
    if (elements.positionX) elements.positionX.value = advData.positionX !== undefined ? advData.positionX : 50;
    if (elements.positionY) elements.positionY.value = advData.positionY !== undefined ? advData.positionY : 50;
    if (elements.width) elements.width.value = advData.width || 400;

    // Goal Tab
    if (elements.chkEnableGoal) elements.chkEnableGoal.checked = settings.goal.enableGoal !== false;
    if (elements.goalTitle) elements.goalTitle.value = settings.goal.title || 'Stream Goal';
    if (elements.goalTarget) elements.goalTarget.value = settings.goal.targetAmount !== undefined ? settings.goal.targetAmount : 5000;
    if (elements.goalCurrent) elements.goalCurrent.value = settings.goal.currentAmount !== undefined ? settings.goal.currentAmount : 0;
    if (elements.goalStart) elements.goalStart.value = settings.goal.startAmount !== undefined ? settings.goal.startAmount : 0;
    if (elements.goalEndDate) elements.goalEndDate.value = settings.goal.endDate || '';
    if (elements.goalFillColor) elements.goalFillColor.value = settings.goal.fillColor || '#00e5ff';
    if (elements.goalFillColorHex) elements.goalFillColorHex.value = settings.goal.fillColor || '#00e5ff';
    if (elements.goalBarColor) elements.goalBarColor.value = settings.goal.barColor || '#1e2433';
    if (elements.goalBarColorHex) elements.goalBarColorHex.value = settings.goal.barColor || '#1e2433';
    if (elements.goalBarHeight) elements.goalBarHeight.value = settings.goal.barHeight || 36;
    if (elements.goalFont) elements.goalFont.value = settings.goal.fontFamily || 'Inter';
    if (elements.chkGoalTransparentBg) elements.chkGoalTransparentBg.checked = !!(settings.goal && settings.goal.isTransparent);
    if (elements.chkEnableGoalCustomCode) elements.chkEnableGoalCustomCode.checked = (settings.goal && settings.goal.enableCustomCode !== false);

    if (elements.goalCustomHTML) elements.goalCustomHTML.value = (settings.goal && settings.goal.customHTML && settings.goal.customHTML.trim()) ? settings.goal.customHTML : DEFAULT_GOAL_HTML;
    if (elements.goalCustomCSS) elements.goalCustomCSS.value = (settings.goal && settings.goal.customCSS && settings.goal.customCSS.trim()) ? settings.goal.customCSS : DEFAULT_GOAL_CSS;
    if (elements.goalCustomJS) elements.goalCustomJS.value = (settings.goal && settings.goal.customJS && settings.goal.customJS.trim()) ? settings.goal.customJS : DEFAULT_GOAL_JS;

    // Leaderboard Tab
    if (elements.chkEnableLb) elements.chkEnableLb.checked = settings.leaderboard.enableLeaderboard !== false;
    if (elements.lbTitle) elements.lbTitle.value = settings.leaderboard.title || 'Top Supporters';
    if (elements.lbMax) elements.lbMax.value = settings.leaderboard.maxEntries || 5;
    if (elements.lbAccentColor) elements.lbAccentColor.value = settings.leaderboard.accentColor || '#00e5ff';
    if (elements.lbAccentColorHex) elements.lbAccentColorHex.value = settings.leaderboard.accentColor || '#00e5ff';
    if (elements.lbFont) elements.lbFont.value = settings.leaderboard.fontFamily || 'Inter';
    if (elements.lbRowBgColor) elements.lbRowBgColor.value = settings.leaderboard.rowBgColor || '#1a1e2b';
    if (elements.lbRowBgColorHex) elements.lbRowBgColorHex.value = settings.leaderboard.rowBgColor || '#1a1e2b';
    if (elements.lbRowAlign) elements.lbRowAlign.value = settings.leaderboard.rowAlign || 'space-between';
    if (elements.chkLbShowAmounts) elements.chkLbShowAmounts.checked = settings.leaderboard.showAmounts !== false;
    if (elements.chkLbTransparentBg) elements.chkLbTransparentBg.checked = !!(settings.leaderboard && settings.leaderboard.isTransparent);
    if (elements.chkEnableLbCustomCode) elements.chkEnableLbCustomCode.checked = (settings.leaderboard && settings.leaderboard.enableCustomCode !== false);

    if (elements.lbCustomHTML) elements.lbCustomHTML.value = (settings.leaderboard && settings.leaderboard.customHTML && settings.leaderboard.customHTML.trim()) ? settings.leaderboard.customHTML : DEFAULT_LB_HTML;
    if (elements.lbCustomCSS) elements.lbCustomCSS.value = (settings.leaderboard && settings.leaderboard.customCSS && settings.leaderboard.customCSS.trim()) ? settings.leaderboard.customCSS : DEFAULT_LB_CSS;
    if (elements.lbCustomJS) elements.lbCustomJS.value = (settings.leaderboard && settings.leaderboard.customJS && settings.leaderboard.customJS.trim()) ? settings.leaderboard.customJS : DEFAULT_LB_JS;

    renderSupportersTable();
    updateValueDisplays();
    updateSnippetButtonStates();
    syncLivePreview();
  }

  function updateValueDisplays() {
    document.querySelectorAll('.val-display').forEach(el => {
      const targetId = el.dataset.target;
      const inputEl = document.getElementById(targetId);
      if (inputEl) {
        let suffix = el.dataset.suffix || '';
        el.textContent = inputEl.value + suffix;
      }
    });
  }

  function syncLivePreview() {
    settings = readFormValues();
    if (elements.iframe && elements.iframe.contentWindow) {
      elements.iframe.contentWindow.postMessage({
        type: 'SETTINGS_UPDATED',
        payload: settings
      }, '*');
    }
  }

  async function sendTestAlert() {
    syncLivePreview();

    // Rotate realistic sample supporters for simulation
    const sampleSupporters = [
      { sender: 'Rahul Kumar', amount: '₹500', sourceApp: 'PhonePe', message: 'Awesome stream! 🚀' },
      { sender: 'Priya Singh', amount: '₹1000', sourceApp: 'Google Pay', message: 'Keep up the great work! ❤️' },
      { sender: 'Amit Verma', amount: '₹250', sourceApp: 'Paytm', message: 'Chai paani subscription ☕' },
      { sender: 'Ankit Sharma', amount: '₹750', sourceApp: 'PhonePe', message: 'Superchat donation 🔥' },
      { sender: 'Sneha Patel', amount: '₹300', sourceApp: 'BHIM UPI', message: 'Great gameplay! 🎮' }
    ];

    const sample = sampleSupporters[Math.floor(Math.random() * sampleSupporters.length)];
    const testData = {
      ...sample,
      timestamp: Date.now()
    };

    // 1. Trigger live preview iframe alert
    if (elements.iframe && elements.iframe.contentWindow) {
      elements.iframe.contentWindow.postMessage({
        type: 'TRIGGER_TEST_ALERT',
        data: testData
      }, '*');
    }

    // 2. Trigger connected live OBS overlay clients & server simulation (Goal + Leaderboard)
    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });
      const data = await res.json();
      if (data.ok) {
        // Fetch updated settings with goal & leaderboard values
        const updatedSettings = await StorageHelper.loadServer();
        settings = updatedSettings;
        populateForm(settings);
      }
    } catch (e) {
      console.warn('[Config] Live overlay test trigger error:', e.message);
    }
  }

  // ── Tab Switching ──────────────────────────────────────────
  const TAB_PREVIEW_URLS = {
    goal: '/overlay/goal',
    leaderboard: '/overlay/leaderboard'
  };
  let lastPreviewTab = 'alert';

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

        btn.classList.add('active');
        const targetTab = btn.dataset.tab;
        const tabEl = document.getElementById(`tab-${targetTab}`);
        if (tabEl) tabEl.classList.add('active');

        if (!elements.iframe) return;

        const previewUrl = TAB_PREVIEW_URLS[targetTab] || '/overlay/alert';
        const comingBackToAlert = targetTab !== 'goal' && targetTab !== 'leaderboard';

        if (elements.iframe.src !== location.origin + previewUrl) {
          elements.iframe.src = previewUrl;

          // When switching back to alert tab, re-trigger test alert after iframe loads
          if (comingBackToAlert) {
            const onLoad = () => {
              elements.iframe.removeEventListener('load', onLoad);
              // Give overlay time to connect, then send settings + test alert
              setTimeout(() => {
                syncLivePreview();
                const sampleSupporters = [
                  { sender: 'Rahul Kumar', amount: '₹500', sourceApp: 'PhonePe', message: 'Awesome stream! 🚀' },
                  { sender: 'Priya Singh', amount: '₹1000', sourceApp: 'Google Pay', message: 'Keep it up! ❤️' },
                  { sender: 'Amit Verma', amount: '₹250', sourceApp: 'Paytm', message: 'Chai paani ☕' },
                ];
                const sample = sampleSupporters[Math.floor(Math.random() * sampleSupporters.length)];
                if (elements.iframe.contentWindow) {
                  elements.iframe.contentWindow.postMessage({ type: 'TRIGGER_TEST_ALERT', data: { ...sample, timestamp: Date.now() } }, '*');
                }
              }, 300);
            };
            elements.iframe.addEventListener('load', onLoad);
          }
        }

        lastPreviewTab = targetTab;
      });
    });
  }

  // ── Code Editor Tabs Switching ─────────────────────────────────
  function setupCodeEditorTabs() {
    document.querySelectorAll('.code-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.code-editor-container');
        if (!container) return;
        const targetTab = btn.dataset.codeTab; // 'html' | 'css' | 'js'

        container.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        container.querySelectorAll('.code-tab-panel').forEach(panel => {
          if (panel.dataset.codePanel === targetTab) {
            panel.style.display = 'block';
          } else {
            panel.style.display = 'none';
          }
        });
      });
    });
  }

  // ── Variable Pills Handling ─────────────────────────────────
  function setupVariablePills() {
    let activeInputEl = elements.titleTemplate;

    // Track active focused text input/textarea across all tabs
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
      input.addEventListener('focus', () => { activeInputEl = input; });
    });

    document.querySelectorAll('.var-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const varName = pill.dataset.var;
        const targetId = pill.dataset.targetInput;
        let targetEl = activeInputEl;

        if (targetId && document.getElementById(targetId)) {
          targetEl = document.getElementById(targetId);
        }
        if (!targetEl) targetEl = elements.titleTemplate;

        const start = targetEl.selectionStart !== undefined ? targetEl.selectionStart : targetEl.value.length;
        const end = targetEl.selectionEnd !== undefined ? targetEl.selectionEnd : targetEl.value.length;
        const text = targetEl.value;
        const insertText = `{{${varName}}}`;

        targetEl.value = text.substring(0, start) + insertText + text.substring(end);
        targetEl.focus();
        if (targetEl.setSelectionRange) {
          targetEl.setSelectionRange(start + insertText.length, start + insertText.length);
        }

        syncLivePreview();
      });
    });
  }

  // ── Color Picker Sync ───────────────────────────────────────
  function setupColorPickers() {
    const colorPairs = [
      { picker: elements.bgColor, hex: elements.bgColorHex },
      { picker: elements.accentColor, hex: elements.accentColorHex },
      { picker: elements.textColor, hex: elements.textColorHex },
      { picker: elements.goalFillColor, hex: elements.goalFillColorHex },
      { picker: elements.goalBarColor, hex: elements.goalBarColorHex },
      { picker: elements.lbAccentColor, hex: elements.lbAccentColorHex },
      { picker: elements.lbRowBgColor, hex: elements.lbRowBgColorHex }
    ];

    colorPairs.forEach(({ picker, hex }) => {
      if (!picker || !hex) return;
      picker.addEventListener('input', () => {
        hex.value = picker.value;
        syncLivePreview();
      });
      hex.addEventListener('change', () => {
        if (/^#[0-9A-F]{6}$/i.test(hex.value)) {
          picker.value = hex.value;
          syncLivePreview();
        }
      });
    });
  }

  // ── Attach Form Input Listeners ──────────────────────────────
  function attachInputListeners() {
    const inputs = document.querySelectorAll('.form-control');
    inputs.forEach(input => {
      input.addEventListener('input', () => {
        updateValueDisplays();
        syncLivePreview();
      });
      input.addEventListener('change', () => {
        updateValueDisplays();
        syncLivePreview();
      });
    });
  }

  // ── CSS Reference Pills Handling ─────────────────────────────
  function setupCssPills() {
    document.querySelectorAll('.css-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const textToCopy = pill.dataset.copy || pill.textContent.trim();
        // Find the visible CSS textarea in the current container
        const activePanel = pill.closest('.code-editor-container');
        let activeTextarea = null;
        if (activePanel) {
          const cssPanel = activePanel.querySelector('.code-tab-panel[data-code-panel="css"]');
          if (cssPanel) activeTextarea = cssPanel.querySelector('textarea');
        }
        if (!activeTextarea) activeTextarea = document.querySelector('textarea:focus') || elements.customCSS;

        if (activeTextarea) {
          const start = activeTextarea.selectionStart !== undefined ? activeTextarea.selectionStart : activeTextarea.value.length;
          const end = activeTextarea.selectionEnd !== undefined ? activeTextarea.selectionEnd : activeTextarea.value.length;
          const insertText = `${textToCopy} {\n  \n}\n`;
          activeTextarea.value = activeTextarea.value.substring(0, start) + insertText + activeTextarea.value.substring(end);
          activeTextarea.focus();
          if (activeTextarea.setSelectionRange) {
            activeTextarea.setSelectionRange(start + textToCopy.length + 5, start + textToCopy.length + 5);
          }
        }

        if (navigator.clipboard) navigator.clipboard.writeText(textToCopy).catch(() => {});
        showToast(`📋 Copied selector "${textToCopy}"`);
      });
    });
  }

  async function loadProfilesList() {
    if (!elements.selectProfile) return;
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      if (data && data.profiles) {
        elements.selectProfile.innerHTML = Object.keys(data.profiles).map(name =>
          `<option value="${TemplateEngine.escapeHtml(name)}" ${name === data.activeProfile ? 'selected' : ''}>${TemplateEngine.escapeHtml(name)}</option>`
        ).join('');
      }
    } catch (e) {
      console.warn('[Profiles] Failed to load profiles list:', e);
    }
  }

  // ── Button Actions ──────────────────────────────────────────
  function setupActionButtons() {
    if (elements.selectTargetWidget) {
      elements.selectTargetWidget.addEventListener('change', (e) => {
        const target = e.target.value;
        const urls = {
          'alert': 'http://localhost:3000/overlay/alert',
          'goal': 'http://localhost:3000/overlay/goal',
          'leaderboard': 'http://localhost:3000/overlay/leaderboard'
        };

        // 1. Read and save current widget state
        readFormValues();

        // 2. Switch widget context key
        currentWidgetKey = target;

        // 3. Update OBS URL callout & iframe preview
        if (elements.widgetUrlDisplay) {
          elements.widgetUrlDisplay.textContent = `OBS Overlay URL: ${urls[target] || urls.alert}`;
        }
        if (elements.iframe) {
          elements.iframe.src = target === 'alert' ? '/overlay/alert' : (target === 'goal' ? '/overlay/goal' : '/overlay/leaderboard');
        }

        // 4. Populate form controls with new widget's style/animation/advanced settings
        populateForm(settings);

        showToast(`🎯 Loaded ${target.toUpperCase()} settings & preview`);
      });
    }

    if (elements.selectProfile) {
      elements.selectProfile.addEventListener('change', async (e) => {
        const name = e.target.value;
        if (!name) return;
        try {
          const res = await fetch('/api/profiles/switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
          });
          const data = await res.json();
          if (data.ok && data.settings) {
            populateForm(data.settings);
            showToast(`👤 Switched to profile "${name}"`);
          }
        } catch (err) {
          alert('Failed to switch profile: ' + err.message);
        }
      });
    }

    if (elements.btnProfileNew) {
      elements.btnProfileNew.addEventListener('click', async () => {
        const name = prompt('Enter a name for the new profile:');
        if (!name || !name.trim()) return;
        const profileName = name.trim();
        const currentVals = readFormValues();
        try {
          const res = await fetch('/api/profiles/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName, settings: currentVals })
          });
          const data = await res.json();
          if (data.ok) {
            await loadProfilesList();
            showToast(`✨ Profile "${profileName}" created!`);
          }
        } catch (err) {
          alert('Failed to create profile: ' + err.message);
        }
      });
    }

    if (elements.btnProfileRename) {
      elements.btnProfileRename.addEventListener('click', async () => {
        const currentName = elements.selectProfile ? elements.selectProfile.value : 'Default';
        const newName = prompt(`Rename profile "${currentName}" to:`, currentName);
        if (!newName || !newName.trim() || newName.trim() === currentName) return;
        const profileName = newName.trim();
        const currentVals = readFormValues();
        try {
          await fetch('/api/profiles/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: currentName })
          });
          const res = await fetch('/api/profiles/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName, settings: currentVals })
          });
          const data = await res.json();
          if (data.ok) {
            await loadProfilesList();
            showToast(`✏️ Renamed profile to "${profileName}"`);
          }
        } catch (err) {
          alert('Failed to rename profile: ' + err.message);
        }
      });
    }

    if (elements.btnProfileDelete) {
      elements.btnProfileDelete.addEventListener('click', async () => {
        const currentName = elements.selectProfile ? elements.selectProfile.value : 'Default';
        if (currentName === 'Default') {
          alert('The Default profile cannot be deleted.');
          return;
        }
        if (confirm(`Are you sure you want to delete profile "${currentName}"?`)) {
          try {
            const res = await fetch('/api/profiles/delete', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ name: currentName })
            });
            const data = await res.json();
            if (data.ok) {
              await loadProfilesList();
              if (data.settings) populateForm(data.settings);
              showToast(`🗑️ Profile "${currentName}" deleted`);
            }
          } catch (err) {
            alert('Failed to delete profile: ' + err.message);
          }
        }
      });
    }

    if (elements.btnProfileExport) {
      elements.btnProfileExport.addEventListener('click', () => {
        const fullVals = readFormValues();
        const activeName = elements.selectProfile ? elements.selectProfile.value : 'default';
        StorageHelper.exportToFile(fullVals, `${activeName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-full-config.json`);
        showToast(`📤 Complete profile config "${activeName}" exported!`);
      });
    }

    if (elements.btnProfileImport && elements.fileProfileInput) {
      elements.btnProfileImport.addEventListener('click', () => elements.fileProfileInput.click());
      elements.fileProfileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const importedConfig = await StorageHelper.importFromFile(file);
          if (!importedConfig) { alert('Invalid profile file.'); return; }

          // Derive a default name from the filename (strip extension)
          const defaultName = file.name.replace(/\.[^.]+$/, '').replace(/-full-config$/, '') || 'Imported';
          const profileName = prompt(`Name for the imported profile:`, defaultName);
          if (!profileName || !profileName.trim()) return;

          const mergedConfig = StorageHelper.mergeWithDefaults(importedConfig);
          const res = await fetch('/api/profiles/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: profileName.trim(), settings: mergedConfig })
          });
          const data = await res.json();
          if (data.ok) {
            settings = mergedConfig;
            await loadProfilesList();
            if (elements.selectProfile) elements.selectProfile.value = profileName.trim();
            populateForm(settings);
            showToast(`🎉 Profile "${profileName.trim()}" imported!`);
          } else {
            alert('Failed to save imported profile: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          alert('Failed to import profile: ' + err.message);
        }
        elements.fileProfileInput.value = '';
      });
    }

    if (elements.btnTest) {
      elements.btnTest.addEventListener('click', () => {
        sendTestAlert();
      });
    }

    if (elements.btnSave) {
      elements.btnSave.addEventListener('click', async () => {
        const currentVals = readFormValues();
        const activeName = elements.selectProfile ? elements.selectProfile.value : 'Default';
        try {
          const res = await fetch('/api/profiles/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: activeName, settings: currentVals })
          });
          const data = await res.json();
          if (data.ok) {
            settings = currentVals;
            showToast('✅ Settings saved!');
          } else {
            showToast('⚠️ Save failed: ' + (data.error || 'Unknown'));
          }
        } catch (err) {
          showToast('⚠️ Save failed: ' + err.message);
        }
      });
    }

    if (elements.btnExport) {
      elements.btnExport.addEventListener('click', () => {
        const fullVals = readFormValues();
        const currentProfileName = elements.selectProfile ? elements.selectProfile.value : 'config';
        StorageHelper.exportToFile(fullVals, `${currentProfileName.toLowerCase().replace(/[^a-z0-9]/g, '-')}-full-config.json`);
        showToast('📤 Complete configuration exported!');
      });
    }

    if (elements.btnImport) {
      elements.btnImport.addEventListener('click', () => {
        if (elements.fileInput) elements.fileInput.click();
      });
    }

    if (elements.fileInput) {
      elements.fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const importedConfig = await StorageHelper.importFromFile(file);
          if (importedConfig) {
            settings = StorageHelper.mergeWithDefaults(importedConfig);
            populateForm(settings);
            await StorageHelper.saveServer(settings);
            showToast('🎉 Complete configuration imported & applied!');
          }
        } catch (err) {
          alert('Failed to import config file: ' + err.message);
        }
        elements.fileInput.value = '';
      });
    }

    // Dedicated Goal Export / Import
    if (elements.btnGoalExport) {
      elements.btnGoalExport.addEventListener('click', () => {
        settings = readFormValues();
        StorageHelper.exportToFile(settings.goal, 'stream-goal-data.json');
        showToast('📥 Goal data exported!');
      });
    }

    if (elements.btnGoalImport && elements.fileGoalInput) {
      elements.btnGoalImport.addEventListener('click', () => elements.fileGoalInput.click());
      elements.fileGoalInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const importedGoal = await StorageHelper.importFromFile(file);
          settings.goal = { ...settings.goal, ...(importedGoal || {}) };
          populateForm(settings);
          await StorageHelper.saveServer(settings);
          showToast('🎉 Goal data imported!');
        } catch (err) {
          alert('Failed to import Goal data: ' + err.message);
        }
        elements.fileGoalInput.value = '';
      });
    }

    // Dedicated Leaderboard Export / Import
    if (elements.btnLbExport) {
      elements.btnLbExport.addEventListener('click', () => {
        settings = readFormValues();
        StorageHelper.exportToFile(settings.leaderboard, 'leaderboard-data.json');
        showToast('📥 Leaderboard data exported!');
      });
    }

    if (elements.btnLbImport && elements.fileLbInput) {
      elements.btnLbImport.addEventListener('click', () => elements.fileLbInput.click());
      elements.fileLbInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        try {
          const importedLb = await StorageHelper.importFromFile(file);
          settings.leaderboard = { ...settings.leaderboard, ...(importedLb || {}) };
          populateForm(settings);
          await StorageHelper.saveServer(settings);
          showToast('🎉 Leaderboard data imported!');
        } catch (err) {
          alert('Failed to import Leaderboard data: ' + err.message);
        }
        elements.fileLbInput.value = '';
      });
    }

    if (elements.btnResetAlertCode) {
      elements.btnResetAlertCode.addEventListener('click', () => {
        if (confirm('Reset Alert custom HTML, CSS, and JS code to default templates?')) {
          if (elements.customHTML) elements.customHTML.value = DEFAULT_CUSTOM_HTML;
          if (elements.customCSS) elements.customCSS.value = DEFAULT_CUSTOM_CSS;
          if (elements.customJS) elements.customJS.value = DEFAULT_CUSTOM_JS;
          updateSnippetButtonStates();
          syncLivePreview();
          showToast('🔄 Alert custom code reset to defaults');
        }
      });
    }

    if (elements.btnResetGoalCode) {
      elements.btnResetGoalCode.addEventListener('click', () => {
        if (confirm('Reset Payment Goal custom HTML, CSS, and JS code to default templates?')) {
          if (elements.goalCustomHTML) elements.goalCustomHTML.value = DEFAULT_GOAL_HTML;
          if (elements.goalCustomCSS) elements.goalCustomCSS.value = DEFAULT_GOAL_CSS;
          if (elements.goalCustomJS) elements.goalCustomJS.value = DEFAULT_GOAL_JS;
          updateSnippetButtonStates();
          syncLivePreview();
          showToast('🔄 Payment Goal custom code reset to defaults');
        }
      });
    }

    if (elements.btnResetLbCode) {
      elements.btnResetLbCode.addEventListener('click', () => {
        if (confirm('Reset Top Leaderboard custom HTML, CSS, and JS code to default templates?')) {
          if (elements.lbCustomHTML) elements.lbCustomHTML.value = DEFAULT_LB_HTML;
          if (elements.lbCustomCSS) elements.lbCustomCSS.value = DEFAULT_LB_CSS;
          if (elements.lbCustomJS) elements.lbCustomJS.value = DEFAULT_LB_JS;
          updateSnippetButtonStates();
          syncLivePreview();
          showToast('🔄 Top Leaderboard custom code reset to defaults');
        }
      });
    }

    if (elements.btnReset) {
      elements.btnReset.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset all settings to default values?')) {
          const defaults = StorageHelper.getDefaultSettings();
          populateForm(defaults);
          await StorageHelper.saveServer(defaults);
          showToast('🔄 Settings reset to defaults!');
        }
      });
    }

    if (elements.btnGoalTestAdd) {
      elements.btnGoalTestAdd.addEventListener('click', () => {
        const cur = parseFloat(elements.goalCurrent.value) || 0;
        elements.goalCurrent.value = cur + 100;
        updateValueDisplays();
        syncLivePreview();
        showToast('🎯 Added ₹100 to Stream Goal progress!');
      });
    }

    if (elements.btnGoalReset) {
      elements.btnGoalReset.addEventListener('click', () => {
        elements.goalCurrent.value = elements.goalStart ? parseFloat(elements.goalStart.value) || 0 : 0;
        updateValueDisplays();
        syncLivePreview();
        showToast('🔄 Stream Goal current amount reset to zero');
      });
    }

    if (elements.btnLbClearAll) {
      elements.btnLbClearAll.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all supporters from the leaderboard?')) {
          if (settings.leaderboard) settings.leaderboard.supporters = {};
          renderSupportersTable();
          syncLivePreview();
          showToast('🗑️ Supporter leaderboard cleared');
        }
      });
    }

    if (elements.btnTestSound && elements.soundUrl) {
      elements.btnTestSound.addEventListener('click', () => {
        const soundUrl = elements.soundUrl.value.trim();
        if (!soundUrl) {
          showToast('⚠️ Please select or enter a Sound URL first');
          return;
        }
        try {
          const audio = new Audio(soundUrl);
          const rawVol = elements.soundVolume ? (!isNaN(parseInt(elements.soundVolume.value)) ? parseInt(elements.soundVolume.value) : 80) : 80;
          audio.volume = Math.max(0, Math.min(1, rawVol / 100));
          audio.play().then(() => showToast('🔊 Playing sound preview...')).catch(err => showToast('⚠️ Sound playback failed: ' + err.message));
        } catch (e) {
          showToast('⚠️ Invalid sound URL');
        }
      });
    }

    if (elements.positionPreset) {
      elements.positionPreset.addEventListener('change', (e) => {
        const val = e.target.value;
        const coords = {
          'center': { x: 50, y: 50 },
          'top-left': { x: 10, y: 10 },
          'top-center': { x: 50, y: 10 },
          'top-right': { x: 90, y: 10 },
          'bottom-left': { x: 10, y: 90 },
          'bottom-center': { x: 50, y: 90 },
          'bottom-right': { x: 90, y: 90 }
        };
        if (coords[val]) {
          if (elements.positionX) elements.positionX.value = coords[val].x;
          if (elements.positionY) elements.positionY.value = coords[val].y;
          updateValueDisplays();
          syncLivePreview();
        }
      });
    }

    if (elements.canvasPreset) {
      elements.canvasPreset.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === '1920x1080') {
          if (elements.canvasWidth) elements.canvasWidth.value = 1920;
          if (elements.canvasHeight) elements.canvasHeight.value = 1080;
        } else if (val === '1280x720') {
          if (elements.canvasWidth) elements.canvasWidth.value = 1280;
          if (elements.canvasHeight) elements.canvasHeight.value = 720;
        } else if (val === '3840x2160') {
          if (elements.canvasWidth) elements.canvasWidth.value = 3840;
          if (elements.canvasHeight) elements.canvasHeight.value = 2160;
        }
        updateValueDisplays();
        syncLivePreview();
      });
    }
  }

  // ── File Browsers (Image/GIF, Sound) ───────────────────────
  function setupFileBrowsers() {
    const filePairs = [
      { btnId: 'btn-browse-image', fileId: 'input-image-file', urlInput: elements.imageUrl },
      { btnId: 'btn-browse-sound', fileId: 'input-sound-file', urlInput: elements.soundUrl }
    ];

    filePairs.forEach(({ btnId, fileId, urlInput }) => {
      const btn = document.getElementById(btnId);
      const fileInput = document.getElementById(fileId);
      if (!btn || !fileInput) return;

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          if (urlInput) urlInput.value = event.target.result;
          else if (btnId.includes('image') && elements.imageUrl) elements.imageUrl.value = event.target.result;
          else if (btnId.includes('sound') && elements.soundUrl) elements.soundUrl.value = event.target.result;

          updateValueDisplays();
          syncLivePreview();
          showToast(`📁 Loaded local file: ${file.name}`);
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
    });
  }

  // ── Quick Snippets & Active Highlight Toggles ────────────────
  const SNIPPET_DICTIONARY = {
    'html-default': '{{mediaHtml}}\n<div class="alert-content">\n  <div class="alert-title">{{sender}} sent {{amount}}</div>\n  <div class="alert-subtitle">{{sourceApp}} payment received</div>\n</div>',
    'html-badge': '<div class="alert-badge" style="background:var(--accent-color);color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:6px;display:inline-block;">{{sourceApp}}</div>\n{{mediaHtml}}\n<div class="alert-title" style="font-size:26px;">{{sender}} → {{amount}}</div>',
    'css-no-border': '\n.alert-box {\n  border-left: none !important;\n}',
    'css-transparent': '\n.alert-box {\n  background: transparent !important;\n  box-shadow: none !important;\n  backdrop-filter: none !important;\n}',
    'css-large-media': '\n.alert-media {\n  width: 100% !important;\n  max-width: 100% !important;\n  height: auto !important;\n}',
    'css-glow': '\n.alert-box {\n  box-shadow: 0 0 25px var(--accent-color), inset 0 0 15px var(--accent-color) !important;\n}',
    'js-log': '\nconsole.log("[Payment Alert]", notifData.sender, notifData.amount);',
    'js-scale': '\nalertBox.style.transform = "scale(1.15)";\nsetTimeout(() => alertBox.style.transform = "scale(1)", 300);'
  };

  function updateSnippetButtonStates() {
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      const key = btn.dataset.snippet;
      const snippetText = SNIPPET_DICTIONARY[key];
      if (!snippetText) return;

      let currentVal = '';
      if (key.startsWith('html-') && elements.customHTML) currentVal = elements.customHTML.value || '';
      else if (key.startsWith('css-') && elements.customCSS) currentVal = elements.customCSS.value || '';
      else if (key.startsWith('js-') && elements.customJS) currentVal = elements.customJS.value || '';

      if (currentVal && currentVal.includes(snippetText.trim())) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function setupSnippets() {
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.snippet;
        const snippetText = SNIPPET_DICTIONARY[key];
        if (!snippetText) return;

        let targetEl = null;
        if (key.startsWith('html-')) targetEl = elements.customHTML;
        else if (key.startsWith('css-')) targetEl = elements.customCSS;
        else if (key.startsWith('js-')) targetEl = elements.customJS;

        if (!targetEl) return;

        const trimmedSnippet = snippetText.trim();
        if (targetEl.value.includes(trimmedSnippet)) {
          // Toggle Off (Remove)
          targetEl.value = targetEl.value.replace(snippetText, '').replace(trimmedSnippet, '').trim();
          showToast('❌ Code snippet removed');
        } else {
          // Toggle On (Insert)
          targetEl.value = (targetEl.value + (targetEl.value.endsWith('\n') || !targetEl.value ? '' : '\n') + snippetText).trim();
          showToast('✨ Code snippet applied!');
        }

        updateSnippetButtonStates();
        syncLivePreview();
      });
    });

    [elements.customHTML, elements.customCSS, elements.customJS].forEach(el => {
      if (el) {
        el.addEventListener('input', updateSnippetButtonStates);
        el.addEventListener('change', updateSnippetButtonStates);
      }
    });

    if (elements.chkTransparentBg) {
      elements.chkTransparentBg.addEventListener('change', () => {
        syncLivePreview();
      });
    }

    if (elements.chkEnableCustomCode) {
      elements.chkEnableCustomCode.addEventListener('change', () => {
        syncLivePreview();
      });
    }
  }

  // ── Initialization (already in DOMContentLoaded) ─────────────
  setupTabs();
  setupCodeEditorTabs();
  setupVariablePills();
  setupCssPills();
  setupColorPickers();
  attachInputListeners();
  setupActionButtons();
  setupFileBrowsers();
  setupSnippets();

  // Load settings from server (active profile)
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    const rawSettings = (data && data.settings) ? data.settings : data;
    await loadProfilesList();
    if (data.activeProfile && elements.selectProfile) {
      elements.selectProfile.value = data.activeProfile;
    }
    populateForm(rawSettings);
  } catch (e) {
    console.error('[Config] Failed to load settings, using defaults:', e);
    populateForm(StorageHelper.getDefaultSettings());
  }

  // Listen for iframe ready message from overlay pages
  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'OVERLAY_READY') {
      syncLivePreview();
    }
  });

  // Sync preview once iframe completes load
  if (elements.iframe) {
    elements.iframe.addEventListener('load', () => {
      syncLivePreview();
      setTimeout(syncLivePreview, 150);
    });
  }
});

