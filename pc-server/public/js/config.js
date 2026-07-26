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
  const TEXT_PREFIXES = { template: 'tpl', alert: 'alert', goal: 'goal', leaderboard: 'lb' };

  let config = ConfigSchema.createDefaultConfig();
  let suppressSync = false;

  const iframe = el('preview-iframe');

  function showToast(message) {
    const toast = el('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2400);
  }

  // ── Generic field helpers ────────────────────────────────────
  const val = (id, fallback) => {
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
      fontWeight: numVal(`${prefix}-font-weight`, base.fontWeight),
      fontStyle: val(`${prefix}-font-style`, base.fontStyle),
      color: val(`${prefix}-text-color`, base.color),
      textAlign: val(`${prefix}-text-align`, base.textAlign),
      textTransform: val(`${prefix}-text-transform`, base.textTransform),
      letterSpacing: numVal(`${prefix}-letter-spacing`, base.letterSpacing),
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
    setVal(`${prefix}-font-weight`, text.fontWeight);
    setVal(`${prefix}-font-style`, text.fontStyle);
    setVal(`${prefix}-text-color`, text.color);
    setVal(`${prefix}-text-color-hex`, text.color);
    setVal(`${prefix}-text-align`, text.textAlign);
    setVal(`${prefix}-text-transform`, text.textTransform);
    setVal(`${prefix}-letter-spacing`, text.letterSpacing);
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
        <button type="button" class="btn btn-danger filter-remove" title="Remove filter">&#10005;</button>
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
      const flags = [t.isDefault ? '⭐ fallback' : '', t.enabled ? '' : 'disabled']
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
        backgroundColor: val('input-bg-color', template.style.backgroundColor),
        backgroundOpacity: numVal('input-bg-opacity', template.style.backgroundOpacity),
        isTransparent: checked('chk-transparent-bg', template.style.isTransparent),
        accentColor: val('input-accent-color', template.style.accentColor),
        borderRadius: numVal('input-border-radius', template.style.borderRadius),
        borderWidth: numVal('input-border-width', template.style.borderWidth),
        padding: numVal('input-padding', template.style.padding)
      });
      template.animation = {
        type: val('select-anim-type', template.animation.type),
        duration: numVal('input-anim-duration', template.animation.duration),
        displayDuration: numVal('input-display-duration', template.animation.displayDuration)
      };
      template.layout = Object.assign({}, template.layout, {
        positionPreset: val('tpl-position-preset', template.layout.positionPreset),
        width: numVal('tpl-layout-width', template.layout.width)
      });
      template.code = {
        enableCustomCode: checked('chk-enable-custom-code', true),
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
      fillColor: val('input-goal-fill-color', goal.style.fillColor),
      barColor: val('input-goal-bar-color', goal.style.barColor),
      barHeight: numVal('input-goal-bar-height', goal.style.barHeight),
      isTransparent: checked('chk-goal-transparent-bg', goal.style.isTransparent)
    });
    goal.code = {
      enableCustomCode: checked('chk-enable-goal-custom-code', true),
      customHTML: val('input-goal-custom-html', ''),
      customCSS: val('input-goal-custom-css', ''),
      customJS: val('input-goal-custom-js', '')
    };

    const lb = config.widgets.leaderboard;
    lb.enabled = checked('chk-enable-lb', lb.enabled);
    lb.title = val('input-lb-title', lb.title);
    lb.maxEntries = numVal('select-lb-max', lb.maxEntries);
    lb.showAmounts = checked('chk-lb-show-amounts', lb.showAmounts);
    lb.text = Object.assign(readTextStyle(TEXT_PREFIXES.leaderboard, lb.text), {
      titleTemplate: val('input-lb-title', lb.text.titleTemplate)
    });
    lb.canvas = readCanvas(TEXT_PREFIXES.leaderboard, lb.canvas);
    lb.style = Object.assign({}, lb.style, {
      accentColor: val('input-lb-accent-color', lb.style.accentColor),
      rowBgColor: val('input-lb-row-bg-color', lb.style.rowBgColor),
      isTransparent: checked('chk-lb-transparent-bg', lb.style.isTransparent)
    });
    lb.code = {
      enableCustomCode: checked('chk-enable-lb-custom-code', true),
      customHTML: val('input-lb-custom-html', ''),
      customCSS: val('input-lb-custom-css', ''),
      customJS: val('input-lb-custom-js', '')
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
      setChecked('chk-transparent-bg', template.style.isTransparent);
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
    setChecked('chk-goal-transparent-bg', goal.style.isTransparent);
    writeTextStyle(TEXT_PREFIXES.goal, goal.text);
    writeCanvas(TEXT_PREFIXES.goal, goal.canvas);
    setChecked('chk-enable-goal-custom-code', goal.code.enableCustomCode);
    setVal('input-goal-custom-html', goal.code.customHTML);
    setVal('input-goal-custom-css', goal.code.customCSS);
    setVal('input-goal-custom-js', goal.code.customJS);

    const lb = config.widgets.leaderboard;
    setChecked('chk-enable-lb', lb.enabled);
    setVal('input-lb-title', lb.text.titleTemplate || lb.title);
    setSelectVal('select-lb-max', lb.maxEntries);
    setChecked('chk-lb-show-amounts', lb.showAmounts);
    setChecked('chk-lb-transparent-bg', lb.style.isTransparent);
    setVal('input-lb-accent-color', lb.style.accentColor);
    setVal('input-lb-accent-color-hex', lb.style.accentColor);
    setVal('input-lb-row-bg-color', lb.style.rowBgColor);
    setVal('input-lb-row-bg-color-hex', lb.style.rowBgColor);
    writeTextStyle(TEXT_PREFIXES.leaderboard, lb.text);
    writeCanvas(TEXT_PREFIXES.leaderboard, lb.canvas);
    setChecked('chk-enable-lb-custom-code', lb.code.enableCustomCode);
    setVal('input-lb-custom-html', lb.code.customHTML);
    setVal('input-lb-custom-css', lb.code.customCSS);
    setVal('input-lb-custom-js', lb.code.customJS);

    renderSupportersTable();
    updateValueDisplays();

    suppressSync = false;
    syncLivePreview();
  }

  function updateValueDisplays() {
    document.querySelectorAll('.val-display').forEach(node => {
      const input = el(node.dataset.target);
      if (input) node.textContent = input.value + (node.dataset.suffix || '');
    });
  }

  function syncLivePreview() {
    if (suppressSync) return;
    readFormValues();
    renderTemplateList();
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SETTINGS_UPDATED', payload: config }, '*');
    }
  }

  // ── Supporters table ─────────────────────────────────────────
  function renderSupportersTable() {
    const body = el('lb-table-body');
    if (!body) return;
    const supporters = config.widgets.leaderboard.supporters || {};
    const rows = Object.keys(supporters)
      .map(name => ({ name, amount: parseFloat(supporters[name]) || 0 }))
      .sort((a, b) => b.amount - a.amount);

    if (!rows.length) {
      body.innerHTML = '<tr><td colspan="3" style="padding: 10px; color: var(--text-muted);">No supporters yet</td></tr>';
      return;
    }

    body.innerHTML = rows.map(r => `
      <tr style="border-bottom: 1px solid var(--border);">
        <td style="padding: 6px;">${TemplateEngine.escapeHtml(r.name)}</td>
        <td style="padding: 6px;">₹${r.amount.toLocaleString('en-IN')}</td>
        <td style="padding: 6px; text-align: right;">
          <button type="button" class="btn btn-danger btn-remove-supporter" data-name="${TemplateEngine.escapeHtml(r.name)}" style="padding: 2px 8px; font-size: 11px;">Remove</button>
        </td>
      </tr>`).join('');

    body.querySelectorAll('.btn-remove-supporter').forEach(btn => {
      btn.addEventListener('click', () => {
        delete config.widgets.leaderboard.supporters[btn.dataset.name];
        renderSupportersTable();
        syncLivePreview();
      });
    });
  }



  // ── Server IO ────────────────────────────────────────────────
  async function saveToServer(profileName) {
    readFormValues();
    const res = await fetch('/api/profiles/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: profileName || el('select-profile').value || 'Default', settings: config })
    });
    const data = await res.json();
    if (data.ok) populateForm(data.settings);
    return data;
  }

  async function loadProfilesList(activeProfile) {
    const select = el('select-profile');
    if (!select) return;
    try {
      const res = await fetch('/api/profiles');
      const data = await res.json();
      if (!data || !data.profiles) return;
      const active = activeProfile || data.activeProfile;
      select.innerHTML = Object.keys(data.profiles).map(name =>
        `<option value="${TemplateEngine.escapeHtml(name)}"${name === active ? ' selected' : ''}>${TemplateEngine.escapeHtml(name)}</option>`
      ).join('');
    } catch (e) {
      console.warn('[Profiles] Failed to load profiles list:', e.message);
    }
  }

  // ── Wiring ───────────────────────────────────────────────────
  const TAB_PREVIEW_URLS = { goal: '/overlay/goal', leaderboard: '/overlay/leaderboard' };

  function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        const content = el(`tab-${tab}`);
        if (content) content.classList.add('active');

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
          panel.style.display = panel.dataset.codePanel === btn.dataset.codeTab ? 'block' : 'none';
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
      ['input-goal-bar-color', 'input-goal-bar-color-hex'],
      ['input-lb-accent-color', 'input-lb-accent-color-hex'],
      ['input-lb-row-bg-color', 'input-lb-row-bg-color-hex'],
      ...Object.keys(TEXT_PREFIXES).map(k => [`${TEXT_PREFIXES[k]}-text-color`, `${TEXT_PREFIXES[k]}-text-color-hex`])
    ];

    pairs.forEach(([pickerId, hexId]) => {
      const picker = el(pickerId);
      const hex = el(hexId);
      if (!picker || !hex) return;
      picker.addEventListener('input', () => { hex.value = picker.value; syncLivePreview(); });
      hex.addEventListener('change', () => {
        if (/^#[0-9a-f]{6}$/i.test(hex.value)) { picker.value = hex.value; syncLivePreview(); }
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
        updateValueDisplays();
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

    el('btn-template-new').addEventListener('click', withTemplate(() => {
      const name = prompt('New template name:', `Alert Template ${config.alertTemplates.length + 1}`);
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
      showToast(`✨ Created template "${created.name}"`);
    }));

    el('btn-template-rename').addEventListener('click', withTemplate((template) => {
      if (!template) return;
      const name = prompt('Rename template:', template.name);
      if (name) template.name = name;
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
      showToast(`📋 Duplicated as "${copy.name}"`);
    }));

    el('btn-template-default').addEventListener('click', withTemplate((template) => {
      if (!template) return;
      config.alertTemplates.forEach(t => { t.isDefault = t.id === template.id; });
      showToast(`⭐ "${template.name}" is now the fallback template`);
    }));

    el('btn-template-delete').addEventListener('click', withTemplate((template) => {
      if (!template) return;
      if (config.alertTemplates.length === 1) {
        showToast('⚠️ At least one template is required');
        return;
      }
      if (!confirm(`Delete template "${template.name}"?`)) return;
      config.alertTemplates = config.alertTemplates.filter(t => t.id !== template.id);
      config.activeTemplateId = config.alertTemplates[0].id;
      showToast('🗑️ Template deleted');
    }));

    el('chk-template-enabled').addEventListener('change', () => syncLivePreview());
  }

  function setupFileBrowsers() {
    [['btn-browse-image', 'input-image-file', 'input-image-url'],
     ['btn-browse-sound', 'input-sound-file', 'input-sound-url']].forEach(([btnId, fileId, urlId]) => {
      const btn = el(btnId);
      const fileInput = el(fileId);
      const urlInput = el(urlId);
      if (!btn || !fileInput) return;
      btn.addEventListener('click', (e) => { e.preventDefault(); fileInput.click(); });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          if (urlInput) urlInput.value = event.target.result;
          syncLivePreview();
          showToast(`📁 Loaded local file: ${file.name}`);
        };
        reader.readAsDataURL(file);
        fileInput.value = '';
      });
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
      const active = snippet && target && target.value.includes(snippet.trim());
      btn.classList.toggle('active', !!active);
    });
  }

  function setupSnippets() {
    document.querySelectorAll('.snippet-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const snippet = SNIPPETS[btn.dataset.snippet];
        const target = snippetTarget(btn.dataset.snippet);
        if (!snippet || !target) return;
        const trimmed = snippet.trim();
        if (target.value.includes(trimmed)) {
          target.value = target.value.replace(snippet, '').replace(trimmed, '').trim();
          showToast('❌ Code snippet removed');
        } else {
          target.value = (target.value + (target.value.endsWith('\n') || !target.value ? '' : '\n') + snippet).trim();
          showToast('✨ Code snippet applied!');
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
          const start = textarea.selectionStart !== null ? textarea.selectionStart : textarea.value.length;
          const insert = `${selector} {\n  \n}\n`;
          textarea.value = textarea.value.substring(0, start) + insert + textarea.value.substring(start);
          textarea.focus();
        }
        if (navigator.clipboard) navigator.clipboard.writeText(selector).catch(() => {});
        showToast(`📋 Copied selector "${selector}"`);
      });
    });
  }

  function attachInputListeners() {
    document.querySelectorAll('.form-control').forEach(input => {
      if (input.closest('#amount-filter-list') || input.id === 'select-template' || input.id === 'select-profile') return;
      ['input', 'change'].forEach(evt => input.addEventListener(evt, () => {
        updateValueDisplays();
        syncLivePreview();
      }));
    });
    document.querySelectorAll('input[type="checkbox"]').forEach(input => {
      input.addEventListener('change', () => syncLivePreview());
    });
    ['input-custom-html', 'input-custom-css', 'input-custom-js'].forEach(id => {
      const node = el(id);
      if (node) node.addEventListener('input', updateSnippetButtonStates);
    });
  }

  function sampleAlert(customAmount) {
    const samples = [
      { sender: 'Rahul Kumar', amount: '₹500', sourceApp: 'PhonePe', message: 'Awesome stream! 🚀' },
      { sender: 'Priya Singh', amount: '₹1000', sourceApp: 'Google Pay', message: 'Keep up the great work! ❤️' },
      { sender: 'Amit Verma', amount: '₹250', sourceApp: 'Paytm', message: 'Chai paani subscription ☕' },
      { sender: 'Sneha Patel', amount: '₹300', sourceApp: 'BHIM UPI', message: 'Great gameplay! 🎮' }
    ];
    const picked = { ...samples[Math.floor(Math.random() * samples.length)], timestamp: Date.now() };
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
    showToast(`⚡ Test alert (₹${amountVal}) → Matched "${resolved.templateName}"`);

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
    on('btn-save', 'click', async () => {
      try {
        const data = await saveToServer();
        showToast(data.ok ? '💾 Settings saved!' : '⚠️ Save failed');
      } catch (e) {
        showToast('⚠️ Save failed: ' + e.message);
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
      showToast(`⚡ Test alert via loaded template "${loadedTemplate ? loadedTemplate.name : 'Default'}"`);
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

    on('btn-export', 'click', () => {
      readFormValues();
      StorageHelper.exportToFile(config, 'alert-theme.json');
      showToast('📤 Exported configuration');
    });

    on('btn-import', 'click', () => { const f = el('file-import-input'); if (f) f.click(); });
    on('file-import-input', 'change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const importedConfig = await StorageHelper.importFromFile(file);
        const activeProfile = (el('select-profile') && el('select-profile').value) || 'Default';
        const res = await fetch('/api/profiles/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: activeProfile, settings: importedConfig })
        });
        const data = await res.json();
        if (data.ok) {
          populateForm(data.settings);
          showToast('📥 Imported configuration into current profile');
        }
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
      e.target.value = '';
    });

    on('btn-reset', 'click', () => {
      if (!confirm('Reset all settings in this profile to defaults?')) return;
      populateForm(ConfigSchema.createDefaultConfig());
      showToast('🔄 Reset to defaults');
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
        showToast(`👤 Switched to "${data.activeProfile}"`);
      }
    });

    on('btn-profile-new', 'click', async () => {
      const name = prompt('New profile name:');
      if (!name) return;
      await saveToServer(name);
      await loadProfilesList(name);
      showToast(`👤 Created profile "${name}"`);
    });

    on('btn-profile-rename', 'click', async () => {
      const select = el('select-profile');
      const oldName = select ? select.value : '';
      const name = prompt('Rename profile:', oldName);
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
      showToast(`✏️ Renamed to "${name}"`);
    });

    on('btn-profile-delete', 'click', async () => {
      const select = el('select-profile');
      const name = select ? select.value : '';
      if (!name || !confirm(`Delete profile "${name}"?`)) return;
      const res = await fetch('/api/profiles/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name })
      });
      const data = await res.json();
      if (!data.ok) return showToast('⚠️ ' + (data.error || 'Delete failed'));
      await loadProfilesList(data.activeProfile);
      populateForm(await StorageHelper.loadServer());
      showToast('🗑️ Profile deleted');
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
        const profileName = prompt('Import profile as:', defaultName);
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
          showToast(`📥 Imported profile "${data.activeProfile}"`);
        } else {
          showToast(`⚠️ Import failed: ${data.error || 'Unknown error'}`);
        }
      } catch (err) {
        showToast('⚠️ ' + err.message);
      }
      e.target.value = '';
    });

    // ── Goal helpers
    on('btn-goal-test-add', 'click', () => {
      readFormValues();
      config.widgets.goal.currentAmount += 100;
      populateForm(config);
      showToast('⚡ Added ₹100 to the goal');
    });

    on('btn-goal-reset', 'click', () => {
      readFormValues();
      config.widgets.goal.currentAmount = 0;
      populateForm(config);
      showToast('🔄 Goal progress reset');
    });

    on('btn-goal-export', 'click', () => {
      readFormValues();
      StorageHelper.exportToFile(config.widgets.goal, 'goal-data.json');
    });

    on('btn-goal-import', 'click', () => { const f = el('file-import-goal-input'); if (f) f.click(); });
    on('file-import-goal-input', 'change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          readFormValues();
          config.widgets.goal = ConfigSchema.normalizeWidget('goal', JSON.parse(ev.target.result));
          populateForm(config);
          showToast('📥 Goal data imported');
        } catch (err) {
          showToast('⚠️ Invalid goal JSON');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    // ── Leaderboard helpers
    on('btn-lb-export', 'click', () => {
      readFormValues();
      StorageHelper.exportToFile(config.widgets.leaderboard.supporters, 'leaderboard.json');
    });

    on('btn-lb-import', 'click', () => { const f = el('file-import-lb-input'); if (f) f.click(); });
    on('file-import-lb-input', 'change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          readFormValues();
          const parsed = JSON.parse(ev.target.result);
          config.widgets.leaderboard.supporters = parsed.supporters || parsed;
          populateForm(config);
          showToast('📥 Leaderboard imported');
        } catch (err) {
          showToast('⚠️ Invalid leaderboard JSON');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    on('btn-lb-clear-all', 'click', () => {
      if (!confirm('Clear every supporter from the leaderboard?')) return;
      readFormValues();
      config.widgets.leaderboard.supporters = {};
      populateForm(config);
      showToast('🗑️ Leaderboard cleared');
    });

    // ── Code reset buttons
    [['btn-reset-alert-code', 'alert', ['input-custom-html', 'input-custom-css', 'input-custom-js']],
     ['btn-reset-goal-code', 'goal', ['input-goal-custom-html', 'input-goal-custom-css', 'input-goal-custom-js']],
     ['btn-reset-lb-code', 'leaderboard', ['input-lb-custom-html', 'input-lb-custom-css', 'input-lb-custom-js']]
    ].forEach(([btnId, kind, ids]) => {
      on(btnId, 'click', () => {
        const defaults = ConfigSchema.DEFAULT_CODE[kind];
        setVal(ids[0], defaults.customHTML);
        setVal(ids[1], defaults.customCSS);
        setVal(ids[2], defaults.customJS);
        updateSnippetButtonStates();
        syncLivePreview();
        showToast('🔄 Code reset to defaults');
      });
    });

    // ── Sound test
    on('btn-test-sound', 'click', () => {
      const url = val('input-sound-url', '');
      if (!url) return showToast('⚠️ No sound URL set');
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, numVal('input-sound-volume', 80) / 100));
      audio.play().catch(err => showToast('⚠️ ' + err.message));
    });
  }

  // ── Custom Event Simulator ────────────────────────────────────
  function updateSimulatorTemplateOptions() {
    const simSelect = el('sim-template-override');
    if (!simSelect) return;
    const current = simSelect.value;
    simSelect.innerHTML = '<option value="">✨ Auto-Match by Amount (Default)</option>' +
      config.alertTemplates.map(t =>
        `<option value="${TemplateEngine.escapeHtml(t.id)}"${t.id === current ? ' selected' : ''}>${TemplateEngine.escapeHtml(t.name)} (ID: ${t.id})</option>`
      ).join('');
  }

  function setupSimulator() {
    const SIM_PRESETS = {
      phonepe: {
        sender: 'Rahul Kumar', amount: '₹500', appName: 'PhonePe', packageName: 'com.phonepe.app',
        title: 'PhonePe', text: 'Rahul Kumar has sent Rs. 500.00 to your bank account', message: 'Awesome stream! 🚀'
      },
      gpay: {
        sender: 'Priya Singh', amount: '₹1000', appName: 'Google Pay', packageName: 'com.google.android.apps.nfc.phone',
        title: 'Google Pay', text: 'Priya Singh sent ₹1,000.00 via Google Pay', message: 'Keep up the great work! ❤️'
      },
      paytm: {
        sender: 'Amit Verma', amount: '₹250', appName: 'Paytm', packageName: 'net.one97.paytm',
        title: 'Paytm', text: 'Rs 250 received from Amit Verma', message: 'Chai paani subscription ☕'
      },
      amazon: {
        sender: 'Sneha Patel', amount: '₹1500', appName: 'Amazon Pay', packageName: 'in.amazon.mShop.android.shopping',
        title: 'Amazon Pay', text: 'Money received from Sneha Patel on Amazon Pay', message: 'Thanks for streaming! 🎮'
      },
      highval: {
        sender: 'Vikramaditya', amount: '₹5000', appName: 'PhonePe', packageName: 'com.phonepe.app',
        title: 'PhonePe', text: 'Vikramaditya has sent Rs. 5,000.00 to your bank account', message: 'ULTRA DONATION! 👑🔥'
      }
    };

    document.querySelectorAll('.btn-sim-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const p = SIM_PRESETS[btn.dataset.preset];
        if (!p) return;
        setVal('sim-sender', p.sender);
        setVal('sim-amount', p.amount);
        setVal('sim-app-name', p.appName);
        setVal('sim-pkg-name', p.packageName);
        setVal('sim-title', p.title);
        setVal('sim-text', p.text);
        setVal('sim-message', p.message);
        setVal('sim-alert-id', `evt_${Date.now()}`);
        showToast(`✨ Loaded preset "${p.appName}"`);
      });
    });

    on('btn-sim-random', 'click', () => {
      const sample = sampleAlert();
      setVal('sim-sender', sample.sender);
      setVal('sim-amount', sample.amount);
      setVal('sim-app-name', sample.sourceApp || 'PhonePe');
      setVal('sim-pkg-name', 'com.phonepe.app');
      setVal('sim-title', sample.sourceApp || 'PhonePe');
      setVal('sim-text', `${sample.sender} has sent ${sample.amount}`);
      setVal('sim-message', sample.message || 'Stream support!');
      setVal('sim-alert-id', `evt_${Date.now()}`);
      showToast('🎲 Generated random event');
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
      const rawAmount = val('sim-amount', '0');
      const numAmount = TemplateMatcher.parseAmount(rawAmount);
      const forcedId = val('sim-template-override', '');
      const resolved = TemplateMatcher.resolve(config, numAmount, forcedId || null);

      const logData = {
        inspectTime: new Date().toLocaleTimeString(),
        simulatedInput: {
          sender: val('sim-sender', ''),
          amount: rawAmount,
          appName: val('sim-app-name', ''),
          packageName: val('sim-pkg-name', ''),
          title: val('sim-title', ''),
          text: val('sim-text', ''),
          message: val('sim-message', ''),
          alertId: val('sim-alert-id', '') || `evt_${Date.now()}`
        },
        parsedDetails: {
          numericAmount: numAmount,
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
      if (c) c.textContent = `[EVENT INSPECTION DATA]\n${JSON.stringify(logData, null, 2)}`;
      showToast(`🔍 Inspected: Matched "${resolved.templateName}"`);
    });

    on('btn-sim-dispatch', 'click', async () => {
      readFormValues();
      const alertId = val('sim-alert-id', '') || `evt_${Date.now()}`;
      const rawAmount = val('sim-amount', '₹500');
      const amountVal = TemplateMatcher.parseAmount(rawAmount);
      const forcedId = val('sim-template-override', '');
      const resolved = TemplateMatcher.resolve(config, amountVal, forcedId || null);

      const eventPayload = {
        type: 'payment_notification',
        alertId,
        sender: val('sim-sender', 'Unknown'),
        amount: rawAmount,
        amountValue: amountVal,
        appName: val('sim-app-name', 'Payment App'),
        packageName: val('sim-pkg-name', 'com.phonepe.app'),
        sourceApp: val('sim-app-name', 'Payment App'),
        title: val('sim-title', 'Payment Received'),
        text: val('sim-text', ''),
        bigText: val('sim-text', ''),
        message: val('sim-message', ''),
        alertTemplateId: resolved.templateId,
        timestamp: Date.now()
      };

      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.postMessage({
          type: 'TRIGGER_TEST_ALERT',
          data: eventPayload
        }, '*');
      }

      const c = el('sim-console');
      if (c) c.textContent = `[DISPATCHING EVENT...]\n${JSON.stringify(eventPayload, null, 2)}`;

      try {
        const res = await fetch('/api/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(eventPayload)
        });
        const data = await res.json();
        if (c) {
          c.textContent = `[DISPATCH SUCCESS - ${new Date().toLocaleTimeString()}]\n` +
            `Server Output: ${JSON.stringify(data, null, 2)}\n\n` +
            `Dispatched Event Payload:\n${JSON.stringify(eventPayload, null, 2)}`;
        }
        showToast(`🚀 Dispatched custom event (${rawAmount} → "${resolved.templateName}")`);
      } catch (err) {
        if (c) c.textContent += `\n\n[ERROR]: ${err.message}`;
        showToast(`⚠️ Dispatch failed: ${err.message}`);
      }
    });
  }

  // ── Network, Live Logs & System Dashboard ───────────────────
  let cachedNetworkInfo = null;

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

  async function initWindowsStartup() {
    try {
      const res = await fetch('/api/system/startup');
      const data = await res.json();
      setChecked('chk-win-startup', !!data.enabled);
    } catch (e) {
      console.warn('[Startup] Query error:', e.message);
    }

    on('chk-win-startup', 'change', async (e) => {
      const enabled = e.target.checked;
      try {
        const res = await fetch('/api/system/startup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ enabled })
        });
        const data = await res.json();
        if (data.ok) {
          showToast(enabled ? '⚙️ Windows startup enabled' : '⚙️ Windows startup disabled');
        } else {
          showToast('⚠️ ' + (data.error || 'Startup update failed'));
          setChecked('chk-win-startup', !enabled);
        }
      } catch (err) {
        showToast('⚠️ ' + err.message);
        setChecked('chk-win-startup', !enabled);
      }
    });
  }

  function setupNetworkAndSystem() {
    fetchNetworkInfo();
    setInterval(fetchNetworkInfo, 5000);

    initWindowsStartup();

    on('btn-copy-ip', 'click', () => {
      const ipText = cachedNetworkInfo ? `${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : (el('net-ip-display') ? el('net-ip-display').textContent : '');
      if (navigator.clipboard && ipText) {
        navigator.clipboard.writeText(ipText).then(() => {
          showToast(`📋 Copied Mobile IP: ${ipText}`);
        }).catch(() => {
          showToast(`📋 Mobile IP: ${ipText}`);
        });
      } else {
        showToast(`📋 Mobile IP: ${ipText}`);
      }
    });

    on('btn-fix-firewall', 'click', async () => {
      try {
        const res = await fetch('/api/system/firewall', { method: 'POST' });
        const data = await res.json();
        if (data.ok) {
          showToast('🛡️ Unblocked Windows Firewall Port 3000!');
        } else {
          showToast('⚠️ Firewall update error: ' + (data.error || 'Failed'));
        }
      } catch (err) {
        showToast('⚠️ Firewall update error: ' + err.message);
      }
    });

    function copyOverlayUrl(path, label) {
      const base = cachedNetworkInfo ? `http://${cachedNetworkInfo.primaryIp}:${cachedNetworkInfo.port}` : location.origin;
      const fullUrl = `${base}${path}`;
      if (navigator.clipboard && fullUrl) {
        navigator.clipboard.writeText(fullUrl).then(() => {
          showToast(`📋 Copied ${label} URL: ${fullUrl}`);
        }).catch(() => {
          showToast(`📋 ${label} URL: ${fullUrl}`);
        });
      } else {
        showToast(`📋 ${label} URL: ${fullUrl}`);
      }
    }

    on('btn-copy-alert-url', 'click', () => copyOverlayUrl('/overlay/alerts', 'Alert Overlay'));
    on('btn-copy-goal-url', 'click', () => copyOverlayUrl('/overlay/goal', 'Goal Overlay'));
    on('btn-copy-goal-url-preview', 'click', () => copyOverlayUrl('/overlay/goal', 'Goal Overlay'));
    on('btn-copy-lb-url', 'click', () => copyOverlayUrl('/overlay/leaderboard', 'Leaderboard Overlay'));
    on('btn-copy-lb-url-preview', 'click', () => copyOverlayUrl('/overlay/leaderboard', 'Leaderboard Overlay'));

    on('btn-clear-logs', 'click', async () => {
      try {
        await fetch('/api/logs/clear', { method: 'POST' });
        const term = el('live-logs-terminal');
        if (term) term.textContent = 'Server logs cleared.';
        showToast('🗑️ Logs cleared');
      } catch (e) {
        showToast('⚠️ Clear logs error');
      }
    });

    on('btn-download-full-logs', 'click', () => {
      window.open('/api/logs?level=ALL', '_blank');
      showToast('📥 Downloading full log file...');
    });

    on('btn-download-filtered-logs', 'click', () => {
      const filterVal = val('select-log-filter', 'ALL');
      window.open(`/api/logs?level=${encodeURIComponent(filterVal)}`, '_blank');
      showToast(`⬇️ Downloading ${filterVal} filtered logs...`);
    });

    fetchLiveLogs();
    setInterval(fetchLiveLogs, 4000);

    on('select-log-filter', 'change', () => fetchLiveLogs());
    on('btn-refresh-logs', 'click', () => {
      fetchLiveLogs();
      showToast('🔄 Logs refreshed');
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
      // Default initial width gives plenty of space to live preview
      const initialWidth = Math.min(520, Math.floor(mainView.clientWidth * 0.48));
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

  // ── Boot ─────────────────────────────────────────────────────
  setupTabs();
  setupCodeEditorTabs();
  setupVariablePills();
  setupCssPills();
  setupColorPickers();
  setupCanvasPresets();
  setupAmountFilterEditor();
  setupTemplateManager();
  setupFileBrowsers();
  setupSnippets();
  setupActionButtons();
  setupSimulator();
  setupNetworkAndSystem();
  setupPanelResizer();
  attachInputListeners();

  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    await loadProfilesList(data.activeProfile);
    populateForm(data.settings || data);
  } catch (e) {
    console.error('[Config] Failed to load settings, using defaults:', e);
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
