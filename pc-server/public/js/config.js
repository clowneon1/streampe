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
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const el = (id) => document.getElementById(id);
  const on = (id, evt, fn) => {
    const node = el(id);
    if (node) node.addEventListener(evt, fn);
  };
  const TEXT_PREFIXES = { template: 'tpl', goal: 'goal', leaderboard: 'lb', recent: 'recent', list: 'list', cycling: 'cycling' };

  let config = ConfigSchema.createDefaultConfig();
  let suppressSync = false;
  const editors = {};

  const TTS_VOICE_CATALOG = {
    'en-IN': [
      { id: 'Aditi', name: 'Aditi (Indian English - Female)' },
      { id: 'Raveena', name: 'Raveena (Indian English - Female)' }
    ],
    'hi-IN': [
      { id: 'Kajal', name: 'Kajal (Hindi - Female)' },
      { id: 'Aditi', name: 'Aditi (Bilingual Hindi/English)' }
    ],
    'en-US': [
      { id: 'Joanna', name: 'Joanna (US English - Female)' },
      { id: 'Kendra', name: 'Kendra (US English - Female)' },
      { id: 'Matthew', name: 'Matthew (US English - Male)' },
      { id: 'Joey', name: 'Joey (US English - Male)' },
      { id: 'Ivy', name: 'Ivy (US English - Child)' },
      { id: 'Justin', name: 'Justin (US English - Child Male)' }
    ],
    'en-GB': [
      { id: 'Amy', name: 'Amy (British - Female)' },
      { id: 'Emma', name: 'Emma (British - Female)' },
      { id: 'Brian', name: 'Brian (British - Male)' },
      { id: 'Arthur', name: 'Arthur (British - Male)' }
    ],
    'es-ES': [
      { id: 'Lucia', name: 'Lucia (Spanish - Female)' },
      { id: 'Enrique', name: 'Enrique (Spanish - Male)' },
      { id: 'Mia', name: 'Mia (Spanish Mexico - Female)' }
    ],
    'fr-FR': [
      { id: 'Lea', name: 'Lea (French - Female)' },
      { id: 'Mathieu', name: 'Mathieu (French - Male)' },
      { id: 'Celine', name: 'Celine (French - Female)' }
    ],
    'de-DE': [
      { id: 'Vicki', name: 'Vicki (German - Female)' },
      { id: 'Daniel', name: 'Daniel (German - Male)' },
      { id: 'Marlene', name: 'Marlene (German - Female)' }
    ],
    'ja-JP': [
      { id: 'Mizuki', name: 'Mizuki (Japanese - Female)' },
      { id: 'Takumi', name: 'Takumi (Japanese - Male)' },
      { id: 'Kazuha', name: 'Kazuha (Japanese - Female)' }
    ],
    'ru-RU': [
      { id: 'Tatyana', name: 'Tatyana (Russian - Female)' },
      { id: 'Maxim', name: 'Maxim (Russian - Male)' }
    ],
    'pt-BR': [
      { id: 'Camila', name: 'Camila (Portuguese BR - Female)' },
      { id: 'Vitoria', name: 'Vitoria (Portuguese BR - Female)' },
      { id: 'Ricardo', name: 'Ricardo (Portuguese BR - Male)' }
    ]
  };

  const MULTILINGUAL_AI_VOICES = [
    { id: 'Puck', name: 'Puck (Gemini AI - Playful & Upbeat)' },
    { id: 'Charon', name: 'Charon (Gemini AI - Deep & Resonant)' },
    { id: 'Kore', name: 'Kore (Gemini AI - Warm & Friendly)' },
    { id: 'Fenrir', name: 'Fenrir (Gemini AI - Bold & Strong)' },
    { id: 'Aoede', name: 'Aoede (Gemini AI - Melodic & Calm)' },
    { id: 'eve', name: 'Eve (xAI Grok - Energetic)' },
    { id: 'ara', name: 'Ara (xAI Grok - Warm)' },
    { id: 'rex', name: 'Rex (xAI Grok - Confident)' },
    { id: 'sal', name: 'Sal (xAI Grok - Smooth)' },
    { id: 'leo', name: 'Leo (xAI Grok - Authoritative)' }
  ];

  function updateTTSVoiceOptions(selectedLang, currentVoice) {
    const voiceSelect = el('tpl-tts-voice');
    if (!voiceSelect) return;
    const langVoices = TTS_VOICE_CATALOG[selectedLang] || TTS_VOICE_CATALOG['en-IN'];
    const activeVoice = currentVoice || (langVoices[0] ? langVoices[0].id : 'Aditi');

    let html = `<optgroup label="Voices for ${selectedLang}">`;
    langVoices.forEach(v => {
      html += `<option value="${TemplateEngine.escapeHtml(v.id)}"${v.id === activeVoice ? ' selected' : ''}>${TemplateEngine.escapeHtml(v.name)}</option>`;
    });
    html += `</optgroup><optgroup label="AI Multilingual Voices (Gemini & xAI)">`;
    MULTILINGUAL_AI_VOICES.forEach(v => {
      html += `<option value="${TemplateEngine.escapeHtml(v.id)}"${v.id === activeVoice ? ' selected' : ''}>${TemplateEngine.escapeHtml(v.name)}</option>`;
    });
    html += `</optgroup>`;

    voiceSelect.innerHTML = html;
    if (activeVoice && voiceSelect.value !== activeVoice) {
      voiceSelect.value = activeVoice;
    }
  }

  const iframe = el('preview-iframe');

  function initCodeEditors() {
    // Inline editors replaced by centralized Code Studio
  }

  function pulseEditorElement(cmInstance) {
    if (!cmInstance) return;
    const wrapper = cmInstance.getWrapperElement ? cmInstance.getWrapperElement() : (cmInstance.nodeType ? cmInstance : null);
    if (wrapper) {
      wrapper.classList.remove('editor-flash-pulse');
      void wrapper.offsetWidth;
      wrapper.classList.add('editor-flash-pulse');
      setTimeout(() => wrapper.classList.remove('editor-flash-pulse'), 700);
    }
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
      pulseEditorElement(editor);
      showToast('<i data-lucide="check"></i> Code formatted', 'success');
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
    toast.style.borderColor = type === 'error' ? '#ff5252' : 'var(--accent, #9146ff)';
    toast.style.boxShadow = type === 'error' ? '0 8px 32px rgba(0, 0, 0, 0.75), 0 0 18px rgba(255, 82, 82, 0.35)' : '0 8px 32px rgba(0, 0, 0, 0.75), 0 0 18px var(--accent-glow, rgba(145, 70, 255, 0.35))';
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

  // ── Advanced Fullscreen Code Studio Controller ──────────────
  // ── Advanced Fullscreen Code Studio Controller ──────────────
  const CodeStudio = {
    modal: null,
    editor: null,
    activeWidget: 'alerts', // 'alerts' | 'goal' | 'list' | 'cycling'
    activeLang: 'html',     // 'html' | 'css' | 'js'
    activeBottomTab: 'vars', // 'vars' | 'classes'
    previewVisible: true,
    debounceTimer: null,

    variablesMap: ConfigSchema.TEMPLATE_VARIABLES,
    cssClassesMap: ConfigSchema.CSS_CLASSES_MAP,

    widgetTargetMap: {
      alerts: {
        badge: 'ALERTS',
        previewUrl: '/overlay/alert',
        codeKind: 'alert'
      },
      goal: {
        badge: 'GOAL WIDGET',
        previewUrl: '/overlay/goal',
        codeKind: 'goal'
      },
      list: {
        badge: 'LIST WIDGET',
        previewUrl: '/overlay/list',
        codeKind: 'leaderboard'
      },
      cycling: {
        badge: 'CYCLING WIDGET',
        previewUrl: '/overlay/cycling-widget',
        codeKind: 'cycling'
      }
    },

    getCodeObject() {
      if (this.activeWidget === 'alerts') {
        const tpl = currentTemplate();
        if (tpl) {
          if (!tpl.code) tpl.code = ConfigSchema.normalizeCode({}, 'alert');
          return tpl.code;
        }
      } else if (this.activeWidget === 'goal') {
        const g = config.widgets?.goal;
        if (g) {
          if (!g.code) g.code = ConfigSchema.normalizeCode({}, 'goal');
          return g.code;
        }
      } else if (this.activeWidget === 'list') {
        const l = currentListConfig();
        if (l) {
          if (!l.code) l.code = ConfigSchema.normalizeCode({}, l.type === 'recent' ? 'recent' : 'leaderboard');
          return l.code;
        }
      } else if (this.activeWidget === 'cycling') {
        const c = config.widgets?.cycling;
        if (c) {
          if (!c.code) c.code = ConfigSchema.normalizeCode({}, 'cycling');
          return c.code;
        }
      }
      return null;
    },

    getCurrentLangKey(lang) {
      if (lang === 'html') return 'customHTML';
      if (lang === 'css') return 'customCSS';
      if (lang === 'js') return 'customJS';
      return 'customHTML';
    },

    getCodeValue(lang) {
      const codeObj = this.getCodeObject();
      if (!codeObj) return '';
      const key = this.getCurrentLangKey(lang);
      return typeof codeObj[key] === 'string' ? codeObj[key] : '';
    },

    syncCurrentToConfig() {
      if (!this.editor) return;
      const codeObj = this.getCodeObject();
      if (!codeObj) return;
      const key = this.getCurrentLangKey(this.activeLang);
      codeObj[key] = this.editor.getValue();
    },

    init() {
      this.modal = el('modal-code-studio');
      if (!this.modal) return;

      const textarea = el('input-studio-editor-textarea');
      if (textarea && !this.editor && window.CodeMirror) {
        this.editor = CodeMirror.fromTextArea(textarea, {
          mode: 'htmlmixed',
          theme: 'dracula',
          lineNumbers: true,
          matchBrackets: true,
          autoCloseBrackets: true,
          tabSize: 2,
          indentUnit: 2,
          lineWrapping: true,
          viewportMargin: Infinity
        });

        this.editor.on('change', () => {
          this.onEditorChange();
        });

        this.editor.on('cursorActivity', () => {
          this.updateCursorStatus();
        });
      }

      this.bindEvents();
    },

    bindEvents() {
      document.querySelectorAll('.btn-popout-code').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const widget = btn.dataset.popoutWidget || 'alerts';
          this.open(widget, 'html');
        });
      });

      const closeBtn = el('btn-studio-close');
      const saveBtn = el('btn-studio-save');
      const backdrop = el('code-studio-backdrop');
      if (closeBtn) closeBtn.addEventListener('click', () => this.close());
      if (backdrop) backdrop.addEventListener('click', () => this.close());
      if (saveBtn) {
        saveBtn.addEventListener('click', async () => {
          this.syncCurrentToConfig();
          const res = await saveToServer();
          if (res && res.ok) {
            showToast('<i data-lucide="check"></i> Code changes saved successfully!', 'success');
          }
        });
      }

      document.querySelectorAll('.code-studio-lang-btn').forEach(tab => {
        tab.addEventListener('click', () => {
          const lang = tab.dataset.studioLang;
          this.switchLang(lang);
        });
      });

      document.querySelectorAll('.code-studio-bottom-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          this.activeBottomTab = tab.dataset.bottomTab;
          document.querySelectorAll('.code-studio-bottom-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.bottomTab === this.activeBottomTab);
          });
          this.renderBottomPanel();
        });
      });

      const formatBtn = el('btn-studio-format');
      if (formatBtn) formatBtn.addEventListener('click', () => this.formatCurrentCode());

      const resetBtn = el('btn-studio-reset');
      if (resetBtn) resetBtn.addEventListener('click', () => this.resetCurrentCode());

      const togglePreviewBtn = el('btn-studio-toggle-preview');
      if (togglePreviewBtn) togglePreviewBtn.addEventListener('click', () => this.togglePreview());

      const testBtn = el('btn-studio-trigger-test');
      if (testBtn) testBtn.addEventListener('click', () => this.triggerTestInPreview());

      window.addEventListener('keydown', async (e) => {
        if (!this.isOpen()) return;

        if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          this.syncCurrentToConfig();
          const res = await saveToServer();
          if (res && res.ok) showToast('<i data-lucide="check"></i> Code changes saved!', 'success');
        } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') {
          e.preventDefault();
          this.formatCurrentCode();
        }
      });
    },

    isOpen() {
      return this.modal && this.modal.style.display !== 'none';
    },

    open(widget = 'alerts', lang = 'html') {
      this.activeWidget = widget;
      this.activeLang = lang;

      const meta = this.widgetTargetMap[widget] || this.widgetTargetMap.alerts;
      const badgeEl = el('code-studio-badge');
      if (badgeEl) {
        if (widget === 'list') {
          const activeList = currentListConfig();
          badgeEl.textContent = (activeList && activeList.type === 'recent') ? 'RECENT DONATIONS' : 'TOP SUPPORTERS';
        } else {
          badgeEl.textContent = meta.badge;
        }
      }

      const testBtn = el('btn-studio-trigger-test');
      if (testBtn) {
        testBtn.style.display = (widget === 'alerts') ? 'inline-flex' : 'none';
      }

      const iframe = el('code-studio-iframe');
      if (iframe) {
        let previewUrl = meta.previewUrl;
        if (widget === 'list') {
          const activeList = currentListConfig();
          previewUrl = `/overlay/list?id=${activeList.id}`;
        }
        iframe.src = `${previewUrl}${previewUrl.includes('?') ? '&' : '?'}preview=true&t=${Date.now()}`;
      }

      this.modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';

      this.switchLang(lang, true);
      if (window.lucide) lucide.createIcons();
    },

    close() {
      this.syncCurrentToConfig();
      if (this.modal) this.modal.style.display = 'none';
      document.body.style.overflow = '';
      readFormValues();
      syncLivePreview();
    },

    switchLang(lang, isInitial = false) {
      if (!isInitial) {
        this.syncCurrentToConfig();
      }

      this.activeLang = lang;

      document.querySelectorAll('.code-studio-lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.studioLang === lang);
      });

      const modePill = el('code-studio-mode-pill');
      if (modePill) modePill.textContent = lang.toUpperCase();

      let mode = 'htmlmixed';
      if (lang === 'css') mode = 'css';
      if (lang === 'js') mode = 'javascript';

      // Auto set bottom tab to classes for CSS, or vars for HTML/JS
      this.activeBottomTab = lang === 'css' ? 'classes' : 'vars';
      document.querySelectorAll('.code-studio-bottom-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.bottomTab === this.activeBottomTab);
      });

      const initialValue = this.getCodeValue(lang);

      if (this.editor) {
        this.editor.setOption('mode', mode);
        this.editor.setValue(initialValue || '');
        this.editor.clearHistory();
        setTimeout(() => {
          this.editor.refresh();
          this.editor.focus();
        }, 50);
      }

      this.renderBottomPanel();
      this.updateCursorStatus();
    },

    renderBottomPanel() {
      const container = el('code-studio-bottom-content');
      if (!container) return;

      container.innerHTML = '';

      if (this.activeBottomTab === 'vars') {
        const vars = this.variablesMap[this.activeWidget] || [];
        if (vars.length === 0) {
          container.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">No template variables for this widget.</span>';
          return;
        }

        vars.forEach(v => {
          const varName = (typeof v === 'object' && v !== null) ? v.name : String(v);
          const varDesc = (typeof v === 'object' && v !== null) ? v.desc : '';
          const insertText = this.activeLang === 'js' ? varName : `{{${varName}}}`;

          const chip = document.createElement('span');
          chip.className = 'code-studio-chip';
          chip.textContent = insertText;
          if (varDesc) {
            chip.title = `${varName}: ${varDesc} (Click to insert/copy)`;
          }
          chip.addEventListener('click', () => {
            if (this.editor) {
              const doc = this.editor.getDoc();
              const cursor = doc.getCursor();
              doc.replaceRange(insertText, cursor);
              this.editor.focus();
            }
            copyToClipboard(insertText).catch(() => { });
            showToast(`<i data-lucide="copy"></i> Copied "${insertText}"`);
          });
          container.appendChild(chip);
        });
      } else {
        const classes = this.cssClassesMap[this.activeWidget] || [];
        if (classes.length === 0) {
          container.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">No class selectors for this widget.</span>';
          return;
        }

        classes.forEach(c => {
          const pill = document.createElement('span');
          pill.className = 'code-studio-class-pill';
          pill.textContent = `{ ${c} }`;
          pill.addEventListener('click', () => {
            if (this.activeLang === 'css' && this.editor) {
              const doc = this.editor.getDoc();
              const cursor = doc.getCursor();
              doc.replaceRange(`\n${c} {\n  \n}\n`, cursor);
              this.editor.focus();
            }
            copyToClipboard(c).catch(() => { });
            showToast(`<i data-lucide="copy"></i> Copied selector "${c}"`);
          });
          container.appendChild(pill);
        });
      }

      if (window.lucide) lucide.createIcons();
    },

    onEditorChange() {
      this.syncCurrentToConfig();
      this.updateCursorStatus();

      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => {
        syncLivePreview();
      }, 100);
    },

    updateCursorStatus() {
      if (!this.editor) return;
      const cursor = this.editor.getCursor();
      const posEl = el('code-studio-cursor-info');
      if (posEl) {
        posEl.textContent = `Ln ${cursor.line + 1}, Col ${cursor.ch + 1}`;
      }
      const charEl = el('code-studio-char-info');
      if (charEl) {
        const val = this.editor.getValue() || '';
        charEl.textContent = `${val.length} chars`;
      }
    },

    async formatCurrentCode() {
      if (!this.editor || !window.prettier) return;

      const code = this.editor.getValue();
      let parser = 'html';
      let plugins = [prettierPlugins.html];

      if (this.activeLang === 'css') {
        parser = 'css';
        plugins = [prettierPlugins.postcss];
      } else if (this.activeLang === 'js') {
        parser = 'babel';
        plugins = [prettierPlugins.babel];
      }

      try {
        const formatted = await prettier.format(code, {
          parser,
          plugins,
          tabWidth: 2,
          singleQuote: true,
          printWidth: 80
        });
        this.editor.setValue(formatted);
        this.syncCurrentToConfig();
        syncLivePreview();
        pulseEditorElement(this.editor);
        showToast('<i data-lucide="check"></i> Code formatted', 'success');
      } catch (err) {
        console.warn('[Prettier] Formatting error:', err);
        showToast('<i data-lucide="alert-triangle"></i> Format failed: ' + err.message.split('\n')[0], 'error');
      }
    },

    resetCurrentCode() {
      if (!this.editor) return;
      let defaultCode = '';
      if (this.activeWidget === 'alerts') {
        if (this.activeLang === 'html') defaultCode = ConfigSchema.DEFAULT_CODE.alert.customHTML;
        if (this.activeLang === 'css') defaultCode = ConfigSchema.DEFAULT_CODE.alert.customCSS;
        if (this.activeLang === 'js') defaultCode = ConfigSchema.DEFAULT_CODE.alert.customJS;
      } else if (this.activeWidget === 'goal') {
        if (this.activeLang === 'html') defaultCode = ConfigSchema.DEFAULT_CODE.goal.customHTML;
        if (this.activeLang === 'css') defaultCode = ConfigSchema.DEFAULT_CODE.goal.customCSS;
        if (this.activeLang === 'js') defaultCode = ConfigSchema.DEFAULT_CODE.goal.customJS;
      } else if (this.activeWidget === 'list') {
        const activeList = currentListConfig();
        const kind = (activeList && activeList.type === 'recent') ? 'recent' : 'leaderboard';
        if (this.activeLang === 'html') defaultCode = ConfigSchema.DEFAULT_CODE[kind].customHTML;
        if (this.activeLang === 'css') defaultCode = ConfigSchema.DEFAULT_CODE[kind].customCSS;
        if (this.activeLang === 'js') defaultCode = ConfigSchema.DEFAULT_CODE[kind].customJS;
      } else if (this.activeWidget === 'cycling') {
        if (this.activeLang === 'html') defaultCode = ConfigSchema.DEFAULT_CODE.cycling.customHTML;
        if (this.activeLang === 'css') defaultCode = ConfigSchema.DEFAULT_CODE.cycling.customCSS;
        if (this.activeLang === 'js') defaultCode = ConfigSchema.DEFAULT_CODE.cycling.customJS;
      }

      this.editor.setValue(defaultCode);
      this.syncCurrentToConfig();
      syncLivePreview();
      pulseEditorElement(this.editor);
      showToast('<i data-lucide="rotate-ccw"></i> Reset to default code');
    },

    togglePreview() {
      this.previewVisible = !this.previewVisible;
      const previewCol = el('code-studio-preview-column');
      const editorCol = el('code-studio-editor-column');
      const label = el('lbl-studio-preview-toggle');

      if (previewCol) previewCol.classList.toggle('hidden', !this.previewVisible);
      if (editorCol) editorCol.classList.toggle('full-width', !this.previewVisible);
      if (label) label.textContent = this.previewVisible ? 'Hide Preview' : 'Show Preview';

      setTimeout(() => {
        if (this.editor) this.editor.refresh();
      }, 250);
    },

    triggerTestInPreview() {
      const iframe = el('code-studio-iframe');
      if (!iframe || !iframe.contentWindow) return;

      const loadedTemplate = currentTemplate();
      const testData = {
        ...sampleAlert(),
        alertTemplateId: loadedTemplate ? loadedTemplate.id : null
      };

      iframe.contentWindow.postMessage({
        type: 'TRIGGER_TEST_ALERT',
        data: testData
      }, '*');

      showToast('<i data-lucide="zap"></i> Sent test event to preview sandbox');
    }
  };

  // ── Voice Studio Modal Controller ───────────────────────────
  const NEURAL_VOICES = [
    { group: '🇮🇳 Indian Voices (Hinglish & Hindi)', voices: [
      { id: 'en-IN-NeerjaNeural', label: '👩 Neerja (Indian English / Hinglish - Female)' },
      { id: 'en-IN-PrabhatNeural', label: '👨 Prabhat (Indian English / Hinglish - Male)' },
      { id: 'hi-IN-SwaraNeural', label: '👩 Swara (Hindi / Hinglish - Female)' },
      { id: 'hi-IN-MadhurNeural', label: '👨 Madhur (Hindi / Hinglish - Male)' }
    ]},
    { group: '🇺🇸 US & Global AI Voices', voices: [
      { id: 'en-US-JennyNeural', label: '👩 Jenny (US - Female)' },
      { id: 'en-US-GuyNeural', label: '👨 Guy (US - Male)' },
      { id: 'en-US-AriaNeural', label: '👩 Aria (US - Female)' }
    ]}
  ];

  function updateTTSVoiceOptions(provider, selectedVoice) {
    const select = el('tpl-tts-voice');
    if (!select) return;
    select.innerHTML = '';
    if (provider === 'local') {
      const voices = (typeof window !== 'undefined' && window.speechSynthesis) ? window.speechSynthesis.getVoices() : [];
      if (!voices.length) {
        select.innerHTML = '<option value="">Default System Voice</option>';
      } else {
        select.innerHTML = voices.map(v => `<option value="${v.name}">${v.name} (${v.lang}) ${v.default ? '★' : ''}</option>`).join('');
      }
      if (selectedVoice) select.value = selectedVoice;
    } else {
      NEURAL_VOICES.forEach(grp => {
        const optgroup = document.createElement('optgroup');
        optgroup.label = grp.group;
        grp.voices.forEach(v => {
          const opt = document.createElement('option');
          opt.value = v.id;
          opt.textContent = v.label;
          if (v.id === selectedVoice) opt.selected = true;
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      });
      if (selectedVoice) select.value = selectedVoice;
    }
  }

  const TTSStudio = {
    modal: null,
    iframe: null,

    init() {
      this.modal = el('modal-tts-studio');
      this.iframe = el('tts-studio-iframe');
      if (!this.modal) return;

      on('btn-open-tts-studio', 'click', () => this.open());
      on('btn-tts-studio-close', 'click', () => this.close());
      const backdrop = el('tts-studio-backdrop');
      if (backdrop) backdrop.addEventListener('click', () => this.close());

      window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && this.modal && this.modal.style.display !== 'none') {
          this.close();
        }
      });

      window.addEventListener('message', (e) => {
        if (!e.data) return;

        if (e.data.type === 'APPLY_TTS_SETTINGS') {
          const s = e.data.settings;
          if (!s) return;
          setSelectVal('tpl-tts-provider', s.provider);
          updateTTSVoiceOptions(s.provider, s.voice);
          setSelectVal('tpl-tts-voice', s.voice);
          setVal('tpl-tts-rate', s.rate);
          setVal('tpl-tts-pitch', s.pitch);
          if (s.template) {
            setVal('tpl-tts-template', s.template);
          }

          showToast('<i data-lucide="check"></i> Voice settings & template synced!', 'success');
          this.close();
        } else if (e.data.type === 'TRIGGER_OBS_ALERT_FROM_STUDIO') {
          const sim = e.data.eventData || {};
          const currentTpl = currentTemplate();
          const tplId = currentTpl ? currentTpl.id : config.activeTemplateId;
          const numAmount = TemplateMatcher.parseAmount(sim.amount) || 500;
          const formattedAmount = numAmount.toLocaleString('en-IN');
          const isIsolated = config.simulation ? config.simulation.isolatedMode !== false : true;

          const rawNotif = {
            type: 'payment_notification',
            alertId: `sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            alertTemplateId: tplId,
            simulated: isIsolated,
            appName: sim.sourceApp || 'Google Pay',
            sender: sim.sender || 'Rahul Sharma',
            amount: sim.amount || '₹500',
            amountValue: numAmount,
            message: sim.message || '',
            text: `${sim.sender || 'Rahul Sharma'} paid you ₹${formattedAmount}`,
            timestamp: Date.now()
          };

          fetch('/api/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...rawNotif, settings: config })
          }).then(() => {
            showToast('<i data-lucide="send"></i> Dispatched test alert to OBS overlay!', 'success');
          }).catch(err => {
            showToast('Failed to trigger alert: ' + err.message, 'error');
          });
        }
      });
    },

    open() {
      if (!this.modal) return;
      readFormValues();
      this.modal.style.display = 'flex';
      setTimeout(() => this.modal.classList.add('active'), 10);

      const template = currentTemplate() || (config.alertTemplates && config.alertTemplates[0]);
      const tts = (template && template.tts) ? template.tts : ConfigSchema.TTS_DEFAULTS;

      // Extract last donation event from recent list or fallback to active simulator settings
      let lastEvent = null;
      const recentList = config.widgets && config.widgets.recent && config.widgets.recent.recentDonations;
      if (Array.isArray(recentList) && recentList.length > 0) {
        const r = recentList[0];
        lastEvent = {
          sender: r.name || r.sender || 'Rahul Kumar',
          amount: r.amount ? (String(r.amount).startsWith('₹') ? r.amount : `₹${r.amount}`) : '₹500',
          message: r.message || '',
          sourceApp: r.app || r.sourceApp || 'Google Pay'
        };
      } else {
        lastEvent = {
          sender: val('sim-sender', 'Rahul Sharma'),
          amount: `₹${val('sim-amount', '500')}`,
          message: val('sim-message', 'Awesome stream bhai!'),
          sourceApp: val('sim-app-provider', 'Google Pay')
        };
      }

      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          type: 'INIT_TTS_PREVIEW',
          tts: {
            ...tts,
            templateText: val('tpl-tts-template', tts.template)
          },
          lastEvent: lastEvent
        }, '*');
      }
    },

    close() {
      if (!this.modal) return;
      this.modal.classList.remove('active');
      setTimeout(() => {
        this.modal.style.display = 'none';
      }, 200);
    }
  };
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
    } catch (_) { }
  }
  function _flashCopied(btn) {
    if (!btn || btn._copying) return;
    btn._copying = true;
    const original = btn.innerHTML;
    const originalTitle = btn.title;
    btn.innerHTML = '<i data-lucide="check" style="width:13px;height:13px;stroke:var(--cyan);"></i>';
    btn.title = 'Copied!';
    if (window.lucide) lucide.createIcons();
    btn.classList.add('btn-copy-flash');
    setTimeout(() => {
      btn.innerHTML = original;
      btn.title = originalTitle;
      btn.classList.remove('btn-copy-flash');
      btn._copying = false;
      if (window.lucide) lucide.createIcons();
    }, 1500);
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
    if (!node || value === undefined || value === null) return;
    if (node.type === 'color') {
      let colorVal = String(value).trim();
      if (/^#[0-9a-f]{8}$/i.test(colorVal)) {
        colorVal = colorVal.slice(0, 7);
      } else if (/^#[0-9a-f]{3}$/i.test(colorVal)) {
        colorVal = '#' + colorVal[1] + colorVal[1] + colorVal[2] + colorVal[2] + colorVal[3] + colorVal[3];
      } else if (!/^#[0-9a-f]{6}$/i.test(colorVal)) {
        colorVal = '#ffffff';
      }
      node.value = colorVal;
      return;
    }
    node.value = value;
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
    const active = currentTemplate();
    const activeId = active ? active.id : config.activeTemplateId;
    const newOptionsHtml = config.alertTemplates.map(t => {
      const star = t.isDefault ? ' ⭐' : '';
      const flags = [t.isDefault ? 'fallback' : '', t.enabled ? '' : 'disabled']
        .filter(Boolean).join(', ');
      const label = TemplateEngine.escapeHtml(t.name) + (flags ? ` (${flags})` : '') + star;
      return `<option value="${TemplateEngine.escapeHtml(t.id)}"${t.id === activeId ? ' selected' : ''}>${label}</option>`;
    }).join('');
    if (select.innerHTML !== newOptionsHtml) {
      select.innerHTML = newOptionsHtml;
    }
    if (activeId && select.value !== activeId) {
      select.value = activeId;
    }

    const summary = el('template-summary');
    if (summary) {
      summary.textContent = active
        ? `${config.alertTemplates.length} template(s). "${active.name}" matches: ${describeFilters(active)}.`
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

  // ── List Config Manager ───────────────────────────────────────
  function currentListConfig() {
    if (!Array.isArray(config.listConfigs) || !config.listConfigs.length) {
      const def = ConfigSchema.createListConfig('top-supporters', { id: 'top-supporters', name: 'Top Supporters', isDefault: true });
      config.listConfigs = [def];
      config.activeListConfigId = def.id;
    }
    const found = config.listConfigs.find(l => l.id === config.activeListConfigId);
    return found || config.listConfigs[0];
  }

  function renderListConfigDropdown() {
    const select = el('select-active-list');
    if (!select) return;
    const lists = Array.isArray(config.listConfigs) ? config.listConfigs : [];
    const active = currentListConfig();
    const activeId = active ? active.id : config.activeListConfigId;
    const newHtml = lists.map(l => {
      const typeLabel = l.type === 'recent' ? 'Recent Feed' : 'Leaderboard';
      const flags = [typeLabel, l.enabled ? '' : 'disabled'].filter(Boolean).join(', ');
      return `<option value="${TemplateEngine.escapeHtml(l.id)}"${l.id === activeId ? ' selected' : ''}>${TemplateEngine.escapeHtml(l.name)} (${flags})</option>`;
    }).join('');
    if (select.innerHTML !== newHtml) {
      select.innerHTML = newHtml;
    }
    if (activeId && select.value !== activeId) {
      select.value = activeId;
    }

    const badge = el('badge-list-url');
    if (badge && active) {
      badge.textContent = `/overlay/list?id=${active.id}`;
    }
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
      const mediaVal = val('input-image-url', '').trim();
      template.image = {
        imageUrl: mediaVal,
        gifUrl: '',
        position: val('select-media-position', template.image?.position || 'top'),
        size: numVal('input-media-size', template.image?.size || 100)
      };
      template.sound = {
        soundUrl: val('input-sound-url', '').trim(),
        soundVolume: numVal('input-sound-volume', template.sound?.soundVolume !== undefined ? template.sound.soundVolume : 80)
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
      const prevTplCode = template.code || ConfigSchema.DEFAULT_CODE.alert;
      template.code = {
        enableCustomCode: checked('chk-enable-custom-code', false),
        customHTML: val('input-custom-html', (typeof prevTplCode.customHTML === 'string') ? prevTplCode.customHTML : ConfigSchema.DEFAULT_CODE.alert.customHTML),
        customCSS: val('input-custom-css', (typeof prevTplCode.customCSS === 'string') ? prevTplCode.customCSS : ConfigSchema.DEFAULT_CODE.alert.customCSS),
        customJS: val('input-custom-js', (typeof prevTplCode.customJS === 'string') ? prevTplCode.customJS : ConfigSchema.DEFAULT_CODE.alert.customJS)
      };

      const prevTTS = template.tts || ConfigSchema.TTS_DEFAULTS;
      template.tts = {
        enabled: checked('tpl-tts-enabled', false),
        template: val('tpl-tts-template', prevTTS.template),
        provider: val('tpl-tts-provider', prevTTS.provider || 'edge'),
        voice: val('tpl-tts-voice', prevTTS.voice || 'en-IN-NeerjaNeural'),
        rate: numVal('tpl-tts-rate', prevTTS.rate !== undefined ? prevTTS.rate : 1.0),
        pitch: numVal('tpl-tts-pitch', prevTTS.pitch !== undefined ? prevTTS.pitch : 0),
        volume: numVal('tpl-tts-volume', prevTTS.volume !== undefined ? prevTTS.volume : 100),
        delay: numVal('tpl-tts-delay', prevTTS.delay !== undefined ? prevTTS.delay : 400),
        maxChars: 200
      };
    }

    const goal = config.widgets.goal;
    const prevGoalCurrent = goal.currentAmount;
    goal.enabled = checked('chk-enable-goal', goal.enabled);
    goal.allowOverflow = checked('chk-goal-allow-overflow', !!goal.allowOverflow);
    goal.title = val('input-goal-title', goal.title);
    goal.targetAmount = numVal('input-goal-target', goal.targetAmount);
    goal.currentAmount = numVal('input-goal-current', prevGoalCurrent !== undefined ? prevGoalCurrent : 0);
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
    const prevGoalCode = goal.code || ConfigSchema.DEFAULT_CODE.goal;
    goal.code = {
      enableCustomCode: checked('chk-enable-goal-custom-code', false),
      customHTML: (typeof prevGoalCode.customHTML === 'string') ? prevGoalCode.customHTML : ConfigSchema.DEFAULT_CODE.goal.customHTML,
      customCSS: (typeof prevGoalCode.customCSS === 'string') ? prevGoalCode.customCSS : ConfigSchema.DEFAULT_CODE.goal.customCSS,
      customJS: (typeof prevGoalCode.customJS === 'string') ? prevGoalCode.customJS : ConfigSchema.DEFAULT_CODE.goal.customJS
    };

    const activeList = currentListConfig();
    if (activeList) {
      activeList.enabled = checked('chk-enable-list', activeList.enabled);
      activeList.type = activeList.id === 'recent-donations' ? 'recent' : 'leaderboard';
      activeList.name = activeList.type === 'recent' ? 'Recent Donations' : 'Top Supporters';
      activeList.title = val('input-list-title', activeList.title);
      const listMaxPreset = val('select-list-max', '5');
      activeList.maxEntries = listMaxPreset === 'custom' ? numVal('input-list-max-custom', 5) : parseInt(listMaxPreset, 10);
      activeList.showAmounts = checked('chk-list-show-amounts', activeList.showAmounts);
      activeList.filter = {
        provider: val('select-list-provider', 'all'),
        minAmount: numVal('input-list-min-amount', 0),
        timeRange: 'all'
      };
      activeList.text = Object.assign(readTextStyle(TEXT_PREFIXES.list, activeList.text), {
        titleTemplate: val('input-list-title', activeList.text.titleTemplate)
      });
      activeList.canvas = readCanvas(TEXT_PREFIXES.list, activeList.canvas);
      activeList.style = Object.assign({}, activeList.style, {
        backgroundColor: val('input-list-bg-color-hex') || val('input-list-bg-color', activeList.style.backgroundColor || '#0a0e17'),
        accentColor: val('input-list-accent-color-hex') || val('input-list-accent-color', activeList.style.accentColor),
        rowBgColor: val('input-list-row-bg-color-hex') || val('input-list-row-bg-color', activeList.style.rowBgColor),
        backgroundOpacity: numVal('input-list-bg-opacity', activeList.style.backgroundOpacity),
        borderWidth: numVal('input-list-border-width', activeList.style.borderWidth ?? 1),
        borderColor: val('input-list-border-color-hex') || val('input-list-border-color', activeList.style.borderColor || '#ffffff22'),
        borderRadius: numVal('input-list-border-radius', activeList.style.borderRadius ?? 16),
        padding: numVal('input-list-padding', activeList.style.padding ?? 18)
      });
      activeList.layout = Object.assign({}, activeList.layout, {
        width: numVal('input-list-layout-width', activeList.layout?.width || 450)
      });
      const listDefault = activeList.type === 'recent' ? ConfigSchema.DEFAULT_CODE.recent : ConfigSchema.DEFAULT_CODE.leaderboard;
      const prevListCode = activeList.code || listDefault;
      activeList.code = {
        enableCustomCode: checked('chk-enable-list-custom-code', false),
        customHTML: (typeof prevListCode.customHTML === 'string') ? prevListCode.customHTML : listDefault.customHTML,
        customCSS: (typeof prevListCode.customCSS === 'string') ? prevListCode.customCSS : listDefault.customCSS,
        customJS: (typeof prevListCode.customJS === 'string') ? prevListCode.customJS : listDefault.customJS
      };

      if (activeList.type === 'leaderboard') {
        const prevSupporters = config.widgets.leaderboard.supporters;
        config.widgets.leaderboard.title = activeList.title;
        config.widgets.leaderboard.maxEntries = activeList.maxEntries;
        config.widgets.leaderboard.showAmounts = activeList.showAmounts;
        config.widgets.leaderboard.style = Object.assign({}, activeList.style);
        config.widgets.leaderboard.text = Object.assign({}, activeList.text);
        if (prevSupporters) config.widgets.leaderboard.supporters = prevSupporters;
      } else {
        const prevRecent = config.widgets.recent.recentDonations;
        config.widgets.recent.title = activeList.title;
        config.widgets.recent.maxEntries = activeList.maxEntries;
        config.widgets.recent.showAmounts = activeList.showAmounts;
        config.widgets.recent.style = Object.assign({}, activeList.style);
        config.widgets.recent.text = Object.assign({}, activeList.text);
        if (prevRecent) config.widgets.recent.recentDonations = prevRecent;
      }
    }

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

    const cyclingPreset = val('cycling-position-preset', 'center');
    const cyclingAnchor = ConfigSchema.POSITION_PRESETS[cyclingPreset] || { x: 50, y: 50 };
    cycling.layout = {
      positionPreset: cyclingPreset,
      positionX: cyclingAnchor.x,
      positionY: cyclingAnchor.y,
      width: numVal('cycling-layout-width', 350)
    };

    const prevCyclingCode = cycling.code || ConfigSchema.DEFAULT_CODE.cycling;
    cycling.code = {
      enableCustomCode: checked('chk-enable-cycling-custom-code', false),
      customHTML: (typeof prevCyclingCode.customHTML === 'string') ? prevCyclingCode.customHTML : ConfigSchema.DEFAULT_CODE.cycling.customHTML,
      customCSS: (typeof prevCyclingCode.customCSS === 'string') ? prevCyclingCode.customCSS : ConfigSchema.DEFAULT_CODE.cycling.customCSS,
      customJS: (typeof prevCyclingCode.customJS === 'string') ? prevCyclingCode.customJS : ConfigSchema.DEFAULT_CODE.cycling.customJS
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

      const tts = template.tts || ConfigSchema.TTS_DEFAULTS;
      setChecked('tpl-tts-enabled', tts.enabled);
      setVal('tpl-tts-template', tts.template);
      setSelectVal('tpl-tts-provider', tts.provider || 'edge');
      updateTTSVoiceOptions(tts.provider || 'edge', tts.voice || 'en-IN-NeerjaNeural');
      setVal('tpl-tts-rate', tts.rate !== undefined ? tts.rate : 1.0);
      setVal('tpl-tts-pitch', tts.pitch !== undefined ? tts.pitch : 0);
      setVal('tpl-tts-volume', tts.volume !== undefined ? tts.volume : 100);
      setVal('tpl-tts-delay', tts.delay !== undefined ? tts.delay : 400);
    }

    const goal = config.widgets.goal;
    setChecked('chk-enable-goal', goal.enabled);
    setChecked('chk-goal-allow-overflow', !!goal.allowOverflow);
    setVal('input-goal-title', goal.text.titleTemplate || goal.title);
    setVal('input-goal-target', goal.targetAmount);
    setVal('input-goal-current', goal.currentAmount);
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
    el('goal-fill2-container').style.display = goal.style.useGradient ? 'flex' : 'none';

    writeTextStyle(TEXT_PREFIXES.goal, goal.text);
    writeCanvas(TEXT_PREFIXES.goal, goal.canvas);
    setChecked('chk-enable-goal-custom-code', goal.code.enableCustomCode);
    setVal('input-goal-custom-html', goal.code.customHTML);
    setVal('input-goal-custom-css', goal.code.customCSS);
    setVal('input-goal-custom-js', goal.code.customJS);

    renderListConfigDropdown();
    const activeList = currentListConfig();
    if (activeList) {
      setChecked('chk-enable-list', activeList.enabled);
      setVal('select-list-type', activeList.type);
      setVal('input-list-title', activeList.text.titleTemplate || activeList.title);
      const listPresets = ['3', '5', '10', '20'];
      if (listPresets.indexOf(String(activeList.maxEntries)) !== -1) {
        setVal('select-list-max', String(activeList.maxEntries));
        el('input-list-max-custom').style.display = 'none';
      } else {
        setVal('select-list-max', 'custom');
        setVal('input-list-max-custom', activeList.maxEntries);
        el('input-list-max-custom').style.display = 'block';
      }
      setChecked('chk-list-show-amounts', activeList.showAmounts);
      setVal('select-list-provider', activeList.filter?.provider || 'all');
      setVal('input-list-min-amount', activeList.filter?.minAmount || 0);

      setVal('input-list-bg-color', activeList.style.backgroundColor || '#0a0e17');
      setVal('input-list-bg-color-hex', activeList.style.backgroundColor || '#0a0e17');
      setVal('input-list-accent-color', activeList.style.accentColor || '#00e5ff');
      setVal('input-list-accent-color-hex', activeList.style.accentColor || '#00e5ff');
      setVal('input-list-row-bg-color', activeList.style.rowBgColor || '#1a1e2b');
      setVal('input-list-row-bg-color-hex', activeList.style.rowBgColor || '#1a1e2b');
      setVal('input-list-bg-opacity', activeList.style.backgroundOpacity ?? 88);
      setVal('input-list-border-width', activeList.style.borderWidth ?? 1);
      setVal('input-list-border-color', activeList.style.borderColor || '#ffffff22');
      setVal('input-list-border-color-hex', activeList.style.borderColor || '#ffffff22');
      setVal('input-list-border-radius', activeList.style.borderRadius ?? 16);
      setVal('input-list-padding', activeList.style.padding ?? 18);

      writeTextStyle(TEXT_PREFIXES.list, activeList.text);
      writeCanvas(TEXT_PREFIXES.list, activeList.canvas);
      setVal('input-list-layout-width', activeList.layout?.width || 450);

      setChecked('chk-enable-list-custom-code', activeList.code?.enableCustomCode);
      setVal('input-list-custom-html', activeList.code?.customHTML || '');
      setVal('input-list-custom-css', activeList.code?.customCSS || '');
      setVal('input-list-custom-js', activeList.code?.customJS || '');
    }

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
    updateSavedBaseline();
  }

  let lastSavedSnapshot = '';

  function getSerializedState() {
    readFormValues();
    const cleanConfig = JSON.parse(JSON.stringify(config));
    if (cleanConfig.widgets?.goal) cleanConfig.widgets.goal.currentAmount = 0;
    if (cleanConfig.widgets?.leaderboard) cleanConfig.widgets.leaderboard.supporters = {};
    if (cleanConfig.widgets?.recent) cleanConfig.widgets.recent.recentDonations = [];
    return JSON.stringify(cleanConfig);
  }

  function updateSavedBaseline() {
    lastSavedSnapshot = getSerializedState();
  }

  function hasUnsavedChanges() {
    if (!lastSavedSnapshot) return false;
    return getSerializedState() !== lastSavedSnapshot;
  }

  window.addEventListener('beforeunload', (e) => {
    if (hasUnsavedChanges()) {
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to reload?';
      return e.returnValue;
    }
  });

  function syncLivePreview() {
    if (suppressSync) return;
    readFormValues();
    renderTemplateList();
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage({ type: 'SETTINGS_UPDATED', payload: config }, '*');
      iframe.contentWindow.postMessage({ type: 'config', config: config }, '*');
    }
    const studioIframe = el('code-studio-iframe');
    if (studioIframe && studioIframe.contentWindow) {
      studioIframe.contentWindow.postMessage({ type: 'SETTINGS_UPDATED', payload: config }, '*');
      studioIframe.contentWindow.postMessage({ type: 'config', config: config }, '*');
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

  // ── Server IO & Profile Helpers ───────────────────────────────
  function getCurrentProfileName() {
    const select = el('select-profile');
    if (select && select.value && select.value.trim()) {
      return select.value.trim();
    }
    if (window.__activeProfile && window.__activeProfile.trim()) {
      return window.__activeProfile.trim();
    }
    return 'Default';
  }

  async function saveToServer(profileName) {
    console.log('[Server IO] Saving profile to server:', profileName);
    readFormValues();

    // Validate that Custom HTML is not empty when Custom Code is enabled
    const template = currentTemplate();
    if (template && template.code && template.code.enableCustomCode && !template.code.customHTML.trim()) {
      showToast('<i data-lucide="alert-triangle"></i> Custom HTML cannot be empty when custom code is enabled', 'error');
      return { ok: false, error: 'Custom HTML cannot be empty' };
    }

    const goal = config.widgets?.goal;
    if (goal && goal.code && goal.code.enableCustomCode && !goal.code.customHTML.trim()) {
      showToast('<i data-lucide="alert-triangle"></i> Goal Custom HTML cannot be empty when custom code is enabled', 'error');
      return { ok: false, error: 'Goal Custom HTML cannot be empty' };
    }

    const activeList = currentListConfig();
    if (activeList && activeList.code && activeList.code.enableCustomCode && !activeList.code.customHTML.trim()) {
      showToast('<i data-lucide="alert-triangle"></i> List Custom HTML cannot be empty when custom code is enabled', 'error');
      return { ok: false, error: 'List Custom HTML cannot be empty' };
    }

    const cycling = config.widgets?.cycling;
    if (cycling && cycling.code && cycling.code.enableCustomCode && !cycling.code.customHTML.trim()) {
      showToast('<i data-lucide="alert-triangle"></i> Cycling Custom HTML cannot be empty when custom code is enabled', 'error');
      return { ok: false, error: 'Cycling Custom HTML cannot be empty' };
    }

    const targetName = profileName || getCurrentProfileName();
    try {
      const res = await fetch('/api/profiles/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetName, settings: config })
      });
      const data = await res.json();
      if (data.ok && data.settings) {
        config = ConfigMigration.migrate(data.settings);
        if (data.profiles) await loadProfilesList(data.activeProfile);
        await fetchAndRenderAnalytics();
        updateSavedBaseline();
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
      const res = await fetch('/api/profiles');
      const data = await res.json();
      if (!data || !data.profiles) return;
      const profileNames = Array.isArray(data.profiles)
        ? data.profiles
        : Object.keys(data.profiles);
      const active = activeProfile || data.activeProfile || profileNames[0] || 'Default';
      window.__activeProfile = active;
      select.innerHTML = profileNames.map(name =>
        `<option value="${TemplateEngine.escapeHtml(name)}"${name === active ? ' selected' : ''}>${TemplateEngine.escapeHtml(name)}</option>`
      ).join('');
      select.value = active;
    } catch (e) {
      console.error('[Profiles] Failed to load profiles list:', e);
    }
  }

  // ── In-App Update Engine & Updates Tab ───────────────────────────
  let latestUpdateInfo = null;
  let updatePollTimer = null;

  function formatReleaseNotesMarkdown(md) {
    if (!md) return '<span style="color: var(--text-muted);">No changelog or release notes provided.</span>';

    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Headers ###, ##, #
    html = html.replace(/^### (.*$)/gim, '<h5 style="color: var(--accent); margin: 14px 0 6px 0; font-size: 13.5px; font-weight: 700;">$1</h5>');
    html = html.replace(/^## (.*$)/gim, '<h4 style="color: #f1f5f9; margin: 16px 0 8px 0; font-size: 14.5px; font-weight: 700; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 4px;">$1</h4>');
    html = html.replace(/^# (.*$)/gim, '<h3 style="color: var(--accent); margin: 18px 0 10px 0; font-size: 15.5px; font-weight: 800;">$1</h3>');

    // Bold & Italic
    html = html.replace(/\*\*(.*?)\*\*/gim, '<strong style="color: #f8fafc;">$1</strong>');
    html = html.replace(/\*(.*?)\*/gim, '<em style="color: #cbd5e1;">$1</em>');

    // Inline code `code`
    html = html.replace(/`([^`]+)`/gim, '<code style="background: rgba(145, 70, 255, 0.12); color: var(--accent-light); padding: 2px 6px; border-radius: 4px; font-size: 11.5px; font-family: monospace; border: 1px solid rgba(145, 70, 255, 0.25);">$1</code>');

    // Markdown links [text](url)
    html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gim, '<a href="$2" target="_blank" style="color: var(--accent-light); text-decoration: underline;">$1</a>');

    // Bullet points
    html = html.replace(/^\* (.*$)/gim, '<div style="display: flex; gap: 8px; margin-bottom: 6px; line-height: 1.5;"><span style="color: var(--accent); font-weight: bold;">•</span><span>$1</span></div>');
    html = html.replace(/^- (.*$)/gim, '<div style="display: flex; gap: 8px; margin-bottom: 6px; line-height: 1.5;"><span style="color: var(--accent); font-weight: bold;">•</span><span>$1</span></div>');

    // Raw URLs
    html = html.replace(/(^|[^">])(https?:\/\/[^\s<"']+)/gim, '$1<a href="$2" target="_blank" style="color: var(--accent); text-decoration: underline;">$2</a>');

    // Double newlines
    html = html.replace(/\n\n/g, '<div style="height: 8px;"></div>');

    return html;
  }

  async function checkAppUpdates(silent = true, force = false) {
    try {
      const url = force ? '/api/updates/check?force=true' : '/api/updates/check';
      const res = await fetch(url);
      const data = await res.json();
      if (!data || !data.ok) {
        if (!silent) showToast('<i data-lucide="alert-circle"></i> Failed to check updates: ' + (data?.error || 'Network error'));
        return;
      }

      latestUpdateInfo = data;
      const navPill = el('nav-update-pill');

      if (data.updateAvailable) {
        if (navPill) navPill.style.display = 'inline-block';
      } else {
        if (navPill) navPill.style.display = 'none';
        if (!silent) {
          showToast(`<i data-lucide="check-circle"></i> StreamPe is up to date (v${data.currentVersion})`);
        }
      }

      renderUpdatesTabUI(data);
    } catch (err) {
      if (!silent) showToast('<i data-lucide="alert-circle"></i> Update check error: ' + err.message);
    }
  }

  async function refreshUpdatesTab() {
    const releaseNotes = el('tab-update-release-notes');
    if (!latestUpdateInfo) {
      if (releaseNotes) {
        releaseNotes.innerHTML = '<div style="display: flex; align-items: center; gap: 8px; color: var(--text-muted);"><div class="rotation-spinner spinner-sm" style="border-top-color: var(--accent);"></div> Fetching latest release notes from GitHub...</div>';
      }
      await checkAppUpdates(true);
    } else {
      renderUpdatesTabUI(latestUpdateInfo);
    }
  }

  function renderUpdatesTabUI(data) {
    if (!data) return;

    const currentVer = el('tab-update-current-ver');
    const latestVer = el('tab-update-latest-ver');
    const headline = el('updates-status-headline');
    const subtext = el('updates-status-subtext');
    const releaseTitle = el('tab-update-release-title');
    const releaseNotes = el('tab-update-release-notes');
    const publishedDate = el('tab-update-published-date');
    const zipBtn = el('btn-tab-download-zip');
    const ghBtn = el('btn-tab-view-github');

    if (currentVer) currentVer.textContent = `v${data.currentVersion || '2.1.0'}`;
    if (latestVer) latestVer.textContent = `v${data.latestVersion || '2.2.0'}`;
    if (releaseTitle) releaseTitle.textContent = data.releaseName || 'What’s New in this Release';
    if (releaseNotes) {
      releaseNotes.innerHTML = formatReleaseNotesMarkdown(data.releaseNotes);
    }

    if (publishedDate && data.publishedAt) {
      const d = new Date(data.publishedAt);
      publishedDate.textContent = `Released on ${d.toLocaleDateString()}`;
    }

    if (ghBtn && data.releaseUrl) {
      ghBtn.href = data.releaseUrl;
    }
    if (zipBtn && data.assets && data.assets.portableZip) {
      zipBtn.href = data.assets.portableZip.downloadUrl;
    } else if (zipBtn) {
      zipBtn.href = data.releaseUrl || 'https://github.com/clowneon1/streampe/releases/latest';
    }

    if (data.updateAvailable) {
      if (headline) {
        headline.innerHTML = `⚡ StreamPe <span style="color: var(--accent);">v${data.latestVersion}</span> is Available!`;
      }
      if (subtext) {
        subtext.textContent = 'A new release is available with performance improvements, fixes, and new features.';
      }
    } else {
      if (headline) {
        headline.innerHTML = `✅ StreamPe is Up to Date`;
      }
      if (subtext) {
        subtext.textContent = `You are running the latest version of StreamPe (v${data.currentVersion}).`;
      }
    }

    if (window.lucide) lucide.createIcons();
  }

  function setupUpdateListeners() {
    on('btn-tab-check-updates', 'click', () => {
      showToast('<i data-lucide="refresh-cw"></i> Checking for updates...');
      checkAppUpdates(false, true).then(() => {
        if (latestUpdateInfo) renderUpdatesTabUI(latestUpdateInfo);
      });
    });

    // ── Release Notes Box Extender ──
    const UPDATE_NOTES_HEIGHTS = { sm: 260, md: 460, lg: 760 };
    const UPDATE_NOTES_KEY = 'streampe_update_notes_height';
    const notesContainer = el('tab-update-release-notes');

    function setNotesHeight(h) {
      if (!notesContainer) return;
      notesContainer.style.height = `${h}px`;
      try { localStorage.setItem(UPDATE_NOTES_KEY, String(h)); } catch (_) { }
      const smBtn = el('btn-update-notes-height-sm');
      const mdBtn = el('btn-update-notes-height-md');
      const lgBtn = el('btn-update-notes-height-lg');
      if (smBtn) smBtn.style.color = h === UPDATE_NOTES_HEIGHTS.sm ? 'var(--accent)' : '';
      if (mdBtn) mdBtn.style.color = h === UPDATE_NOTES_HEIGHTS.md ? 'var(--accent)' : '';
      if (lgBtn) lgBtn.style.color = h === UPDATE_NOTES_HEIGHTS.lg ? 'var(--accent)' : '';
    }

    try {
      const saved = parseInt(localStorage.getItem(UPDATE_NOTES_KEY), 10);
      if (saved && saved >= 200) setNotesHeight(saved);
      else setNotesHeight(UPDATE_NOTES_HEIGHTS.md);
    } catch (_) { setNotesHeight(UPDATE_NOTES_HEIGHTS.md); }

    on('btn-update-notes-height-sm', 'click', () => setNotesHeight(UPDATE_NOTES_HEIGHTS.sm));
    on('btn-update-notes-height-md', 'click', () => setNotesHeight(UPDATE_NOTES_HEIGHTS.md));
    on('btn-update-notes-height-lg', 'click', () => setNotesHeight(UPDATE_NOTES_HEIGHTS.lg));

    on('btn-update-notes-expand', 'click', () => {
      const current = parseInt(notesContainer?.style?.height, 10) || UPDATE_NOTES_HEIGHTS.md;
      const next = current <= UPDATE_NOTES_HEIGHTS.sm ? UPDATE_NOTES_HEIGHTS.md
        : current <= UPDATE_NOTES_HEIGHTS.md ? UPDATE_NOTES_HEIGHTS.lg
          : UPDATE_NOTES_HEIGHTS.sm;
      setNotesHeight(next);
    });
  }

  // ── Wiring ───────────────────────────────────────────────────
  const TAB_PREVIEW_URLS = {
    goal: '/overlay/goal',
    leaderboard: '/overlay/leaderboard',
    recent: '/overlay/recent',
    lists: '/overlay/list',
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

        if (tab === 'earnings' || tab === 'server-logs' || tab === 'updates') {
          if (tab === 'earnings') refreshEarningsAnalytics();
          if (tab === 'server-logs') fetchLiveLogs();
          if (tab === 'updates') refreshUpdatesTab();
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
          const alertTabs = ['text', 'style'];
          manager.style.display = alertTabs.indexOf(tab) === -1 ? 'none' : '';
        }

        if (!iframe) return;
        let previewUrl = TAB_PREVIEW_URLS[tab] || '/overlay/alert';
        if (tab === 'lists') {
          previewUrl = `/overlay/list?id=${currentListConfig().id}`;
        }
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
      ['input-list-bg-color', 'input-list-bg-color-hex'],
      ['input-list-accent-color', 'input-list-accent-color-hex'],
      ['input-list-row-bg-color', 'input-list-row-bg-color-hex'],
      ['input-list-border-color', 'input-list-border-color-hex'],
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
      const handleTemplateChange = (e) => {
        const nextId = (e && e.target && e.target.value) || select.value;
        if (!nextId || nextId === config.activeTemplateId) return;
        readFormValues();
        config.activeTemplateId = nextId;
        populateForm(config);
      };
      select.addEventListener('change', handleTemplateChange);
      select.addEventListener('input', handleTemplateChange);
    }

    const withTemplate = (fn) => async () => {
      readFormValues();
      await fn(currentTemplate());
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
        showToast('<i data-lucide="check"></i> Template renamed to "' + name + '"');
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
      showToast('<i data-lucide="trash-2"></i> Template deleted');
    }));

    el('chk-template-enabled').addEventListener('change', () => syncLivePreview());

    ['tpl-tts-enabled', 'tpl-tts-template', 'tpl-tts-provider', 'tpl-tts-voice', 'tpl-tts-rate', 'tpl-tts-pitch', 'tpl-tts-volume', 'tpl-tts-delay'].forEach(id => {
      on(id, 'change', () => syncLivePreview());
      on(id, 'input', () => syncLivePreview());
    });
  }

  function setupListConfigManager() {
    const select = el('select-active-list');
    if (select) {
      const handleListChange = () => {
        const nextId = select.value;
        if (!nextId || nextId === config.activeListConfigId) return;
        readFormValues();
        config.activeListConfigId = nextId;
        populateForm(config);
        if (iframe && iframe.contentWindow) {
          const tab = document.querySelector('.tab-btn.active')?.dataset?.tab;
          if (tab === 'lists') {
            iframe.src = `/overlay/list?id=${currentListConfig().id}`;
          }
        }
      };
      select.addEventListener('change', handleListChange);
      select.addEventListener('input', handleListChange);
    }

    on('select-list-max', 'change', (e) => {
      const isCustom = e.target.value === 'custom';
      el('input-list-max-custom').style.display = isCustom ? 'block' : 'none';
      syncLivePreview();
    });

    on('chk-enable-list', 'change', () => syncLivePreview());
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
    // Alert Snippets
    'html-default': ConfigSchema.DEFAULT_CODE.alert.customHTML,
    'html-badge': '<div class="alert-badge" style="background:var(--accent-color);color:#000;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;margin-bottom:6px;display:inline-block;">{{sourceApp}}</div>\n{{mediaHtml}}\n<div class="alert-title" style="font-size:26px;">{{sender}} → {{amount}}</div>',
    'css-no-border': '\n.alert-box {\n  border-left: none !important;\n}',
    'css-transparent': '\n.alert-box {\n  background: transparent !important;\n  box-shadow: none !important;\n  backdrop-filter: none !important;\n}',
    'css-large-media': '\n.alert-media {\n  width: 100% !important;\n  max-width: 100% !important;\n  height: auto !important;\n}',
    'css-glow': '\n.alert-box {\n  box-shadow: 0 0 25px var(--accent-color), inset 0 0 15px var(--accent-color) !important;\n}',
    'js-log': '\nconsole.log("[Payment Alert]", notifData.sender, notifData.amount);',
    'js-scale': '\nalertBox.style.transform = "scale(1.15)";\nsetTimeout(() => alertBox.style.transform = "scale(1)", 300);',

    // List & Leaderboard Snippets
    'html-lb-default': ConfigSchema.DEFAULT_CODE.leaderboard.customHTML,
    'html-recent-default': ConfigSchema.DEFAULT_CODE.recent.customHTML,
    'css-lb-transparent': '\n.lb-card {\n  background: transparent !important;\n  box-shadow: none !important;\n}',
    'css-lb-glow-ranks': '\n.rank-1 { box-shadow: 0 0 16px rgba(255, 183, 3, 0.4) !important; }\n.rank-2 { box-shadow: 0 0 14px rgba(213, 186, 255, 0.35) !important; }\n.rank-3 { box-shadow: 0 0 12px rgba(145, 70, 255, 0.3) !important; }',
    'css-lb-no-row-bg': '\n.lb-row {\n  background: transparent !important;\n  border-color: rgba(255, 255, 255, 0.05) !important;\n}',
    'js-lb-log': '\nconsole.log("[List Overlay Items]", items);'
  };

  function snippetTarget(key) {
    if (key.startsWith('html-lb-') || key.startsWith('html-recent-')) return el('input-list-custom-html');
    if (key.startsWith('css-lb-')) return el('input-list-custom-css');
    if (key.startsWith('js-lb-')) return el('input-list-custom-js');

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
        copyToClipboard(selector).catch(() => { });
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
        body: JSON.stringify({ ...testData, alertTemplateId: resolved.templateId, settings: config })
      });
    } catch (e) {
      console.warn('[Config] Live overlay test trigger error:', e.message);
    }
  }

  function setupActionButtons() {
    on('chk-goal-use-gradient', 'change', (e) => {
      el('goal-fill2-container').style.display = e.target.checked ? 'flex' : 'none';
      syncLivePreview();
    });

    on('chk-goal-allow-overflow', 'change', async () => {
      readFormValues();
      await saveToServer();
      showToast('<i data-lucide="check"></i> Goal Overflow mode updated');
    });

    ['chk-enable-goal', 'chk-enable-list', 'chk-enable-cycling'].forEach(id => {
      on(id, 'change', async () => {
        readFormValues();
        await saveToServer();
        showToast('<i data-lucide="check"></i> Widget status updated');
      });
    });

    document.querySelectorAll('.btn-format-code').forEach(btn => {
      btn.addEventListener('click', () => {
        const container = btn.closest('.code-editor-container');
        const activeTab = container ? container.querySelector('.code-tab-btn.active') : null;
        if (!activeTab) return;
        const panel = container.querySelector(`.code-tab-panel[data-code-panel="${activeTab.dataset.codeTab}"]`);
        const textarea = panel && panel.querySelector('textarea');
        if (textarea && textarea.id) formatCode(textarea.id, btn);
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
        alertTemplateId: loadedTemplate ? loadedTemplate.id : null,
        settings: config
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
      try {
        const tplRes = await fetch('/api/profiles/default-template');
        const tplData = await tplRes.json();
        const defConfig = (tplData.ok && tplData.template) ? tplData.template : ConfigSchema.createDefaultConfig();
        populateForm(defConfig);
        const saveRes = await saveToServer();
        if (saveRes.ok) {
          showToast('<i data-lucide="rotate-ccw"></i> Reset to defaults and saved profile!', 'success');
        } else {
          showToast('<i data-lucide="rotate-ccw"></i> Reset to defaults (local only)');
        }
      } catch (err) {
        populateForm(ConfigSchema.createDefaultConfig());
        showToast('<i data-lucide="rotate-ccw"></i> Reset to defaults');
      }
    });

    // ── Profiles
    on('select-profile', 'change', async (e) => {
      const targetProfile = e.target.value;
      if (hasUnsavedChanges()) {
        const confirmLeave = await AppModal.show({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in this profile that will be discarded. Are you sure you want to switch profiles?',
          confirmText: 'Discard & Switch',
          cancelText: 'Stay on Profile'
        });
        if (!confirmLeave) {
          e.target.value = getCurrentProfileName();
          return;
        }
      }
      const res = await fetch('/api/profiles/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: targetProfile })
      });
      const data = await res.json();
      if (data.ok) {
        populateForm(data.settings);
        await fetchAndRenderAnalytics();
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
      try {
        const tplRes = await fetch('/api/profiles/default-template');
        const tplData = await tplRes.json();
        const newSettings = (tplData.ok && tplData.template) ? tplData.template : ConfigSchema.createDefaultConfig();
        const res = await fetch('/api/profiles/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, settings: newSettings })
        });
        const data = await res.json();
        if (data.ok) {
          config = data.settings;
          populateForm(data.settings);
          await loadProfilesList(name);
          await fetchAndRenderAnalytics();
          showToast('<i data-lucide="user"></i> Created profile "' + name + '"');
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> Failed to create profile: ' + err.message);
      }
    });

    on('btn-profile-clone', 'click', async () => {
      const select = el('select-profile');
      const currentName = select ? select.value : 'Default';
      const name = await AppModal.show({
        title: 'Clone Profile',
        message: `Enter name for cloned copy of "${currentName}":`,
        showInput: true,
        defaultValue: `${currentName} (Copy)`
      });
      if (!name) return;
      readFormValues();
      await saveToServer(name);
      await loadProfilesList(name);
      await fetchAndRenderAnalytics();
      showToast('<i data-lucide="copy"></i> Cloned profile to "' + name + '"');
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
      await fetchAndRenderAnalytics();
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
      await fetchAndRenderAnalytics();
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
          await fetchAndRenderAnalytics();
          showToast('<i data-lucide="download"></i> Imported profile "' + data.activeProfile + '"');
        } else {
          showToast('<i data-lucide="alert-triangle"></i> Import failed: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        showToast('<i data-lucide="alert-triangle"></i> ' + err.message);
      }
      e.target.value = '';
    });

    // ── Centralized Donations Data CSV Helpers ────────────────
    on('btn-sidebar-export-donations', 'click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-export-csv');
      if (modal) {
        el('select-export-scope').value = 'all';
        el('export-range-fields').style.display = 'none';
        el('input-export-start').value = '';
        el('input-export-end').value = '';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
      }
    });

    on('btn-sidebar-import-donations', 'click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-import-backup');
      if (modal) {
        if (el('input-import-file-picker')) el('input-import-file-picker').value = '';
        if (el('select-import-mode')) el('select-import-mode').value = 'merge';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
      }
    });

    on('file-import-donations-csv', 'change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          let csvPayload = ev.target.result;
          if (file.name.endsWith('.json') || (typeof csvPayload === 'string' && (csvPayload.trim().startsWith('{') || csvPayload.trim().startsWith('[')))) {
            const parsed = JSON.parse(csvPayload);
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

          const activeProf = getCurrentProfileName();
          const res = await fetch('/api/donations/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: activeProf, csv: csvPayload, mode: 'merge' })
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
      if (file.name.endsWith('.zip')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
      e.target.value = '';
    });

    // ── Code reset buttons
    [['btn-reset-alert-code', 'alert', ['input-custom-html', 'input-custom-css', 'input-custom-js']],
    ['btn-reset-goal-code', 'goal', ['input-goal-custom-html', 'input-goal-custom-css', 'input-goal-custom-js']],
    ['btn-reset-lb-code', 'leaderboard', ['input-lb-custom-html', 'input-lb-custom-css', 'input-lb-custom-js']],
    ['btn-reset-recent-code', 'recent', ['input-recent-custom-html', 'input-recent-custom-css', 'input-recent-custom-js']],
    ['btn-reset-list-code', 'list', ['input-list-custom-html', 'input-list-custom-css', 'input-list-custom-js']],
    ['btn-reset-cycling-code', 'cycling', ['input-cycling-custom-html', 'input-cycling-custom-css', 'input-cycling-custom-js']]
    ].forEach(([btnId, kind, ids]) => {
      const btn = el(btnId);
      if (!btn) return;
      btn.addEventListener('click', () => {
        let defaults = ConfigSchema.DEFAULT_CODE[kind];
        if (kind === 'list') {
          const activeList = currentListConfig();
          defaults = (activeList && activeList.type === 'recent')
            ? ConfigSchema.DEFAULT_CODE.recent
            : ConfigSchema.DEFAULT_CODE.leaderboard;
        }
        setVal(ids[0], defaults.customHTML);
        setVal(ids[1], defaults.customCSS);
        setVal(ids[2], defaults.customJS);
        ids.forEach(id => {
          if (editors[id]) pulseEditorElement(editors[id]);
        });
        flashButtonSuccess(btn, '<i data-lucide="check"></i> Restored!');
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

    // ── TTS Controls & Voice Studio
    TTSStudio.init();
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
      let title = `PhonePe - ${sender}`;
      let text = `has sent ₹${formattedAmount}.00`;

      if (providerKey === 'gpay') {
        appName = 'Google Pay';
        packageName = 'com.google.android.apps.nbu.paisa.user';
        title = `Google Pay`;
        text = `${sender} paid you ₹${formattedAmount}`;
      } else if (providerKey === 'amazon') {
        appName = 'Amazon Pay';
        packageName = 'com.amazon.mShop.android.shopping';
        title = `₹${formattedAmount} received`;
        text = `Money received from ${sender} on Amazon Pay`;
      } else if (providerKey === 'cash') {
        appName = 'Cash';
        packageName = 'com.clowneon1.paymentalertsobs.cash';
        title = `Cash Donation from ${sender}`;
        text = msg || `Received ₹${formattedAmount} in Cash from ${sender}`;
      } else {
        appName = 'PhonePe';
        packageName = 'com.phonepe.app';
        title = `PhonePe - ${sender}`;
        text = `has sent ₹${formattedAmount}.00`;
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
      gpay: { provider: 'gpay', sender: 'Priya Singh', amount: '1000', message: 'Keep up the great work!' },
      amazon: { provider: 'amazon', sender: 'Sneha Patel', amount: '1500', message: 'Thanks for streaming!' },
      cash: { provider: 'cash', sender: 'Amit Verma', amount: '250', message: 'Chai paani subscription ☕' },
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
      const providers = ['phonepe', 'gpay', 'amazon', 'cash'];
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
          body: JSON.stringify({ ...rawNotif, settings: config })
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
        } catch (e) { }
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

  function formatLogLineToHtml(line) {
    if (!line) return '';
    const match = line.match(/^\[(.*?)\]\s*\[(INFO|WARN|ERROR|EVENT|PARSE|DEDUP)\](?:\s*\[(.*?)\])?\s*(.*)$/i);
    if (!match) {
      // Indented JSON or raw object lines
      if (/^\s*[{}\[\],]\s*$/.test(line)) {
        return `<div class="log-line" style="color: #64748b; padding-left: 20px; font-family: inherit;">${TemplateEngine.escapeHtml(line)}</div>`;
      }
      if (/^\s*"([^"]+)":\s*(.*)$/.test(line)) {
        const formatted = line.replace(/^(\s*)"([^"]+)":\s*(.*)$/, (_, indent, k, v) => {
          return `${indent}<span style="color: #38bdf8;">"${TemplateEngine.escapeHtml(k)}"</span>: <span style="color: #a7f3d0;">${TemplateEngine.escapeHtml(v)}</span>`;
        });
        return `<div class="log-line" style="padding-left: 20px; font-family: inherit;">${formatted}</div>`;
      }
      return `<div class="log-line" style="color: #94a3b8; font-family: inherit;">${TemplateEngine.escapeHtml(line)}</div>`;
    }

    const [, rawTs, rawLevel, tag, msg] = match;
    const level = rawLevel.toUpperCase();
    let timeDisplay = rawTs;
    try {
      const d = new Date(rawTs);
      if (!isNaN(d.getTime())) {
        timeDisplay = d.toLocaleTimeString([], { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
      }
    } catch (_) { }

    const levelStyles = {
      INFO: 'background: rgba(145, 70, 255, 0.15); color: #d5baff; border: 1px solid rgba(145, 70, 255, 0.35);',
      WARN: 'background: rgba(255, 214, 0, 0.12); color: #ffd600; border: 1px solid rgba(255, 214, 0, 0.28);',
      ERROR: 'background: rgba(255, 82, 82, 0.16); color: #ff5252; border: 1px solid rgba(255, 82, 82, 0.35); font-weight: 700;',
      EVENT: 'background: rgba(224, 64, 251, 0.15); color: #e040fb; border: 1px solid rgba(224, 64, 251, 0.3);',
      PARSE: 'background: rgba(0, 245, 147, 0.12); color: #00F593; border: 1px solid rgba(0, 245, 147, 0.28);',
      DEDUP: 'background: rgba(148, 163, 184, 0.1); color: #94a3b8; border: 1px solid rgba(148, 163, 184, 0.2);',
    };

    const badgeStyle = levelStyles[level] || 'color: #cbd5e1;';
    const tagHtml = tag ? `<span style="color: #d5baff; font-weight: 600; margin-right: 4px;">[${TemplateEngine.escapeHtml(tag)}]</span>` : '';

    return `<div class="log-line log-level-${level.toLowerCase()}" style="margin-bottom: 3px; line-height: 1.6; font-family: inherit;"><span style="color: #475569; font-size: 10px; margin-right: 6px; user-select: none;">[${TemplateEngine.escapeHtml(timeDisplay)}]</span><span style="display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 9.5px; font-weight: 700; margin-right: 6px; letter-spacing: 0.5px; ${badgeStyle}">${level}</span>${tagHtml}<span style="color: #f1f5f9;">${TemplateEngine.escapeHtml(msg)}</span></div>`;
  }

  async function fetchLiveLogs() {
    try {
      const dateVal = val('select-log-date', '');
      const url = '/api/logs/live' + (dateVal ? `?date=${encodeURIComponent(dateVal)}` : '');
      const res = await fetch(url);
      const data = await res.json();
      if (!data || !Array.isArray(data.lines)) return;

      // Populate available log dates dropdown dynamically
      if (Array.isArray(data.availableDates)) {
        const dateSelect = el('select-log-date');
        if (dateSelect) {
          const currentSelected = dateSelect.value;
          const optionsHtml = data.availableDates.map(d => {
            const isToday = d.date === data.date && (!dateVal || dateVal === d.date);
            const label = isToday ? `Today (${d.date})` : d.date;
            const sizeKb = d.size ? ` (${(d.size / 1024).toFixed(1)} KB)` : '';
            return `<option value="${d.date}">${label}${sizeKb}</option>`;
          }).join('');

          const finalHtml = optionsHtml || `<option value="">Today (${data.date || 'Active'})</option>`;
          const datesKey = JSON.stringify(data.availableDates);
          if (dateSelect.dataset.renderedDates !== datesKey) {
            dateSelect.dataset.renderedDates = datesKey;
            dateSelect.innerHTML = finalHtml;
            if (currentSelected && Array.from(dateSelect.options).some(o => o.value === currentSelected)) {
              dateSelect.value = currentSelected;
            }
          }
        }
      }

      const filterVal = val('select-log-filter', 'ALL');
      const lines = data.lines.filter(line => {
        if (filterVal === 'ALL') return true;
        return line.includes(`[${filterVal}]`);
      });

      const countEl = el('logs-line-count');
      if (countEl) {
        countEl.textContent = `${lines.length} lines (${data.totalLines || 0} total)`;
      }

      const term = el('live-logs-terminal');
      if (term) {
        if (lines.length > 0) {
          const formattedHtml = lines.slice(-250).map(formatLogLineToHtml).join('');
          term.innerHTML = formattedHtml;
        } else {
          term.innerHTML = '<div style="color: #64748b; padding: 12px;">No matching log entries for this date.</div>';
        }
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
    on('btn-copy-list-url', 'click', (e) => {
      const active = currentListConfig();
      copyOverlayUrl(`/overlay/list?id=${active.id || 'top-supporters'}`, `List (${active.name || 'Active'}) Overlay`, e.currentTarget);
    });
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

    on('btn-clear-logs', 'click', async () => {
      try {
        const dateVal = val('select-log-date', '');
        await fetch('/api/logs/clear' + (dateVal ? `?date=${encodeURIComponent(dateVal)}` : ''), { method: 'POST' });
        const term = el('live-logs-terminal');
        if (term) term.textContent = 'Server logs cleared.';
        showToast('<i data-lucide="trash-2"></i> Logs cleared');
      } catch (e) {
        showToast('<i data-lucide="alert-triangle"></i> Clear logs error');
      }
    });

    on('btn-download-full-logs', 'click', () => {
      const dateVal = val('select-log-date', '');
      window.open('/api/logs?level=ALL' + (dateVal ? `&date=${encodeURIComponent(dateVal)}` : ''), '_blank');
      showToast('<i data-lucide="download"></i> Downloading full log file...');
    });

    on('btn-download-filtered-logs', 'click', () => {
      const dateVal = val('select-log-date', '');
      const filterVal = val('select-log-filter', 'ALL');
      window.open(`/api/logs?level=${encodeURIComponent(filterVal)}` + (dateVal ? `&date=${encodeURIComponent(dateVal)}` : ''), '_blank');
      showToast('<i data-lucide="download"></i> Downloading ' + filterVal + ' filtered logs...');
    });

    fetchLiveLogs();
    setInterval(fetchLiveLogs, 4000);

    on('select-log-date', 'change', () => fetchLiveLogs());
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
    searchAlias: '',
    searchNote: '',
    minAmount: '',
    specificDate: '',
    startDate: '',
    endDate: '',
    sortOrder: 'desc',
    sortField: 'date',
    page: 1,
    limit: 50
  };

  let analyticsSearchDebounce = null;

  async function refreshEarningsAnalytics() {
    await fetchAndRenderAnalytics();
  }

  async function fetchAndRenderAnalytics() {
    try {
      const activeProf = getCurrentProfileName();

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
              const [yr, mo] = m.split('-').map(Number);
              const optDate = new Date(yr, mo - 1, 1);
              const label = optDate.toLocaleString('default', { month: 'long', year: 'numeric' });
              optionsHtml += `<option value="${m}"${m === currentVal ? ' selected' : ''}>${label}</option>`;
            });

            monthSelect.innerHTML = optionsHtml;
          }
        }
      } catch (_) { }

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

      const formatCompact = (amt) => (typeof PaymentsCsv !== 'undefined' && PaymentsCsv.formatCompactCurrency)
        ? PaymentsCsv.formatCompactCurrency(amt)
        : `₹${(parseFloat(amt) || 0).toLocaleString('en-IN')}`;

      // 3. Update KPI Cards & Single-Line Summary Bar
      if (el('kpi-total-revenue')) el('kpi-total-revenue').innerHTML = formatCompact(a.totalRevenue || 0);
      if (el('kpi-total-count')) el('kpi-total-count').textContent = (a.totalDonationsCount || 0).toLocaleString();
      if (el('kpi-unique-donors')) el('kpi-unique-donors').textContent = (a.uniqueDonorsCount || 0).toLocaleString();
      if (el('kpi-avg-amount')) el('kpi-avg-amount').innerHTML = formatCompact(a.averageDonation || 0);
      if (el('kpi-peak-day')) {
        const peak = a.peakDay;
        if (peak && peak.date !== 'N/A' && peak.amount > 0) {
          el('kpi-peak-day').textContent = `${peak.date} · ${formatCompact(peak.amount)}`;
        } else {
          el('kpi-peak-day').textContent = 'N/A';
        }
      }

      // Single-Line Filtered Stats Summary Bar
      if (el('summary-stat-total')) el('summary-stat-total').innerHTML = formatCompact(a.totalRevenue || 0);
      if (el('summary-stat-count')) el('summary-stat-count').textContent = (a.totalDonationsCount || 0).toLocaleString();
      if (el('summary-stat-donors')) el('summary-stat-donors').textContent = (a.uniqueDonorsCount || 0).toLocaleString();
      if (el('summary-stat-avg')) el('summary-stat-avg').innerHTML = formatCompact(a.averageDonation || 0);
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

    centerAmt.textContent = (typeof PaymentsCsv !== 'undefined' && PaymentsCsv.formatCompactCurrency)
      ? PaymentsCsv.formatCompactCurrency(donut.totalRevenue || 0)
      : (donut.formattedTotal || '₹0.00');
    if (centerLbl) centerLbl.textContent = `${donut.totalCount || 0} Earnings`;

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

  let currentTimelineData = [];

  function renderTrendChart(trends) {
    currentTimelineData = trends || [];
    renderSingleTrendSvg(el('analytics-trend-svg'), currentTimelineData, false);
    renderSingleTrendSvg(el('modal-analytics-trend-svg'), currentTimelineData, true);

    // Update modal summary if present
    const modalTotalEl = el('modal-trend-total');
    if (modalTotalEl && currentTimelineData.length) {
      const sum = currentTimelineData.reduce((acc, t) => acc + (t.amount || 0), 0);
      const curr = (typeof currentConfig !== 'undefined' && currentConfig && currentConfig.currency) || 'INR';
      modalTotalEl.textContent = `Period Total: ${PaymentsCsv.formatCurrency(sum, curr)}`;
    }
  }

  function renderSingleTrendSvg(svg, trends, isModal = false) {
    if (!svg) return;

    if (!trends || !trends.length) {
      svg.innerHTML = `
        <text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" fill="var(--text-muted)" font-size="${isModal ? '14' : '12'}" font-family="Geist, sans-serif">
          No transactions recorded for this timeframe
        </text>
      `;
      return;
    }

    const viewBoxWidth = isModal ? 840 : 540;
    const viewBoxHeight = isModal ? 320 : 220;
    svg.setAttribute('viewBox', `0 0 ${viewBoxWidth} ${viewBoxHeight}`);

    const leftMargin = isModal ? 70 : 55;
    const rightMargin = isModal ? 24 : 16;
    const topMargin = isModal ? 28 : 22;
    const bottomMargin = isModal ? 42 : 34;

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
      return (typeof PaymentsCsv !== 'undefined' && PaymentsCsv.formatCompactCurrency)
        ? PaymentsCsv.formatCompactCurrency(amount)
        : `₹${amount}`;
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
        <text x="${leftMargin - 8}" y="${y + 4}" text-anchor="end" fill="var(--text-muted)" font-size="${isModal ? '12' : '11'}" font-weight="500" font-family="Geist, sans-serif">
          ${formatShortCurrency(val)}
        </text>
      `;
    });

    const slotWidth = plotWidth / trends.length;
    const barWidth = Math.max(isModal ? 12 : 8, Math.min(isModal ? 48 : 32, slotWidth * 0.65));

    let barsHtml = '';
    trends.forEach((t, i) => {
      const slotX = leftMargin + i * slotWidth;
      const barX = slotX + (slotWidth - barWidth) / 2;
      const barHeight = t.amount > 0 ? Math.max(4, (t.amount / maxScale) * plotHeight) : 2;
      const barY = topMargin + plotHeight - barHeight;
      const isPositive = t.amount > 0;

      const delimiterHtml = i > 0 ? `
        <line x1="${slotX}" y1="${topMargin}" x2="${slotX}" y2="${topMargin + plotHeight}" stroke="rgba(255,255,255,0.03)" stroke-dasharray="2,2" />
      ` : '';

      // Amount label on top of bar for modal or positive spikes
      const valueLabelHtml = (isModal && isPositive) ? `
        <text x="${slotX + slotWidth / 2}" y="${barY - 6}" text-anchor="middle"
          fill="var(--cyan)" font-size="11" font-weight="600" font-family="Geist, sans-serif">
          ${formatShortCurrency(t.amount)}
        </text>
      ` : '';

      barsHtml += `
        ${delimiterHtml}
        <g class="trend-slot-group" data-date="${t.date}" data-amount="${t.formattedAmount}">
          <rect x="${slotX}" y="${topMargin}" width="${slotWidth}" height="${plotHeight}"
            fill="rgba(0, 244, 254, 0.06)" rx="4" opacity="0" class="trend-slot-hover" />

          <rect class="trend-bar" x="${barX}" y="${barY}" width="${barWidth}" height="${barHeight}" rx="4"
            fill="${isPositive ? 'url(#trendBarGrad)' : 'rgba(255,255,255,0.08)'}"
            opacity="${isPositive ? '0.92' : '0.4'}"
          >
            <title>${t.date}: ${t.formattedAmount} (${t.count || 0} donations)</title>
          </rect>

          ${valueLabelHtml}

          <!-- X Axis Label with High Legibility Font -->
          <text x="${slotX + slotWidth / 2}" y="${viewBoxHeight - (isModal ? 14 : 10)}" text-anchor="middle"
            fill="${isPositive ? '#ffffff' : 'var(--text-muted)'}"
            font-size="${isModal ? '12.5' : (trends.length > 10 ? '10' : '11.5')}"
            font-weight="${isPositive ? '600' : '500'}"
            font-family="Geist, sans-serif"
          >
            ${t.dayLabel}
          </text>
        </g>
      `;
    });

    svg.innerHTML = `
      <defs>
        <linearGradient id="trendBarGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#d5baff" />
          <stop offset="60%" stop-color="#9146ff" />
          <stop offset="100%" stop-color="rgba(145, 70, 255, 0.3)" />
        </linearGradient>
      </defs>
      ${gridHtml}
      ${barsHtml}
    `;
  }

  async function fetchAndRenderLedger(activeProf) {
    const targetProf = activeProf || getCurrentProfileName();
    const body = el('analytics-ledger-body');
    const info = el('ledger-pagination-info');
    const countLbl = el('ledger-count-label');
    const btnPrev = el('btn-ledger-prev');
    const btnNext = el('btn-ledger-next');
    if (!body) return;

    if (!body.children.length || !body.querySelector('tr[style*="border-bottom"]')) {
      body.innerHTML = `
        <tr class="table-loading-row">
          <td colspan="7">
            <div class="table-loading-container">
              <div class="rotation-spinner spinner-lg"></div>
              <div style="font-size: 13px; color: var(--text-muted); font-weight: 500;">Loading transactions ledger...</div>
            </div>
          </td>
        </tr>
      `;
    }

    try {
      const effectiveSearch = [analyticsState.search, analyticsState.searchDonor, analyticsState.searchNote].filter(Boolean).join(' ');
      const params = new URLSearchParams({
        profile: targetProf,
        month: analyticsState.month,
        provider: analyticsState.provider,
        search: effectiveSearch,
        alias: analyticsState.searchAlias || '',
        minAmount: analyticsState.minAmount,
        date: analyticsState.specificDate,
        startDate: analyticsState.startDate,
        endDate: analyticsState.endDate,
        sort: analyticsState.sortOrder || 'desc',
        sortBy: analyticsState.sortField || 'date',
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
        body.innerHTML = `
          <tr class="table-empty-row">
            <td colspan="7">
              <div class="table-loading-container">
                <i data-lucide="inbox" style="width: 28px; height: 28px; color: var(--text-dim); opacity: 0.5;"></i>
                <div style="font-size: 13px; color: var(--text-muted);">No matching transactions found</div>
              </div>
            </td>
          </tr>
        `;
        if (window.lucide) lucide.createIcons();
        return;
      }

      body.innerHTML = txs.map(tx => {
        const meta = PaymentsCsv.getProviderMeta(tx.sourceApp);
        const pKey = PaymentsCsv.normalizeProviderKey(tx.sourceApp);
        const curr = tx.currency || 'INR';
        const rawName = tx.rawSender || tx.sender || 'Unknown';
        const formattedName = tx.sender || rawName;
        const hasAlias = formattedName && rawName && formattedName.trim().toLowerCase() !== rawName.trim().toLowerCase();

        return `
          <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 10px 10px; color: var(--text-muted); font-size: 12px;">
              <div style="font-weight: 400; color: var(--text-main); font-size: 13px;">${tx.date || ''}</div>
              <div style="font-size: 11px; color: var(--text-muted);">${tx.time || ''}</div>
            </td>
            <td style="padding: 10px 10px;">
              <div style="font-weight: 400; color: var(--text-main); font-size: 13px;">${TemplateEngine.escapeHtml(rawName)}</div>
            </td>
            <td style="padding: 10px 10px;">
              ${hasAlias ? `<div style="color: var(--accent-light, #d5baff); font-weight: 400; font-size: 13px;"><i data-lucide="tag" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 4px;"></i>${TemplateEngine.escapeHtml(formattedName)}</div>` : '<span style="opacity: 0.3; font-size: 12px;">—</span>'}
            </td>
            <td style="padding: 10px 10px;">
              <span class="provider-badge ${pKey}">${TemplateEngine.escapeHtml(meta.name)}</span>
            </td>
            <td style="padding: 10px 10px; color: var(--text-muted); font-size: 12.5px;">
              ${tx.message ? `<div style="max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #f1f5f9;">${TemplateEngine.escapeHtml(tx.message)}</div>` : '<span style="opacity: 0.4;">—</span>'}
            </td>
            <td style="padding: 10px 10px; text-align: right; font-weight: 400; color: var(--text-main); font-size: 13px; font-variant-numeric: tabular-nums;">
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

          const rawName = targetTx.rawSender || targetTx.sender || '';
          const formattedName = targetTx.sender || rawName;
          const hasAlias = formattedName && rawName && formattedName.trim().toLowerCase() !== rawName.trim().toLowerCase();

          if (el('input-manual-edit-id')) el('input-manual-edit-id').value = targetTx.id;
          if (el('input-manual-donor')) el('input-manual-donor').value = rawName;
          if (el('input-manual-alias')) el('input-manual-alias').value = hasAlias ? formattedName : '';
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
            const delRes = await fetch(`/api/donations/${encodeURIComponent(txId)}?profile=${encodeURIComponent(targetProf)}`, {
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
      analyticsState.sortField = 'date';
      analyticsState.sortOrder = e.target.value;
      if (el('select-col-amount-sort')) el('select-col-amount-sort').value = 'none';
      analyticsState.page = 1;
      const activeProf = (el('select-profile') ? el('select-profile').value : 'Default') || 'Default';
      fetchAndRenderLedger(activeProf);
    });

    on('select-col-amount-sort', 'change', (e) => {
      const val = e.target.value;
      if (val === 'none') {
        analyticsState.sortField = 'date';
        analyticsState.sortOrder = el('select-col-date-sort') ? el('select-col-date-sort').value : 'desc';
      } else {
        analyticsState.sortField = 'amount';
        analyticsState.sortOrder = val;
      }
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

    on('filter-col-alias', 'input', (e) => {
      clearTimeout(analyticsSearchDebounce);
      analyticsSearchDebounce = setTimeout(() => {
        analyticsState.searchAlias = e.target.value;
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
      if (el('filter-col-alias')) el('filter-col-alias').value = '';
      if (el('filter-col-note')) el('filter-col-note').value = '';
      if (el('filter-col-min-amount')) el('filter-col-min-amount').value = '';
      if (el('filter-col-provider')) el('filter-col-provider').value = 'all';
      if (el('select-col-date-sort')) el('select-col-date-sort').value = 'desc';
      if (el('select-col-amount-sort')) el('select-col-amount-sort').value = 'none';
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
      analyticsState.sortField = 'date';
      analyticsState.page = 1;
      fetchAndRenderAnalytics();
      showToast('<i data-lucide="filter-x"></i> Filters reset');
    });

    on('btn-download-filtered-csv', 'click', () => {
      const activeProf = getCurrentProfileName();
      const effectiveSearch = [analyticsState.search, analyticsState.searchDonor, analyticsState.searchNote].filter(Boolean).join(' ');

      const params = new URLSearchParams({
        profile: activeProf,
        month: analyticsState.month || 'all',
        provider: analyticsState.provider || 'all',
        search: effectiveSearch,
        minAmount: analyticsState.minAmount || '',
        maxAmount: analyticsState.maxAmount || '',
        date: analyticsState.specificDate || '',
        startDate: analyticsState.startDate || '',
        endDate: analyticsState.endDate || ''
      });

      const url = `/api/donations/csv?${params.toString()}`;
      window.open(url, '_blank');
      showToast('<i data-lucide="download"></i> Exporting filtered list as CSV...');
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
    // ── Ledger height expand/collapse toggle ─────────────────────────
    (function () {
      const NORMAL_HEIGHT = 420;
      const EXPANDED_HEIGHT = 760;
      const LEDGER_HEIGHT_KEY = 'ledger_height_pref';
      const container = document.querySelector('.analytics-ledger-table-container');
      const expandBtn = el('btn-ledger-expand');
      if (!container || !expandBtn) return;

      function updateExpandState(isExpanded) {
        const height = isExpanded ? EXPANDED_HEIGHT : NORMAL_HEIGHT;
        container.style.height = height + 'px';
        try { localStorage.setItem(LEDGER_HEIGHT_KEY, isExpanded ? 'expanded' : 'collapsed'); } catch (_) { }

        expandBtn.title = isExpanded ? 'Collapse table height' : 'Expand table height';
        expandBtn.innerHTML = `<i data-lucide="${isExpanded ? 'minimize-2' : 'maximize-2'}" style="width:13px; height:13px;"></i>`;
        if (window.lucide) lucide.createIcons();
      }

      // Restore persisted preference
      let initialExpanded = false;
      try {
        initialExpanded = localStorage.getItem(LEDGER_HEIGHT_KEY) === 'expanded';
      } catch (_) { }
      updateExpandState(initialExpanded);

      on('btn-ledger-expand', 'click', () => {
        const currentHeight = parseInt(container.style.height, 10) || NORMAL_HEIGHT;
        const isNowExpanded = currentHeight < EXPANDED_HEIGHT;
        updateExpandState(isNowExpanded);
      });
    })();

    on('select-trend-view-mode', 'change', (e) => {
      analyticsState.timelineMode = e.target.value;
      const modalSelect = el('select-modal-trend-view-mode');
      if (modalSelect) modalSelect.value = e.target.value;
      fetchAndRenderAnalytics();
    });

    on('select-modal-trend-view-mode', 'change', (e) => {
      analyticsState.timelineMode = e.target.value;
      const cardSelect = el('select-trend-view-mode');
      if (cardSelect) cardSelect.value = e.target.value;
      fetchAndRenderAnalytics();
    });

    const openTimelineModal = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const modal = el('modal-timeline-expand');
      if (modal) {
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
        renderSingleTrendSvg(el('modal-analytics-trend-svg'), currentTimelineData, true);
      }
    };

    const closeTimelineModal = (e) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }
      const modal = el('modal-timeline-expand');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    };

    on('btn-open-timeline-modal', 'click', openTimelineModal);
    on('modal-timeline-close', 'click', closeTimelineModal);
    on('btn-close-timeline-modal', 'click', closeTimelineModal);
    on('modal-timeline-expand', 'click', (e) => {
      if (e.target && e.target.id === 'modal-timeline-expand') closeTimelineModal(e);
    });

    on('select-donut-view-mode', 'change', (e) => {
      analyticsState.donutMode = e.target.value;
      fetchAndRenderAnalytics();
    });

    // Time-Based Export CSV Modal Controls
    on('btn-analytics-export-csv', 'click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-export-csv');
      if (modal) {
        el('select-export-scope').value = 'all';
        el('export-range-fields').style.display = 'none';
        el('input-export-start').value = '';
        el('input-export-end').value = '';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
      }
    });

    on('select-export-scope', 'change', (e) => {
      const scope = e.target.value;
      el('export-range-fields').style.display = scope === 'range' ? 'block' : 'none';
    });

    const closeExportModal = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-export-csv');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    };

    on('modal-export-csv-close', 'click', closeExportModal);
    on('btn-cancel-export-csv', 'click', closeExportModal);
    on('modal-export-csv', 'click', (e) => {
      if (e.target.id === 'modal-export-csv') closeExportModal(e);
    });

    on('btn-submit-export-csv', 'click', () => {
      const activeProf = getCurrentProfileName();
      const format = el('select-export-format') ? el('select-export-format').value : 'zip';
      const scope = el('select-export-scope').value;

      let baseUrl = '/api/donations/export-zip';
      if (format === 'csv') baseUrl = '/api/donations/csv';
      if (format === 'aliases') baseUrl = '/api/aliases/csv';

      let url = `${baseUrl}?profile=${encodeURIComponent(activeProf)}`;

      if (scope === 'range' && format !== 'aliases') {
        const startVal = el('input-export-start').value;
        const endVal = el('input-export-end').value;

        if (!startVal || !endVal) {
          showToast('<i data-lucide="alert-triangle"></i> Please select both start and end months.');
          return;
        }

        if (new Date(startVal) > new Date(endVal)) {
          showToast('<i data-lucide="alert-triangle"></i> Start month cannot be after end month.');
          return;
        }

        url += `&startDate=${encodeURIComponent(startVal)}&endDate=${encodeURIComponent(endVal)}`;
        showToast(`<i data-lucide="download"></i> Downloading backup (${format.toUpperCase()}) from ${startVal} to ${endVal}...`);
      } else {
        url += `&month=all`;
        showToast(`<i data-lucide="download"></i> Downloading all-time backup (${format.toUpperCase()})...`);
      }

      window.open(url, '_blank');
      closeExportModal();
    });

    // Import Backup Modal Controls
    on('btn-analytics-import', 'click', (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-import-backup');
      if (modal) {
        if (el('input-import-file-picker')) el('input-import-file-picker').value = '';
        if (el('select-import-mode')) el('select-import-mode').value = 'merge';
        modal.style.display = 'flex';
        setTimeout(() => modal.classList.add('active'), 10);
      }
    });

    const closeImportModal = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      const modal = el('modal-import-backup');
      if (modal) {
        modal.classList.remove('active');
        modal.style.display = 'none';
      }
    };

    on('modal-import-backup-close', 'click', closeImportModal);
    on('btn-cancel-import-backup', 'click', closeImportModal);
    on('modal-import-backup', 'click', (e) => {
      if (e.target.id === 'modal-import-backup') closeImportModal(e);
    });

    on('btn-submit-import-backup', 'click', () => {
      const fileInput = el('input-import-file-picker');
      const file = fileInput && fileInput.files ? fileInput.files[0] : null;
      if (!file) {
        showToast('<i data-lucide="alert-triangle"></i> Please select a .zip or .csv backup file to import.');
        return;
      }

      const activeProf = getCurrentProfileName();
      const importMode = el('select-import-mode') ? el('select-import-mode').value : 'merge';
      const reader = new FileReader();

      showToast(`<i data-lucide="upload"></i> Reading ${file.name}...`);

      reader.onload = async (event) => {
        try {
          const rawData = event.target.result;
          const res = await fetch('/api/donations/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: activeProf, mode: importMode, csv: rawData })
          });
          const data = await res.json();
          if (data.ok) {
            showToast(`<i data-lucide="check-circle"></i> Imported ${data.importedCount || 0} transactions and ${data.aliasCount || 0} aliases into profile [${activeProf}]`);
            fetchAndRenderAnalytics();
            fetchAndRenderLedger();
            closeImportModal();
          } else {
            showToast('<i data-lucide="alert-triangle"></i> Import failed: ' + (data.error || 'Unknown error'));
          }
        } catch (err) {
          showToast('<i data-lucide="alert-triangle"></i> Import error: ' + err.message);
        }
      };

      if (file.name.endsWith('.zip')) {
        reader.readAsDataURL(file);
      } else {
        reader.readAsText(file);
      }
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
      const sc = String(now.getSeconds()).padStart(2, '0');

      if (el('input-manual-edit-id')) el('input-manual-edit-id').value = '';
      if (el('input-manual-donor')) el('input-manual-donor').value = 'Anonymous Donor';
      if (el('input-manual-alias')) el('input-manual-alias').value = '';
      if (el('input-manual-amount')) el('input-manual-amount').value = '500';
      if (el('select-manual-provider')) el('select-manual-provider').value = 'Manual Entry';
      if (el('input-manual-date')) el('input-manual-date').value = `${yr}-${mo}-${da}`;
      if (el('input-manual-time')) el('input-manual-time').value = `${hr}:${mn}:${sc}`;
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
      const aliasVal = val('input-manual-alias', '').trim();
      const amount = parseFloat(val('input-manual-amount', '0')) || 0;
      const source = val('select-manual-provider', 'Manual Entry');
      let dateVal = (val('input-manual-date', '') || '').trim();
      let timeVal = (val('input-manual-time', '') || '').trim();
      const curNow = new Date();
      if (!timeVal) {
        const hr = String(curNow.getHours()).padStart(2, '0');
        const mn = String(curNow.getMinutes()).padStart(2, '0');
        const sc = String(curNow.getSeconds()).padStart(2, '0');
        timeVal = `${hr}:${mn}:${sc}`;
      } else if (window.PaymentsCsv && window.PaymentsCsv.normalizeTime) {
        timeVal = window.PaymentsCsv.normalizeTime(timeVal);
      } else if (/^\d{1,2}:\d{2}$/.test(timeVal)) {
        timeVal += ':00';
      }
      if (!dateVal) {
        const yr = curNow.getFullYear();
        const mo = String(curNow.getMonth() + 1).padStart(2, '0');
        const da = String(curNow.getDate()).padStart(2, '0');
        dateVal = `${yr}-${mo}-${da}`;
      } else if (window.PaymentsCsv && window.PaymentsCsv.normalizeDate) {
        dateVal = window.PaymentsCsv.normalizeDate(dateVal);
      }
      const note = val('input-manual-note', '').trim();
      const activeProf = getCurrentProfileName();

      if (amount <= 0) {
        return showToast('<i data-lucide="alert-triangle"></i> Please enter a valid donation amount');
      }

      if (donor) {
        try {
          if (aliasVal) {
            await fetch('/api/aliases', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sender: donor, alias: aliasVal, profile: activeProf })
            });
          } else {
            await fetch(`/api/aliases/${encodeURIComponent(donor)}?profile=${encodeURIComponent(activeProf)}`, { method: 'DELETE' });
          }
        } catch (_) { }
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
        try { lucide.createIcons(); } catch (e) { }
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

  function attachInputListeners() {
    const formPanel = document.querySelector('.form-panel');
    if (!formPanel) return;

    formPanel.addEventListener('input', (e) => {
      if (e.target.closest('.CodeMirror') || e.target.type === 'file') return;
      syncLivePreview();
    });

    formPanel.addEventListener('change', (e) => {
      if (e.target.closest('.CodeMirror') || e.target.type === 'file') return;
      syncLivePreview();
    });
  }

  // ── Boot ─────────────────────────────────────────────────────
  async function initDashboard() {
    initCodeEditors();
    CodeStudio.init();
    setupTabs();
    setupCodeEditorTabs();
    setupVariablePills();
    setupColorPickers();
    setupCanvasPresets();
    setupAmountFilterEditor();
    setupTemplateManager();
    setupListConfigManager();
    setupCyclingWidgetEditor();
    setupIconPicker();
    setupFileBrowsers();
    setupActionButtons();
    setupSimulator();
    setupNetworkAndSystem();
    setupEarningsAnalytics();
    setupPanelResizer();
    attachInputListeners();
    setupUpdateListeners();

    let activeProf = 'Default';
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      activeProf = data.activeProfile || 'Default';
      window.__activeProfile = activeProf;
      await loadProfilesList(activeProf);
      populateForm(data.settings || data);
    } catch (e) {
      console.error('[Config] Failed to load settings from server, falling back to defaults:', e);
      populateForm(ConfigSchema.createDefaultConfig());
    }

    // Activate default landing tab directly with the resolved active profile (zero flicker)
    const activeTabBtn = document.querySelector('.tab-btn.active') || document.querySelector('.tab-btn[data-tab="earnings"]');
    if (activeTabBtn) {
      activeTabBtn.click();
    } else {
      await refreshEarningsAnalytics();
    }

    // Dismiss boot loader dynamically after all loads complete, with a standard 500ms backoff buffer for smooth icon/font painting
    setTimeout(() => {
      requestAnimationFrame(() => {
        const loader = el('dashboard-boot-loader');
        if (loader) {
          loader.style.opacity = '0';
          loader.style.visibility = 'hidden';
          setTimeout(() => { try { loader.remove(); } catch (_) { } }, 400);
        }
      });
    }, 500);

    // Trigger silent background update check
    setTimeout(() => { checkAppUpdates(true); }, 1200);
  }

  initDashboard();

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
