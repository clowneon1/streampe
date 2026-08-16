/**
 * Configuration dashboard controller.
 *
 * The form is a view over one v2 config object:
 *   - the alert-facing tabs edit the *selected alert template*
 *     (`alertTemplates[activeTemplateId]`),
 *   - the "Alert Widget Base", "Payment Goal" and "Top Leaderboard" tabs edit
 *     `widgets.alert` / `widgets.goal` / `widgets.leaderboard`.
 *
 * Text style and canvas controls follow one id convention per section, so a
 * single pair of read/write helpers drives all four of them:
 *   `<prefix>-font-family`, `<prefix>-font-size`, … , `<prefix>-canvas-preset`, …
 * with prefixes `tpl` (template), `alert`, `goal`, `lb`.
 */
document.addEventListener('DOMContentLoaded', async () => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const on = (id, evt, fn) => {
    const node = el(id);
    if (node) node.addEventListener(evt, fn);
  };
  const TEXT_PREFIXES = { template: 'tpl', alert: 'alert', goal: 'goal', leaderboard: 'lb', recent: 'recent', cycling: 'cycling' };

  let config = ConfigSchema.createDefaultConfig();
  let suppressSync = false;
  const editors = {};

  const iframe = el('preview-iframe');

  function initCodeEditors() {
    const editorConfigs = [
      { id: 'input-custom-html', mode: 'htmlmixed' },
      { id: 'input-custom-css', mode: 'css' },
      { id: 'input-custom-js', mode: 'javascript' },
      { id: 'input-goal-custom-html', mode: 'htmlmixed' },
      { id: 'input-goal-custom-css', mode: 'css' },
      { id: 'input-goal-custom-js', mode: 'javascript' },
      { id: 'input-lb-custom-html', mode: 'htmlmixed' },
      { id: 'input-lb-custom-css', mode: 'css' },
      { id: 'input-lb-custom-js', mode: 'javascript' },
      { id: 'input-recent-custom-html', mode: 'htmlmixed' },
      { id: 'input-recent-custom-css', mode: 'css' },
      { id: 'input-recent-custom-js', mode: 'javascript' },
      { id: 'input-cycling-custom-html', mode: 'htmlmixed' },
      { id: 'input-cycling-custom-css', mode: 'css' },
      { id: 'input-cycling-custom-js', mode: 'javascript' }
    ];

    editorConfigs.forEach(conf => {
      const textarea = el(conf.id);
      if (!textarea) return;

      const editor = CodeMirror.fromTextArea(textarea, {
        mode: conf.mode,
        theme: 'dracula',
        lineNumbers: true,
        matchBrackets: true,
        autoCloseBrackets: true,
        tabSize: 2,
        indentUnit: 2,
        viewportMargin: Infinity,
        lineWrapping: true
      });

      editor.on('change', () => {
        if (!suppressSync) syncLivePreview();
      });

      editors[conf.id] = editor;
    });
  }

  async function formatCode(editorId) {
    const editor = editors[editorId];
    if (!editor || !window.prettier) return;

    const code = editor.getValue();
    const mode = editor.getOption('mode');

    let parser = 'babel';
    if (mode === 'htmlmixed') parser = 'html';
    if (mode === 'css') parser = 'css';

    try {
      const formatted = prettier.format(code, {
        parser: parser,
        plugins: prettierPlugins,
        printWidth: 100,
        tabWidth: 2,
        semi: true,
        singleQuote: true
      });
      editor.setValue(formatted);
      showToast('<i data-lucide="check"></i> Code formatted');
    } catch (err) {
      console.warn('[Prettier] Formatting error:', err);
      showToast('<i data-lucide="alert-triangle"></i> Format failed: ' + err.message.split('\n')[0], 'error');
    }
  }

  function showToast(message, type = 'info') {
    const toast = el('toast');
    if (!toast) return;
    toast.innerHTML = message;
    if (window.lucide) lucide.createIcons();
    toast.style.borderColor = type === 'success' ? '#00e676' : (type === 'error' ? '#ff5252' : 'var(--accent)');
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  // ── Universal Modal Controller ───────────────────────────────
  const AppModal = {
    overlay: el('app-modal'),
    title: el('modal-title'),
    message: el('modal-message'),
    inputContainer: el('modal-input-container'),
    input: el('modal-input'),
    cancelBtn: el('modal-cancel'),
    confirmBtn: el('modal-confirm'),
    closeBtn: el('modal-close'),
    resolver: null,

    show(options = {}) {
      this.title.textContent = options.title || 'Dialog';
      this.message.textContent = options.message || '';
      this.confirmBtn.textContent = options.confirmText || 'Confirm';
      this.cancelBtn.textContent = options.cancelText || 'Cancel';

      this.inputContainer.style.display = options.showInput ? 'block' : 'none';
      if (options.showInput) {
        this.input.value = options.defaultValue || '';
        setTimeout(() => this.input.focus(), 100);
      }

      this.cancelBtn.style.display = options.hideCancel ? 'none' : 'inline-block';
      this.overlay.style.display = 'flex';
      setTimeout(() => this.overlay.classList.add('active'), 10);

      return new Promise((resolve) => {
        this.resolver = resolve;
      });
    },

    hide(value) {
      this.overlay.classList.remove('active');
      setTimeout(() => {
        this.overlay.style.display = 'none';
        if (this.resolver) this.resolver(value);
      }, 200);
    }
  };

  on('modal-confirm', 'click', () => {
    const isInputVisible = AppModal.inputContainer.style.display !== 'none';
    AppModal.hide(isInputVisible ? AppModal.input.value : true);
  });
  on('modal-cancel', 'click', () => AppModal.hide(null));
  on('modal-close', 'click', () => AppModal.hide(null));
  AppModal.overlay.addEventListener('click', (e) => { if (e.target === AppModal.overlay) AppModal.hide(null); });
  AppModal.input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') el('modal-confirm').click();
    if (e.key === 'Escape') AppModal.hide(null);
  });

  // Works in both HTTPS (navigator.clipboard) and plain HTTP / OBS browser sources (execCommand fallback).
  // Pass the originating button element as the second argument to get a visual "✓ Copied!" flash animation.
  function copyToClipboard(text, triggerBtn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(() => _execCommandCopy(text));
    } else {
      _execCommandCopy(text);
    }
    if (triggerBtn) _flashCopied(triggerBtn);
    return Promise.resolve();
  }
  function _execCommandCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    } catch (_) {}
  }
  function _flashCopied(btn) {
    if (!btn || btn._copying) return;
    btn._copying = true;
    const original = btn.innerHTML;
    const originalTitle = btn.title;
    const originalBg = btn.style.background;
    const originalColor = btn.style.color;
    const originalBorder = btn.style.border;
    btn.innerHTML = '<i data-lucide="check" style="width:14px;height:14px;"></i>';
    btn.title = 'Copied!';
    if (window.lucide) lucide.createIcons({ attrs: { class: 'lucide' }, nameAttr: 'data-lucide' });
    btn.style.background = '#00e676';
    btn.style.color = '#000';
    btn.style.border = '1.5px solid #00e676';
    btn.classList.add('btn-copy-flash');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.title = originalTitle;
      btn.style.background = originalBg;
      btn.style.color = originalColor;
      btn.style.border = originalBorder;
      btn.classList.remove('btn-copy-flash');
      btn._copying = false;
      if (window.lucide) lucide.createIcons({ attrs: { class: 'lucide' }, nameAttr: 'data-lucide' });
    }, 1600);
  }

  // ── Generic field helpers ────────────────────────────────────
  const val = (id, fallback) => {
    if (editors[id]) return editors[id].getValue();
    const node = el(id);
    return node ? node.value : fallback;
  };
  const numVal = (id, fallback) => {
    const parsed = parseFloat(val(id, ''));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const checked = (id, fallback) => {
    const node = el(id);
    return node ? node.checked : fallback;
  };
  function setVal(id, value) {
    if (editors[id]) {
      editors[id].setValue(value || '');
      return;
    }
    const node = el(id);
    if (node && value !== undefined && value !== null) node.value = value;
  }
  function setChecked(id, value) {
    const node = el(id);
    if (node) node.checked = !!value;
  }

  function readTextStyle(prefix, base) {
    return WidgetStyle.normalizeText({
      titleTemplate: base.titleTemplate,
      subtitleTemplate: base.subtitleTemplate,
      fontFamily: val(`${prefix}-font-family`, base.fontFamily),
      fontSize: numVal(`${prefix}-font-size`, base.fontSize),
      fontSizeUnit: val(`${prefix}-font-size-unit`, base.fontSizeUnit),
      fontWeight: numVal(`${prefix}-font-weight`, base.fontWeight),
      fontStyle: val(`${prefix}-font-style`, base.fontStyle),
      color: val(`${prefix}-text-color-hex`) || val(`${prefix}-text-color`, base.color),
      textAlign: val(`${prefix}-text-align`, base.textAlign),
      textTransform: val(`${prefix}-text-transform`, base.textTransform),
      letterSpacing: numVal(`${prefix}-letter-spacing`, base.letterSpacing),
      letterSpacingUnit: val(`${prefix}-letter-spacing-unit`, base.letterSpacingUnit),
      lineHeight: numVal(`${prefix}-line-height`, base.lineHeight)
    }, base);
  }

  /**
   * Set a <select> value, adding the option first when it is missing. Saved
   * configs may name a font the dropdown does not list; without this the
   * select would fall back to "" and silently drop the font on the next save.
   */
  function setSelectVal(id, value) {
    const node = el(id);
    if (!node || value === undefined || value === null || value === '') return;
    const known = Array.prototype.some.call(node.options, o => o.value === String(value));
    if (!known) node.add(new Option(String(value), String(value)));
    node.value = value;
  }

  function writeTextStyle(prefix, text) {
    setSelectVal(`${prefix}-font-family`, text.fontFamily);
    setVal(`${prefix}-font-size`, text.fontSize);
    setSelectVal(`${prefix}-font-size-unit`, text.fontSizeUnit);
    setVal(`${prefix}-font-weight`, text.fontWeight);
    setVal(`${prefix}-font-style`, text.fontStyle);
    setVal(`${prefix}-text-color`, text.color);
    setVal(`${prefix}-text-color-hex`, text.color);
    setVal(`${prefix}-text-align`, text.textAlign);
    setVal(`${prefix}-text-transform`, text.textTransform);
    setVal(`${prefix}-letter-spacing`, text.letterSpacing);
    setSelectVal(`${prefix}-letter-spacing-unit`, text.letterSpacingUnit);
    setVal(`${prefix}-line-height`, text.lineHeight);
  }

  function readCanvas(prefix, base) {
    return CanvasPresets.resolve({
      preset: val(`${prefix}-canvas-preset`, base.preset),
      width: numVal(`${prefix}-canvas-width`, base.width),
      height: numVal(`${prefix}-canvas-height`, base.height)
    });
  }

  function writeCanvas(prefix, canvas) {
    const resolved = CanvasPresets.resolve(canvas);
    setSelectVal(`${prefix}-canvas-preset`, resolved.preset);
    setVal(`${prefix}-canvas-width`, resolved.width);
    setVal(`${prefix}-canvas-height`, resolved.height);
    const isCustom = resolved.preset === CanvasPresets.CUSTOM;
    [`${prefix}-canvas-width`, `${prefix}-canvas-height`].forEach(id => {
      const node = el(id);
      if (node) node.disabled = !isCustom;
    });
  }

  // ── Amount filters ───────────────────────────────────────────
  function filterRowHtml(filter) {
    const opts = TemplateMatcher.FILTER_TYPES
      .map(t => `<option value="${t}"${t === filter.type ? ' selected' : ''}>${t}</option>`).join('');
    return `
      <div class="amount-filter-row" data-type="${filter.type}">
        <select class="form-control filter-type">${opts}</select>
        <input type="number" class="form-control filter-value" step="any" placeholder="Amount" value="${filter.value}" />
        <input type="number" class="form-control filter-min" step="any" placeholder="Min" value="${filter.min}" />
        <input type="number" class="form-control filter-max" step="any" placeholder="Max" value="${filter.max}" />
        <button type="button" class="btn btn-danger filter-remove" title="Remove filter"><i data-lucide="trash-2"></i></button>
      </div>`;
  }

  /** Only the inputs that a filter type actually uses stay visible. */
  function updateFilterRowVisibility(row) {
    const type = row.querySelector('.filter-type').value;
    row.dataset.type = type;
    const show = {
      any: [],
      exact: ['.filter-value'],
      min: ['.filter-min'],
      max: ['.filter-max'],
      range: ['.filter-min', '.filter-max']
    }[type] || [];
    ['.filter-value', '.filter-min', '.filter-max'].forEach(sel => {
      row.querySelector(sel).style.display = show.indexOf(sel) === -1 ? 'none' : '';
    });
  }

  function renderAmountFilters(filters) {
    const list = el('amount-filter-list');
    if (!list) return;
    list.innerHTML = filters.length
      ? filters.map(filterRowHtml).join('')
      : '<p class="panel-desc">No filters &mdash; this template matches every amount.</p>';
    list.querySelectorAll('.amount-filter-row').forEach(updateFilterRowVisibility);
    if (window.lucide) lucide.createIcons();
  }

  function readAmountFilters() {
    const list = el('amount-filter-list');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.amount-filter-row')).map(row => TemplateMatcher.normalizeFilter({
      type: row.querySelector('.filter-type').value,
      value: row.querySelector('.filter-value').value,
      min: row.querySelector('.filter-min').value,
      max: row.querySelector('.filter-max').value
    }));
  }

  // ── Template manager ─────────────────────────────────────────
  function currentTemplate() {
    return config.alertTemplates.find(t => t.id === config.activeTemplateId) || config.alertTemplates[0];
  }

  function renderTemplateList() {
    const select = el('select-template');
    if (!select) return;
    select.innerHTML = config.alertTemplates.map(t => {
      const flags = [t.isDefault ? 'fallback' : '', t.enabled ? '' : 'disabled']
        .filter(Boolean).join(', ');
      const label = TemplateEngine.escapeHtml(t.name) + (flags ? ` (${flags})` : '');
      return `<option value="${TemplateEngine.escapeHtml(t.id)}"${t.id === config.activeTemplateId ? ' selected' : ''}>${label}</option>`;
    }).join('');

    const summary = el('template-summary');
    if (summary) {
      const t = currentTemplate();
      summary.textContent = t
        ? `${config.alertTemplates.length} template(s). "${t.name}" matches: ${describeFilters(t)}.`
        : '';
    }

    updateSimulatorTemplateOptions();
  }

  function describeFilters(template) {
    const filters = TemplateMatcher.filtersOf(template);
    return filters.map(f => {
      if (f.type === 'exact') return `= ₹${f.value}`;
      if (f.type === 'min') return `≥ ₹${f.min || f.value}`;
      if (f.type === 'max') return `≤ ₹${f.max || f.value}`;
      if (f.type === 'range') return `₹${f.min}–₹${f.max}`;
      return 'any amount';
    }).join(' or ');
  }

  // ── Form → config ────────────────────────────────────────────
  function readFormValues() {
    const template = currentTemplate();
    const base = ConfigSchema.WIDGET_DEFAULTS.alert;

    if (template) {
      template.enabled = checked('chk-template-enabled', template.enabled);
      template.priority = numVal('input-template-priority', template.priority);
      template.amountFilters = readAmountFilters();
      template.text = Object.assign(readTextStyle(TEXT_PREFIXES.template, base.text), {
        titleTemplate: val('input-title-template', template.text.titleTemplate),
        subtitleTemplate: val('input-subtitle-template', template.text.subtitleTemplate)
      });
      template.canvas = readCanvas(TEXT_PREFIXES.template, template.canvas);
      template.image = {
        imageUrl: val('input-image-url', ''),
        gifUrl: template.image.gifUrl,
        position: val('select-media-position', template.image.position),
        size: numVal('input-media-size', template.image.size)
      };
      template.sound = {
        soundUrl: val('input-sound-url', ''),
        soundVolume: numVal('input-sound-volume', template.sound.soundVolume)
      };
      template.style = Object.assign({}, template.style, {
        backgroundColor: val('input-bg-color-hex') || val('input-bg-color', template.style.backgroundColor),
        backgroundOpacity: numVal('input-bg-opacity', template.style.backgroundOpacity),
        accentColor: val('input-accent-color-hex') || val('input-accent-color', template.style.accentColor),
        borderRadius: numVal('input-border-radius', template.style.borderRadius),
        borderWidth: numVal('input-border-width', template.style.borderWidth),
        padding: numVal('input-padding', template.style.padding)
      });
      template.animation = {
        type: val('select-anim-type', template.animation.type),
        duration: numVal('input-anim-duration', template.animation.duration),
        displayDuration: numVal('input-display-duration', template.animation.displayDuration)
      };
      const tplPreset = val('tpl-position-preset', template.layout.positionPreset);
      const tplAnchor = (ConfigSchema.POSITION_PRESETS && ConfigSchema.POSITION_PRESETS[tplPreset]) || { x: 50, y: 50 };
      template.layout = Object.assign({}, template.layout, {
        positionPreset: tplPreset,
        positionX: tplAnchor.x,
        positionY: tplAnchor.y,
        width: numVal('tpl-layout-width', template.layout.width)
      });
      template.code = {
        enableCustomCode: checked('chk-enable-custom-code', false),
        customHTML: val('input-custom-html', ''),
        customCSS: val('input-custom-css', ''),
        customJS: val('input-custom-js', '')
      };
    }

    const alertWidget = config.widgets.alert;
    alertWidget.enabled = checked('chk-enable-alert', alertWidget.enabled);
    alertWidget.text = readTextStyle(TEXT_PREFIXES.alert, alertWidget.text);
    alertWidget.canvas = readCanvas(TEXT_PREFIXES.alert, alertWidget.canvas);

    const goal = config.widgets.goal;
    goal.enabled = checked('chk-enable-goal', goal.enabled);
    goal.title = val('input-goal-title', goal.title);
    goal.targetAmount = numVal('input-goal-target', goal.targetAmount);
    goal.currentAmount = numVal('input-goal-current', goal.currentAmount);
    goal.startAmount = numVal('input-goal-start', goal.startAmount);
    goal.endDate = val('input-goal-end-date', goal.endDate);
    goal.text = Object.assign(readTextStyle(TEXT_PREFIXES.goal, goal.text), {
      titleTemplate: val('input-goal-title', goal.text.titleTemplate)
    });
    goal.canvas = readCanvas(TEXT_PREFIXES.goal, goal.canvas);
    goal.style = Object.assign({}, goal.style, {
      fillColor: val('input-goal-fill-color-hex') || val('input-goal-fill-color', goal.style.fillColor),
      barColor: val('input-goal-bar-color-hex') || val('input-goal-bar-color', goal.style.barColor),
      backgroundColor: val('input-goal-bg-color-hex') || val('input-goal-bg-color', goal.style.backgroundColor),
      barHeight: numVal('input-goal-bar-height', goal.style.barHeight),
      backgroundOpacity: numVal('input-goal-bg-opacity', goal.style.backgroundOpacity),
      barRoundness: numVal('input-goal-bar-roundness', goal.style.barRoundness),
      borderRadius: numVal('input-goal-border-radius', goal.style.borderRadius),
      borderWidth: numVal('input-goal-border-width', goal.style.borderWidth),
      barOpacity: numVal('input-goal-bar-opacity', goal.style.barOpacity),
      useGradient: checked('chk-goal-use-gradient', goal.style.useGradient),
      fillColor2: val('input-goal-fill-color2-hex') || val('input-goal-fill-color2', goal.style.fillColor2),
      effect: val('select-goal-effect', goal.style.effect)
    });
    goal.code = {
      enableCustomCode: checked('chk-enable-goal-custom-code', false),
      customHTML: val('input-goal-custom-html', ''),
      customCSS: val('input-goal-custom-css', ''),
      customJS: val('input-goal-custom-js', '')
    };

    const lb = config.widgets.leaderboard;
    lb.enabled = checked('chk-enable-lb', lb.enabled);
    lb.title = val('input-lb-title', lb.title);
    const lbMaxPreset = val('select-lb-max', '5');
    lb.maxEntries = lbMaxPreset === 'custom' ? numVal('input-lb-max-custom', 5) : parseInt(lbMaxPreset, 10);
    lb.showAmounts = checked('chk-lb-show-amounts', lb.showAmounts);
    lb.text = Object.assign(readTextStyle(TEXT_PREFIXES.leaderboard, lb.text), {
      titleTemplate: val('input-lb-title', lb.text.titleTemplate)
    });
    lb.canvas = readCanvas(TEXT_PREFIXES.leaderboard, lb.canvas);
    lb.style = Object.assign({}, lb.style, {
      backgroundColor: val('input-lb-bg-color-hex') || val('input-lb-bg-color', lb.style.backgroundColor || '#0a0e17'),
      accentColor: val('input-lb-accent-color-hex') || val('input-lb-accent-color', lb.style.accentColor),
      rowBgColor: val('input-lb-row-bg-color-hex') || val('input-lb-row-bg-color', lb.style.rowBgColor),
      backgroundOpacity: numVal('input-lb-bg-opacity', lb.style.backgroundOpacity),
      borderWidth: numVal('input-lb-border-width', lb.style.borderWidth ?? 1),
      borderColor: val('input-lb-border-color-hex') || val('input-lb-border-color', lb.style.borderColor || '#ffffff22')
    });
    lb.code = {
      enableCustomCode: checked('chk-enable-lb-custom-code', false),
      customHTML: val('input-lb-custom-html', ''),
      customCSS: val('input-lb-custom-css', ''),
      customJS: val('input-lb-custom-js', '')
    };

    const recent = config.widgets.recent;
    recent.enabled = checked('chk-enable-recent', recent.enabled);
    recent.title = val('input-recent-title', recent.title);
    const recentMaxPreset = val('select-recent-max', '5');
    recent.maxEntries = recentMaxPreset === 'custom' ? numVal('input-recent-max-custom', 5) : parseInt(recentMaxPreset, 10);
    recent.showAmounts = checked('chk-recent-show-amounts', recent.showAmounts);
    recent.text = Object.assign(readTextStyle(TEXT_PREFIXES.recent, recent.text), {
      titleTemplate: val('input-recent-title', recent.text.titleTemplate)
    });
    recent.canvas = readCanvas(TEXT_PREFIXES.recent, recent.canvas);
    recent.style = Object.assign({}, recent.style, {
      backgroundColor: val('input-recent-bg-color-hex') || val('input-recent-bg-color', recent.style.backgroundColor || '#0a0e17'),
      accentColor: val('input-recent-accent-color-hex') || val('input-recent-accent-color', recent.style.accentColor),
      rowBgColor: val('input-recent-row-bg-color-hex') || val('input-recent-row-bg-color', recent.style.rowBgColor),
      backgroundOpacity: numVal('input-recent-bg-opacity', recent.style.backgroundOpacity),
      borderWidth: numVal('input-recent-border-width', recent.style.borderWidth ?? 1),
      borderColor: val('input-recent-border-color-hex') || val('input-recent-border-color', recent.style.borderColor || '#ffffff22')
    });
    recent.code = {
      enableCustomCode: checked('chk-enable-recent-custom-code', false),
      customHTML: val('input-recent-custom-html', ''),
      customCSS: val('input-recent-custom-css', ''),
      customJS: val('input-recent-custom-js', '')
    };

    const cycling = config.widgets.cycling || {};
    cycling.enabled = checked('chk-enable-cycling', !!cycling.enabled);
    cycling.cycleDuration = numVal('input-cycling-duration', 5000);
    cycling.transitionIn = val('select-cycling-in-effect', 'slide-up');
    cycling.transitionOut = val('select-cycling-out-effect', 'slide-up');
    cycling.transitionInDuration = numVal('input-cycling-in-duration', 500);
    cycling.transitionOutDuration = numVal('input-cycling-out-duration', 400);
    cycling.transitionEffect = cycling.transitionIn;
    cycling.items = readCyclingItems();
    cycling.text = Object.assign(readTextStyle(TEXT_PREFIXES.cycling, cycling.text || {}), {
      labelFontSize: numVal('cycling-label-font-size', 11),
      labelColor: val('cycling-label-color-hex') || val('cycling-label-color', '#00e5ff'),
      labelTransform: val('cycling-label-transform', 'uppercase')
    });
    cycling.canvas = readCanvas(TEXT_PREFIXES.cycling, cycling.canvas || {});
    cycling.style = Object.assign({}, cycling.style || {}, {
      backgroundColor: val('input-cycling-bg-color-hex') || val('input-cycling-bg-color', '#0a0e17'),
      backgroundOpacity: numVal('input-cycling-bg-opacity', 85),
      accentColor: val('input-cycling-accent-color-hex') || val('input-cycling-accent-color', '#00e5ff'),
      borderColor: val('input-cycling-border-color-hex') || val('input-cycling-border-color', '#ffffff22'),
      borderWidth: numVal('input-cycling-border-width', 1),
      borderRadius: numVal('input-cycling-border-radius', 14),
      padding: numVal('input-cycling-padding', 16),
      mediaSize: numVal('input-cycling-media-size', 32),
      mediaBgColor: val('input-cycling-media-bg-hex') || val('input-cycling-media-bg', '#00e5ff1a'),
      mediaRadius: numVal('input-cycling-media-radius', 8)
    });

    const cyclingPreset = val('cycling-position-preset', 'bottom-left');
    const cyclingAnchor = ConfigSchema.POSITION_PRESETS[cyclingPreset] || { x: 10, y: 90 };
    cycling.layout = {
      positionPreset: cyclingPreset,
      positionX: cyclingAnchor.x,
      positionY: cyclingAnchor.y,
      width: numVal('cycling-layout-width', 350)
    };

    cycling.code = {
      enableCustomCode: checked('chk-enable-cycling-custom-code', false),
      customHTML: val('input-cycling-custom-html', ''),
      customCSS: val('input-cycling-custom-css', ''),
      customJS: val('input-cycling-custom-js', '')
    };

    config.widgets.cycling = cycling;
    config.simulation = {
      isolatedMode: checked('chk-sim-isolated-mode', true)
    };
    config = ConfigSchema.normalizeConfig(config);
    return config;
  }

  // ── Config → form ────────────────────────────────────────────
  function populateForm(raw) {
    config = ConfigMigration.migrate(raw);
    suppressSync = true;

    renderTemplateList();
    const template = currentTemplate();
    if (template) {
      setChecked('chk-template-enabled', template.enabled);
      setVal('input-template-priority', template.priority);
      renderAmountFilters(template.amountFilters);
      setVal('input-title-template', template.text.titleTemplate);
      setVal('input-subtitle-template', template.text.subtitleTemplate);
      writeTextStyle(TEXT_PREFIXES.template, template.text);
      writeCanvas(TEXT_PREFIXES.template, template.canvas);

      setVal('input-image-url', template.image.imageUrl || template.image.gifUrl);
      setSelectVal('select-media-position', template.image.position);
      setVal('input-media-size', template.image.size);
      setVal('input-sound-url', template.sound.soundUrl);
      setVal('input-sound-volume', template.sound.soundVolume);

      setVal('input-bg-color', template.style.backgroundColor);
      setVal('input-bg-color-hex', template.style.backgroundColor);
      setVal('input-bg-opacity', template.style.backgroundOpacity);
      setVal('input-accent-color', template.style.accentColor);
      setVal('input-accent-color-hex', template.style.accentColor);
      setVal('input-border-radius', template.style.borderRadius);
      setVal('input-border-width', template.style.borderWidth);
      setVal('input-padding', template.style.padding);

      setSelectVal('select-anim-type', template.animation.type);
      setVal('input-anim-duration', template.animation.duration);
      setVal('input-display-duration', template.animation.displayDuration);

      setVal('tpl-position-preset', template.layout.positionPreset);
      setVal('tpl-layout-width', template.layout.width);

      setChecked('chk-enable-custom-code', template.code.enableCustomCode);
      setVal('input-custom-html', template.code.customHTML);
      setVal('input-custom-css', template.code.customCSS);
      setVal('input-custom-js', template.code.customJS);
    }

    const alertWidget = config.widgets.alert;
    setChecked('chk-enable-alert', alertWidget.enabled);
    writeTextStyle(TEXT_PREFIXES.alert, alertWidget.text);
    writeCanvas(TEXT_PREFIXES.alert, alertWidget.canvas);

    const goal = config.widgets.goal;
    setChecked('chk-enable-goal', goal.enabled);
    setVal('input-goal-title', goal.text.titleTemplate || goal.title);
    setVal('input-goal-target', goal.targetAmount);
    setVal('input-goal-current', goal.currentAmount);
    setVal('input-goal-start', goal.startAmount);
    setVal('input-goal-end-date', goal.endDate);
    setVal('input-goal-fill-color', goal.style.fillColor);
    setVal('input-goal-fill-color-hex', goal.style.fillColor);
    setVal('input-goal-bar-color', goal.style.barColor);
    setVal('input-goal-bar-color-hex', goal.style.barColor);
    setVal('input-goal-bar-height', goal.style.barHeight);
    setVal('input-goal-bg-opacity', goal.style.backgroundOpacity);
    setVal('input-goal-bar-roundness', goal.style.barRoundness);
    setVal('input-goal-border-radius', goal.style.borderRadius);
    setVal('input-goal-border-width', goal.style.borderWidth);
    setVal('input-goal-bar-opacity', goal.style.barOpacity);
    setChecked('chk-goal-use-gradient', goal.style.useGradient);
    setVal('input-goal-fill-color2', goal.style.fillColor2);
    setVal('input-goal-fill-color2-hex', goal.style.fillColor2);
    setVal('input-goal-bg-color', goal.style.backgroundColor);
    setVal('input-goal-bg-color-hex', goal.style.backgroundColor);
    setSelectVal('select-goal-effect', goal.style.effect);
    el('goal-fill2-container').style.display = goal.style.useGradient ? 'block' : 'none';

    writeTextStyle(TEXT_PREFIXES.goal, goal.text);
    writeCanvas(TEXT_PREFIXES.goal, goal.canvas);
    setChecked('chk-enable-goal-custom-code', goal.code.enableCustomCode);
    setVal('input-goal-custom-html', goal.code.customHTML);
    setVal('input-goal-custom-css', goal.code.customCSS);
    setVal('input-goal-custom-js', goal.code.customJS);

    const lb = config.widgets.leaderboard;
    setChecked('chk-enable-lb', lb.enabled);
    setVal('input-lb-title', lb.text.titleTemplate || lb.title);
    const lbPresets = ['3', '5', '10', '20'];
    if (lbPresets.indexOf(String(lb.maxEntries)) !== -1) {
      setVal('select-lb-max', String(lb.maxEntries));
      el('input-lb-max-custom').style.display = 'none';
    } else {
      setVal('select-lb-max', 'custom');
      setVal('input-lb-max-custom', lb.maxEntries);
      el('input-lb-max-custom').style.display = 'block';
    }
    setChecked('chk-lb-show-amounts', lb.showAmounts);
    setVal('input-lb-bg-color', lb.style.backgroundColor || '#0a0e17');
    setVal('input-lb-bg-color-hex', lb.style.backgroundColor || '#0a0e17');
    setVal('input-lb-accent-color', lb.style.accentColor);
    setVal('input-lb-accent-color-hex', lb.style.accentColor);
    setVal('input-lb-row-bg-color', lb.style.rowBgColor);
    setVal('input-lb-row-bg-color-hex', lb.style.rowBgColor);
    setVal('input-lb-bg-opacity', lb.style.backgroundOpacity);
    setVal('input-lb-border-width', lb.style.borderWidth ?? 1);
    setVal('input-lb-border-color', lb.style.borderColor || '#ffffff22');
    setVal('input-lb-border-color-hex', lb.style.borderColor || '#ffffff22');
    writeTextStyle(TEXT_PREFIXES.leaderboard, lb.text);
    writeCanvas(TEXT_PREFIXES.leaderboard, lb.canvas);
    setChecked('chk-enable-lb-custom-code', lb.code.enableCustomCode);
    setVal('input-lb-custom-html', lb.code.customHTML);
    setVal('input-lb-custom-css', lb.code.customCSS);
    setVal('input-lb-custom-js', lb.code.customJS);

    const recent = config.widgets.recent;
    setChecked('chk-enable-recent', recent.enabled);
    setVal('input-recent-title', recent.text.titleTemplate || recent.title);
    const recentPresets = ['3', '5', '10', '20'];
    if (recentPresets.indexOf(String(recent.maxEntries)) !== -1) {
      setVal('select-recent-max', String(recent.maxEntries));
      el('input-recent-max-custom').style.display = 'none';
    } else {
      setVal('select-recent-max', 'custom');
      setVal('input-recent-max-custom', recent.maxEntries);
      el('input-recent-max-custom').style.display = 'block';
    }
    setChecked('chk-recent-show-amounts', recent.showAmounts);
    setVal('input-recent-bg-color', recent.style.backgroundColor || '#0a0e17');
    setVal('input-recent-bg-color-hex', recent.style.backgroundColor || '#0a0e17');
    setVal('input-recent-accent-color', recent.style.accentColor);
    setVal('input-recent-accent-color-hex', recent.style.accentColor);
    setVal('input-recent-row-bg-color', recent.style.rowBgColor);
    setVal('input-recent-row-bg-color-hex', recent.style.rowBgColor);
    setVal('input-recent-bg-opacity', recent.style.backgroundOpacity);
    setVal('input-recent-border-width', recent.style.borderWidth ?? 1);
    setVal('input-recent-border-color', recent.style.borderColor || '#ffffff22');
    setVal('input-recent-border-color-hex', recent.style.borderColor || '#ffffff22');
    writeTextStyle(TEXT_PREFIXES.recent, recent.text);
    writeCanvas(TEXT_PREFIXES.recent, recent.canvas);
    setChecked('chk-enable-recent-custom-code', recent.code.enableCustomCode);
    setVal('input-recent-custom-html', recent.code.customHTML);
    setVal('input-recent-custom-css', recent.code.customCSS);
    setVal('input-recent-custom-js', recent.code.customJS);

    const cycling = config.widgets.cycling;
    if (cycling) {
      setChecked('chk-enable-cycling', cycling.enabled);
      setVal('input-cycling-duration', cycling.cycleDuration);
      setSelectVal('select-cycling-in-effect', cycling.transitionIn || cycling.transitionEffect || 'slide-up');
      setSelectVal('select-cycling-out-effect', cycling.transitionOut || cycling.transitionEffect || 'slide-up');
      setVal('input-cycling-in-duration', cycling.transitionInDuration || 500);
      setVal('input-cycling-out-duration', cycling.transitionOutDuration || 400);
      renderCyclingItems(cycling.items || []);
      if (cycling.text) {
        writeTextStyle(TEXT_PREFIXES.cycling, cycling.text);
        setVal('cycling-label-font-size', cycling.text.labelFontSize || 11);
        setVal('cycling-label-color', cycling.text.labelColor || cycling.style?.accentColor || '#00e5ff');
        setVal('cycling-label-color-hex', cycling.text.labelColor || cycling.style?.accentColor || '#00e5ff');
        setSelectVal('cycling-label-transform', cycling.text.labelTransform || 'uppercase');
      }
      if (cycling.canvas) writeCanvas(TEXT_PREFIXES.cycling, cycling.canvas);
      if (cycling.style) {
        setVal('input-cycling-bg-color', cycling.style.backgroundColor);
        setVal('input-cycling-bg-color-hex', cycling.style.backgroundColor);
        setVal('input-cycling-bg-opacity', cycling.style.backgroundOpacity);
        setVal('input-cycling-accent-color', cycling.style.accentColor);
        setVal('input-cycling-accent-color-hex', cycling.style.accentColor);
        setVal('input-cycling-border-color', cycling.style.borderColor || '#ffffff22');
        setVal('input-cycling-border-color-hex', cycling.style.borderColor || '#ffffff22');
        setVal('input-cycling-border-width', cycling.style.borderWidth ?? 1);
        setVal('input-cycling-border-radius', cycling.style.borderRadius);
        setVal('input-cycling-padding', cycling.style.padding);
        setVal('input-cycling-media-size', cycling.style.mediaSize ?? 32);
        setVal('input-cycling-media-bg', cycling.style.mediaBgColor || '#00e5ff1a');
        setVal('input-cycling-media-bg-hex', cycling.style.mediaBgColor || '#00e5ff1a');
        setVal('input-cycling-media-radius', cycling.style.mediaRadius ?? 8);
      }
      if (cycling.layout) {
        setSelectVal('cycling-position-preset', cycling.layout.positionPreset);
        setVal('cycling-layout-width', cycling.layout.width);
      }
      if (cycling.code) {
        setChecked('chk-enable-cycling-custom-code', cycling.code.enableCustomCode);
        setVal('input-cycling-custom-html', cycling.code.customHTML);
        setVal('input-cycling-custom-css', cycling.code.customCSS);
        setVal('input-cycling-custom-js', cycling.code.customJS);
      }
    }

    const simIsolatedVal = config.simulation ? config.simulation.isolatedMode !== false : true;
    setChecked('chk-sim-isolated-mode', simIsolatedVal);

    suppressSync = false;
    syncLivePreview();
  }

  function syncLivePreview() {
    if (suppressSync) return;
    readFormValues();
    renderTemplateList();
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SETTINGS_UPDATED', payload: config }, '*');
      iframe.contentWindow.postMessage({ type: 'config', config: config }, '*');
    }
  }

  // ── Cycling Widget Item Manager ──────────────────────────────
  function renderCyclingItems(items) {
    const list = el('cycling-items-list');
    if (!list) return;

    if (!items || !items.length) {
      list.innerHTML = '<p class="panel-desc">No items added to cycle. Click the buttons below to add items like Top Supporter, Recent Donation, or Custom Social links.</p>';
      return;
    }

    list.innerHTML = items.map((item, idx) => {
      const isCustom = item.type === 'custom' || item.type === 'social';
      const typeLabel = isCustom ? 'Custom Item' : (item.type === 'top_supporter' ? 'Top Supporter' : 'Recent Donation');
      const placeholderText = isCustom ? 'Text to display' : 'Label (e.g. Top Supporter)';
      const mediaType = item.mediaType || (item.imageUrl ? 'image' : 'icon');

      return `
        <div class="cycling-item-row" data-type="${item.type}" data-idx="${idx}" style="display: flex; flex-direction: column; gap: 8px; padding: 10px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; margin-bottom: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div class="item-type-badge">${typeLabel}</div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <select class="form-control item-media-type" style="width: 110px; font-size: 11px; padding: 3px 6px;">
                <option value="icon"${mediaType === 'icon' ? ' selected' : ''}>Lucide Icon</option>
                <option value="image"${mediaType === 'image' ? ' selected' : ''}>Custom Image</option>
              </select>
              <button type="button" class="btn btn-danger btn-remove-cycling-item" style="padding: 3px 8px;" title="Remove item"><i data-lucide="trash-2"></i></button>
            </div>
          </div>
          <div class="item-fields" style="display: flex; gap: 8px; align-items: center;">
            <div class="item-icon-wrapper" style="display: ${mediaType === 'image' ? 'none' : 'flex'}; flex: 0 0 160px; gap: 4px;">
              <input type="text" class="form-control item-icon" placeholder="Icon name" value="${TemplateEngine.escapeHtml(item.icon || 'star')}" style="flex: 1;" title="Lucide icon name" />
              <button type="button" class="btn btn-secondary btn-open-icon-picker" style="padding: 4px 8px;" title="Pick icon from library"><i data-lucide="grid"></i></button>
            </div>
            <div class="item-image-wrapper" style="display: ${mediaType === 'image' ? 'flex' : 'none'}; flex: 1; gap: 6px; align-items: center;">
              <input type="text" class="form-control item-image-url" placeholder="Image URL or Base64 data" value="${TemplateEngine.escapeHtml(item.imageUrl || '')}" style="flex: 1;" />
              <button type="button" class="btn btn-secondary btn-upload-item-img" style="font-size: 11px; padding: 4px 8px; white-space: nowrap;"><i data-lucide="image"></i> Browse</button>
              <input type="file" class="item-img-file-input" accept="image/*" style="display: none;" />
            </div>
            <input type="text" class="form-control item-text-field" placeholder="${placeholderText}" value="${TemplateEngine.escapeHtml(isCustom ? (item.text || '') : (item.label || ''))}" style="flex: 1;" />
          </div>
        </div>
      `;
    }).join('');

    if (window.lucide) lucide.createIcons();

    list.querySelectorAll('.cycling-item-row').forEach(row => {
      const mediaSelect = row.querySelector('.item-media-type');
      const iconWrapper = row.querySelector('.item-icon-wrapper');
      const imageWrapper = row.querySelector('.item-image-wrapper');
      const iconInput = row.querySelector('.item-icon');
      const iconPickerBtn = row.querySelector('.btn-open-icon-picker');
      const browseBtn = row.querySelector('.btn-upload-item-img');
      const fileInput = row.querySelector('.item-img-file-input');
      const imgUrlInput = row.querySelector('.item-image-url');

      if (iconPickerBtn && iconInput) {
        iconPickerBtn.addEventListener('click', (e) => {
          e.preventDefault();
          openIconPicker(iconInput);
        });
      }

      mediaSelect.addEventListener('change', (e) => {
        const showImage = e.target.value === 'image';
        iconWrapper.style.display = showImage ? 'none' : 'flex';
        imageWrapper.style.display = showImage ? 'flex' : 'none';
        syncLivePreview();
      });

      browseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        fileInput.click();
      });

      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          imgUrlInput.value = ev.target.result;
          syncLivePreview();
          showToast(`📁 Loaded image for item: ${file.name}`);
        };
        reader.readAsDataURL(file);
      });
    });

    list.querySelectorAll('.btn-remove-cycling-item').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.cycling-item-row').remove();
        syncLivePreview();
      });
    });

    list.querySelectorAll('input, select').forEach(input => {
      input.addEventListener('input', () => syncLivePreview());
      input.addEventListener('change', () => syncLivePreview());
    });
  }

  function readCyclingItems() {
    const list = el('cycling-items-list');
    if (!list) return [];
    return Array.from(list.querySelectorAll('.cycling-item-row')).map(row => {
      const type = row.dataset.type;
      const isCustom = type === 'custom' || type === 'social';
      const mediaType = row.querySelector('.item-media-type')?.value || 'icon';
      const rawIcon = row.querySelector('.item-icon')?.value || '';
      const imageUrl = row.querySelector('.item-image-url')?.value || '';
      const rawVal = row.querySelector('.item-text-field')?.value || '';

      const defaultIcon = type === 'top_supporter' ? 'trophy' : (type === 'recent_donation' ? 'history' : 'star');
      const defaultLabel = type === 'top_supporter' ? 'Top Supporter' : (type === 'recent_donation' ? 'Recent Donation' : '');

      const item = {
        type,
        mediaType,
        icon: rawIcon.trim() || defaultIcon,
        imageUrl
      };
      if (isCustom) {
        item.text = rawVal;
      } else {
        item.label = rawVal.trim() || defaultLabel;
      }
      return item;
    });
  }

  function setupCyclingWidgetEditor() {
    document.querySelectorAll('.btn-add-cycling-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.type;
        const items = readCyclingItems();
        const newItem = { type, icon: 'star' };

        if (type === 'top_supporter') {
          newItem.label = 'Top Supporter';
          newItem.icon = 'trophy';
        } else if (type === 'recent_donation') {
          newItem.label = 'Recent Donation';
          newItem.icon = 'history';
        } else {
          newItem.text = 'Follow @yourname';
          newItem.icon = 'share-2';
        }

        items.push(newItem);
        renderCyclingItems(items);
        syncLivePreview();
      });
    });

    on('btn-copy-cycling-url', 'click', (e) => {
      const base = cachedNetworkInfo ? `http://${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : location.origin;
      const url = `${base}/overlay/cycling-widget`;
      copyToClipboard(url, e.currentTarget);
      showToast('<i data-lucide="copy"></i> Copied Cycling Widget URL');
    });
  }

  // ── Server IO ────────────────────────────────────────────────
  async function saveToServer(profileName) {
    console.log('[Server IO] Saving profile to server:', profileName);
    readFormValues();
    const targetName = profileName || (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
    try {
      const res = await fetch('/api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetName, settings: config })
      });
      const data = await res.json();
      console.log('[Server IO] Save response:', data);
      if (data.ok && data.settings) {
        populateForm(data.settings);
        if (data.profiles) await loadProfilesList(data.activeProfile);
      }
      return data;
    } catch (err) {
      console.error('[Server IO] Save profile error:', err);
      return { ok: false, error: err.message };
    }
  }

  async function loadProfilesList(activeProfile) {
    const select = el('select-profile');
    if (!select) return;
    try {
      console.log('[Profiles] Requesting profile list from /api/profiles...');
      const res = await fetch('/api/profiles');
      const data = await res.json();
      console.log('[Profiles] Received profiles data:', data);
      if (!data || !data.profiles) return;
      const profileNames = Array.isArray(data.profiles)
        ? data.profiles
        : Object.keys(data.profiles);
      const active = activeProfile || data.activeProfile || profileNames[0] || 'Default';
      console.log('[Profiles] Populating select dropdown with profiles:', profileNames, '| Active:', active);
      select.innerHTML = profileNames.map(name =>
        `<option value="${TemplateEngine.escapeHtml(name)}"${name === active ? ' selected' : ''}>${TemplateEngine.escapeHtml(name)}</option>`
      ).join('');
    } catch (e) {
      console.error('[Profiles] Failed to load profiles list:', e);
    }
  }

  // ── Wiring ───────────────────────────────────────────────────
  const TAB_PREVIEW_URLS = {
    goal: '/overlay/goal',
    leaderboard: '/overlay/leaderboard',
    recent: '/overlay/recent',
    cycling: '/overlay/cycling-widget'
  };

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const content = el(`tab-${tab}`);
        if (content) {
          content.classList.add('active');
          // Refresh any CodeMirror editors in this tab
          content.querySelectorAll('.CodeMirror').forEach(cmEl => {
            if (cmEl.CodeMirror) cmEl.CodeMirror.refresh();
          });
        }

        const formPanel = document.querySelector('.form-panel');
        const previewPanel = document.querySelector('.preview-panel');
        const resizer = el('panel-resizer');
        const actionBar = document.querySelector('.action-bar');

        if (tab === 'earnings') {
          refreshEarningsAnalytics();
          if (previewPanel) previewPanel.style.display = 'none';
          if (resizer) resizer.style.display = 'none';
          if (actionBar) actionBar.style.display = 'none';
          if (formPanel) {
            formPanel.style.flex = '1 1 auto';
            formPanel.style.maxWidth = '100%';
          }
        } else {
          if (previewPanel) previewPanel.style.display = '';
          if (resizer) resizer.style.display = '';
          if (actionBar) actionBar.style.display = '';
          if (formPanel) {
            const savedWidth = localStorage.getItem('obs_panel_split_width');
            const mainView = document.querySelector('.main-view');
            const initialWidth = Math.min(620, Math.floor((mainView?.clientWidth || 1200) * 0.52));
            formPanel.style.flex = `0 0 ${savedWidth || initialWidth}px`;
            formPanel.style.maxWidth = '';
          }
        }

        const manager = el('template-manager');
        if (manager) {
          const alertTabs = ['text', 'media', 'style', 'animation'];
          manager.style.display = alertTabs.indexOf(tab) === -1 ? 'none' : '';
        }

        if (!iframe) return;
        const previewUrl = TAB_PREVIEW_URLS[tab] || '/overlay/alert';
        if (iframe.src !== location.origin + previewUrl) iframe.src = previewUrl;
      });
    });
  }

  function setupCodeEditorTabs() {
    document.querySelectorAll('.code-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.code-editor-container');
        if (!container) return;
        container.querySelectorAll('.code-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        container.querySelectorAll('.code-tab-panel').forEach(panel => {
          const isVisible = panel.dataset.codePanel === btn.dataset.codeTab;
          panel.style.display = isVisible ? 'block' : 'none';
          if (isVisible) {
            const cm = panel.querySelector('.CodeMirror');
            if (cm && cm.CodeMirror) cm.CodeMirror.refresh();
          }
        });
      });
    });
  }

  function setupVariablePills() {
    let activeInput = el('input-title-template');
    document.querySelectorAll('input[type="text"], textarea').forEach(input => {
      input.addEventListener('focus', () => { activeInput = input; });
    });

    document.querySelectorAll('.var-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const target = (pill.dataset.targetInput && el(pill.dataset.targetInput)) || activeInput;
        if (!target) return;
        const start = target.selectionStart !== null ? target.selectionStart : target.value.length;
        const end = target.selectionEnd !== null ? target.selectionEnd : target.value.length;
        const insert = `{{${pill.dataset.var}}}`;
        target.value = target.value.substring(0, start) + insert + target.value.substring(end);
        target.focus();
        if (target.setSelectionRange) target.setSelectionRange(start + insert.length, start + insert.length);
        syncLivePreview();
      });
    });
  }

  function setupColorPickers() {
    const pairs = [
      ['input-bg-color', 'input-bg-color-hex'],
      ['input-accent-color', 'input-accent-color-hex'],
      ['input-goal-fill-color', 'input-goal-fill-color-hex'],
      ['input-goal-fill-color2', 'input-goal-fill-color2-hex'],
      ['input-goal-bar-color', 'input-goal-bar-color-hex'],
      ['input-goal-bg-color', 'input-goal-bg-color-hex'],
      ['input-cycling-bg-color', 'input-cycling-bg-color-hex'],
      ['input-cycling-accent-color', 'input-cycling-accent-color-hex'],
      ['input-cycling-border-color', 'input-cycling-border-color-hex'],
      ['input-cycling-media-bg', 'input-cycling-media-bg-hex'],
      ['cycling-label-color', 'cycling-label-color-hex'],
      ['input-lb-bg-color', 'input-lb-bg-color-hex'],
      ['input-lb-accent-color', 'input-lb-accent-color-hex'],
      ['input-lb-row-bg-color', 'input-lb-row-bg-color-hex'],
      ['input-lb-border-color', 'input-lb-border-color-hex'],
      ['input-recent-bg-color', 'input-recent-bg-color-hex'],
      ['input-recent-accent-color', 'input-recent-accent-color-hex'],
      ['input-recent-row-bg-color', 'input-recent-row-bg-color-hex'],
      ['input-recent-border-color', 'input-recent-border-color-hex'],
      ...Object.keys(TEXT_PREFIXES).map(k => [`${TEXT_PREFIXES[k]}-text-color`, `${TEXT_PREFIXES[k]}-text-color-hex`])
    ];

    pairs.forEach(([pickerId, hexId]) => {
      const picker = el(pickerId);
      const hex = el(hexId);
      if (!picker || !hex) return;
      picker.addEventListener('input', () => { hex.value = picker.value; syncLivePreview(); });
      ['input', 'change'].forEach(evt => {
        hex.addEventListener(evt, () => {
          let valStr = hex.value.trim();
          if (!valStr.startsWith('#')) valStr = '#' + valStr;
          if (/^#[0-9a-f]{6}$/i.test(valStr)) { picker.value = valStr; }
          syncLivePreview();
        });
      });
    });
  }

  function setupCanvasPresets() {
    Object.keys(TEXT_PREFIXES).forEach(key => {
      const prefix = TEXT_PREFIXES[key];
      const select = el(`${prefix}-canvas-preset`);
      if (!select) return;
      select.addEventListener('change', () => {
        writeCanvas(prefix, { preset: select.value });
        syncLivePreview();
      });
    });
  }

  function setupAmountFilterEditor() {
    const list = el('amount-filter-list');
    const addBtn = el('btn-filter-row-add');
    if (!list) return;

    list.addEventListener('change', (event) => {
      const row = event.target.closest('.amount-filter-row');
      if (row) updateFilterRowVisibility(row);
      syncLivePreview();
    });
    list.addEventListener('input', () => syncLivePreview());
    list.addEventListener('click', (event) => {
      if (!event.target.classList.contains('filter-remove')) return;
      event.target.closest('.amount-filter-row').remove();
      syncLivePreview();
      if (!list.querySelector('.amount-filter-row')) renderAmountFilters([]);
    });

    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const filters = readAmountFilters();
        filters.push(TemplateMatcher.normalizeFilter({ type: 'range', min: 0, max: 500 }));
        renderAmountFilters(filters);
        syncLivePreview();
      });
    }

    on('btn-match-test', 'click', () => {
      const amount = val('input-match-test', '');
      runTestAlertWithAmount(amount);
    });

    document.querySelectorAll('.btn-quick-test-amount').forEach(btn => {
      btn.addEventListener('click', () => {
        const amt = btn.dataset.amount;
        setVal('input-match-test', amt);
        runTestAlertWithAmount(amt);
      });
    });
  }

  function setupTemplateManager() {
    const select = el('select-template');
    if (select) {
      select.addEventListener('change', () => {
        readFormValues();
        config.activeTemplateId = select.value;
        populateForm(config);
      });
    }

    const withTemplate = (fn) => () => {
      readFormValues();
      fn(currentTemplate());
      populateForm(config);
    };

    el('btn-template-new').addEventListener('click', withTemplate(async () => {
      const name = await AppModal.show({
        title: 'New Template',
        message: 'Enter a name for the new alert template:',
        showInput: true,
        defaultValue: `Alert Template ${config.alertTemplates.length + 1}`
      });
      if (!name) return;
      const base = config.widgets.alert;
      const created = ConfigSchema.createTemplate({
        name,
        canvas: ConfigSchema.clone(base.canvas),
        text: ConfigSchema.clone(base.text),
        style: ConfigSchema.clone(base.style),
        animation: ConfigSchema.clone(base.animation),
        layout: ConfigSchema.clone(base.layout),
        code: ConfigSchema.clone(base.code)
      });
      config.alertTemplates.push(created);
      config.activeTemplateId = created.id;
      populateForm(config);
      showToast('<i data-lucide="sparkles"></i> Created template "' + created.name + '"');
    }));

    el('btn-template-rename').addEventListener('click', withTemplate(async (template) => {
      if (!template) return;
      const name = await AppModal.show({
        title: 'Rename Template',
        message: 'Enter new name:',
        showInput: true,
        defaultValue: template.name
      });
      if (name) {
        template.name = name;
        populateForm(config);
      }
    }));

    el('btn-template-duplicate').addEventListener('click', withTemplate((template) => {
      if (!template) return;
      const copy = ConfigSchema.normalizeTemplate(Object.assign(ConfigSchema.clone(template), {
        id: ConfigSchema.generateId('tpl'),
        name: `${template.name} copy`,
        isDefault: false
      }));
      config.alertTemplates.push(copy);
      config.activeTemplateId = copy.id;
      showToast('<i data-lucide="copy"></i> Duplicated as "' + copy.name + '"');
    }));

    el('btn-template-default').addEventListener('click', withTemplate((template) => {
      if (!template) return;
      config.alertTemplates.forEach(t => { t.isDefault = t.id === template.id; });
      showToast(`⭐ "${template.name}" is now the fallback template`);
    }));

    el('btn-template-delete').addEventListener('click', withTemplate(async (template) => {
      if (!template) return;
      if (config.alertTemplates.length === 1) {
        showToast('<i data-lucide="alert-triangle"></i> At least one template is required');
        return;
      }
      const confirmed = await AppModal.show({
        title: 'Delete Template',
        message: `Are you sure you want to delete "${template.name}"?`
      });
      if (!confirmed) return;
      config.alertTemplates = config.alertTemplates.filter(t => t.id !== template.id);
      config.activeTemplateId = config.alertTemplates[0].id;
      populateForm(config);
      showToast('<i data-lucide="trash-2"></i> Template deleted');
    }));

    el('chk-template-enabled').addEventListener('change', () => syncLivePreview());
  }

  function setupFileBrowsers() {
    const handlers = [
      { btn: 'btn-browse-image', file: 'input-image-file', url: 'input-image-url', kind: 'image' },
      { btn: 'btn-browse-sound', file: 'input-sound-file', url: 'input-sound-url', kind: 'sound' }
    ];

    function readFile(file, urlInputId) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        setVal(urlInputId, event.target.result);
        syncLivePreview();
        showToast(`📁 Loaded local file: ${file.name}`);
      };
      reader.readAsDataURL(file);
    }

    handlers.forEach(h => {
      const btn = el(h.btn);
      const fileInput = el(h.file);
      const urlInput = el(h.url);
      const zone = document.querySelector(`.drop-zone[data-drop-kind="${h.kind}"]`);

      if (btn && fileInput) {
        btn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
        fileInput.addEventListener('change', (e) => {
          readFile(e.target.files[0], h.url);
          fileInput.value = '';
        });
      }

      if (zone) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(evt => {
          zone.addEventListener(evt, (e) => {
            e.preventDefault();
            e.stopPropagation();
          });
        });

        ['dragenter', 'dragover'].forEach(evt => {
          zone.addEventListener(evt, () => zone.classList.add('drag-over'));
        });

        ['dragleave', 'drop'].forEach(evt => {
          zone.addEventListener(evt, () => zone.classList.remove('drag-over'));
        });

        zone.addEventListener('drop', (e) => {
          const file = e.dataTransfer.files[0];
          if (file) {
            const isImage = file.type.startsWith('image/');
            const isAudio = file.type.startsWith('audio/');

            if (h.kind === 'image' && !isImage) return showToast('<i data-lucide="alert-triangle"></i> Please drop an image file');
            if (h.kind === 'sound' && !isAudio) return showToast('<i data-lucide="alert-triangle"></i> Please drop an audio file');

            readFile(file, h.url);
          }
        });
      }
    });
  }

  const SNIPPETS = {
    'html-default': ConfigSchema.DEFAULT_CODE.alert.customHTML,
    'html-badge': '<div class="alert-badge" style="background:var(--accent-color);color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:6px;display:inline-block;">{{sourceApp}}</div>\n{{mediaHtml}}\n<div class="alert-title" style="font-size:26px;">{{sender}} → {{amount}}</div>',
    'css-no-border': '\n.alert-box {\n  border-left: none !important;\n}',
    'css-transparent': '\n.alert-box {\n  background: transparent !important;\n  box-shadow: none !important;\n  backdrop-filter: none !important;\n}',
    'css-large-media': '\n.alert-media {\n  width: 100% !important;\n  max-width: 100% !important;\n  height: auto !important;\n}',
    'css-glow': '\n.alert-box {\n  box-shadow: 0 0 25px var(--accent-color), inset 0 0 15px var(--accent-color) !important;\n}',
    'js-log': '\nconsole.log("[Payment Alert]", notifData.sender, notifData.amount);',
    'js-scale': '\nalertBox.style.transform = "scale(1.15)";\nsetTimeout(() => alertBox.style.transform = "scale(1)", 300);'
  };

  function snippetTarget(key) {
    if (key.startsWith('html-')) return el('input-custom-html');
    if (key.startsWith('css-')) return el('input-custom-css');
    return el('input-custom-js');
  }

  function updateSnippetButtonStates() {
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      const snippet = SNIPPETS[btn.dataset.snippet];
      const target = snippetTarget(btn.dataset.snippet);
      const currentVal = target ? val(target.id, '') : '';
      const active = snippet && currentVal.includes(snippet.trim());
      btn.classList.toggle('active', !!active);
    });
  }

  function setupSnippets() {
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const snippet = SNIPPETS[btn.dataset.snippet];
        const target = snippetTarget(btn.dataset.snippet);
        if (!snippet || !target) return;
        const currentVal = val(target.id, '');
        const trimmed = snippet.trim();
        if (currentVal.includes(trimmed)) {
          setVal(target.id, currentVal.replace(snippet, '').replace(trimmed, '').trim());
          showToast('<i data-lucide="x-circle"></i> Code snippet removed');
        } else {
          setVal(target.id, (currentVal + (currentVal.endsWith('\n') || !currentVal ? '' : '\n') + snippet).trim());
          showToast('<i data-lucide="sparkles"></i> Code snippet applied!');
        }
        updateSnippetButtonStates();
        syncLivePreview();
      });
    });
  }

  function setupCssPills() {
    document.querySelectorAll('.css-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        const selector = pill.dataset.copy || pill.textContent.trim();
        const container = pill.closest('.code-editor-container');
        const cssPanel = container && container.querySelector('.code-tab-panel[data-code-panel="css"]');
        const textarea = cssPanel && cssPanel.querySelector('textarea');
        if (textarea) {
          const currentVal = val(textarea.id, '');
          const insert = `${selector} {\n  \n}\n`;
          setVal(textarea.id, currentVal + (currentVal ? '\n' : '') + insert);
        }
        copyToClipboard(selector).catch(() => {});
        showToast('<i data-lucide="copy"></i> Copied selector "' + selector + '"');
      });
    });
  }

  function attachInputListeners() {
    document.querySelectorAll('.form-control, .color-picker, input, select, textarea').forEach(input => {
      if (input.closest('#amount-filter-list') || input.id === 'select-template' || input.id === 'select-profile' || input.id === 'icon-search-input') return;
      ['input', 'change'].forEach(evt => input.addEventListener(evt, () => {
        syncLivePreview();
      }));
    });
    ['input-custom-html', 'input-custom-css', 'input-custom-js'].forEach(id => {
      const node = el(id);
      if (node) node.addEventListener('input', updateSnippetButtonStates);
    });
  }

  function sampleAlert(customAmount) {
    const samples = [
      { sender: 'Rahul Kumar', amount: '₹500', sourceApp: 'PhonePe', message: 'Awesome stream!' },
      { sender: 'Priya Singh', amount: '₹1000', sourceApp: 'Google Pay', message: 'Keep up the great work!' },
      { sender: 'Amit Verma', amount: '₹250', sourceApp: 'Paytm', message: 'Chai paani subscription ☕' },
      { sender: 'Sneha Patel', amount: '₹300', sourceApp: 'BHIM UPI', message: 'Great gameplay! 🎮' }
    ];
    const isIsolated = config.simulation ? config.simulation.isolatedMode !== false : true;
    const picked = { ...samples[Math.floor(Math.random() * samples.length)], timestamp: Date.now(), simulated: isIsolated };
    if (customAmount !== undefined && customAmount !== null && customAmount !== '') {
      const num = parseFloat(customAmount);
      if (Number.isFinite(num)) {
        picked.amount = `₹${num}`;
      }
    }
    return picked;
  }

  async function runTestAlertWithAmount(specificAmount) {
    syncLivePreview();
    const testData = sampleAlert(specificAmount);
    const amountVal = TemplateMatcher.parseAmount(testData.amount);
    const resolved = TemplateMatcher.resolve(config, amountVal);

    const resultEl = el('match-test-result');
    if (resultEl) {
      resultEl.textContent = `₹${amountVal.toLocaleString('en-IN')} → Matched "${resolved.templateName}"${resolved.templateId === config.activeTemplateId ? ' (editing)' : ''}`;
    }

    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({
        type: 'TRIGGER_TEST_ALERT',
        data: { ...testData, alertTemplateId: resolved.templateId }
      }, '*');
    }
    showToast('<i data-lucide="zap"></i> Test alert (₹' + amountVal + ') → Matched "' + resolved.templateName + '"');

    try {
      await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...testData, alertTemplateId: resolved.templateId })
      });
    } catch (e) {
      console.warn('[Config] Live overlay test trigger error:', e.message);
    }
  }

  function setupActionButtons() {
    on('chk-goal-use-gradient', 'change', (e) => {
      el('goal-fill2-container').style.display = e.target.checked ? 'block' : 'none';
      syncLivePreview();
    });

    document.querySelectorAll('.btn-format-code').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.code-editor-container');
        const activeTab = container.querySelector('.code-tab-btn.active');
        if (!activeTab) return;
        const panel = container.querySelector(`.code-tab-panel[data-code-panel="${activeTab.dataset.codeTab}"]`);
        const textarea = panel && panel.querySelector('textarea');
        if (textarea && textarea.id) formatCode(textarea.id);
      });
    });

    on('btn-save', 'click', async () => {
      try {
        const data = await saveToServer();
        if (data.ok) {
          showToast('<i data-lucide="save"></i> Settings saved successfully!', 'success');
        } else {
          showToast('<i data-lucide="alert-triangle"></i> Save failed', 'error');
        }
      } catch (e) {
        showToast('<i data-lucide="alert-triangle"></i> Save failed: ' + e.message, 'error');
      }
    });

    on('btn-test', 'click', async () => {
      readFormValues();
      syncLivePreview();
      const loadedTemplate = currentTemplate();
      const testData = {
        ...sampleAlert(),
        alertTemplateId: loadedTemplate ? loadedTemplate.id : null
      };
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'TRIGGER_TEST_ALERT',
          data: testData
        }, '*');
      }
      showToast('<i data-lucide="zap"></i> Test alert via loaded template "' + (loadedTemplate ? loadedTemplate.name : 'Default') + '"');
      try {
        await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData)
        });
      } catch (e) {
        console.warn('[Config] Live overlay test trigger error:', e.message);
      }
    });



    on('btn-reset', 'click', async () => {
      const confirmed = await AppModal.show({
        title: 'Reset Defaults',
        message: 'Reset all settings in this profile to defaults?'
      });
      if (!confirmed) return;
      populateForm(ConfigSchema.createDefaultConfig());
      showToast('<i data-lucide="rotate-ccw"></i> Reset to defaults');
    });

    // ── Profiles
    on('select-profile', 'change', async (e) => {
      const res = await fetch('/api/profiles/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: e.target.value })
      });
      const data = await res.json();
      if (data.ok) {
        populateForm(data.settings);
        showToast('<i data-lucide="user"></i> Switched to "' + data.activeProfile + '"');
      }
    });

    on('btn-profile-new', 'click', async () => {
      const name = await AppModal.show({
        title: 'New Profile',
        message: 'Enter a name for the new profile:',
        showInput: true
      });
      if (!name) return;
      await saveToServer(name);
      await loadProfilesList(name);
      showToast('<i data-lucide="user"></i> Created profile "' + name + '"');
    });

    on('btn-profile-rename', 'click', async () => {
      const select = el('select-profile');
      const oldName = select ? select.value : '';
      const name = await AppModal.show({
        title: 'Rename Profile',
        message: 'Enter new name:',
        showInput: true,
        defaultValue: oldName
      });
      if (!name || name === oldName) return;
      await saveToServer(name);
      if (oldName !== 'Default') {
        await fetch('/api/profiles/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: oldName })
        });
      }
      await loadProfilesList(name);
      showToast('<i data-lucide="pencil"></i> Renamed to "' + name + '"');
    });

    on('btn-profile-delete', 'click', async () => {
      const select = el('select-profile');
      const name = select ? select.value : '';
      if (!name) return;
      const confirmed = await AppModal.show({
        title: 'Delete Profile',
        message: `Are you sure you want to delete profile "${name}"?`
      });
      if (!confirmed) return;
      const res = await fetch('/api/profiles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!data.ok) return showToast('<i data-lucide="alert-triangle"></i> ' + (data.error || 'Delete failed'));
      await loadProfilesList(data.activeProfile);
      populateForm(await StorageHelper.loadServer());
      showToast('<i data-lucide="trash-2"></i> Profile deleted');
    });

    on('btn-profile-export', 'click', () => {
      readFormValues();
      const select = el('select-profile');
      StorageHelper.exportToFile(config, `profile-${(select && select.value) || 'default'}.json`);
    });

    on('btn-profile-import', 'click', () => { const f = el('file-import-profile-input'); if (f) f.click(); });
    on('file-import-profile-input', 'change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const importedConfig = await StorageHelper.importFromFile(file);
        let defaultName = file.name.replace(/\.json$/i, '').replace(/^profile-/i, '').trim();
        if (!defaultName) defaultName = 'Imported Profile';

        const profileName = await AppModal.show({
          title: 'Import Profile',
          message: 'Confirm profile name:',
          showInput: true,
          defaultValue: defaultName
        });
        if (!profileName) { e.target.value = ''; return; }

        const res = await fetch('/api/profiles/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: profileName, settings: importedConfig })
        });
        const data = await res.json();
        if (data.ok) {
          await loadProfilesList(data.activeProfile);
          populateForm(data.settings);
          showToast('<i data-lucide="download"></i> Imported profile "' + data.activeProfile + '"');
        } else {
          showToast('<i data-lucide="alert-triangle"></i> Import failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> ' + err.message);
      }
      e.target.value = '';
    });

    // ── Goal Controls (Derived from CSV Single Source of Truth) ──
    on('btn-goal-test-add', async () => {
      try {
        const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
        const res = await fetch('/api/donations/record', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            profile: activeProf,
            sender: 'Test Supporter',
            amount: 100,
            currency: 'INR',
            sourceApp: 'Manual Test'
          })
        });
        const data = await res.json();
        if (data.ok) {
          config.widgets.goal.currentAmount = data.metrics.goalAmount;
          config.widgets.leaderboard.supporters = data.metrics.supporters;
          config.widgets.recent.recentDonations = data.metrics.recentDonations;
          populateForm(config);
          showToast('<i data-lucide="zap"></i> Added ₹100 donation to Goal and CSV');
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> Failed to add amount: ' + err.message);
      }
    });

    on('btn-goal-reset', async () => {
      const confirmed = await AppModal.show({
        title: 'Reset Stream Goal',
        message: 'Reset current goal progress and clear donation records for this profile?'
      });
      if (!confirmed) return;
      try {
        const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
        const res = await fetch('/api/donations/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ profile: activeProf })
        });
        const data = await res.json();
        if (data.ok) {
          config.widgets.goal.currentAmount = data.metrics.goalAmount;
          config.widgets.leaderboard.supporters = data.metrics.supporters;
          config.widgets.recent.recentDonations = data.metrics.recentDonations;
          populateForm(config);
          showToast('<i data-lucide="rotate-ccw"></i> Goal progress reset');
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> Failed to reset goal progress');
      }
    });

    // ── Centralized Donations Data CSV Helpers ────────────────
    on('btn-sidebar-export-donations', 'click', () => {
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      window.open(`/api/donations/csv?profile=${encodeURIComponent(activeProf)}`, '_blank');
      showToast('<i data-lucide="file-spreadsheet"></i> Exporting donations.csv for Excel/Sheets...');
    });

    on('btn-sidebar-import-donations', 'click', () => {
      const f = el('file-import-donations-csv');
      if (f) f.click();
    });

    on('file-import-donations-csv', 'change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const text = ev.target.result;
          let csvPayload = text;
          if (file.name.endsWith('.json') || text.trim().startsWith('{') || text.trim().startsWith('[')) {
            const parsed = JSON.parse(text);
            const list = Array.isArray(parsed) ? parsed : (parsed.recentDonations || Object.entries(parsed.supporters || parsed).map(([name, total]) => ({ sender: name, amount: total })));
            const txs = list.map((r, i) => ({
              id: r.id || `imported_${Date.now()}_${i}`,
              timestamp: Number(r.timestamp) || (Date.now() - i * 60000),
              date: new Date(Number(r.timestamp) || Date.now()).toISOString().split('T')[0],
              time: new Date(Number(r.timestamp) || Date.now()).toTimeString().split(' ')[0],
              sender: r.sender || 'Unknown',
              amount: parseFloat(r.amountValue || TemplateMatcher.parseAmount(r.amount)) || 0,
              rawAmount: r.amount ? String(r.amount) : `₹${r.amountValue || 0}`,
              sourceApp: r.sourceApp || 'Imported Data',
              message: r.message || '',
              templateId: '',
              simulated: false
            }));
            csvPayload = PaymentsCsv.serializeCsv(txs);
          }

          const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
          const res = await fetch('/api/donations/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: activeProf, csv: csvPayload, mode: 'replace' })
          });
          const data = await res.json();
          if (data.ok) {
            config.widgets.goal.currentAmount = data.metrics.goalAmount;
            config.widgets.leaderboard.supporters = data.metrics.supporters;
            config.widgets.recent.recentDonations = data.metrics.recentDonations;
            populateForm(config);
            showToast(`<i data-lucide="file-spreadsheet"></i> Imported ${data.totalCount} transactions into ${activeProf}`);
          } else {
            showToast('<i data-lucide="alert-triangle"></i> Import error: ' + (data.error || 'Failed'));
          }
        } catch (err) {
          showToast('<i data-lucide="alert-triangle"></i> Invalid file format: ' + err.message);
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // ── Code reset buttons
    [['btn-reset-alert-code', 'alert', ['input-custom-html', 'input-custom-css', 'input-custom-js']],
     ['btn-reset-goal-code', 'goal', ['input-goal-custom-html', 'input-goal-custom-css', 'input-goal-custom-js']],
     ['btn-reset-lb-code', 'leaderboard', ['input-lb-custom-html', 'input-lb-custom-css', 'input-lb-custom-js']],
     ['btn-reset-recent-code', 'recent', ['input-recent-custom-html', 'input-recent-custom-css', 'input-recent-custom-js']],
     ['btn-reset-cycling-code', 'cycling', ['input-cycling-custom-html', 'input-cycling-custom-css', 'input-cycling-custom-js']]
    ].forEach(([btnId, kind, ids]) => {
      on(btnId, 'click', () => {
        const defaults = ConfigSchema.DEFAULT_CODE[kind];
        setVal(ids[0], defaults.customHTML);
        setVal(ids[1], defaults.customCSS);
        setVal(ids[2], defaults.customJS);
        updateSnippetButtonStates();
        syncLivePreview();
        showToast('<i data-lucide="rotate-ccw"></i> Code reset to defaults');
      });
    });

    // ── Sound test
    on('btn-test-sound', 'click', () => {
      const url = val('input-sound-url', '');
      if (!url) return showToast('<i data-lucide="alert-triangle"></i> No sound URL set');
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, numVal('input-sound-volume', 80) / 100));
      audio.play().catch(err => showToast('<i data-lucide="alert-triangle"></i> ' + err.message));
    });
  }

  // ── Custom Event Simulator ────────────────────────────────────
  function updateSimulatorTemplateOptions() {
    const simSelect = el('sim-template-override');
    if (!simSelect) return;
    const current = simSelect.value;
    simSelect.innerHTML = '<option value="">Auto-Match by Amount (Default)</option>' +
      config.alertTemplates.map(t =>
        `<option value="${TemplateEngine.escapeHtml(t.id)}"${t.id === current ? ' selected' : ''}>${TemplateEngine.escapeHtml(t.name)} (ID: ${t.id})</option>`
      ).join('');
  }

  function setupSimulator() {
    function buildSimulatedNotification(providerKey, senderName, rawAmount, note) {
      const sender = (senderName || 'Anonymous').trim();
      const numAmount = TemplateMatcher.parseAmount(rawAmount) || 100;
      const formattedAmount = numAmount.toLocaleString('en-IN');
      const msg = (note || '').trim();

      let appName = 'PhonePe';
      let packageName = 'com.phonepe.app';
      let title = 'PhonePe';
      let text = `${sender} has sent Rs. ${formattedAmount}.00 to your bank account`;

      if (providerKey === 'gpay') {
        appName = 'Google Pay';
        packageName = 'com.google.android.apps.nbu.paisa.user';
        title = 'Google Pay';
        text = `Received ₹${formattedAmount} from ${sender}`;
      } else if (providerKey === 'paytm') {
        appName = 'Paytm';
        packageName = 'net.one97.paytm';
        title = 'Paytm';
        text = `Payment of ₹${formattedAmount} received from ${sender}`;
      } else if (providerKey === 'amazon') {
        appName = 'Amazon Pay';
        packageName = 'in.amazon.mShop.android.shopping';
        title = `₹${formattedAmount} received`;
        text = `Money received from ${sender} on Amazon Pay`;
      } else if (providerKey === 'bhim') {
        appName = 'BHIM UPI';
        packageName = 'in.org.npci.upiapp';
        title = 'UPI Payment';
        text = `${sender} sent ₹${formattedAmount} via UPI`;
      } else {
        appName = 'PhonePe';
        packageName = 'com.phonepe.app';
        title = 'PhonePe';
        text = `${sender} has sent Rs. ${formattedAmount}.00 to your bank account`;
      }

      const isIsolated = config.simulation ? config.simulation.isolatedMode !== false : true;
      return {
        type: 'payment_notification',
        simulated: isIsolated,
        packageName,
        appName,
        title,
        text,
        bigText: text,
        message: msg,
        timestamp: Date.now()
      };
    }

    const SIM_PRESETS = {
      phonepe: { provider: 'phonepe', sender: 'Rahul Kumar', amount: '500', message: 'Awesome stream!' },
      gpay:    { provider: 'gpay',    sender: 'Priya Singh', amount: '1000', message: 'Keep up the great work!' },
      paytm:   { provider: 'paytm',   sender: 'Amit Verma',  amount: '250',  message: 'Chai paani subscription ☕' },
      amazon:  { provider: 'amazon',  sender: 'Sneha Patel', amount: '1500', message: 'Thanks for streaming!' },
      highval: { provider: 'phonepe', sender: 'Vikramaditya', amount: '5000', message: 'ULTRA DONATION! 👑🔥' }
    };

    document.querySelectorAll('.btn-sim-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = SIM_PRESETS[btn.dataset.preset];
        if (!p) return;
        setVal('sim-app-provider', p.provider);
        setVal('sim-sender', p.sender);
        setVal('sim-amount', p.amount);
        setVal('sim-message', p.message);
        setVal('sim-alert-id', `evt_${Date.now()}`);
        showToast('<i data-lucide="sparkles"></i> Loaded preset "' + p.provider.toUpperCase() + '"');
      });
    });

    on('chk-sim-isolated-mode', 'change', async (e) => {
      readFormValues();
      await saveToServer();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      showToast(e.target.checked
        ? '<i data-lucide="shield-check"></i> Isolated Simulation Mode active (Live stats safe)'
        : '<i data-lucide="alert-triangle"></i> Isolated Simulation Mode OFF (Tests will update Goal/Leaderboard)',
        e.target.checked ? 'info' : 'warning');
    });

    on('btn-sim-random', 'click', () => {
      const sample = sampleAlert();
      const providers = ['phonepe', 'gpay', 'paytm', 'amazon', 'bhim'];
      const p = providers[Math.floor(Math.random() * providers.length)];
      setVal('sim-app-provider', p);
      setVal('sim-sender', sample.sender);
      setVal('sim-amount', String(sample.amountVal || 250));
      setVal('sim-message', sample.message || 'Stream support!');
      setVal('sim-alert-id', `evt_${Date.now()}`);
      showToast('<i data-lucide="dices"></i> Generated random event');
    });

    on('btn-sim-gen-id', 'click', () => {
      setVal('sim-alert-id', `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
    });

    on('btn-sim-clear-console', 'click', () => {
      const c = el('sim-console');
      if (c) c.textContent = 'Console cleared. Ready for next simulation.';
    });

    on('btn-sim-inspect', 'click', () => {
      readFormValues();
      const provider = val('sim-app-provider', 'phonepe');
      const sender = val('sim-sender', 'Rahul Kumar');
      const rawAmount = val('sim-amount', '500');
      const message = val('sim-message', '');
      const forcedId = val('sim-template-override', '');
      const isIsolated = config.simulation ? config.simulation.isolatedMode !== false : true;

      const rawNotif = buildSimulatedNotification(provider, sender, rawAmount, message);
      const numAmount = TemplateMatcher.parseAmount(rawAmount);
      const resolved = TemplateMatcher.resolve(config, numAmount, forcedId || null);

      const logData = {
        inspectTime: new Date().toLocaleTimeString(),
        simulationMode: isIsolated ? '🛡️ Isolated (Goal & Leaderboard untouched)' : '⚡ Live Mutation (Will update Goal & Leaderboard)',
        simulatedRawMobileNotification: rawNotif,
        parsedDetails: {
          extractedSender: sender,
          extractedNumericAmount: numAmount,
          templateOverrideId: forcedId || 'None (Auto-Match)'
        },
        templateMatchOutput: {
          matchedTemplateName: resolved.templateName,
          matchedTemplateId: resolved.templateId,
          customCodeEnabled: resolved.code ? resolved.code.enableCustomCode !== false : true,
          mediaUrl: (resolved.image && (resolved.image.gifUrl || resolved.image.imageUrl)) || 'None',
          soundUrl: (resolved.sound && resolved.sound.soundUrl) || 'None'
        }
      };

      const c = el('sim-console');
      if (c) c.textContent = `[SIMULATED RAW MOBILE EVENT & PARSER INSPECTION]\n${JSON.stringify(logData, null, 2)}`;
      showToast('<i data-lucide="search"></i> Inspected: Matched "' + resolved.templateName + '"');
    });

    on('btn-sim-dispatch', 'click', async () => {
      readFormValues();
      const provider = val('sim-app-provider', 'phonepe');
      const sender = val('sim-sender', 'Rahul Kumar');
      const rawAmount = val('sim-amount', '500');
      const message = val('sim-message', '');
      const forcedId = val('sim-template-override', '');
      const isIsolated = config.simulation ? config.simulation.isolatedMode !== false : true;

      // Generate a fresh unique ID for every dispatch so the server counts it for goal/leaderboard
      const alertId = `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      setVal('sim-alert-id', alertId);

      const rawNotif = buildSimulatedNotification(provider, sender, rawAmount, message);
      rawNotif.alertId = alertId;
      if (forcedId) rawNotif.alertTemplateId = forcedId;

      const c = el('sim-console');
      if (c) c.textContent = `[DISPATCHING RAW MOBILE NOTIFICATION (${isIsolated ? '🛡️ ISOLATED' : '⚡ LIVE'})...]\n${JSON.stringify(rawNotif, null, 2)}`;

      try {
        const res = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(rawNotif)
        });
        const data = await res.json();
        if (c) {
          c.textContent = `[DISPATCH SUCCESS - ${new Date().toLocaleTimeString()}]\n` +
            `Simulation Mode: ${isIsolated ? '🛡️ ISOLATED (Live stats protected)' : '⚡ LIVE MUTATION (Goal & Leaderboard updated)'}\n` +
            `Server Output: ${JSON.stringify(data, null, 2)}\n\n` +
            `Raw Mobile Notification Payload Sent:\n${JSON.stringify(rawNotif, null, 2)}`;
        }
        showToast('<i data-lucide="send"></i> Dispatched raw event (' + provider.toUpperCase() + ' ₹' + rawAmount + ' · ' + (isIsolated ? 'Isolated' : 'Live') + ')');
      } catch (err) {
        if (c) c.textContent += `\n\n[ERROR]: ${err.message}`;
        showToast('<i data-lucide="alert-triangle"></i> Dispatch failed: ' + err.message);
      }
    });
  }

  // ── Network, Live Logs & System Dashboard ───────────────────
  let cachedNetworkInfo = null;
  let dashboardWs = null;

  function connectDashboardWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    try {
      dashboardWs = new WebSocket(`${protocol}//${location.host}/obs`);
      dashboardWs.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'SETTINGS_UPDATED' && msg.payload) {
            const newConfig = msg.payload;
            // Sync ONLY live goal/leaderboard data to avoid overwriting active user edits in other fields
            config.widgets.goal.currentAmount = newConfig.widgets.goal.currentAmount;
            config.widgets.leaderboard.supporters = newConfig.widgets.leaderboard.supporters;
            config.widgets.recent.recentDonations = newConfig.widgets.recent.recentDonations;

            // Refresh UI components for live data
            setVal('input-goal-current', config.widgets.goal.currentAmount);
            syncLivePreview();

            // Live refresh analytics if viewing the Earning Overview tab
            const activeTabBtn = document.querySelector('.tab-btn.active');
            if (activeTabBtn && activeTabBtn.dataset.tab === 'earnings') {
              refreshEarningsAnalytics();
            }
          }
        } catch (e) {}
      };
      dashboardWs.onclose = () => setTimeout(connectDashboardWebSocket, 3000);
    } catch (e) {
      console.warn('[DashboardWS] Failed to connect:', e.message);
    }
  }

  async function fetchNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      const data = await res.json();
      cachedNetworkInfo = data;

      const ipEl = el('net-ip-display');
      if (ipEl) ipEl.textContent = `${data.primaryIp}:${data.port}`;

      const androidDot = el('dot-android-status');
      const androidLbl = el('lbl-android-status');
      if (androidLbl && androidDot) {
        if (data.androidClientsCount > 0) {
          androidDot.style.background = '#00e676';
          androidLbl.textContent = `Connected (${data.androidClientsCount})`;
        } else {
          androidDot.style.background = '#ff5252';
          androidLbl.textContent = 'Disconnected (0)';
        }
      }

      const obsDot = el('dot-obs-status');
      const obsLbl = el('lbl-obs-status');
      if (obsLbl && obsDot) {
        if (data.obsClientsCount > 0) {
          obsDot.style.background = '#00e676';
          obsLbl.textContent = `Connected (${data.obsClientsCount})`;
        } else {
          obsDot.style.background = '#ffab00';
          obsLbl.textContent = 'No OBS client connected';
        }
      }
    } catch (e) {
      console.warn('[NetworkInfo] Fetch error:', e.message);
    }
  }

  async function fetchLiveLogs() {
    try {
      const res = await fetch('/api/logs/live');
      const data = await res.json();
      if (!data || !Array.isArray(data.lines)) return;

      const filterVal = val('select-log-filter', 'ALL');
      const lines = data.lines.filter(line => {
        if (filterVal === 'ALL') return true;
        return line.includes(`[${filterVal}]`);
      });

      const term = el('live-logs-terminal');
      if (term) {
        term.textContent = lines.length > 0 ? lines.slice(-150).join('\n') : 'No matching log entries.';
        term.scrollTop = term.scrollHeight;
      }
    } catch (e) {
      console.warn('[LiveLogs] Fetch error:', e.message);
    }
  }

  function setupNetworkAndSystem() {
    fetchNetworkInfo();
    setInterval(fetchNetworkInfo, 5000);

    on('btn-copy-ip', 'click', (e) => {
      const ipText = cachedNetworkInfo ? `${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : (el('net-ip-display') ? el('net-ip-display').textContent : '');
      if (ipText) {
        copyToClipboard(ipText, e.currentTarget);
        showToast('<i data-lucide="copy"></i> Copied Mobile IP: ' + ipText);
      } else {
        showToast('<i data-lucide="alert-triangle"></i> No IP available yet');
      }
    });

    on('btn-fix-firewall', 'click', async () => {
      try {
        const res = await fetch('/api/system/firewall', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          showToast('<i data-lucide="shield"></i> Unblocked Windows Firewall!');
        } else {
          showToast('<i data-lucide="alert-triangle"></i> Firewall update error: ' + (data.error || 'Failed'));
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> Firewall update error: ' + err.message);
      }
    });

    function copyOverlayUrl(path, label, btn) {
      const base = cachedNetworkInfo ? `http://${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : location.origin;
      const fullUrl = `${base}${path}`;
      copyToClipboard(fullUrl, btn);
      showToast('<i data-lucide="copy"></i> Copied ' + label + ' URL: ' + fullUrl);
    }

    on('btn-copy-alert-url-tab', 'click', (e) => copyOverlayUrl('/overlay/alerts', 'Alert Overlay', e.currentTarget));
    on('btn-copy-goal-url', 'click', (e) => copyOverlayUrl('/overlay/goal', 'Goal Overlay', e.currentTarget));
    on('btn-copy-lb-url', 'click', (e) => copyOverlayUrl('/overlay/leaderboard', 'Leaderboard Overlay', e.currentTarget));
    on('btn-copy-recent-url', 'click', (e) => copyOverlayUrl('/overlay/recent', 'Recent Overlay', e.currentTarget));
    on('btn-copy-cycling-url', 'click', (e) => copyOverlayUrl('/overlay/cycling-widget', 'Cycling Overlay', e.currentTarget));

    on('btn-copy-current-url', 'click', (e) => {
      if (!iframe) return;
      let path = new URL(iframe.src, location.origin).pathname;
      if (path === '/preview.html' || path === '/overlay/alert') path = '/overlay/alerts';

      const base = cachedNetworkInfo ? `http://${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : location.origin;
      const fullUrl = `${base}${path}`;
      copyToClipboard(fullUrl, e.currentTarget);
      showToast('<i data-lucide="copy"></i> Copied Overlay URL: ' + fullUrl);
    });

    on('btn-open-new-tab', 'click', () => {
      if (!iframe) return;
      let url = iframe.src;
      const path = new URL(url, location.origin).pathname;
      if (path === '/preview.html' || path === '/overlay/alert') {
          url = '/overlay/alerts';
      }
      window.open(url, '_blank');
    });

    // ── Custom Max Entry Toggles
    ['lb', 'recent'].forEach(key => {
      on(`select-${key}-max`, 'change', (e) => {
        el(`input-${key}-max-custom`).style.display = e.target.value === 'custom' ? 'block' : 'none';
        syncLivePreview();
      });
    });

    on('btn-clear-logs', 'click', async () => {
      try {
        await fetch('/api/logs/clear', { method: 'POST' });
        const term = el('live-logs-terminal');
        if (term) term.textContent = 'Server logs cleared.';
        showToast('<i data-lucide="trash-2"></i> Logs cleared');
      } catch (e) {
        showToast('<i data-lucide="alert-triangle"></i> Clear logs error');
      }
    });

    on('btn-download-full-logs', 'click', () => {
      window.open('/api/logs?level=ALL', '_blank');
      showToast('<i data-lucide="download"></i> Downloading full log file...');
    });

    on('btn-download-filtered-logs', 'click', () => {
      const filterVal = val('select-log-filter', 'ALL');
      window.open(`/api/logs?level=${encodeURIComponent(filterVal)}`, '_blank');
      showToast('<i data-lucide="download"></i> Downloading ' + filterVal + ' filtered logs...');
    });

    fetchLiveLogs();
    setInterval(fetchLiveLogs, 4000);

    on('select-log-filter', 'change', () => fetchLiveLogs());
    on('btn-refresh-logs', 'click', () => {
      fetchLiveLogs();
      showToast('<i data-lucide="rotate-ccw"></i> Logs refreshed');
    });
  }

  // ── Earning Overview & Analytics Controller ─────────────────────
  let analyticsState = {
    month: 'all',
    provider: 'all',
    range: 'all',
    timelineMode: 'month',
    search: '',
    searchDonor: '',
    searchNote: '',
    minAmount: '',
    specificDate: '',
    startDate: '',
    endDate: '',
    sortOrder: 'desc',
    page: 1,
    limit: 50
  };

  let analyticsSearchDebounce = null;

  async function refreshEarningsAnalytics() {
    await fetchAndRenderAnalytics();
  }

  async function fetchAndRenderAnalytics() {
    try {
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';

      // 1. Fetch available months list
      try {
        const mRes = await fetch(`/api/donations/months?profile=${encodeURIComponent(activeProf)}`);
        const mData = await mRes.json();
        if (mData.ok && Array.isArray(mData.months)) {
          const monthSelect = el('select-analytics-month');
          if (monthSelect) {
            const currentVal = analyticsState.month;
            let optionsHtml = '<option value="all">📅 All Time (Full History)</option>';
            mData.months.forEach(m => {
              const [yr, mo] = m.split('-');
              const dateObj = new Date(parseInt(yr, 10), parseInt(mo, 10) - 1, 1);
              const label = dateObj.toLocaleString('default', { month: 'long', year: 'numeric' });
              optionsHtml += `<option value="${m}"${m === currentVal ? ' selected' : ''}>${label}</option>`;
            });
            monthSelect.innerHTML = optionsHtml;
          }
        }
      } catch (_) {}

      // 2. Fetch aggregated analytics
      const effectiveSearch = [analyticsState.search, analyticsState.searchDonor, analyticsState.searchNote].filter(Boolean).join(' ');
      const params = new URLSearchParams({
        profile: activeProf,
        month: analyticsState.month,
        provider: analyticsState.provider,
        timelineMode: analyticsState.timelineMode,
        donutMode: analyticsState.donutMode || 'all',
        search: effectiveSearch,
        minAmount: analyticsState.minAmount,
        date: analyticsState.specificDate,
        startDate: analyticsState.startDate,
        endDate: analyticsState.endDate
      });

      const res = await fetch(`/api/analytics?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) return;

      const a = data.analytics || {};

      // 3. Update KPI Cards & Single-Line Summary Bar
      if (el('kpi-total-revenue')) el('kpi-total-revenue').innerHTML = a.formattedTotalRevenue || '&#8377;0.00';
      if (el('kpi-total-count')) el('kpi-total-count').textContent = (a.totalDonationsCount || 0).toLocaleString();
      if (el('kpi-unique-donors')) el('kpi-unique-donors').textContent = (a.uniqueDonorsCount || 0).toLocaleString();
      if (el('kpi-avg-amount')) el('kpi-avg-amount').innerHTML = a.formattedAverageDonation || '&#8377;0.00';
      if (el('kpi-peak-day')) {
        const peak = a.peakDay;
        if (peak && peak.date !== 'N/A' && peak.amount > 0) {
          el('kpi-peak-day').textContent = `${peak.date} · ${peak.formattedAmount}`;
        } else {
          el('kpi-peak-day').textContent = 'N/A';
        }
      }

      // Single-Line Filtered Stats Summary Bar
      if (el('summary-stat-total')) el('summary-stat-total').innerHTML = a.formattedTotalRevenue || '&#8377;0.00';
      if (el('summary-stat-count')) el('summary-stat-count').textContent = (a.totalDonationsCount || 0).toLocaleString();
      if (el('summary-stat-donors')) el('summary-stat-donors').textContent = (a.uniqueDonorsCount || 0).toLocaleString();
      if (el('summary-stat-avg')) el('summary-stat-avg').innerHTML = a.formattedAverageDonation || '&#8377;0.00';
      if (el('summary-stat-badge')) {
        const filterParts = [];
        if (analyticsState.provider && analyticsState.provider !== 'all') {
          filterParts.push(`Method: ${analyticsState.provider.toUpperCase()}`);
        }
        if (analyticsState.startDate && analyticsState.endDate) {
          filterParts.push(`${analyticsState.startDate} to ${analyticsState.endDate}`);
        } else if (analyticsState.startDate) {
          filterParts.push(`From ${analyticsState.startDate}`);
        } else if (analyticsState.endDate) {
          filterParts.push(`Up to ${analyticsState.endDate}`);
        } else if (analyticsState.month && analyticsState.month !== 'all') {
          filterParts.push(`Month: ${analyticsState.month}`);
        }
        if (analyticsState.searchDonor) filterParts.push(`Donor: "${analyticsState.searchDonor}"`);
        if (analyticsState.searchNote) filterParts.push(`Note: "${analyticsState.searchNote}"`);
        if (analyticsState.minAmount) filterParts.push(`Min: ₹${analyticsState.minAmount}`);

        el('summary-stat-badge').textContent = filterParts.length > 0
          ? `Filtered: ${filterParts.join(' · ')}`
          : 'Showing all records';
      }

      // 4. Render Donut / Pie Chart with prominent Center Total
      renderDonutChart(a.donut || { totalRevenue: 0, formattedTotal: '₹0.00', segments: [] });

      // 5. Render Detached Income Timeline Graph
      renderTrendChart(a.timeline || a.dailyTrends || []);

      // 6. Fetch and render Paginated Ledger
      await fetchAndRenderLedger(activeProf);

    } catch (e) {
      console.warn('[Analytics] Fetch error:', e.message);
    }
  }

  function renderDonutChart(donut) {
    const svg = el('analytics-donut-svg');
    const centerAmt = el('donut-center-amount');
    const centerLbl = el('donut-center-label');
    const legend = el('analytics-donut-legend');
    if (!svg || !centerAmt || !legend) return;

    centerAmt.textContent = donut.formattedTotal || '₹0.00';
    if (centerLbl) centerLbl.textContent = `${donut.totalCount || 0} Donations`;

    const segments = donut.segments || [];

    if (!segments.length || donut.totalRevenue <= 0) {
      svg.innerHTML = `
        <circle cx="110" cy="110" r="85" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="26" />
      `;
      legend.innerHTML = '<span style="font-size: 11px; color: var(--text-muted);">No donation data for current filter</span>';
      return;
    }

    const cx = 110;
    const cy = 110;
    const r = 85;
    const strokeWidth = 28;
    const circumference = 2 * Math.PI * r;

    let pathsHtml = '';
    let accumulatedOffset = 0;

    segments.forEach((seg, idx) => {
      const strokeDash = (seg.percentage / 100) * circumference;
      const strokeGap = circumference - strokeDash;
      const offset = -accumulatedOffset;
      accumulatedOffset += strokeDash;

      pathsHtml += `
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
          stroke="${seg.color}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${strokeDash} ${strokeGap}"
          stroke-dashoffset="${offset}"
          style="transform: rotate(-90deg); transform-origin: 110px 110px; transition: stroke-width 0.2s ease, filter 0.2s ease; cursor: pointer;"
          data-provider="${seg.name}"
          data-amount="${seg.formattedAmount}"
          data-percent="${seg.percentage}%"
          class="donut-slice"
        >
          <title>${seg.name}: ${seg.formattedAmount} (${seg.percentage}%)</title>
        </circle>
      `;
    });

    svg.innerHTML = pathsHtml;

    // Render interactive legend pills
    legend.innerHTML = segments.map(seg => `
      <div class="analytics-legend-pill" title="${seg.count} transactions">
        <span class="analytics-legend-dot" style="background: ${seg.color}; box-shadow: 0 0 6px ${seg.glow};"></span>
        <span style="font-weight: 600;">${TemplateEngine.escapeHtml(seg.name)}</span>
        <span style="color: var(--text-muted); font-size: 10px;">${seg.percentage}%</span>
        <span style="font-weight: 700; color: var(--accent);">${seg.formattedAmount}</span>
      </div>
    `).join('');
  }

  function renderTrendChart(trends) {
    const svg = el('analytics-trend-svg');
    if (!svg) return;

    if (!trends || !trends.length) {
      svg.innerHTML = `
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="12">
          No transactions recorded for this timeframe
        </text>
      `;
      return;
    }

    const viewBoxWidth = 680;
    const viewBoxHeight = 240;
    svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);

    const leftMargin = 68;
    const rightMargin = 20;
    const topMargin = 22;
    const bottomMargin = 38;

    const plotWidth = viewBoxWidth - leftMargin - rightMargin;
    const plotHeight = viewBoxHeight - topMargin - bottomMargin;

    const rawMax = Math.max(...trends.map(t => t.amount), 0);
    function getNiceMax(val) {
      if (val <= 0) return 500;
      if (val <= 100) return 100;
      if (val <= 250) return 250;
      if (val <= 500) return 500;
      if (val <= 1000) return 1000;
      if (val <= 2500) return 2500;
      if (val <= 5000) return 5000;
      if (val <= 10000) return 10000;
      if (val <= 25000) return 25000;
      if (val <= 50000) return 50000;
      const mag = Math.pow(10, Math.floor(Math.log10(val)));
      return Math.ceil(val / mag) * mag;
    }

    const maxScale = getNiceMax(rawMax);
    const gridSteps = [1.0, 0.75, 0.5, 0.25, 0.0];

    function formatShortCurrency(amount) {
      if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
      if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}k`;
      return `₹${amount}`;
    }

    let gridHtml = '';
    gridSteps.forEach(ratio => {
      const val = maxScale * ratio;
      const y = topMargin + (1.0 - ratio) * plotHeight;
      const isBaseline = ratio === 0.0;

      gridHtml += `
        <line x1="${leftMargin}" y1="${y}" x2="${viewBoxWidth - rightMargin}" y2="${y}"
          class="${isBaseline ? 'trend-axis-line' : 'trend-grid-line'}"
          stroke-width="${isBaseline ? '1.5' : '1'}" />
        <text x="${leftMargin - 8}" y="${y + 3.5}" text-anchor="end" fill="var(--text-muted)" font-size="10" font-family="sans-serif">
          ${formatShortCurrency(val)}
        </text>
      `;
    });

    const slotWidth = plotWidth / trends.length;
    const barWidth = Math.max(8, Math.min(34, slotWidth * 0.62));

    let barsHtml = '';
    trends.forEach((t, i) => {
      const slotX = leftMargin + i * slotWidth;
      const barX = slotX + (slotWidth - barWidth) / 2;
      const barHeight = t.amount > 0 ? Math.max(4, (t.amount / maxScale) * plotHeight) : 2;
      const barY = topMargin + plotHeight - barHeight;
      const isPositive = t.amount > 0;

      // Draw subtle vertical grid delimiter
      const delimiterHtml = i > 0 ? `
        <line x1="${slotX}" y1="${topMargin}" x2="${slotX}" y2="${topMargin + plotHeight}" stroke="rgba(255,255,255,0.03)" stroke-dasharray="2,2" />
      ` : '';

      barsHtml += `
        ${delimiterHtml}
        <g class="trend-slot-group" data-date="${t.date}" data-amount="${t.formattedAmount}">
          <!-- Hover highlight column slot -->
          <rect x="${slotX}" y="${topMargin}" width="${slotWidth}" height="${plotHeight}"
            fill="rgba(0, 229, 255, 0.06)" rx="3" opacity="0" class="trend-slot-hover" />

          <!-- Clean Rounded Gradient Bar without dot -->
          <rect class="trend-bar" x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4"
            fill="${isPositive ? 'url(#trendBarGrad)' : 'rgba(255,255,255,0.08)'}"
            opacity="${isPositive ? '0.92' : '0.4'}"
          >
            <title>${t.date}: ${t.formattedAmount} (${t.count || 0} donations)</title>
          </rect>

          <!-- X Axis Day / Week / Month Label -->
          <text x="${slotX + slotWidth / 2}" y="${viewBoxHeight - 12}" text-anchor="middle"
            fill="${isPositive ? 'var(--text-main)' : 'var(--text-muted)'}"
            font-size="${trends.length > 10 ? '9' : '10.5'}"
            font-weight="${isPositive ? '600' : '400'}"
            font-family="sans-serif"
          >
            ${t.dayLabel}
          </text>
        </g>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="trendBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#00e5ff" />
          <stop offset="60%" stop-color="#7928ca" />
          <stop offset="100%" stop-color="rgba(121, 40, 202, 0.3)" />
        </linearGradient>
      </defs>
      ${gridHtml}
      ${barsHtml}
    `;
  }

  async function fetchAndRenderLedger(activeProf) {
    const body = el('analytics-ledger-body');
    const info = el('ledger-pagination-info');
    const countLbl = el('ledger-count-label');
    const btnPrev = el('btn-ledger-prev');
    const btnNext = el('btn-ledger-next');
    if (!body) return;

    try {
      const effectiveSearch = [analyticsState.search, analyticsState.searchDonor, analyticsState.searchNote].filter(Boolean).join(' ');
      const params = new URLSearchParams({
        profile: activeProf,
        month: analyticsState.month,
        provider: analyticsState.provider,
        search: effectiveSearch,
        minAmount: analyticsState.minAmount,
        date: analyticsState.specificDate,
        startDate: analyticsState.startDate,
        endDate: analyticsState.endDate,
        sort: analyticsState.sortOrder || 'desc',
        page: analyticsState.page,
        limit: analyticsState.limit
      });

      const res = await fetch(`/api/donations/query?${params.toString()}`);
      const data = await res.json();
      if (!data.ok) return;

      const txs = data.transactions || [];
      if (countLbl) countLbl.textContent = `${data.total || 0} records`;
      if (info) info.textContent = `Page ${data.page} of ${data.totalPages || 1}`;

      if (btnPrev) btnPrev.disabled = data.page <= 1;
      if (btnNext) btnNext.disabled = data.page >= data.totalPages;

      if (!txs.length) {
        body.innerHTML = '<tr><td colspan="6" style="padding: 20px; text-align: center; color: var(--text-muted);">No matching transactions found</td></tr>';
        return;
      }

      body.innerHTML = txs.map(tx => {
        const meta = PaymentsCsv.getProviderMeta(tx.sourceApp);
        const pKey = PaymentsCsv.normalizeProviderKey(tx.sourceApp);
        const curr = tx.currency || 'INR';

        return `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 8px 10px; color: var(--text-muted); font-size: 11px;">
              <div style="font-weight: 500; color: var(--text-main);">${tx.date || ''}</div>
              <div style="font-size: 10px;">${tx.time || ''}</div>
            </td>
            <td style="padding: 8px 10px;">
              <div style="font-weight: 600; color: var(--text-main); font-size: 12px;">${TemplateEngine.escapeHtml(tx.sender || 'Unknown')}</div>
            </td>
            <td style="padding: 8px 10px;">
              <span class="provider-badge ${pKey}">${TemplateEngine.escapeHtml(meta.name)}</span>
            </td>
            <td style="padding: 8px 10px; color: var(--text-muted); font-size: 11px;">
              ${tx.message ? `<div style="max-width: 240px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${TemplateEngine.escapeHtml(tx.message)}</div>` : '<span style="opacity: 0.4;">—</span>'}
            </td>
            <td style="padding: 8px 10px; text-align: right; font-weight: 700; color: var(--accent); font-size: 13px;">
              ${PaymentsCsv.formatCurrency(tx.amount, curr)}
            </td>
            <td style="padding: 6px 10px; text-align: center; white-space: nowrap;">
              <div style="display: inline-flex; align-items: center; justify-content: center; gap: 6px;">
                <button type="button" class="btn-table-action btn-edit-ledger-tx" data-id="${tx.id}" title="Edit transaction">
                  <i data-lucide="pencil" style="width: 13px; height: 13px;"></i>
                </button>
                <button type="button" class="btn-table-action btn-delete-danger btn-delete-ledger-tx" data-id="${tx.id}" title="Delete transaction">
                  <i data-lucide="trash-2" style="width: 13px; height: 13px;"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }).join('');

      if (window.lucide) lucide.createIcons();

      // Bind row edit actions
      body.querySelectorAll('.btn-edit-ledger-tx').forEach(btn => {
        btn.addEventListener('click', () => {
          const txId = btn.dataset.id;
          const targetTx = txs.find(t => t.id === txId);
          if (!targetTx) return;

          if (el('input-manual-edit-id')) el('input-manual-edit-id').value = targetTx.id;
          if (el('input-manual-donor')) el('input-manual-donor').value = targetTx.sender || '';
          if (el('input-manual-amount')) el('input-manual-amount').value = targetTx.amount || 0;
          if (el('select-manual-provider')) el('select-manual-provider').value = targetTx.sourceApp || 'Manual Entry';
          if (el('input-manual-date')) el('input-manual-date').value = targetTx.date || '';
          if (el('input-manual-time')) el('input-manual-time').value = targetTx.time || '';
          if (el('input-manual-note')) el('input-manual-note').value = targetTx.message || '';

          if (el('modal-manual-title-text')) el('modal-manual-title-text').textContent = 'Edit Payment Entry';
          if (el('btn-submit-manual-text')) el('btn-submit-manual-text').textContent = 'Save Changes';

          const modal = el('modal-manual-payment');
          if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => modal.classList.add('active'), 10);
            if (window.lucide) lucide.createIcons();
          }
        });
      });

      // Bind row delete actions
      body.querySelectorAll('.btn-delete-ledger-tx').forEach(btn => {
        btn.addEventListener('click', async () => {
          const txId = btn.dataset.id;
          const confirmed = await AppModal.show({
            title: 'Delete Transaction',
            message: 'Are you sure you want to remove this transaction from the CSV ledger? Live goal and leaderboard amounts will update automatically.'
          });
          if (!confirmed) return;

          try {
            const delRes = await fetch(`/api/donations/${encodeURIComponent(txId)}?profile=${encodeURIComponent(activeProf)}`, {
              method: 'DELETE'
            });
            const delData = await delRes.json();
            if (delData.ok) {
              config.widgets.goal.currentAmount = delData.metrics.goalAmount;
              config.widgets.leaderboard.supporters = delData.metrics.supporters;
              config.widgets.recent.recentDonations = delData.metrics.recentDonations;
              setVal('input-goal-current', delData.metrics.goalAmount);
              syncLivePreview();
              fetchAndRenderAnalytics();
              showToast('<i data-lucide="trash-2"></i> Transaction deleted');
            } else {
              showToast('<i data-lucide="alert-triangle"></i> ' + (delData.error || 'Delete failed'));
            }
          } catch (err) {
            showToast('<i data-lucide="alert-triangle"></i> Delete error: ' + err.message);
          }
        });
      });

    } catch (e) {
      console.warn('[Ledger] Fetch error:', e.message);
    }
  }

  function setupTableColumnResizing() {
    const tableContainer = document.querySelector('.analytics-ledger-table-container');
    if (!tableContainer) return;
    const table = tableContainer.querySelector('table');
    if (!table) return;

    const allThs = Array.from(table.querySelectorAll('thead th'));
    const handles = tableContainer.querySelectorAll('.col-resize-handle');

    handles.forEach(handle => {
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const th = handle.closest('th');
        if (!th) return;

        // Lock all current computed column widths in pixels so layout doesn't shift unexpectedly
        allThs.forEach(header => {
          const w = header.getBoundingClientRect().width;
          header.style.width = w + 'px';
          header.style.minWidth = '60px';
        });

        const startX = e.clientX;
        const startWidth = th.getBoundingClientRect().width;
        const startTableWidth = table.getBoundingClientRect().width;

        handle.classList.add('active');
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';

        function onMouseMove(moveEvent) {
          const diff = moveEvent.clientX - startX;
          const newWidth = Math.max(70, Math.round(startWidth + diff));
          th.style.width = newWidth + 'px';
          const tableDelta = newWidth - startWidth;
          if (tableDelta > 0) {
            table.style.minWidth = (startTableWidth + tableDelta) + 'px';
          }
        }

        function onMouseUp() {
          handle.classList.remove('active');
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  function setupEarningsAnalytics() {
    setupTableColumnResizing();

    on('select-col-date-sort', 'change', (e) => {
      analyticsState.sortOrder = e.target.value;
      analyticsState.page = 1;
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      fetchAndRenderLedger(activeProf);
    });

    on('select-analytics-month', 'change', (e) => {
      analyticsState.month = e.target.value;
      analyticsState.specificDate = '';
      analyticsState.startDate = '';
      analyticsState.endDate = '';
      if (el('filter-col-date-from')) el('filter-col-date-from').value = '';
      if (el('filter-col-date-to')) el('filter-col-date-to').value = '';

      document.querySelectorAll('.analytics-range-btn').forEach(b => {
        b.classList.toggle('active', e.target.value === 'all' && b.dataset.range === 'all');
      });

      analyticsState.page = 1;
      fetchAndRenderAnalytics();
    });

    on('select-analytics-provider', 'change', (e) => {
      analyticsState.provider = e.target.value;
      if (el('filter-col-provider')) el('filter-col-provider').value = e.target.value;
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
    });

    on('filter-col-provider', 'change', (e) => {
      analyticsState.provider = e.target.value;
      if (el('select-analytics-provider')) el('select-analytics-provider').value = e.target.value;
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
    });

    on('filter-col-date-from', 'input', (e) => {
      analyticsState.startDate = e.target.value;
      analyticsState.specificDate = '';
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
    });

    on('filter-col-date-to', 'input', (e) => {
      analyticsState.endDate = e.target.value;
      analyticsState.specificDate = '';
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
    });

    on('filter-col-donor', 'input', (e) => {
      clearTimeout(analyticsSearchDebounce);
      analyticsSearchDebounce = setTimeout(() => {
        analyticsState.searchDonor = e.target.value;
        analyticsState.page = 1;
        fetchAndRenderAnalytics();
      }, 250);
    });

    on('filter-col-note', 'input', (e) => {
      clearTimeout(analyticsSearchDebounce);
      analyticsSearchDebounce = setTimeout(() => {
        analyticsState.searchNote = e.target.value;
        analyticsState.page = 1;
        fetchAndRenderAnalytics();
      }, 250);
    });

    on('filter-col-min-amount', 'input', (e) => {
      clearTimeout(analyticsSearchDebounce);
      analyticsSearchDebounce = setTimeout(() => {
        analyticsState.minAmount = e.target.value;
        analyticsState.page = 1;
        fetchAndRenderAnalytics();
      }, 250);
    });

    on('select-ledger-limit', 'change', (e) => {
      analyticsState.limit = parseInt(e.target.value, 10) || 50;
      analyticsState.page = 1;
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      fetchAndRenderLedger(activeProf);
    });

    on('btn-clear-column-filters', 'click', () => {
      if (el('filter-col-date-from')) el('filter-col-date-from').value = '';
      if (el('filter-col-date-to')) el('filter-col-date-to').value = '';
      if (el('filter-col-donor')) el('filter-col-donor').value = '';
      if (el('filter-col-note')) el('filter-col-note').value = '';
      if (el('filter-col-min-amount')) el('filter-col-min-amount').value = '';
      if (el('filter-col-provider')) el('filter-col-provider').value = 'all';
      if (el('select-col-date-sort')) el('select-col-date-sort').value = 'desc';
      if (el('select-analytics-provider')) el('select-analytics-provider').value = 'all';
      if (el('input-analytics-search')) el('input-analytics-search').value = '';

      analyticsState.search = '';
      analyticsState.searchDonor = '';
      analyticsState.searchNote = '';
      analyticsState.minAmount = '';
      analyticsState.specificDate = '';
      analyticsState.startDate = '';
      analyticsState.endDate = '';
      analyticsState.provider = 'all';
      analyticsState.sortOrder = 'desc';
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
      showToast('<i data-lucide="filter-x"></i> Filters reset');
    });

    document.querySelectorAll('.analytics-range-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.analytics-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const range = btn.dataset.range;
        analyticsState.range = range;
        const now = new Date();
        const yr = now.getFullYear();
        const mo = String(now.getMonth() + 1).padStart(2, '0');
        const da = String(now.getDate()).padStart(2, '0');
        const todayStr = `${yr}-${mo}-${da}`;

        if (range === 'today') {
          analyticsState.specificDate = '';
          analyticsState.startDate = todayStr;
          analyticsState.endDate = todayStr;
          if (el('filter-col-date-from')) el('filter-col-date-from').value = todayStr;
          if (el('filter-col-date-to')) el('filter-col-date-to').value = todayStr;
        } else if (range === 'week') {
          const past = new Date(now.getTime() - 7 * 86400000);
          const pYr = past.getFullYear();
          const pMo = String(past.getMonth() + 1).padStart(2, '0');
          const pDa = String(past.getDate()).padStart(2, '0');
          analyticsState.specificDate = '';
          analyticsState.startDate = `${pYr}-${pMo}-${pDa}`;
          analyticsState.endDate = todayStr;
          if (el('filter-col-date-from')) el('filter-col-date-from').value = `${pYr}-${pMo}-${pDa}`;
          if (el('filter-col-date-to')) el('filter-col-date-to').value = todayStr;
        } else if (range === 'month') {
          analyticsState.specificDate = '';
          analyticsState.month = `${yr}-${mo}`;
          analyticsState.startDate = '';
          analyticsState.endDate = '';
          if (el('select-analytics-month')) el('select-analytics-month').value = `${yr}-${mo}`;
          if (el('filter-col-date-from')) el('filter-col-date-from').value = '';
          if (el('filter-col-date-to')) el('filter-col-date-to').value = '';
        } else {
          analyticsState.specificDate = '';
          analyticsState.month = 'all';
          analyticsState.startDate = '';
          analyticsState.endDate = '';
          if (el('select-analytics-month')) el('select-analytics-month').value = 'all';
          if (el('filter-col-date-from')) el('filter-col-date-from').value = '';
          if (el('filter-col-date-to')) el('filter-col-date-to').value = '';
        }

        analyticsState.page = 1;
        fetchAndRenderAnalytics();
      });
    });

    on('input-analytics-search', 'input', (e) => {
      clearTimeout(analyticsSearchDebounce);
      analyticsSearchDebounce = setTimeout(() => {
        analyticsState.search = e.target.value;
        analyticsState.page = 1;
        fetchAndRenderAnalytics();
      }, 250);
    });

    on('btn-refresh-analytics', 'click', () => {
      fetchAndRenderAnalytics();
      showToast('<i data-lucide="rotate-cw"></i> Analytics refreshed');
    });

    on('btn-ledger-prev', 'click', () => {
      if (analyticsState.page > 1) {
        analyticsState.page -= 1;
        const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
        fetchAndRenderLedger(activeProf);
      }
    });

    on('btn-ledger-next', 'click', () => {
      analyticsState.page += 1;
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      fetchAndRenderLedger(activeProf);
    });

    // ── Ledger height controls ────────────────────────────────────────
    (function () {
      const LEDGER_HEIGHTS = { sm: 220, md: 420, lg: 720 };
      const LEDGER_HEIGHT_KEY = 'ledger_height_pref';
      const container = document.querySelector('.analytics-ledger-table-container');
      if (!container) return;

      function setLedgerHeight(px) {
        container.style.height = px + 'px';
        try { localStorage.setItem(LEDGER_HEIGHT_KEY, String(px)); } catch (_) {}
        const btnSm = el('btn-ledger-height-sm');
        const btnMd = el('btn-ledger-height-md');
        const btnLg = el('btn-ledger-height-lg');
        const accent = 'var(--accent)';
        const muted  = 'var(--text-muted)';
        if (btnSm) btnSm.style.color = px === LEDGER_HEIGHTS.sm ? accent : muted;
        if (btnMd) btnMd.style.color = px === LEDGER_HEIGHTS.md ? accent : muted;
        if (btnLg) btnLg.style.color = px === LEDGER_HEIGHTS.lg ? accent : muted;
      }

      // Restore persisted preference
      try {
        const saved = parseInt(localStorage.getItem(LEDGER_HEIGHT_KEY), 10);
        if (saved && saved >= 220) setLedgerHeight(saved);
        else setLedgerHeight(LEDGER_HEIGHTS.md);
      } catch (_) { setLedgerHeight(LEDGER_HEIGHTS.md); }

      on('btn-ledger-height-sm', 'click', () => setLedgerHeight(LEDGER_HEIGHTS.sm));
      on('btn-ledger-height-md', 'click', () => setLedgerHeight(LEDGER_HEIGHTS.md));
      on('btn-ledger-height-lg', 'click', () => setLedgerHeight(LEDGER_HEIGHTS.lg));

      // Expand/collapse toggle — cycles sm → md → lg → sm
      on('btn-ledger-expand', 'click', () => {
        const current = parseInt(container.style.height, 10) || LEDGER_HEIGHTS.md;
        const next = current <= LEDGER_HEIGHTS.sm ? LEDGER_HEIGHTS.md
                   : current <= LEDGER_HEIGHTS.md  ? LEDGER_HEIGHTS.lg
                   : LEDGER_HEIGHTS.sm;
        setLedgerHeight(next);
      });
    })();

    on('select-trend-view-mode', 'change', (e) => {
      analyticsState.timelineMode = e.target.value;
      fetchAndRenderAnalytics();
    });

    on('select-donut-view-mode', 'change', (e) => {
      analyticsState.donutMode = e.target.value;
      fetchAndRenderAnalytics();
    });

    on('btn-analytics-export-csv', 'click', () => {
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      window.open(`/api/donations/csv?profile=${encodeURIComponent(activeProf)}`, '_blank');
      showToast('<i data-lucide="download"></i> Downloading donations.csv...');
    });

    // Manual Payment Modal (Record & Edit)
    on('btn-open-record-modal', 'click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-manual-payment');
      if (!modal) return;
      const now = new Date();
      const yr = now.getFullYear();
      const mo = String(now.getMonth() + 1).padStart(2, '0');
      const da = String(now.getDate()).padStart(2, '0');
      const hr = String(now.getHours()).padStart(2, '0');
      const mn = String(now.getMinutes()).padStart(2, '0');

      if (el('input-manual-edit-id')) el('input-manual-edit-id').value = '';
      if (el('input-manual-donor')) el('input-manual-donor').value = 'Anonymous Donor';
      if (el('input-manual-amount')) el('input-manual-amount').value = '500';
      if (el('select-manual-provider')) el('select-manual-provider').value = 'Manual Entry';
      if (el('input-manual-date')) el('input-manual-date').value = `${yr}-${mo}-${da}`;
      if (el('input-manual-time')) el('input-manual-time').value = `${hr}:${mn}`;
      if (el('input-manual-note')) el('input-manual-note').value = '';

      if (el('modal-manual-title-text')) el('modal-manual-title-text').textContent = 'Record Manual Payment';
      if (el('btn-submit-manual-text')) el('btn-submit-manual-text').textContent = 'Record & Credit Goal';

      modal.style.display = 'flex';
      setTimeout(() => modal.classList.add('active'), 10);
      if (window.lucide) lucide.createIcons();
    });

    const closeManualModal = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-manual-payment');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    };

    on('modal-manual-payment-close', 'click', closeManualModal);
    on('btn-cancel-manual-payment', 'click', closeManualModal);

    const manualModalOverlay = el('modal-manual-payment');
    if (manualModalOverlay) {
      manualModalOverlay.addEventListener('click', (e) => {
        if (e.target === manualModalOverlay) {
          closeManualModal(e);
        }
      });
      const card = manualModalOverlay.querySelector('.modal-card');
      if (card) {
        card.addEventListener('click', (e) => {
          e.stopPropagation();
        });
      }
    }

    on('btn-submit-manual-payment', 'click', async () => {
      const editId = (val('input-manual-edit-id', '') || '').trim();
      const isEdit = !!editId;
      const donor = (val('input-manual-donor', 'Anonymous Donor') || 'Anonymous Donor').trim();
      const amount = parseFloat(val('input-manual-amount', '0')) || 0;
      const source = val('select-manual-provider', 'Manual Entry');
      const dateVal = val('input-manual-date', '');
      const timeVal = val('input-manual-time', '');
      const note = val('input-manual-note', '').trim();
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';

      if (amount <= 0) {
        return showToast('<i data-lucide="alert-triangle"></i> Please enter a valid donation amount');
      }

      try {
        const payload = {
          profile: activeProf,
          sender: donor,
          amount: amount,
          currency: 'INR',
          sourceApp: source,
          date: dateVal,
          time: timeVal,
          message: note
        };

        const targetUrl = isEdit ? `/api/donations/${encodeURIComponent(editId)}` : '/api/donations/record';
        const targetMethod = isEdit ? 'PUT' : 'POST';

        const res = await fetch(targetUrl, {
          method: targetMethod,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        if (data.ok) {
          closeManualModal();
          if (data.metrics) {
            config.widgets.goal.currentAmount = data.metrics.goalAmount;
            config.widgets.leaderboard.supporters = data.metrics.supporters;
            config.widgets.recent.recentDonations = data.metrics.recentDonations;
            setVal('input-goal-current', data.metrics.goalAmount);
            syncLivePreview();
          }
          await fetchAndRenderAnalytics();
          const actionMsg = isEdit ? 'Updated transaction for ₹' : 'Recorded manual payment of ₹';
          showToast('<i data-lucide="check-circle"></i> ' + actionMsg + amount.toLocaleString('en-IN') + ' (' + donor + ')');
        } else {
          showToast('<i data-lucide="alert-triangle"></i> ' + (data.error || 'Operation failed'));
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> Error: ' + err.message);
      }
    });
  }

  // ── Panel Split Resizer ─────────────────────────────────────────
  function setupPanelResizer() {
    const resizer = el('panel-resizer');
    const formPanel = document.querySelector('.form-panel');
    const mainView = document.querySelector('.main-view');
    const iframeEl = el('preview-iframe');
    if (!resizer || !formPanel || !mainView) return;

    // Load saved split position
    const savedWidth = localStorage.getItem('obs_panel_split_width');
    if (savedWidth) {
      formPanel.style.flex = `0 0 ${savedWidth}px`;
    } else {
      // Default initial width — generous form space, preview still visible
      const initialWidth = Math.min(620, Math.floor(mainView.clientWidth * 0.52));
      formPanel.style.flex = `0 0 ${initialWidth}px`;
    }

    let isDragging = false;

    resizer.addEventListener('mousedown', (e) => {
      isDragging = true;
      resizer.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      if (iframeEl) iframeEl.style.pointerEvents = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const mainRect = mainView.getBoundingClientRect();
      let newWidth = e.clientX - mainRect.left;
      const minWidth = 340;
      const maxWidth = mainRect.width - 320;
      newWidth = Math.max(minWidth, Math.min(newWidth, maxWidth));
      formPanel.style.flex = `0 0 ${newWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      resizer.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      if (iframeEl) iframeEl.style.pointerEvents = '';
      const currentWidth = formPanel.getBoundingClientRect().width;
      localStorage.setItem('obs_panel_split_width', Math.round(currentWidth));
    });
  }

  function setupCodeAutoSeeding() {
    const configs = [
      { id: 'chk-enable-custom-code', kind: 'alert', fields: ['input-custom-html', 'input-custom-css', 'input-custom-js'] },
      { id: 'chk-enable-goal-custom-code', kind: 'goal', fields: ['input-goal-custom-html', 'input-goal-custom-css', 'input-goal-custom-js'] },
      { id: 'chk-enable-lb-custom-code', kind: 'leaderboard', fields: ['input-lb-custom-html', 'input-lb-custom-css', 'input-lb-custom-js'] }
    ];

    configs.forEach(c => {
      on(c.id, 'change', (e) => {
        if (!e.target.checked) return;

        // If HTML or CSS is empty, seed them with the default full source
        const htmlEmpty = !val(c.fields[0], '').trim();
        const cssEmpty = !val(c.fields[1], '').trim();

        if (htmlEmpty || cssEmpty) {
          const defaults = ConfigSchema.DEFAULT_CODE[c.kind];
          if (htmlEmpty) setVal(c.fields[0], defaults.customHTML);
          if (cssEmpty) setVal(c.fields[1], defaults.customCSS);
          // Always seed JS if empty
          if (!val(c.fields[2], '').trim()) setVal(c.fields[2], defaults.customJS);

          showToast('<i data-lucide="sparkles"></i> Restored ' + c.kind + ' baseline code', 'info');
          syncLivePreview();
        }
      });
    });
  }

  let activeIconInput = null;
  const LUCIDE_ICONS_LIST = [
    'trophy', 'star', 'crown', 'gamepad-2', 'tv', 'monitor', 'headphones', 'mic', 'music', 'video', 'camera',
    'sparkles', 'flame', 'zap', 'history', 'heart', 'gift', 'award', 'dollar-sign', 'credit-card', 'coins',
    'banknote', 'wallet', 'piggy-bank', 'shopping-bag', 'shopping-cart', 'share-2', 'send', 'message-square',
    'message-circle', 'mail', 'globe', 'thumbs-up', 'smile', 'user', 'users', 'user-check', 'user-plus',
    'shield', 'badge-check', 'bell', 'coffee', 'compass', 'flag', 'home', 'image', 'info', 'key', 'link',
    'list', 'map-pin', 'rocket', 'search', 'settings', 'target', 'check', 'hash', 'at-sign', 'sun', 'moon',
    'circle', 'check-circle', 'alert-circle', 'box', 'layers', 'package'
  ];

  function openIconPicker(targetInput) {
    activeIconInput = targetInput;
    const modal = el('icon-picker-modal');
    const searchInput = el('icon-search-input');
    const grid = el('icon-grid');
    if (!modal || !grid) return;
    if (searchInput) searchInput.value = '';
    modal.style.display = 'flex';
    requestAnimationFrame(() => {
      modal.classList.add('active');
    });
    renderIconGrid('');
  }

  function closeIconPicker() {
    const modal = el('icon-picker-modal');
    if (!modal) return;
    modal.classList.remove('active');
    setTimeout(() => {
      modal.style.display = 'none';
    }, 200);
  }

  function renderIconGrid(query) {
    const grid = el('icon-grid');
    if (!grid) return;
    const q = (query || '').toLowerCase().trim();
    const filtered = q ? LUCIDE_ICONS_LIST.filter(name => name.includes(q)) : LUCIDE_ICONS_LIST;

    if (!filtered.length) {
      grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 16px;">No icons found matching your search.</div>';
      return;
    }

    grid.innerHTML = filtered.map(name => `
      <button type="button" class="btn btn-secondary icon-picker-item" data-icon="${name}" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 8px 4px; font-size: 11px;">
        <i data-lucide="${name}" style="width: 22px; height: 22px;"></i>
        <span style="font-size: 10px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 60px;">${name}</span>
      </button>
    `).join('');

    setTimeout(() => {
      if (window.lucide) {
        try { lucide.createIcons(); } catch (e) {}
      }
    }, 20);

    grid.querySelectorAll('.icon-picker-item').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeIconInput) {
          activeIconInput.value = btn.dataset.icon;
          syncLivePreview();
          showToast(`Selected icon: ${btn.dataset.icon}`);
        }
        closeIconPicker();
      });
    });
  }

  function setupIconPicker() {
    const modal = el('icon-picker-modal');
    const closeBtn = el('icon-picker-close');
    const searchInput = el('icon-search-input');
    if (!modal) return;
    if (closeBtn) closeBtn.addEventListener('click', closeIconPicker);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeIconPicker();
    });
    if (searchInput) {
      searchInput.addEventListener('input', () => renderIconGrid(searchInput.value));
    }
  }

  function setupBoxExpanders() {
    console.log('[Config] Initializing box expanders');
  }

  // ── Boot ─────────────────────────────────────────────────────
  console.log('[Config] Starting dashboard boot sequence...');
  initCodeEditors();
  setupTabs();
  setupCodeEditorTabs();
  setupVariablePills();
  setupCssPills();
  setupColorPickers();
  setupCanvasPresets();
  setupAmountFilterEditor();
  setupTemplateManager();
  setupCyclingWidgetEditor();
  setupIconPicker();
  setupFileBrowsers();
  setupSnippets();
  setupCodeAutoSeeding();
  setupActionButtons();
  setupSimulator();
  setupNetworkAndSystem();
  setupEarningsAnalytics();
  setupPanelResizer();
  setupBoxExpanders();
  attachInputListeners();
  connectDashboardWebSocket();

  try {
    console.log('[Config] Fetching settings from /api/settings...');
    const res = await fetch('/api/settings');
    const data = await res.json();
    console.log('[Config] Loaded settings payload:', data);
    await loadProfilesList(data.activeProfile);
    populateForm(data.settings || data);
    console.log('[Config] Dashboard boot sequence completed successfully.');
  } catch (e) {
    console.error('[Config] Failed to load settings from server, falling back to defaults:', e);
    populateForm(ConfigSchema.createDefaultConfig());
  }
  updateSnippetButtonStates();

  window.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'OVERLAY_READY') syncLivePreview();
  });

  if (iframe) {
    iframe.addEventListener('load', () => {
      syncLivePreview();
      setTimeout(syncLivePreview, 150);
    });
  }
});
