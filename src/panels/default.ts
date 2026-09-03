declare const Editor: any;

import { readFileSync } from 'fs';
import { join } from 'path';
import { translate, normalizeLang } from '../core/i18n/locales';
import { formatLogoDimensions } from '../core/splash/logo-dimensions';
import { AXON_SPEC_URL } from '@playbox-ai/playable-kit';

const template = readFileSync(join(__dirname, '../../static/template/index.html'), 'utf-8');
const style = readFileSync(join(__dirname, '../../static/style/index.css'), 'utf-8');

// ---- helpers ----------------------------------------------------------------

function fmt(bytes: number): string {
  if (bytes == null || isNaN(bytes)) return '—';
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return bytes + ' B';
}

function pct(a: number, b: number): string {
  if (!b) return '—';
  const p = ((b - a) / b) * 100;
  return (p >= 0 ? '-' : '+') + Math.abs(p).toFixed(0) + '%';
}

function makeBadge(cls: string, text: string): HTMLElement {
  const el = document.createElement('span');
  el.className = `badge ${cls}`;
  el.textContent = text;
  return el;
}

function clearChildren(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

// ---- panel ------------------------------------------------------------------

module.exports = Editor.Panel.define({
  template,
  style,

  $: {
    tabBuildReport: '#tab-build-report',
    tabCompress:    '#tab-compress',
    tabPackage:     '#tab-package',
    tabDeploy:      '#tab-deploy',

    contentBuildReport: '#content-build-report',
    contentCompress:    '#content-compress',
    contentPackage:     '#content-package',
    contentDeploy:      '#content-deploy',
    panelVersion:       '#panel-version',
    panelUpdateBar:     '#panel-update-bar',
    panelUpdate:        '#panel-update',
    panelUpdateBtn:     '#panel-update-btn',

    // Settings overlay
    btnSettings:         '#btn-settings',
    settingsOverlay:     '#settings-overlay',
    settingsBackdrop:    '#settings-backdrop',
    settingsClose:       '#settings-close',
    settingsVersion:     '#settings-version',
    settingsCheck:       '#settings-check',
    settingsCheckStatus: '#settings-check-status',
    settingsAutoPackage: '#settings-auto-package',
    settingsShowOnStart: '#settings-show-on-start',
    settingsLanguage:    '#settings-language',

    // Build Report tab
    btnAnalyze:       '#btn-analyze',
    scanStatus:       '#scan-status',
    reportSummary:    '#report-summary',
    reportTbody:      '#report-tbody',
    summaryCount:     '#summary-count',
    summarySourceSize:'#summary-source-size',
    summaryBuildSizeReal: '#summary-build-size-real',
    summaryImages:    '#summary-images',
    summaryAudio:     '#summary-audio',
    reportFilterBar:  '#report-filter-bar',
    reportShowUnused: '#report-show-unused',

    // Compress tab
    compressQuality:  '#compress-quality',
    compressQualityVal:'#compress-quality-val',
    ffmpegStatus:     '#ffmpeg-status',
    sharpStatus:      '#sharp-status',
    btnCompressAll:   '#btn-compress-all',
    compressFormat:   '#compress-format',
    compressTbody:    '#compress-tbody',

    // Package tab
    btnGenerateAdapter: '#btn-generate-adapter',
    btnGenerateAxon:    '#btn-generate-axon',
    networkGrid:      '#network-grid',
    networkGridMore:  '#network-grid-more',
    networkMoreWrap:  '#network-more-wrap',
    btnToggleMoreNets:'#btn-toggle-more-nets',
    btnBuild:         '#btn-build',
    btnBuildAll:      '#btn-build-all',

    // Build overlay
    buildOverlay:      '#build-overlay',
    buildBackdrop:     '#build-backdrop',
    buildClose:        '#build-close',
    buildChecks:       '#build-checks',
    buildFix:          '#build-fix',
    buildCheckStatus:  '#build-check-status',
    buildStart:        '#build-start',
    buildValidate:     '#build-validate',
    buildProgressBar:  '#build-progress-bar',
    buildProgressText: '#build-progress-text',
    buildPacked:       '#build-packed',
    btnPreview:       '#btn-preview',
    btnOpenOutput:    '#btn-open-output',
    pkgStatus:        '#pkg-status',
    pkgStoreIos:      '#pkg-store-ios',
    pkgStoreAndroid:  '#pkg-store-android',
    pkgStoreRegional: '#pkg-store-regional',
    pkgStoreRegionalText: '#pkg-store-regional-text',
    pkgStoreRegionalFix: '#pkg-store-regional-fix',
    pkgBuildDir:      '#pkg-build-dir',
    pkgBuildDirWarn:  '#pkg-build-dir-warn',
    pkgBuildDirWarnText: '#pkg-build-dir-warn-text',
    pkgBuildDirUse:   '#pkg-build-dir-use',
    pkgOutputDir:     '#pkg-output-dir',
    pkgResultsTbody:  '#pkg-results-tbody',
    pkgWarnings:      '#pkg-warnings',
    pkgAutoPackage:   '#pkg-auto-package',
    pkgSplashMode:    '#pkg-splash-mode',
    pkgSplashCost:    '#pkg-splash-cost',
    pkgCustomLogo:    '#pkg-custom-logo',
    pkgLogoPreview:   '#pkg-logo-preview',
    pkgLogoBrowse:    '#pkg-logo-browse',
    pkgLogoClear:     '#pkg-logo-clear',
    pkgLogoCost:      '#pkg-logo-cost',
    pkgLogoError:     '#pkg-logo-error',
    pkgLogoNatural:   '#pkg-logo-natural',
    pkgLogoScale:     '#pkg-logo-scale',
    pkgLogoScaleNum:  '#pkg-logo-scale-num',
    pkgSplashFrame:   '#pkg-splash-frame',
    pkgSplashPreview: '#pkg-splash-preview',
    pkgPreviewOrient: '#pkg-preview-orient',
    pkgEncoding:      '#pkg-encoding',
    pkgEncWarn:       '#pkg-enc-warn',
    pkgTemplatePreset:'#pkg-template-preset',
    pkgOutputTemplate:'#pkg-output-template',
    pkgTemplatePreview:'#pkg-template-preview',
    pkgTemplateVars:  '#pkg-template-vars',
    pkgUserVarsContainer:'#pkg-user-vars-container',

    // Deploy tab
    deployBody:        '#deploy-body',
    deployToken:       '#deploy-token',
    btnSaveToken:      '#btn-save-token',
    loginStatus:       '#login-status',
    deployProject:       '#deploy-project',
    deployProjectInput:  '#deploy-project-input',
    deployProjectDropdown: '#deploy-project-dropdown',
    btnRefreshProjects:  '#btn-refresh-projects',
    btnNewProject:       '#btn-new-project',
    deployExisting:      '#deploy-existing',
    deployExistingList:  '#deploy-existing-list',
    btnCancelNewProject: '#btn-cancel-new-project',
    deployProjectName: '#deploy-project-name',
    deployNewProjectRow: '#deploy-new-project-row',
    deployName:        '#deploy-name',
    deployNameHint:    '#deploy-name-hint',
    deployNetwork:     '#deploy-network',
    deployBuildPath:   '#deploy-build-path',
    btnDeploy:         '#btn-deploy',
    deployStatus:      '#deploy-status',
    deployResult:      '#deploy-result',
    deployResultUrl:   '#deploy-result-url',
    btnCopyUrl:        '#btn-copy-url',
    molocoCdnCard:     '#moloco-cdn-card',
    molocoApiKey:      '#moloco-api-key',
    molocoAdAccount:   '#moloco-ad-account',
    molocoAssetProvider: '#moloco-asset-provider',
    molocoAssetTitle:  '#moloco-asset-title',
    btnMolocoCdn:      '#btn-moloco-cdn',
    molocoCdnStatus:   '#moloco-cdn-status',

    // Preset buttons
    presetWeb:  '#preset-web',
    presetMax:  '#preset-max',
    presetFast: '#preset-fast',
    presetHigh: '#preset-high',

    // Preview overlay
    previewOverlay:    '#preview-overlay',
    previewBackdrop:   '#preview-backdrop',
    previewTitle:      '#preview-title',
    previewClose:      '#preview-close',
    previewOrigWrap:   '#preview-orig-wrap',
    previewOrigMeta:   '#preview-orig-meta',
    previewCompWrap:   '#preview-comp-wrap',
    previewCompMeta:   '#preview-comp-meta',
    previewSpinner:    '#preview-spinner',
    previewFormat:     '#preview-format',
    previewQuality:    '#preview-quality',
    previewQualityVal: '#preview-quality-val',
    previewApply:      '#preview-apply',
    previewCancel:     '#preview-cancel',

    // Build Details section
    buildDetails:  '#build-details',
    bdBody:        '#bd-body',
    bdBars:        '#bd-bars',
    bdHtmls:       '#bd-htmls',
    bdTitle:       '#bd-title',
    bdChevron:     '#bd-chevron',
    bdToggle:      '#bd-toggle',
  },

  ready(this: any) {
    const tabs = [
      { btn: this.$.tabBuildReport, content: this.$.contentBuildReport },
      { btn: this.$.tabCompress,    content: this.$.contentCompress    },
      { btn: this.$.tabPackage,     content: this.$.contentPackage     },
      { btn: this.$.tabDeploy,      content: this.$.contentDeploy      },
    ];

    const activateTab = (index: number) => {
      tabs.forEach((t, i) => {
        if (t.btn) t.btn.classList.toggle('active', i === index);
        if (t.content) (t.content as HTMLElement).style.display = i === index ? 'flex' : 'none';
      });
      // Re-check build availability when switching to Deploy tab
      if (index === 3 && typeof this._checkDeployBuild === 'function') {
        this._checkDeployBuild();
        this._checkMolocoCdnCard?.();
      }
    };

    tabs.forEach((t, i) => {
      if (t.btn) t.btn.addEventListener('click', () => activateTab(i));
    });
    activateTab(0);

    this._reportData = null;

    // Show version in footer
    const versionEl = this.$.panelVersion;
    if (versionEl) {
      Editor.Message.request('plbx-cocos-extension', 'getVersion')
        .then((v: string) => { versionEl.textContent = v; })
        .catch(() => {});
    }

    // Surface a footer banner + Update button when the checkout is behind GitHub.
    this._initFreshness();
    this._initSettings();
    this._initBuild();
    this._initI18n();

    this._initBuildReport();
    this._initCompress();
    this._initPackage();
    this._initDeploy();
    this._initPreview();
  },

  close() {},

  methods: {
    _initI18n(this: any) {
      // Resolve the panel root (shadow root) from any known element, then
      // translate every [data-i18n] / [data-i18n-title] / [data-i18n-placeholder]
      // node under it.
      const anchor = (this.$.tabBuildReport || this.$.btnSettings) as HTMLElement | null;
      const root = anchor?.getRootNode?.() as ShadowRoot | Document | null;

      const apply = (lang: string) => {
        this._lang = lang;
        if (!root) return;
        root.querySelectorAll('[data-i18n]').forEach((el: any) => {
          const key = el.getAttribute('data-i18n');
          if (key) el.textContent = translate(lang as any, key);
        });
        root.querySelectorAll('[data-i18n-title]').forEach((el: any) => {
          const key = el.getAttribute('data-i18n-title');
          if (key) el.title = translate(lang as any, key);
        });
        root.querySelectorAll('[data-i18n-placeholder]').forEach((el: any) => {
          const key = el.getAttribute('data-i18n-placeholder');
          if (key) el.placeholder = translate(lang as any, key);
        });
      };
      this._applyLocale = apply;

      const sel = this.$.settingsLanguage as HTMLSelectElement | null;

      Editor.Message.request('plbx-cocos-extension', 'getLanguage')
        .then((lang: string) => {
          const l = normalizeLang(lang);
          if (sel) sel.value = l;
          apply(l);
        })
        .catch(() => apply('en'));

      sel?.addEventListener('change', () => {
        const l = normalizeLang(sel.value);
        Editor.Message.request('plbx-cocos-extension', 'saveLanguage', l).catch(() => {});
        apply(l);
      });
    },

    /**
     * Package tab → Build: verify the three settings a playable build needs,
     * offer a one-click fix, then run the build with progress.
     *
     * Deliberately NOT merged with Pack All — building and packaging are two
     * processes, and one button that silently did both would hide which half
     * failed.
     */
    _initBuild(this: any) {
      const overlay = this.$.buildOverlay as HTMLElement | null;
      if (!overlay) return;

      const t = (key: string) => translate(this._lang || 'en', key);
      const checksEl = this.$.buildChecks as HTMLElement | null;
      const fixBtn = this.$.buildFix as HTMLButtonElement | null;
      const startBtn = this.$.buildStart as HTMLButtonElement | null;
      const validateBtn = this.$.buildValidate as HTMLButtonElement | null;
      const statusEl = this.$.buildCheckStatus as HTMLElement | null;
      const barEl = this.$.buildProgressBar as HTMLElement | null;
      const progressTextEl = this.$.buildProgressText as HTMLElement | null;

      const ICONS: Record<string, string> = { ok: '✓', fail: '✗', na: '–' };

      /**
       * Show what auto-package produced in the Package tab's results table.
       *
       * The hook packages and reports through `on-auto-package-done`, which
       * main stores; the panel is never called directly. A couple of retries
       * cover the gap between the task reporting success and that message
       * landing.
       */
      /** Resolved per render: binding once at init makes a stale cached
       *  template fail silently and forever. */
      const getPackedEl = (): HTMLElement | null =>
        (this.$.buildPacked as HTMLElement | null) ??
        (overlay.querySelector('#build-packed') as HTMLElement | null);

      /**
       * List what auto-package actually produced, inside the build modal.
       *
       * The Package tab's results table already showed this, but it is behind
       * the modal — so a build that packaged the wrong set (or nothing) looked
       * identical to one that packaged the right set. Naming the networks in
       * the popup is what makes that visible without closing anything.
       *
       * Success is `outputPath` being non-empty: PackageResult carries no
       * status field, and the packager's per-network catch pushes a row with an
       * empty path. (`hooks.ts` used to count `r.status === 'success'`, which is
       * never true — its "N success, M failed" line always read 0, 0.)
       */
      const renderPackedList = (results: any[]) => {
        const packedEl = getPackedEl();
        if (!packedEl) {
          console.warn('[plbx] #build-packed missing — panel template is stale; restart the editor');
          return;
        }
        packedEl.innerHTML = '';
        const rows = Array.isArray(results) ? results : [];
        const ok = rows.filter((r) => r && r.outputPath);
        const failed = rows.filter((r) => r && !r.outputPath);

        packedEl.style.display = '';

        const title = document.createElement('div');
        title.className = 'build-packed-title';
        // No rows is a result too — hiding the block is how a broken delivery
        // looked identical to a build that simply had not packaged yet.
        title.textContent = ok.length
          ? `${t('build.packedTitle')} (${ok.length})`
          : t('build.packedNone');
        packedEl.appendChild(title);

        const mb = (n: number) => `${(n / (1024 * 1024)).toFixed(2)} MB`;
        for (const r of [...ok, ...failed]) {
          const row = document.createElement('div');
          const good = !!r.outputPath && r.withinLimit !== false;
          row.className = `build-packed-row is-${!r.outputPath ? 'fail' : good ? 'ok' : 'warn'}`;

          const icon = document.createElement('span');
          icon.className = 'build-packed-icon';
          icon.textContent = !r.outputPath ? '✗' : good ? '✓' : '!';

          const name = document.createElement('span');
          name.className = 'build-packed-name';
          name.textContent = r.networkName || r.networkId || '';

          const note = document.createElement('span');
          note.className = 'build-packed-note';
          note.textContent = !r.outputPath
            ? ''
            : r.withinLimit === false
              ? `${mb(r.outputSize)} — ${t('build.packedOverLimit')} ${mb(r.maxSize)}`
              : mb(r.outputSize);

          row.append(icon, name, note);
          packedEl.appendChild(row);
        }
      };
      this._renderPackedList = renderPackedList;

      this._pullAutoPackageResults = async () => {
        for (let attempt = 0; attempt < 15; attempt++) {
          try {
            const last = await Editor.Message.request('plbx-cocos-extension', 'get-last-build-result');
            const results = last?.autoPackageResult?.results;
            // First look and the give-up only — "the list did not appear" has
            // four possible layers (hook ran? results stored? panel asked?
            // panel rendered?) and guessing between them costs a whole build,
            // but a line per poll would bury the console.
            if (attempt === 0) {
              console.log(
                `[plbx] pullAutoPackageResults: keys=[${Object.keys(last || {}).join(', ')}] ` +
                `results=${Array.isArray(results) ? results.length : 'none'}`,
              );
            }
            if (Array.isArray(results) && results.length) {
              this._renderPackageResults(results);
              renderPackedList(results);
              if (this.$.btnPreview) (this.$.btnPreview as HTMLElement).style.display = '';
              return;
            }
          } catch (e: any) {
            console.warn('[plbx]', e);
          }
          await new Promise((r) => setTimeout(r, 700));
        }
        // Auto-package was on but produced nothing we could read — say so
        // rather than leaving the previous build's list on screen.
        console.warn('[plbx] auto-package results never arrived after ~10s');
        renderPackedList([]);
      };

      const renderChecks = (checks: any[]) => {
        if (!checksEl) return;
        checksEl.innerHTML = '';
        for (const c of checks || []) {
          const row = document.createElement('div');
          row.className = `build-check-row is-${c.status}`;
          const icon = document.createElement('span');
          icon.className = 'build-check-icon';
          icon.textContent = ICONS[c.status] ?? '';
          const label = document.createElement('span');
          label.className = 'build-check-label';
          label.textContent = t(c.labelKey);
          const value = document.createElement('span');
          value.className = 'build-check-value';
          // An n/a check is a fact about the editor, not about the project —
          // showing "— → asmjs" there would read as something to fix.
          value.textContent =
            c.status === 'na' ? t('build.na')
            : c.status === 'ok' ? c.actual
            : `${c.actual} → ${c.expected}`;
          row.append(icon, label, value);
          checksEl.appendChild(row);
        }
      };

      const refreshChecks = async () => {
        try {
          const res = await Editor.Message.request('plbx-cocos-extension', 'verify-build-settings');
          renderChecks(res?.checks ?? []);
          if (fixBtn) fixBtn.style.display = res?.needsFix ? '' : 'none';
          if (statusEl) statusEl.textContent = res?.needsFix ? '' : t('build.allOk');
        } catch (e: any) {
          console.warn('[plbx]', e);
        }
      };

      const setProgress = (fraction: number, text: string) => {
        if (barEl) barEl.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
        if (progressTextEl) progressTextEl.textContent = text;
      };

      const open = () => {
        overlay.style.display = 'flex';
        setProgress(0, '');
        // A reopened modal must not show the previous build's packaged list.
        const packedEl = getPackedEl();
        if (packedEl) { packedEl.innerHTML = ''; packedEl.style.display = 'none'; }
        // A modal reopened after a previous build must not still offer to
        // validate that build's output as if it were this session's result.
        if (startBtn) startBtn.textContent = t('build.start');
        if (validateBtn) validateBtn.style.display = 'none';
        refreshChecks();
      };
      const close = () => { overlay.style.display = 'none'; };

      this.$.btnBuild?.addEventListener('click', open);
      this.$.buildClose?.addEventListener('click', close);
      this.$.buildBackdrop?.addEventListener('click', close);

      fixBtn?.addEventListener('click', async () => {
        fixBtn.disabled = true;
        try {
          const res = await Editor.Message.request('plbx-cocos-extension', 'fix-build-settings');
          renderChecks(res?.checks ?? []);
          fixBtn.style.display = res?.needsFix ? '' : 'none';
          if (statusEl) statusEl.textContent = t(res?.needsFix ? 'build.allOk' : 'build.fixed');
        } catch (e: any) {
          console.warn('[plbx]', e);
        } finally {
          fixBtn.disabled = false;
        }
      });

      startBtn?.addEventListener('click', async () => {
        startBtn.disabled = true;
        setProgress(0, t('build.running'));
        // Deliberately not awaited: `add-task` may only answer when the build
        // ends, and awaiting it would freeze the bar for the whole build by
        // construction. The poll below is what drives the UI.
        Editor.Message.request('plbx-cocos-extension', 'start-build')
          .catch((e: any) => console.warn('[plbx] start-build failed', e));
        // Poll rather than push: same shape as the update/deploy progress that
        // already works here, and it survives a panel reload mid-build.
        const poll = setInterval(async () => {
          let state: any;
          try {
            state = await Editor.Message.request('plbx-cocos-extension', 'get-build-progress');
          } catch {
            return; // transient; keep polling
          }
          if (!state || state.state === 'running') {
            setProgress(state?.progress ?? 0, `${t('build.running')} ${state?.message || ''}`.trim());
            return;
          }
          clearInterval(poll);
          startBtn.disabled = false;
          if (state.state === 'success') {
            // The build wrote a fresh directory and main adopted it — reflect
            // that in the Build Directory field the packager reads.
            this._reloadBuildDirField?.();
            const autoPacked = (this.$.pkgAutoPackage as HTMLInputElement | null)?.checked;
            console.log(`[plbx] build finished: autoPackage checkbox = ${autoPacked}`);
            // The button's job changed: the build exists now, so pressing it
            // again is a rebuild.
            startBtn.textContent = t('build.again');

            if (!autoPacked) {
              setProgress(1, t('build.success'));
              if (validateBtn) validateBtn.style.display = '';
              refreshChecks();
              return;
            }

            // The task reporting success means the BUILD finished — it does not
            // prove packaging did. Validate used to appear right here and the
            // status already claimed "and packaged", so the operator could open
            // the validator against artifacts that were still being written,
            // and saw it come up slow or short. Wait for the results, then say
            // so and offer the button.
            setProgress(1, t('build.packaging'));
            if (validateBtn) validateBtn.style.display = 'none';
            this._pullAutoPackageResults?.().then(() => {
              setProgress(1, t('build.successPacked'));
              if (validateBtn) validateBtn.style.display = '';
              refreshChecks();
            });
            return;
          } else if (state.state === 'busy') {
            setProgress(0, t('build.busy'));
          } else {
            setProgress(0, state.fallback ? t('build.fallback') : t('build.failed'));
          }
          refreshChecks();
        }, 500);
      });

      // Same preview validator the Package toolbar's Validate button starts —
      // one implementation, shared through `_startPreview`.
      validateBtn?.addEventListener('click', async () => {
        validateBtn.disabled = true;
        try {
          const url = await this._startPreview();
          setProgress(1, t('status.previewUrl').replace('{url}', url));
        } catch (e: any) {
          console.error('[plbx] Preview failed:', e?.message ?? e);
          setProgress(1, t('status.previewError').replace('{msg}', String(e?.message ?? e)));
        } finally {
          validateBtn.disabled = false;
        }
      });
    },

    _initSettings(this: any) {
      const overlay = this.$.settingsOverlay as HTMLElement | null;
      if (!overlay) return;

      const refresh = () => {
        Editor.Message.request('plbx-cocos-extension', 'getVersion')
          .then((v: string) => { if (this.$.settingsVersion) this.$.settingsVersion.textContent = 'v' + v; })
          .catch(() => {});
        Editor.Message.request('plbx-cocos-extension', 'get-settings')
          .then((s: any) => {
            if (this.$.settingsAutoPackage) (this.$.settingsAutoPackage as HTMLInputElement).checked = s?.autoPackage !== false;
          })
          .catch(() => {});
        Editor.Message.request('plbx-cocos-extension', 'getShowPanelOnStart')
          .then((v: boolean) => {
            if (this.$.settingsShowOnStart) (this.$.settingsShowOnStart as HTMLInputElement).checked = v !== false;
          })
          .catch(() => {});
        if (this.$.settingsCheckStatus) this.$.settingsCheckStatus.textContent = '';
      };

      const open = () => { overlay.style.display = 'flex'; refresh(); };
      const close = () => { overlay.style.display = 'none'; };

      this.$.btnSettings?.addEventListener('click', open);
      this.$.settingsClose?.addEventListener('click', close);
      this.$.settingsBackdrop?.addEventListener('click', close);

      // Check for updates (forces a fresh check, bypassing the cache).
      this.$.settingsCheck?.addEventListener('click', async () => {
        const btn = this.$.settingsCheck as HTMLButtonElement;
        const statusEl = this.$.settingsCheckStatus as HTMLElement;
        btn.disabled = true;
        if (statusEl) statusEl.textContent = translate(this._lang || 'en', 'settings.checking');
        try {
          const res = await Editor.Message.request('plbx-cocos-extension', 'checkFreshness', true);
          if (statusEl) statusEl.textContent = res?.status || '—';
        } catch {
          if (statusEl) statusEl.textContent = translate(this._lang || 'en', 'settings.checkFailed');
        } finally {
          btn.disabled = false;
        }
      });

      // Auto-package toggle — project setting, mirrored to the Package-tab checkbox.
      const autoCb = this.$.settingsAutoPackage as HTMLInputElement | null;
      autoCb?.addEventListener('change', () => {
        const checked = autoCb.checked;
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { autoPackage: checked }).catch(() => {});
        const pkgCb = this.$.pkgAutoPackage as HTMLInputElement | null;
        if (pkgCb) pkgCb.checked = checked;
      });

      // Show-panel-on-start toggle — global pref.
      const startCb = this.$.settingsShowOnStart as HTMLInputElement | null;
      startCb?.addEventListener('change', () => {
        Editor.Message.request('plbx-cocos-extension', 'saveShowPanelOnStart', startCb.checked).catch(() => {});
      });

    },

    _initFreshness(this: any) {
      const bar = this.$.panelUpdateBar as HTMLElement | null;
      const textEl = this.$.panelUpdate as HTMLElement | null;
      const btn = this.$.panelUpdateBtn as HTMLButtonElement | null;
      if (!bar || !textEl) return;

      // Human labels for the update steps (keys match update.ts ProgressEvent step names).
      const STEP_LABELS: Record<string, string> = {
        detect: 'Checking install type',
        download: 'Downloading latest release',
        verify: 'Verifying checksum',
        extract: 'Unpacking',
        apply: 'Applying update',
      };

      const setBar = (message: string, severity: string) => {
        textEl.textContent = message;
        bar.className = 'panel-update-bar ' + (severity || 'warn');
        bar.hidden = false;
      };

      const renderProgress = (state: any) => {
        const idx = state.index || 0;
        const total = state.total || 5;
        const label = STEP_LABELS[state.step] || state.step || 'Starting…';
        const done = (state.done || [])
          .map((d: string) => '✓ ' + (STEP_LABELS[d] || d))
          .join('   ');
        const head =
          state.phase === 'fail'
            ? `Update failed during: ${label}`
            : `Updating…  step ${idx}/${total} · ${label}`;
        setBar(done ? `${head}\n${done}` : head, 'warn');
      };

      // Wire the one-click update. The button is a tiny state machine so it
      // can't re-trigger an update after success — once done it switches to
      // prompting a restart instead. `kit` is the same machine pointed at the
      // packaging kit: the bar and the button are shared, and the two updates are
      // mutually exclusive (the extension one wins — see the check below).
      let mode: 'update' | 'kit' | 'restart' = 'update';

      if (btn) {
        const promptRestart = () => {
          Editor.Message.request('plbx-cocos-extension', 'promptRestart').catch(() => {});
        };

        const startKitUpdate = () => {
          btn.disabled = true;
          btn.textContent = translate(this._lang || 'en', 'settings.updating');
          setBar(translate(this._lang || 'en', 'settings.updatingKit'), 'warn');
          Editor.Message.request('plbx-cocos-extension', 'startKitUpdate').catch(() => {});
          const poll = setInterval(async () => {
            let state: any;
            try {
              state = await Editor.Message.request('plbx-cocos-extension', 'getKitUpdateState');
            } catch {
              return; // transient; keep polling
            }
            if (!state || state.running) return;
            clearInterval(poll);
            const result = state.result || { ok: false, message: 'No result.' };
            btn.disabled = false;
            setBar((result.ok ? '✓ ' : '✗ ') + result.message, result.ok ? 'info' : 'warn');
            if (result.ok) {
              mode = 'restart';
              btn.textContent = translate(this._lang || 'en', 'settings.restartEditor');
              promptRestart(); // the old kit sits in the require cache until reload
            } else {
              btn.textContent = translate(this._lang || 'en', 'settings.retry');
            }
          }, 1000);
        };

        const startUpdate = () => {
          btn.disabled = true;
          btn.textContent = translate(this._lang || 'en', 'settings.updating');
          setBar(translate(this._lang || 'en', 'settings.updating') + '  starting', 'warn');
          Editor.Message.request('plbx-cocos-extension', 'startUpdate').catch(() => {});
          const poll = setInterval(async () => {
            let state: any;
            try {
              state = await Editor.Message.request('plbx-cocos-extension', 'getUpdateState');
            } catch {
              return; // transient; keep polling
            }
            if (!state) return;
            if (state.running) {
              renderProgress(state);
              return;
            }
            // Finished.
            clearInterval(poll);
            const result = state.result || { ok: false, message: 'No result.' };
            btn.disabled = false;
            setBar((result.ok ? '✓ ' : '✗ ') + result.message, result.ok ? 'info' : 'warn');
            if (result.ok) {
              mode = 'restart';
              btn.textContent = translate(this._lang || 'en', 'settings.restartEditor');
              promptRestart(); // auto-prompt once on success
            } else {
              mode = 'update';
              btn.textContent = translate(this._lang || 'en', 'settings.retry');
            }
          }, 1000);
        };

        btn.addEventListener('click', () => {
          if (mode === 'restart') promptRestart();
          else if (mode === 'kit') startKitUpdate();
          else startUpdate();
        });
      }

      // Extension first: when it is behind, that banner wins the bar and the kit
      // one stays quiet — a newer bundle carries a newer kit anyway. Only when no
      // extension update is being offered do we surface the packaging kit.
      Editor.Message.request('plbx-cocos-extension', 'checkFreshness')
        .then((res: any) => {
          const action = res?.action;
          if (action?.notify) {
            setBar(action.message, action.severity);
            return;
          }
          return Editor.Message.request('plbx-cocos-extension', 'checkKitVersion').then((kit: any) => {
            if (!kit?.banner) return;
            setBar(kit.banner, 'info');
            if (!btn) return;
            if (!kit.canInstall) {
              // Developer Import (never mutate a working tree), or the newer kit is
              // out of our pin — either way there is nothing to click.
              btn.hidden = true;
              return;
            }
            btn.hidden = false;
            mode = 'kit';
            btn.textContent = translate(this._lang || 'en', 'settings.updateKit');
          });
        })
        .catch(() => {});
    },

    _initBuildReport(this: any) {
      const btnAnalyze  = this.$.btnAnalyze as HTMLButtonElement;
      const scanStatus  = this.$.scanStatus as HTMLSpanElement;

      this._reportSortKey = 'buildSize';
      this._reportSortAsc = false;

      btnAnalyze?.addEventListener('click', async () => {
        btnAnalyze.disabled = true;
        if (scanStatus) scanStatus.textContent = translate(this._lang || 'en', 'status.scanning');
        try {
          const report = await Editor.Message.request('plbx-cocos-extension', 'scan-assets-hybrid');
          this._reportData = report;
          this._renderReport(report, this._reportSortKey);
          if (scanStatus) scanStatus.textContent = '';
          this._populateCompressTable(report);
        } catch (e: any) {
          if (scanStatus) scanStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message || e));
        } finally {
          btnAnalyze.disabled = false;
        }
      });

      // Sortable column headers
      const reportTable = this.$.reportTbody?.closest('table') as HTMLTableElement | null;
      reportTable?.querySelectorAll('.sortable-th').forEach((th: Element) => {
        th.addEventListener('click', () => {
          const key = (th as HTMLElement).dataset.sort ?? 'name';
          if (this._reportSortKey === key) {
            this._reportSortAsc = !this._reportSortAsc;
          } else {
            this._reportSortKey = key;
            this._reportSortAsc = key === 'name' || key === 'type' || key === 'extension';
          }
          reportTable!.querySelectorAll('.sortable-th').forEach((h: Element) => {
            h.classList.remove('sort-active');
            const arrow = h.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = '';
          });
          th.classList.add('sort-active');
          const arrow = th.querySelector('.sort-arrow');
          if (arrow) arrow.textContent = this._reportSortAsc ? '\u25B2' : '\u25BC';

          if (this._reportData) this._renderReport(this._reportData, this._reportSortKey);
        });
      });
    },

    _renderReport(this: any, report: any, sortKey: string) {
      const summary     = this.$.reportSummary;
      const tbody       = this.$.reportTbody;
      const countEl     = this.$.summaryCount;
      const srcEl       = this.$.summarySourceSize;
      const buildRealEl = this.$.summaryBuildSizeReal;
      const imgEl       = this.$.summaryImages;
      const audioEl     = this.$.summaryAudio;
      const filterBar   = this.$.reportFilterBar;
      const showUnusedChk = this.$.reportShowUnused as HTMLInputElement | null;

      if (!summary || !tbody || !countEl || !srcEl || !imgEl || !audioEl) return;

      // Deduplicate by path
      const seen = new Set<string>();
      const dedupedAssets = (report?.assets ?? []).filter((a: any) => {
        const key = a.path ?? a.name ?? '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      report = { ...report, assets: dedupedAssets };

      const assets: any[] = report?.assets ?? [];

      const asc = this._reportSortAsc ?? false;
      const sorted = [...assets].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') {
          cmp = (a.name || '').localeCompare(b.name || '');
        } else if (sortKey === 'type') {
          cmp = (a.type || '').localeCompare(b.type || '');
        } else if (sortKey === 'extension') {
          const aExt = (a.name ?? '').split('.').pop() ?? '';
          const bExt = (b.name ?? '').split('.').pop() ?? '';
          cmp = aExt.localeCompare(bExt);
        } else {
          const av = sortKey === 'buildSize'
            ? ((a as any).actualBuildSize ?? a.buildSize ?? a.sourceSize ?? 0)
            : (a.sourceSize ?? 0);
          const bv = sortKey === 'buildSize'
            ? ((b as any).actualBuildSize ?? b.buildSize ?? b.sourceSize ?? 0)
            : (b.sourceSize ?? 0);
          cmp = av - bv;
        }
        return asc ? cmp : -cmp;
      });

      const totalSrc  = assets.reduce((s, a) => s + (a.sourceSize ?? 0), 0);
      const totalReal = (report as any).totalActualBuildSize as number | undefined;
      const images = assets.filter(a => a.type === 'image' || /\.(png|jpg|jpeg|webp|avif|gif)$/i.test(a.name ?? '')).length;
      const audio  = assets.filter(a => a.type === 'audio' || /\.(mp3|ogg|wav|m4a)$/i.test(a.name ?? '')).length;

      countEl.textContent = String(assets.length);
      srcEl.textContent   = fmt(totalSrc);
      if (buildRealEl) buildRealEl.textContent = totalReal != null ? fmt(totalReal) : '—';
      imgEl.textContent   = String(images);
      audioEl.textContent = String(audio);
      summary.style.display = 'flex';

      // Show filter bar and wire checkbox (once)
      if (filterBar) filterBar.style.display = '';
      if (showUnusedChk && !showUnusedChk.dataset['wired']) {
        showUnusedChk.dataset['wired'] = '1';
        showUnusedChk.addEventListener('change', () => this._renderReport(report, this._reportSortKey ?? 'buildSize'));
      }

      const showUnused = showUnusedChk?.checked ?? false;

      clearChildren(tbody);
      if (sorted.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        const es = document.createElement('div');
        es.className = 'empty-state';
        es.textContent = translate(this._lang || 'en', 'buildReport.noAssetsFound');
        td.appendChild(es);
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      const visible = showUnused ? sorted : sorted.filter(a => {
        const s = (a as any).buildStatus ?? 'unused';
        return s === 'confirmed' || s === 'predicted';
      });

      for (const asset of visible) {
        const tr = document.createElement('tr');

        const tdName = document.createElement('td');
        tdName.title = asset.path ?? asset.name ?? '';
        tdName.textContent = asset.name ?? '—';

        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = asset.type ?? '—';

        const tdSrc = document.createElement('td');
        tdSrc.className = 'col-size';
        tdSrc.textContent = fmt(asset.sourceSize);

        const tdBuild = document.createElement('td');
        tdBuild.className = 'col-size';
        const displayBuildSize = (asset as any).actualBuildSize ?? asset.buildSize ?? asset.sourceSize;
        tdBuild.textContent = fmt(displayBuildSize);
        if ((asset as any).actualBuildSize != null) {
          tdBuild.title = translate(this._lang || 'en', 'buildReport.realSizeTitle');
        } else {
          tdBuild.title = translate(this._lang || 'en', 'buildReport.estimatedTitle');
        }

        const tdExt = document.createElement('td');
        tdExt.className = 'col-type';
        const ext = (asset.name ?? '').split('.').pop() ?? '';
        tdExt.textContent = ext ? '.' + ext : '—';

        const tdStatus = document.createElement('td');
        tdStatus.className = 'col-type';
        const status = (asset as any).buildStatus ?? 'unused';
        if (status === 'confirmed') {
          tdStatus.textContent = '✓';
          tdStatus.style.color = '#4caf50';
          tdStatus.title = translate(this._lang || 'en', 'buildReport.confirmedTitle');
        } else if (status === 'predicted') {
          tdStatus.textContent = '~';
          tdStatus.style.color = '#ff9800';
          tdStatus.title = translate(this._lang || 'en', 'buildReport.predictedTitle');
        } else {
          tdStatus.textContent = '○';
          tdStatus.style.color = '#999';
          tdStatus.title = translate(this._lang || 'en', 'buildReport.unusedTitle');
        }

        tr.appendChild(tdName);
        tr.appendChild(tdType);
        tr.appendChild(tdSrc);
        tr.appendChild(tdBuild);
        tr.appendChild(tdExt);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
      }

      this._renderBuildDetails(report);
    },

    _renderBuildDetails(this: any, report: any) {
      const section   = this.$.buildDetails as HTMLElement | null;
      const bdBody    = this.$.bdBody       as HTMLElement | null;
      const bdBars    = this.$.bdBars       as HTMLElement | null;
      const bdHtmls   = this.$.bdHtmls      as HTMLElement | null;
      const bdTitle   = this.$.bdTitle      as HTMLElement | null;
      const bdChevron = this.$.bdChevron    as HTMLElement | null;
      const header    = this.$.bdToggle     as HTMLElement | null;

      if (!section || !bdBody || !bdBars || !bdHtmls) return;

      const cats: any  = report.buildCategories;
      const htmls: any[] = report.packedHtmls ?? [];

      if (!cats) {
        section.style.display = 'none';
        return;
      }
      section.style.display = '';

      // Update title with total
      const total = report.totalActualBuildSize ?? 0;
      if (bdTitle) bdTitle.textContent = translate(this._lang || 'en', 'buildReport.buildDetailsTitle').replace('{size}', fmt(total));

      // Wire collapse toggle once
      if (header && !header.dataset['wired']) {
        header.dataset['wired'] = '1';
        header.addEventListener('click', () => {
          const collapsed = bdBody.style.display === 'none';
          bdBody.style.display = collapsed ? '' : 'none';
          if (bdChevron) bdChevron.classList.toggle('collapsed', !collapsed);
        });
      }

      // Render category bars
      clearChildren(bdBars);
      const totalForPct = total || 1;
      const categories = [
        { label: 'Engine (cc.js)', size: cats.engine,  color: '#5b9cf6' },
        { label: 'Plugins',        size: cats.plugins, color: '#e8834c' },
        { label: 'Assets',         size: cats.assets,  color: '#6ec26e' },
        { label: 'Scripts',        size: cats.scripts, color: '#e8c44c' },
        { label: 'Other',          size: cats.other,   color: '#888888' },
      ].filter(c => c.size > 0);

      for (const cat of categories) {
        const barPct = Math.max(0.5, (cat.size / totalForPct) * 100);

        const row = document.createElement('div');
        row.className = 'bd-bar-row';

        const label = document.createElement('span');
        label.className = 'bd-bar-label';
        label.textContent = cat.label;

        const track = document.createElement('div');
        track.className = 'bd-bar-track';
        const fill = document.createElement('div');
        fill.className = 'bd-bar-fill';
        fill.style.cssText = `width:${barPct}%;background:${cat.color};`;
        track.appendChild(fill);

        const val = document.createElement('span');
        val.className = 'bd-bar-val';
        val.textContent = fmt(cat.size);

        const pctEl = document.createElement('span');
        pctEl.className = 'bd-bar-pct';
        pctEl.textContent = `${((cat.size / totalForPct) * 100).toFixed(0)}%`;

        row.appendChild(label);
        row.appendChild(track);
        row.appendChild(val);
        row.appendChild(pctEl);
        bdBars.appendChild(row);
      }

      // Render packed HTMLs
      if (htmls.length === 0) {
        bdHtmls.style.display = 'none';
        return;
      }
      bdHtmls.style.display = '';
      clearChildren(bdHtmls);

      const sectionLabel = document.createElement('div');
      sectionLabel.className = 'bd-section-label';
      sectionLabel.textContent = translate(this._lang || 'en', 'buildReport.packedHtmlPerNetwork');
      bdHtmls.appendChild(sectionLabel);

      const maxHtmlSize = Math.max(...htmls.map((h: any) => h.size), 1);

      for (const h of htmls) {
        const barPct = Math.max(1, (h.size / maxHtmlSize) * 100);
        const overLimit = h.size > 5 * 1024 * 1024;

        const row = document.createElement('div');
        row.className = 'bd-html-row';

        const net = document.createElement('span');
        net.className = 'bd-html-net';
        net.textContent = h.network;

        const bar = document.createElement('div');
        bar.className = 'bd-html-bar';
        const fill = document.createElement('div');
        fill.className = 'bd-html-fill';
        fill.style.cssText = `width:${barPct}%;${overLimit ? 'background:#e57373;' : ''}`;
        bar.appendChild(fill);

        const val = document.createElement('span');
        val.className = 'bd-html-val';
        val.textContent = fmt(h.size);

        row.appendChild(net);
        row.appendChild(bar);
        row.appendChild(val);

        if (overLimit) {
          const warn = document.createElement('span');
          warn.className = 'bd-html-warn';
          warn.textContent = translate(this._lang || 'en', 'buildReport.overSizeWarning');
          row.appendChild(warn);
        }

        bdHtmls.appendChild(row);
      }
    },

    _initCompress(this: any) {
      const qualitySlider  = this.$.compressQuality as HTMLInputElement;
      const qualityVal     = this.$.compressQualityVal as HTMLSpanElement;
      const ffmpegStatus   = this.$.ffmpegStatus as HTMLSpanElement;
      const sharpStatus    = this.$.sharpStatus as HTMLSpanElement;
      const btnCompressAll = this.$.btnCompressAll as HTMLButtonElement;

      qualitySlider?.addEventListener('input', () => {
        if (qualityVal) qualityVal.textContent = qualitySlider.value;
      });

      const formatSel = this.$.compressFormat as HTMLSelectElement;
      const applyPreset = (fmt: string, q: string) => {
        if (formatSel) formatSel.value = fmt;
        if (qualitySlider) qualitySlider.value = q;
        if (qualityVal) qualityVal.textContent = q;
      };
      this.$.presetWeb?.addEventListener('click',  () => applyPreset('webp', '80'));
      this.$.presetMax?.addEventListener('click',  () => applyPreset('png', '100'));
      this.$.presetFast?.addEventListener('click', () => applyPreset('jpeg', '75'));
      this.$.presetHigh?.addEventListener('click', () => applyPreset('webp', '50'));

      Editor.Message.request('plbx-cocos-extension', 'check-ffmpeg').then((ok: boolean) => {
        if (ffmpegStatus) {
          ffmpegStatus.textContent = ok
            ? translate(this._lang || 'en', 'compress.ffmpegAvailable')
            : translate(this._lang || 'en', 'compress.ffmpegMissing');
          ffmpegStatus.style.color = ok ? '#4caf50' : '#ff9800';
        }
      }).catch((e: any) => { console.warn('[plbx]', e); });

      Editor.Message.request('plbx-cocos-extension', 'check-sharp').then((ok: boolean) => {
        this._sharpReady = ok;
        if (sharpStatus) {
          sharpStatus.textContent = ok
            ? translate(this._lang || 'en', 'compress.sharpAvailable')
            : translate(this._lang || 'en', 'compress.sharpMissing');
          sharpStatus.style.color = ok ? '#4caf50' : '#ff9800';
        }
      }).catch((e: any) => { console.warn('[plbx]', e); });

      btnCompressAll?.addEventListener('click', () => {
        this._compressAll();
      });

      // Sortable column headers
      const compressTable = this.$.compressTbody?.closest('table') as HTMLTableElement | null;
      compressTable?.querySelectorAll('.sortable-th').forEach((th: Element) => {
        th.addEventListener('click', () => {
          const key = (th as HTMLElement).dataset.sort ?? 'name';
          if (this._compressSortKey === key) {
            this._compressSortAsc = !this._compressSortAsc;
          } else {
            this._compressSortKey = key;
            this._compressSortAsc = true;
          }
          // Update arrow indicators
          compressTable!.querySelectorAll('.sortable-th').forEach((h: Element) => {
            h.classList.remove('sort-active');
            const arrow = h.querySelector('.sort-arrow');
            if (arrow) arrow.textContent = '';
          });
          th.classList.add('sort-active');
          const arrow = th.querySelector('.sort-arrow');
          if (arrow) arrow.textContent = this._compressSortAsc ? '\u25B2' : '\u25BC';

          if (this._compressAssets) this._renderCompressRows(this._compressAssets);
        });
      });
    },

    _populateCompressTable(this: any, report: any) {
      const tbody = this.$.compressTbody;
      if (!tbody) return;

      // Deduplicate by file path
      const seen = new Set<string>();
      const assets: any[] = (report?.assets ?? []).filter((a: any) => {
        const name = (a.name ?? '').toLowerCase();
        if (!/\.(png|jpg|jpeg|webp|avif|gif|mp3|ogg|wav|m4a)$/.test(name)) return false;
        const key = a.file ?? a.path ?? a.name ?? '';
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Store for sorting
      this._compressAssets = assets;
      this._compressSortKey = this._compressSortKey || 'name';
      this._compressSortAsc = this._compressSortAsc ?? true;

      this._renderCompressRows(assets);
    },

    _renderCompressRows(this: any, assets: any[]) {
      const tbody = this.$.compressTbody;
      if (!tbody) return;

      const sortKey = this._compressSortKey || 'name';
      const asc = this._compressSortAsc ?? true;

      const sorted = [...assets].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name' || sortKey === 'asset') {
          cmp = (a.name ?? '').localeCompare(b.name ?? '');
        } else if (sortKey === 'type') {
          const aType = /\.(mp3|ogg|wav|m4a)$/i.test(a.name ?? '') ? 'audio' : 'image';
          const bType = /\.(mp3|ogg|wav|m4a)$/i.test(b.name ?? '') ? 'audio' : 'image';
          cmp = aType.localeCompare(bType);
        } else if (sortKey === 'original' || sortKey === 'size') {
          cmp = (a.sourceSize ?? 0) - (b.sourceSize ?? 0);
        }
        return asc ? cmp : -cmp;
      });

      clearChildren(tbody);

      if (assets.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 7;
        const es = document.createElement('div');
        es.className = 'empty-state';
        es.textContent = translate(this._lang || 'en', 'buildReport.noCompressibleAssets');
        td.appendChild(es);
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      for (const asset of assets) {
        const isAudio = /\.(mp3|ogg|wav|m4a)$/i.test(asset.name ?? '');
        const tr = document.createElement('tr');
        tr.id = 'compress-row-' + encodeURIComponent(asset.path ?? asset.name ?? '');
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e: MouseEvent) => {
          if ((e.target as HTMLElement).closest('button')) return;
          this._openPreview(asset);
        });

        const tdName = document.createElement('td');
        tdName.title = asset.path ?? '';
        tdName.textContent = asset.name ?? '—';

        const tdType = document.createElement('td');
        tdType.className = 'col-type';
        tdType.textContent = isAudio ? 'audio' : 'image';

        const tdOrig = document.createElement('td');
        tdOrig.className = 'col-size';
        tdOrig.textContent = fmt(asset.sourceSize ?? asset.buildSize);

        const tdComp = document.createElement('td');
        tdComp.className = 'col-size';
        tdComp.textContent = '—';

        const tdSav = document.createElement('td');
        tdSav.className = 'col-size';
        tdSav.textContent = '—';

        const tdStatus = document.createElement('td');
        tdStatus.appendChild(makeBadge('badge-info', 'ready'));

        const tdAction = document.createElement('td');
        const btn = document.createElement('button');
        btn.className = 'btn btn-small';
        btn.textContent = translate(this._lang || 'en', 'compress.compressBtn');
        btn.addEventListener('click', () => {
          const format  = (this.$.compressFormat as HTMLSelectElement)?.value ?? 'webp';
          const quality = parseInt((this.$.compressQuality as HTMLInputElement)?.value ?? '80', 10);
          this._compressSingle(asset, format, quality, tdComp, tdSav, tdStatus, btn);
        });
        tdAction.appendChild(btn);

        tr.appendChild(tdName);
        tr.appendChild(tdType);
        tr.appendChild(tdOrig);
        tr.appendChild(tdComp);
        tr.appendChild(tdSav);
        tr.appendChild(tdStatus);
        tr.appendChild(tdAction);
        tbody.appendChild(tr);
      }
    },

    _refreshSharpStatus(this: any, ok: boolean) {
      const el = this.$.sharpStatus as HTMLSpanElement | null;
      if (!el) return;
      el.textContent = translate(this._lang || 'en', ok ? 'compress.sharpAvailable' : 'compress.sharpMissing');
      el.style.color = ok ? '#4caf50' : '#ff9800';
    },

    /**
     * Gate image compression on sharp being installed. Cached after the first
     * success so "Compress All" prompts at most once. Audio never calls this.
     * Returns true only when sharp is ready to use.
     */
    async _ensureSharp(this: any): Promise<boolean> {
      if (this._sharpReady) return true;
      const lang = this._lang || 'en';

      // Re-probe: it may have been installed since the panel opened.
      try {
        if (await Editor.Message.request('plbx-cocos-extension', 'check-sharp')) {
          this._sharpReady = true;
          this._refreshSharpStatus(true);
          return true;
        }
      } catch { /* fall through to the install prompt */ }

      const dlg = await Editor.Dialog.info(translate(lang, 'compress.sharpInstallPrompt'), {
        title: 'Playbox',
        buttons: [translate(lang, 'compress.sharpInstallBtn'), 'Cancel'],
        default: 0,
        cancel: 1,
      });
      if (!dlg || dlg.response !== 0) return false;

      const el = this.$.sharpStatus as HTMLSpanElement | null;
      if (el) { el.textContent = translate(lang, 'compress.sharpInstalling'); el.style.color = '#ff9800'; }
      try {
        await Editor.Message.request('plbx-cocos-extension', 'install-sharp');
      } catch { /* ignore — the poll below reports the real outcome */ }

      const result: any = await new Promise((resolve) => {
        const poll = setInterval(async () => {
          let state: any;
          try { state = await Editor.Message.request('plbx-cocos-extension', 'get-sharp-install-state'); }
          catch { return; } // transient; keep polling
          if (!state || state.running) return;
          clearInterval(poll);
          resolve(state.result || { ok: false, message: 'No result.' });
        }, 1000);
      });

      if (result.ok) {
        this._sharpReady = true;
        this._refreshSharpStatus(true);
        return true;
      }
      this._refreshSharpStatus(false);
      await Editor.Dialog.info(translate(lang, 'compress.sharpInstallFailed'), {
        title: 'Playbox', buttons: ['OK'], default: 0,
      });
      return false;
    },

    async _compressSingle(this: any, asset: any, format: string, quality: number, tdComp: HTMLElement, tdSav: HTMLElement, tdStatus: HTMLElement, btn: HTMLButtonElement) {
      btn.disabled = true;
      clearChildren(tdStatus);
      const spinner = document.createElement('span');
      spinner.className = 'spinner';
      tdStatus.appendChild(spinner);

      try {
        const isAudio = /\.(mp3|ogg|wav|m4a)$/i.test(asset.name ?? '');
        let result: any;
        if (isAudio) {
          const audioFormat = format === 'mp3' || format === 'ogg' ? format : 'mp3';
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio', asset.file, audioFormat, quality);
        } else {
          if (!(await this._ensureSharp())) {
            clearChildren(tdStatus);
            const b = makeBadge('badge-fail', 'error');
            b.title = translate(this._lang || 'en', 'compress.sharpMissing');
            tdStatus.appendChild(b);
            return; // finally re-enables the button
          }
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-image', asset.file, format, quality);
        }
        const newSize  = result?.outputSize ?? result?.size ?? 0;
        const origSize = asset.sourceSize ?? asset.buildSize ?? 0;
        tdComp.textContent = fmt(newSize);
        tdSav.textContent  = origSize ? pct(newSize, origSize) : '—';
        clearChildren(tdStatus);
        tdStatus.appendChild(makeBadge('badge-pass', 'done'));
      } catch (e: any) {
        clearChildren(tdStatus);
        const b = makeBadge('badge-fail', 'error');
        b.title = e?.message ?? String(e);
        tdStatus.appendChild(b);
      } finally {
        btn.disabled = false;
      }
    },

    _compressAll(this: any) {
      const tbody = this.$.compressTbody as HTMLElement | null;
      const rows = tbody?.querySelectorAll('tr[id^="compress-row-"]');
      if (!rows) return;
      for (const row of Array.from(rows)) {
        const btn = (row as HTMLTableRowElement).querySelector('button') as HTMLButtonElement | null;
        if (btn) btn.click();
      }
    },

    _initPreview(this: any) {
      this._previewAsset = null;
      this._previewDebounceTimer = null;

      this.$.previewClose?.addEventListener('click', () => this._closePreview());
      this.$.previewBackdrop?.addEventListener('click', () => this._closePreview());
      this.$.previewCancel?.addEventListener('click', () => this._closePreview());

      document.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape' && this._previewAsset) this._closePreview();
      });

      const qSlider = this.$.previewQuality as HTMLInputElement;
      const qVal    = this.$.previewQualityVal as HTMLSpanElement;
      qSlider?.addEventListener('input', () => {
        if (qVal) qVal.textContent = qSlider.value;
        this._schedulePreviewUpdate();
      });

      this.$.previewFormat?.addEventListener('change', () => {
        this._schedulePreviewUpdate();
      });

      this.$.previewApply?.addEventListener('click', () => this._applyPreview());
    },

    _schedulePreviewUpdate(this: any) {
      if (this._previewDebounceTimer) clearTimeout(this._previewDebounceTimer);
      this._previewDebounceTimer = setTimeout(() => {
        this._previewDebounceTimer = null;
        this._updatePreview();
      }, 500);
    },

    async _openPreview(this: any, asset: any) {
      this._previewAsset = asset;
      const overlay = this.$.previewOverlay as HTMLElement;
      if (!overlay) return;

      const isAudio = /\.(mp3|ogg|wav|m4a)$/i.test(asset.name ?? '');

      const title = this.$.previewTitle as HTMLElement;
      if (title) title.textContent = translate(this._lang || 'en', 'compress.previewTitle').replace('{name}', asset.name ?? '\u2014');

      const mainFormat  = (this.$.compressFormat as HTMLSelectElement)?.value ?? 'webp';
      const mainQuality = (this.$.compressQuality as HTMLInputElement)?.value ?? '80';
      const pFormat  = this.$.previewFormat as HTMLSelectElement;
      const pQuality = this.$.previewQuality as HTMLInputElement;
      const pQVal    = this.$.previewQualityVal as HTMLSpanElement;

      if (pFormat) {
        clearChildren(pFormat);
        const options = isAudio
          ? [['mp3', 'MP3'], ['ogg', 'OGG']]
          : [['webp','WebP'],['jpeg','JPEG'],['png','PNG'],['avif','AVIF']];
        for (const [val, label] of options) {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          pFormat.appendChild(opt);
        }
        pFormat.value = isAudio ? (mainFormat === 'ogg' ? 'ogg' : 'mp3') : mainFormat;
      }
      if (pQuality) pQuality.value = mainQuality;
      if (pQVal) pQVal.textContent = mainQuality;

      const origWrap = this.$.previewOrigWrap as HTMLElement;
      const origMeta = this.$.previewOrigMeta as HTMLElement;
      if (origWrap) clearChildren(origWrap);
      if (origMeta) origMeta.textContent = translate(this._lang || 'en', 'compress.loading');

      overlay.style.display = 'flex';

      try {
        const origData = await Editor.Message.request('plbx-cocos-extension', 'get-asset-data-uri', asset.file);
        if (origWrap) {
          if (isAudio) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = origData.dataUri;
            origWrap.appendChild(audio);
          } else {
            const img = document.createElement('img');
            img.src = origData.dataUri;
            origWrap.appendChild(img);
          }
        }

        const origSize = origData.size ?? asset.sourceSize ?? asset.buildSize ?? 0;
        if (!isAudio) {
          const meta = await Editor.Message.request('plbx-cocos-extension', 'get-image-meta', asset.file);
          if (origMeta) origMeta.textContent = meta.width + '\u00d7' + meta.height + ' ' + meta.format.toUpperCase() + '\n' + fmt(origSize);
        } else {
          if (origMeta) origMeta.textContent = fmt(origSize);
        }
      } catch (e: any) {
        console.warn('[plbx] preview original load error:', e);
        if (origMeta) origMeta.textContent = translate(this._lang || 'en', 'compress.failedToLoad');
      }

      this._updatePreview();
    },

    async _updatePreview(this: any) {
      const asset = this._previewAsset;
      if (!asset) return;

      const isAudio = /\.(mp3|ogg|wav|m4a)$/i.test(asset.name ?? '');
      const format  = (this.$.previewFormat as HTMLSelectElement)?.value ?? 'webp';
      const quality = parseInt((this.$.previewQuality as HTMLInputElement)?.value ?? '80', 10);

      const compWrap = this.$.previewCompWrap as HTMLElement;
      const compMeta = this.$.previewCompMeta as HTMLElement;
      const spinner  = this.$.previewSpinner as HTMLElement;

      if (compWrap) {
        Array.from(compWrap.children).forEach((c: any) => {
          if (c !== spinner) c.remove();
        });
      }
      if (spinner) spinner.style.display = '';
      if (compMeta) compMeta.textContent = translate(this._lang || 'en', 'compress.compressing');

      try {
        let result: any;
        if (isAudio) {
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio-preview', asset.file, format, quality);
        } else {
          if (!this._sharpReady) {
            if (spinner) spinner.style.display = 'none';
            if (compMeta) compMeta.textContent = translate(this._lang || 'en', 'compress.sharpMissing');
            return;
          }
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-image-preview', asset.file, format, quality);
        }

        if (this._previewAsset !== asset) return;

        if (spinner) spinner.style.display = 'none';

        if (compWrap) {
          if (isAudio) {
            const audio = document.createElement('audio');
            audio.controls = true;
            audio.src = result.dataUri;
            compWrap.appendChild(audio);
          } else {
            const img = document.createElement('img');
            img.src = result.dataUri;
            compWrap.appendChild(img);
          }
        }

        const meta = result.metadata;
        const origSize = asset.sourceSize ?? asset.buildSize ?? meta.inputSize ?? 0;
        const compSize = meta.outputSize ?? 0;
        const savings  = origSize > 0 ? ((origSize - compSize) / origSize * 100).toFixed(1) : '0';

        if (!isAudio && meta.width) {
          if (compMeta) compMeta.textContent = meta.width + '\u00d7' + meta.height + ' ' + format.toUpperCase() + '\n' + fmt(compSize) + ' (\u2212' + savings + '%)';
        } else {
          if (compMeta) compMeta.textContent = format.toUpperCase() + '\n' + fmt(compSize) + ' (\u2212' + savings + '%)';
        }
      } catch (e: any) {
        if (spinner) spinner.style.display = 'none';
        if (compMeta) compMeta.textContent = translate(this._lang || 'en', 'compress.error').replace('{msg}', String(e?.message ?? e));
        console.warn('[plbx] preview compress error:', e);
      }
    },

    _closePreview(this: any) {
      this._previewAsset = null;
      if (this._previewDebounceTimer) {
        clearTimeout(this._previewDebounceTimer);
        this._previewDebounceTimer = null;
      }
      const overlay = this.$.previewOverlay as HTMLElement;
      if (overlay) overlay.style.display = 'none';

      const origWrap = this.$.previewOrigWrap as HTMLElement;
      const compWrap = this.$.previewCompWrap as HTMLElement;
      if (origWrap) clearChildren(origWrap);
      if (compWrap) {
        const spinner = this.$.previewSpinner as HTMLElement;
        Array.from(compWrap.children).forEach((c: any) => {
          if (c !== spinner) c.remove();
        });
      }
    },

    async _applyPreview(this: any) {
      const asset = this._previewAsset;
      if (!asset) return;

      const isAudio = /\.(mp3|ogg|wav|m4a)$/i.test(asset.name ?? '');
      const format  = (this.$.previewFormat as HTMLSelectElement)?.value ?? 'webp';
      const quality = parseInt((this.$.previewQuality as HTMLInputElement)?.value ?? '80', 10);

      const applyBtn = this.$.previewApply as HTMLButtonElement;
      if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = translate(this._lang || 'en', 'compress.applying'); }

      try {
        let result: any;
        if (isAudio) {
          const audioFormat = format === 'mp3' || format === 'ogg' ? format : 'mp3';
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio', asset.file, audioFormat, quality);
        } else {
          if (!(await this._ensureSharp())) return; // finally re-enables Apply
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-image', asset.file, format, quality);
        }

        const rowId = 'compress-row-' + encodeURIComponent(asset.path ?? asset.name ?? '');
        const tbody = this.$.compressTbody as HTMLElement;
        const row = tbody?.querySelector('#' + CSS.escape(rowId)) as HTMLTableRowElement | null;
        if (row) {
          const cells = row.querySelectorAll('td');
          const newSize = result?.outputSize ?? result?.size ?? 0;
          const origSize = asset.sourceSize ?? asset.buildSize ?? 0;
          if (cells[3]) cells[3].textContent = fmt(newSize);
          if (cells[4]) cells[4].textContent = origSize ? pct(newSize, origSize) : '\u2014';
          if (cells[5]) { clearChildren(cells[5]); cells[5].appendChild(makeBadge('badge-pass', 'done')); }
        }

        this._closePreview();
      } catch (e: any) {
        console.warn('[plbx] preview apply error:', e);
      } finally {
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = translate(this._lang || 'en', 'compress.applyBtn'); }
      }
    },

    _initPackage(this: any) {
      const grid          = this.$.networkGrid as HTMLElement | null;
      const gridMore      = this.$.networkGridMore as HTMLElement | null;
      const moreWrap      = this.$.networkMoreWrap as HTMLElement | null;
      const btnToggleMore = this.$.btnToggleMoreNets as HTMLButtonElement | null;
      const btnBuildAll   = this.$.btnBuildAll as HTMLButtonElement;
      const btnPreview    = this.$.btnPreview as HTMLButtonElement;
      const btnOpenOutput = this.$.btnOpenOutput as HTMLButtonElement;
      const pkgStatus     = this.$.pkgStatus as HTMLSpanElement;
      const templatePreset = this.$.pkgTemplatePreset as HTMLSelectElement | null;
      const templateInput  = this.$.pkgOutputTemplate as HTMLInputElement | null;
      const templatePreview = this.$.pkgTemplatePreview as HTMLElement | null;
      const templateVarsEl  = this.$.pkgTemplateVars as HTMLElement | null;
      const userVarsContainer = this.$.pkgUserVarsContainer as HTMLElement | null;

      if (!grid) return;

      /**
       * Persist the Package tab's form into the project profile.
       *
       * Auto-package runs in the build hook (hooks.onAfterBuild), which never
       * sees this panel: it reads selectedNetworks, orientation, outputDir and
       * the output template from the SAVED settings. Until this existed those
       * fields reached the profile only when Pack All was pressed, so ticking a
       * network and pressing Build packaged the list some earlier Pack All had
       * saved — the new network was simply absent from the run.
       *
       * Saving inside the Build button would not have been enough: the hook
       * fires for ANY build, including one started from Cocos's own build
       * panel, which never goes through our code at all. So the form is
       * persisted as it changes, and the same keys Pack All writes.
       */
      const persistPackageForm = () => {
        // The checkboxes start on their built-in defaults and are corrected
        // asynchronously from the profile. Persisting before that lands would
        // write the defaults over the operator's saved selection — the very
        // failure this helper exists to prevent, with the arrow reversed.
        if (!this._packageFormRestored) return;
        const contentPackage = this.$.contentPackage as HTMLElement | null;
        const selectedNetworks = Array.from(
          contentPackage?.querySelectorAll('input[name="network"]:checked') ?? [],
        ).map((cb: any) => (cb as HTMLInputElement).value);
        const orientation =
          ((contentPackage?.querySelector('input[name="orientation"]:checked') as HTMLInputElement | null)
            ?.value ?? 'portrait');
        const templateVariables: Record<string, string> = {};
        (this.$.pkgUserVarsContainer as HTMLElement | null)
          ?.querySelectorAll('input[data-template-var]')
          .forEach((inp: any) => {
            const el = inp as HTMLInputElement;
            if (el.dataset.templateVar && el.value.trim()) {
              templateVariables[el.dataset.templateVar] = el.value.trim();
            }
          });
        Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          selectedNetworks,
          orientation,
          buildDir: (this.$.pkgBuildDir as HTMLInputElement | null)?.value.trim() ?? '',
          outputDir: (this.$.pkgOutputDir as HTMLInputElement | null)?.value.trim() ?? '',
          outputTemplate:
            (this.$.pkgOutputTemplate as HTMLInputElement | null)?.value.trim() ||
            '{networkId}/index.{ext}',
          templateVariables,
        }).catch((e: any) => console.warn('[plbx]', e));
      };
      this._persistPackageForm = persistPackageForm;

      // Primary networks shown by default (sorted alphabetically)
      const PRIMARY_NETS = ['applovin', 'facebook', 'google', 'ironsource', 'unity', 'mintegral', 'moloco'];
      const SYSTEM_VARS = ['network', 'networkId', 'format', 'ext'];
      const TEMPLATE_PRESETS: Record<string, string> = {
        standard: '{networkId}/index.{ext}',
        flat: '{networkId}.{ext}',
      };

      // --- Helper: create a network checkbox label ---
      const createNetLabel = (net: any, defaultChecked: string[]) => {
        const label = document.createElement('label');
        label.className = 'network-check-label';
        label.dataset.networkId = net.id;
        label.dataset.format = net.format ?? '';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = 'network';
        cb.value = net.id;
        cb.checked = defaultChecked.includes(net.id);
        if (cb.checked) label.classList.add('checked');
        cb.addEventListener('change', () => {
          label.classList.toggle('checked', cb.checked);
          persistPackageForm();
        });

        const nameSpan = document.createElement('span');
        nameSpan.className = 'network-check-name';
        nameSpan.textContent = net.name ?? net.id;
        // Long names ("Moloco V2.0 (Launcher API)") truncate — full name on hover.
        label.title = net.name ?? net.id;

        const fmtTag = document.createElement('span');
        fmtTag.className = 'network-format-tag';
        // Long format names ("launcher-payload") would eat the whole card width
        // and squeeze the network name to nothing — show a short label instead.
        const FORMAT_SHORT: Record<string, string> = { 'launcher-payload': 'L+P' };
        const fmt = net.format ?? '';
        fmtTag.textContent = FORMAT_SHORT[fmt] ?? fmt;
        if (FORMAT_SHORT[fmt]) fmtTag.title = fmt;

        label.appendChild(cb);
        label.appendChild(nameSpan);
        label.appendChild(fmtTag);
        return label;
      };

      // --- Load networks: sort by name, split primary/more ---
      Editor.Message.request('plbx-cocos-extension', 'get-networks').then((networks: any[]) => {
        const sorted = [...networks].sort((a: any, b: any) =>
          (a.name ?? a.id).localeCompare(b.name ?? b.id),
        );

        const primary = sorted.filter((n: any) => PRIMARY_NETS.includes(n.id));
        const more = sorted.filter((n: any) => !PRIMARY_NETS.includes(n.id));

        clearChildren(grid);
        for (const net of primary) {
          grid.appendChild(createNetLabel(net, PRIMARY_NETS));
        }

        if (gridMore && moreWrap && more.length > 0) {
          moreWrap.style.display = '';
          clearChildren(gridMore);
          for (const net of more) {
            gridMore.appendChild(createNetLabel(net, PRIMARY_NETS));
          }
        }
      }).catch((e: any) => {
        console.warn('[plbx]', e);
        if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.couldNotLoadNetworks');
      });

      // --- More networks toggle ---
      btnToggleMore?.addEventListener('click', () => {
        const moreGrid = this.$.networkGridMore as HTMLElement | null;
        if (!moreGrid) return;
        const isHidden = moreGrid.style.display === 'none';
        moreGrid.style.display = isHidden ? '' : 'none';
        const arrow = btnToggleMore.querySelector('.more-arrow');
        arrow?.classList.toggle('expanded', isHidden);
      });

      // --- Network filter actions (All/None/HTML/ZIP) ---
      const contentPkg = this.$.contentPackage as HTMLElement | null;
      contentPkg?.querySelectorAll('[data-net-action]').forEach((btn: any) => {
        btn.addEventListener('click', () => {
          const action = btn.dataset.netAction;
          const allCbs = contentPkg.querySelectorAll('input[name="network"]');
          allCbs.forEach((cb: any) => {
            const input = cb as HTMLInputElement;
            const label = input.closest('label') as HTMLElement | null;
            const fmt = label?.dataset.format ?? '';
            if (action === 'all') input.checked = true;
            else if (action === 'none') input.checked = false;
            else if (action === 'html') input.checked = fmt === 'html';
            else if (action === 'zip') input.checked = fmt === 'zip';
            label?.classList.toggle('checked', input.checked);
          });
          // Programmatic .checked does NOT fire 'change', so the per-checkbox
          // listener never runs for these — persist explicitly.
          this._persistPackageForm?.();
          // Expand "more" section if filter was applied
          const moreGrid = this.$.networkGridMore as HTMLElement | null;
          if (moreGrid && action !== 'none') {
            moreGrid.style.display = '';
            const arrow = btnToggleMore?.querySelector('.more-arrow');
            arrow?.classList.add('expanded');
          }
        });
      });

      // --- Output Naming: template logic ---
      const updateTemplatePreview = () => {
        if (!templateInput || !templatePreview) return;
        const tmpl = templateInput.value || '{networkId}/index.{ext}';
        // Case-aware preview: lowercase var → lowercase value, Uppercase → Capitalized, ALL CAPS → UPPERCASE
        const previewVars: Record<string, Record<string, string>> = {
          network:   { lower: 'applovin', cap: 'Applovin', upper: 'APPLOVIN' },
          networkId: { lower: 'applovin', cap: 'Applovin', upper: 'APPLOVIN' },
          format:    { lower: 'html',     cap: 'Html',     upper: 'HTML' },
          ext:       { lower: 'html',     cap: 'Html',     upper: 'HTML' },
        };
        const preview = tmpl.replace(/\{(\w+)\}/g, (_m: string, key: string) => {
          const ctxKey = key[0].toLowerCase() + key.slice(1);
          const vals = previewVars[ctxKey];
          if (!vals) return `{${key}}`;
          if (key === key.toUpperCase() && key.length > 1) return vals.upper;
          if (key[0] === key[0].toUpperCase() && key[0] !== key[0].toLowerCase()) return vals.cap;
          return vals.lower;
        });
        templatePreview.textContent = translate(this._lang || 'en', 'package.tplPreview').replace('{preview}', preview);

        // Detect user variables
        const allVars = (tmpl.match(/\{(\w+)\}/g) || []).map((v: string) => v.slice(1, -1));
        const userVars = [...new Set(allVars)].filter((v: string) => !SYSTEM_VARS.includes(v));
        if (userVarsContainer) {
          clearChildren(userVarsContainer);
          for (const varName of userVars) {
            const group = document.createElement('div');
            group.className = 'form-group';
            const label = document.createElement('span');
            label.className = 'form-label';
            label.textContent = varName;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'form-input';
            input.dataset.templateVar = varName;
            input.placeholder = translate(this._lang || 'en', 'package.varPlaceholder').replace('{var}', varName);
            group.appendChild(label);
            group.appendChild(input);
            userVarsContainer.appendChild(group);
          }
        }
      };

      templatePreset?.addEventListener('change', () => {
        const val = templatePreset.value;
        if (val !== 'custom' && templateInput) {
          templateInput.value = TEMPLATE_PRESETS[val] || TEMPLATE_PRESETS.standard;
          updateTemplatePreview();
        }
      });

      templateInput?.addEventListener('change', () => this._persistPackageForm?.());
      userVarsContainer?.addEventListener('change', () => this._persistPackageForm?.());
      templateInput?.addEventListener('input', () => {
        // Auto-switch to Custom if user edits
        if (templatePreset) {
          const val = templateInput?.value ?? '';
          const matchesPreset = Object.entries(TEMPLATE_PRESETS).find(([, v]) => v === val);
          templatePreset.value = matchesPreset ? matchesPreset[0] : 'custom';
        }
        updateTemplatePreview();
      });

      // Variable chip click → insert at cursor
      templateVarsEl?.querySelectorAll('.var-chip').forEach((chip: any) => {
        chip.addEventListener('click', () => {
          if (!templateInput) return;
          const varName = chip.dataset.var;
          const token = `{${varName}}`;
          const pos = templateInput.selectionStart ?? templateInput.value.length;
          const before = templateInput.value.slice(0, pos);
          const after = templateInput.value.slice(pos);
          templateInput.value = before + token + after;
          templateInput.focus();
          templateInput.setSelectionRange(pos + token.length, pos + token.length);
          if (templatePreset) {
            const matchesPreset = Object.entries(TEMPLATE_PRESETS).find(([, v]) => v === templateInput.value);
            templatePreset.value = matchesPreset ? matchesPreset[0] : 'custom';
          }
          updateTemplatePreview();
        });
      });

      updateTemplatePreview();

      // Populate the read-only store-URL fields from URLs the game sets in code
      // (set_google_play_url / set_app_store_url), detected by scanning the build.
      const refreshDetectedStoreUrls = (buildDir?: string) => {
        const androidInput = this.$.pkgStoreAndroid as HTMLInputElement | null;
        const iosInput = this.$.pkgStoreIos as HTMLInputElement | null;
        const dir = (buildDir ?? (this.$.pkgBuildDir as HTMLInputElement)?.value ?? '').trim();
        if (!dir) {
          if (androidInput) androidInput.value = '';
          if (iosInput) iosInput.value = '';
          return;
        }
        const regionalEl = this.$.pkgStoreRegional as HTMLElement | null;
        Editor.Message.request('plbx-cocos-extension', 'detect-store-urls', dir)
          .then((res: any) => {
            if (androidInput) androidInput.value = res?.googlePlayUrl ?? '';
            if (iosInput) iosInput.value = res?.appStoreUrl ?? '';
            // Regional/localization params in the store URL — flag inline (should
            // be absent so the creative serves globally; same rule the packager warns on).
            const regional: string[] = Array.isArray(res?.regional) ? res.regional : [];
            if (regionalEl) {
              const textEl = this.$.pkgStoreRegionalText as HTMLElement | null;
              if (regional.length) {
                if (textEl) {
                  textEl.textContent =
                    '⚠ ' + translate(this._lang || 'en', 'package.storeUrlRegional') + ': ' + regional.join('; ');
                }
                regionalEl.style.display = '';
              } else {
                if (textEl) textEl.textContent = '';
                regionalEl.style.display = 'none';
              }
            }
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      };

      // "Fix" button on the regional warning: rewrite the offending store URLs
      // inside the build's source files (they are set in game code), then
      // re-scan so the warning clears and the fields show the fixed URLs.
      const fixBtn = this.$.pkgStoreRegionalFix as HTMLButtonElement | null;
      fixBtn?.addEventListener('click', () => {
        const dir = ((this.$.pkgBuildDir as HTMLInputElement)?.value ?? '').trim();
        if (!dir) return;
        fixBtn.disabled = true;
        Editor.Message.request('plbx-cocos-extension', 'fix-store-urls', dir)
          .then((res: any) => {
            const total = (res?.fixed ?? 0) + (res?.sourceFixed ?? 0);
            console.log('[plbx] regional store URLs fixed:', res);
            refreshDetectedStoreUrls(dir);
            // Already-packaged outputs still carry the old URLs — tell the user
            // to re-package. Reuse the warnings box under the results table.
            if (total > 0) {
              const msg = translate(this._lang || 'en', 'package.fixedRepack').replace(
                '{n}',
                String(total),
              );
              this._renderPackageWarnings([{ networkName: 'Store URL', warnings: [msg] }]);
            }
          })
          .catch((e: any) => { console.warn('[plbx]', e); })
          .finally(() => { fixBtn.disabled = false; });
      });

      // Advisory AppLovin Axon event-spec scan of the build source. Shown only
      // when AppLovin is selected (Axon is AppLovin-specific) so other projects
      // aren't nagged. Mirrors the fresh-pack warnings into the same box.
      const refreshAxonAdvisory = (buildDir?: string, selectedNetworks?: string[]) => {
        const selected = selectedNetworks ?? Array.from(
          contentPkg?.querySelectorAll('input[name="network"]:checked') ?? [],
        ).map((cb: any) => (cb as HTMLInputElement).value);
        if (!selected.includes('applovin')) return;
        const dir = (buildDir ?? (this.$.pkgBuildDir as HTMLInputElement)?.value ?? '').trim();
        if (!dir) return;
        Editor.Message.request('plbx-cocos-extension', 'scan-axon-events', dir)
          .then((res: any) => {
            const warnings: string[] = Array.isArray(res?.warnings) ? res.warnings : [];
            this._renderPackageWarnings([{ networkName: 'AppLovin', warnings }]);
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      };

      // Build Directory vs the directory Cocos actually built into. A build task
      // named anything but the default writes elsewhere (e.g. build/web-mobile-001),
      // and Pack All then packaged a stale leftover while auto-package packaged the
      // fresh output — same project, ~800 KB apart, no warning. Untouched default →
      // adopt silently (nothing was chosen); hand-edited → surface, never override.
      let lastBuildDestRel = '';
      const refreshBuildDirState = () => {
        const warn = this.$.pkgBuildDirWarn as HTMLElement | null;
        const warnText = this.$.pkgBuildDirWarnText as HTMLElement | null;
        const input = this.$.pkgBuildDir as HTMLInputElement | null;
        Editor.Message.request('plbx-cocos-extension', 'get-build-dir-state')
          .then((state: any) => {
            lastBuildDestRel = state?.lastDestRelative || '';
            if (state?.action === 'adopt' && input) {
              input.value = state.effective;
              if (warn) warn.style.display = 'none';
              Editor.Message.request('plbx-cocos-extension', 'save-settings', { buildDir: state.effective })
                .then(() => { refreshDetectedStoreUrls(state.effective); })
                .catch((e: any) => { console.warn('[plbx]', e); });
              return;
            }
            if (state?.action === 'mismatch' && warn && warnText) {
              warnText.textContent = translate(this._lang || 'en', 'package.buildDirMismatch')
                .replace('{dest}', lastBuildDestRel);
              warn.style.display = 'flex';
              return;
            }
            if (warn) warn.style.display = 'none';
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      };
      // After a build started from our own Build button, main has already
      // adopted the output directory into settings — pull it back into the
      // field so the packager and the panel agree without a manual step.
      this._reloadBuildDirField = () => {
        Editor.Message.request('plbx-cocos-extension', 'get-settings')
          .then((s: any) => {
            const input = this.$.pkgBuildDir as HTMLInputElement | null;
            if (input && s?.buildDir) input.value = s.buildDir;
            refreshBuildDirState();
            refreshPackAvailability(s?.buildDir);
            if (s?.buildDir) refreshDetectedStoreUrls(s.buildDir);
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      };

      (this.$.pkgBuildDirUse as HTMLElement)?.addEventListener('click', () => {
        const input = this.$.pkgBuildDir as HTMLInputElement | null;
        if (!input || !lastBuildDestRel) return;
        input.value = lastBuildDestRel;
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { buildDir: lastBuildDestRel })
          .then(() => {
            refreshDetectedStoreUrls(lastBuildDestRel);
            refreshBuildDirState();
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });

      // Custom splash logo size. Kept in a local so the slider, the number box
      // and the preview all read one value; the kit clamps it for real.
      let currentLogoScale = 26;

      // Live splash preview: the kit builds the SAME markup + CSS the packager
      // emits and we drop it into a phone-shaped iframe, so what the operator
      // sizes here is what ships. Empty path → nothing to preview.
      const refreshSplashPreview = (path: string, scale: number) => {
        const frame = this.$.pkgSplashPreview as HTMLIFrameElement | null;
        if (!frame) return;
        if (!path) { frame.removeAttribute('srcdoc'); return; }
        Editor.Message.request('plbx-cocos-extension', 'get-splash-preview', { logoPath: path, scale })
          .then((res: any) => {
            if (res?.ok) frame.srcdoc = res.srcdoc;
            else frame.removeAttribute('srcdoc');
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      };

      // Persisting on every slider tick would write the Cocos profile dozens of
      // times per drag; the preview itself refreshes immediately.
      let scaleSaveTimer: any = null;
      const saveLogoScale = (scale: number) => {
        if (scaleSaveTimer) clearTimeout(scaleSaveTimer);
        scaleSaveTimer = setTimeout(() => {
          Editor.Message.request('plbx-cocos-extension', 'save-settings', { splashLogoScale: scale })
            .catch((e: any) => { console.warn('[plbx]', e); });
        }, 250);
      };

      const applyLogoScale = (scale: number, opts?: { persist?: boolean }) => {
        currentLogoScale = scale;
        const slider = this.$.pkgLogoScale as HTMLInputElement | null;
        const num = this.$.pkgLogoScaleNum as HTMLInputElement | null;
        if (slider && slider.value !== String(scale)) slider.value = String(scale);
        if (num && num.value !== String(scale)) num.value = String(scale);
        refreshSplashPreview(currentLogoPath, scale);
        if (opts?.persist) saveLogoScale(scale);
      };

      // Custom splash logo: preview + build cost (incl. base64 +33%). Empty
      // path → default PLBX splash, no preview.
      const refreshCustomLogo = (path: string) => {
        const preview = this.$.pkgLogoPreview as HTMLImageElement | null;
        const clearBtn = this.$.pkgLogoClear as HTMLElement | null;
        const costEl = this.$.pkgLogoCost as HTMLElement | null;
        const errEl = this.$.pkgLogoError as HTMLElement | null;
        if (costEl) costEl.textContent = '';
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }
        const showErr = () => {
          if (preview) { preview.style.display = 'none'; preview.removeAttribute('src'); }
          if (errEl) {
            errEl.textContent = translate(this._lang || 'en', 'settings.customLogoError');
            errEl.style.display = 'block';
          }
        };
        refreshSplashPreview(path, currentLogoScale);
        if (!path) {
          if (preview) { preview.style.display = 'none'; preview.removeAttribute('src'); }
          if (clearBtn) clearBtn.style.display = 'none';
          return;
        }
        if (clearBtn) clearBtn.style.display = '';
        Editor.Message.request('plbx-cocos-extension', 'get-splash-logo-info', path)
          .then((info: any) => {
            if (!info?.ok) { showErr(); return; }
            if (preview) {
              // The scale enlarges an undersized logo, so show the asset's own
              // pixel size — measurable only once the browser has decoded it.
              const showNatural = () => {
                const el = this.$.pkgLogoNatural as HTMLElement | null;
                if (el) {
                  el.textContent = formatLogoDimensions(
                    preview.naturalWidth, preview.naturalHeight, this._lang || 'en',
                  );
                }
              };
              preview.onload = showNatural;
              preview.src = info.dataUrl;
              preview.style.display = 'block';
              if (preview.complete) showNatural();
            }
            if (costEl) {
              const kb = (info.bytes / 1024).toFixed(1);
              costEl.textContent = translate(this._lang || 'en', 'settings.customLogoCost').replace('{kb}', kb);
            }
          })
          .catch(() => showErr());
      };

      // Splash mode (none / playbox / custom). Playbox byte-cost is fetched once
      // and shown only in playbox mode; the custom-logo block shows only in
      // custom mode. currentLogoPath persists the picked file across mode flips.
      let splashKb = '';
      let currentLogoPath = '';
      const renderSplashCost = () => {
        const el = this.$.pkgSplashCost as HTMLElement | null;
        if (!el) return;
        const mode = (this.$.pkgSplashMode as HTMLSelectElement | null)?.value || 'playbox';
        el.textContent = mode === 'playbox' && splashKb
          ? translate(this._lang || 'en', 'settings.splashCost').replace('{kb}', splashKb)
          : '';
      };
      const applySplashMode = (mode: string, logoPath: string, logoScale?: number) => {
        currentLogoPath = logoPath;
        const sel = this.$.pkgSplashMode as HTMLSelectElement | null;
        if (sel) sel.value = mode;
        const block = this.$.pkgCustomLogo as HTMLElement | null;
        if (block) block.style.display = mode === 'custom' ? 'block' : 'none';
        renderSplashCost();
        if (mode === 'custom') {
          applyLogoScale(typeof logoScale === 'number' ? logoScale : currentLogoScale);
          refreshCustomLogo(logoPath);
        }
      };

      // --- Restore settings ---
      Editor.Message.request('plbx-cocos-extension', 'get-settings').then((settings: any) => {
        const buildDirInput = this.$.pkgBuildDir as HTMLInputElement;
        const outputDirInput = this.$.pkgOutputDir as HTMLInputElement;
        const autoPackageCb = this.$.pkgAutoPackage as HTMLInputElement;

        if (buildDirInput && settings?.buildDir) buildDirInput.value = settings.buildDir;
        refreshBuildDirState();
        refreshPackAvailability(settings?.buildDir);
        refreshDetectedStoreUrls(settings?.buildDir);
        refreshAxonAdvisory(settings?.buildDir, settings?.selectedNetworks);
        if (outputDirInput && settings?.outputDir) outputDirInput.value = settings.outputDir;
        if (autoPackageCb) autoPackageCb.checked = settings?.autoPackage !== false;
        applySplashMode(
          settings?.splashMode || 'playbox',
          settings?.customSplashLogo || '',
          typeof settings?.splashLogoScale === 'number' ? settings.splashLogoScale : 26,
        );
        const encArr: string[] = Array.isArray(settings?.assetEncodings) && settings.assetEncodings.length
          ? settings.assetEncodings
          : ['base64'];
        const encSel = this.$.pkgEncoding as HTMLSelectElement | null;
        if (encSel) {
          const both = encArr.includes('base64') && encArr.includes('base122');
          encSel.value = both ? 'both' : encArr.includes('base122') ? 'base122' : 'base64';
          const encWarn = this.$.pkgEncWarn as HTMLElement | null;
          if (encWarn) {
            encWarn.style.display = encSel.value === 'base64' ? 'none' : 'inline';
            encWarn.title = translate(this._lang || 'en', 'settings.encWarn');
          }
        }

        const ori = settings?.orientation ?? 'auto';
        const radioEl = (this.$.contentPackage as HTMLElement | null)?.querySelector(`input[name="orientation"][value="${ori}"]`) as HTMLInputElement | null;
        if (radioEl) radioEl.checked = true;

        // Restore output template
        if (settings?.outputTemplate && templateInput) {
          templateInput.value = settings.outputTemplate;
          if (templatePreset) {
            const matchesPreset = Object.entries(TEMPLATE_PRESETS).find(([, v]) => v === settings.outputTemplate);
            templatePreset.value = matchesPreset ? matchesPreset[0] : 'custom';
          }
          updateTemplatePreview();
        }

        // Restore template variables
        if (settings?.templateVariables && userVarsContainer) {
          for (const [k, v] of Object.entries(settings.templateVariables)) {
            const input = userVarsContainer.querySelector(`input[data-template-var="${k}"]`) as HTMLInputElement | null;
            if (input) input.value = v as string;
          }
        }

        // From here on the form mirrors the profile, so persisting it is safe.
        this._packageFormRestored = true;
        // Restore selected networks
        if (settings?.selectedNetworks?.length) {
          const allCbs = contentPkg?.querySelectorAll('input[name="network"]');
          allCbs?.forEach((cb: any) => {
            const input = cb as HTMLInputElement;
            input.checked = settings.selectedNetworks.includes(input.value);
            input.closest('label')?.classList.toggle('checked', input.checked);
          });
        }

        // Check if builds already exist — show Validate button + list them
        if (settings?.outputDir) {
          Editor.Message.request('plbx-cocos-extension', 'check-output-has-builds', settings.outputDir)
            .then((hasBuild: boolean) => {
              if (hasBuild && btnPreview) btnPreview.style.display = '';
            })
            .catch(() => {});

          // List existing builds so they appear on open (no need to Pack first)
          Editor.Message.request('plbx-cocos-extension', 'list-output-builds', settings.outputDir)
            .then((rows: any[]) => {
              if (Array.isArray(rows) && rows.length > 0) {
                this._renderPackageResults(rows);
                if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.existingBuilds').replace('{n}', String(rows.length));
                // _renderPackageResults clears the warnings box; re-run the Axon
                // advisory so it survives the existing-builds render.
                refreshAxonAdvisory(settings?.buildDir, settings?.selectedNetworks);
              }
            })
            .catch((e: any) => { console.warn('[plbx]', e); });
        }
      }).catch((e: any) => { console.warn('[plbx]', e); });

      // Save auto-package toggle on change
      (this.$.pkgAutoPackage as HTMLInputElement)?.addEventListener('change', () => {
        const checked = (this.$.pkgAutoPackage as HTMLInputElement)?.checked ?? true;
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { autoPackage: checked })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });

      // Splash mode dropdown (none / playbox / custom) — project setting + hints.
      (this.$.pkgSplashMode as HTMLSelectElement)?.addEventListener('change', () => {
        const mode = (this.$.pkgSplashMode as HTMLSelectElement)?.value || 'playbox';
        applySplashMode(mode, currentLogoPath);
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { splashMode: mode })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });

      // Custom splash logo: Browse (file dialog) + Clear.
      (this.$.pkgLogoBrowse as HTMLElement)?.addEventListener('click', () => {
        Editor.Message.request('plbx-cocos-extension', 'pick-splash-logo')
          .then((res: any) => {
            if (res?.canceled || !res?.path) return;
            currentLogoPath = res.path;
            Editor.Message.request('plbx-cocos-extension', 'save-settings', { customSplashLogo: res.path })
              .then(() => refreshCustomLogo(res.path))
              .catch((e: any) => { console.warn('[plbx]', e); });
          })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });
      (this.$.pkgLogoClear as HTMLElement)?.addEventListener('click', () => {
        currentLogoPath = '';
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { customSplashLogo: '' })
          .then(() => refreshCustomLogo(''))
          .catch((e: any) => { console.warn('[plbx]', e); });
      });

      // Logo size: slider and number box drive each other; the preview follows
      // every tick, the project profile only after the drag settles. Range
      // bounds mirror the kit's clamp, which stays the single authority.
      const readScale = (raw: string): number => {
        const n = Math.round(Number(raw));
        if (!Number.isFinite(n)) return currentLogoScale;
        return Math.min(100, Math.max(5, n));
      };
      (this.$.pkgLogoScale as HTMLInputElement)?.addEventListener('input', (e) => {
        applyLogoScale(readScale((e.target as HTMLInputElement).value), { persist: true });
      });
      (this.$.pkgLogoScaleNum as HTMLInputElement)?.addEventListener('change', (e) => {
        applyLogoScale(readScale((e.target as HTMLInputElement).value), { persist: true });
      });

      // Orientation is a viewing control for the preview frame only — a logo has
      // one size, and vmin already keeps it inside either orientation.
      (this.$.pkgPreviewOrient as HTMLElement)?.addEventListener('click', () => {
        const frame = this.$.pkgSplashFrame as HTMLElement | null;
        const btn = this.$.pkgPreviewOrient as HTMLElement | null;
        if (!frame) return;
        const landscape = frame.classList.toggle('landscape');
        if (btn) {
          btn.textContent = translate(
            this._lang || 'en',
            landscape ? 'settings.previewPortrait' : 'settings.previewLandscape',
          );
        }
      });

      // Asset-encoding dropdown (base64 default / base122 / both). Maps the single
      // choice to the assetEncodings array; "both" emits index.html (base122) +
      // index.b64.html for A/B size comparison. Persisted to project settings;
      // packaging reads it via toPackageConfig. base122 surfaces a hover warning.
      (this.$.pkgEncoding as HTMLSelectElement)?.addEventListener('change', () => {
        const v = (this.$.pkgEncoding as HTMLSelectElement)?.value || 'base64';
        const enc: ('base64' | 'base122')[] =
          v === 'both' ? ['base64', 'base122'] : v === 'base122' ? ['base122'] : ['base64'];
        const warn = this.$.pkgEncWarn as HTMLElement | null;
        if (warn) {
          warn.style.display = v === 'base64' ? 'none' : 'inline';
          warn.title = translate(this._lang || 'en', 'settings.encWarn');
        }
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { assetEncodings: enc })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });
      Editor.Message.request('plbx-cocos-extension', 'get-splash-info')
        .then((info: any) => {
          if (info?.bytes > 0) splashKb = (info.bytes / 1024).toFixed(1);
          renderSplashCost();
        })
        .catch(() => {});

      /**
       * Pack All is only meaningful when a Cocos build actually sits at the
       * Build Directory. Packaging a path with no build there fails deep inside
       * the kit with a message about a missing file; disabling the button says
       * the same thing before the click.
       *
       * `src/settings.json` is the marker — the same one `detectBuildDir` uses
       * to recognise a build directory. A directory that merely exists (an
       * emptied `build/`, a typo that matches a real folder) is not a build.
       */
      const refreshPackAvailability = async (buildDir?: string) => {
        if (!btnBuildAll) return;
        const dir = (buildDir ?? (this.$.pkgBuildDir as HTMLInputElement)?.value ?? '').trim();
        let hasBuild = false;
        if (dir) {
          try {
            hasBuild = await Editor.Message.request(
              'plbx-cocos-extension', 'check-path-exists', `${dir}/src/settings.json`,
            );
          } catch (e: any) {
            console.warn('[plbx]', e);
          }
        }
        btnBuildAll.disabled = !hasBuild;
        btnBuildAll.title = hasBuild ? '' : translate(this._lang || 'en', 'package.noBuildAtPath');
      };
      this._refreshPackAvailability = refreshPackAvailability;

      // Re-detect store URLs when the build directory changes.
      (this.$.pkgBuildDir as HTMLInputElement)?.addEventListener('change', () => {
        refreshDetectedStoreUrls();
        refreshAxonAdvisory();
        refreshPackAvailability();
        persistPackageForm();
      });
      (this.$.pkgOutputDir as HTMLInputElement)?.addEventListener('change', () => persistPackageForm());
      // Orientation feeds the packager's config through the same saved settings.
      (this.$.contentPackage as HTMLElement | null)
        ?.querySelectorAll('input[name="orientation"]')
        .forEach((r: any) => r.addEventListener('change', () => persistPackageForm()));

      // --- Build All ---
      btnBuildAll?.addEventListener('click', async () => {
        const buildDir  = (this.$.pkgBuildDir as HTMLInputElement)?.value.trim() ?? '';
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        const orientation = (((this.$.contentPackage as HTMLElement | null)?.querySelector('input[name="orientation"]:checked') as HTMLInputElement | null)?.value ?? 'portrait') as any;
        const outputTemplate = templateInput?.value.trim() || '{networkId}/index.{ext}';

        // Collect user-defined template variables
        const templateVariables: Record<string, string> = {};
        userVarsContainer?.querySelectorAll('input[data-template-var]').forEach((inp: any) => {
          const el = inp as HTMLInputElement;
          if (el.dataset.templateVar && el.value.trim()) {
            templateVariables[el.dataset.templateVar] = el.value.trim();
          }
        });

        // Gather selected from both grids
        const selected = Array.from(
          contentPkg?.querySelectorAll('input[name="network"]:checked') ?? []
        ).map((cb: any) => (cb as HTMLInputElement).value);

        if (!buildDir)        { if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.setBuildDir');    return; }
        if (!outputDir)       { if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.setOutputDir');   return; }
        if (!selected.length) { if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.selectNetwork'); return; }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          selectedNetworks: selected,
          orientation,
          buildDir,
          outputDir,
          outputTemplate,
          templateVariables,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        btnBuildAll.disabled = true;
        if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.packing');

        const config = { orientation };
        try {
          const response = await Editor.Message.request(
            'plbx-cocos-extension', 'package-networks',
            buildDir, outputDir, selected, config, outputTemplate, templateVariables,
          );
          const results = Array.isArray(response) ? response : response?.results ?? [];
          this._renderPackageResults(results);
          refreshDetectedStoreUrls(buildDir);
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.packComplete');
          if (btnPreview) btnPreview.style.display = '';
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message ?? e));
        } finally {
          btnBuildAll.disabled = false;
        }
      });

      btnOpenOutput?.addEventListener('click', async () => {
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        if (!outputDir) return;
        try {
          await Editor.Message.request('plbx-cocos-extension', 'open-folder', outputDir);
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message ?? e));
        }
      });

      /**
       * Serve the packaged output through the preview validator.
       *
       * Shared by the toolbar's Validate button and the one the Build modal
       * shows after a successful build — one implementation so the two cannot
       * drift. Throws a translated message; each caller decides where to put it.
       */
      const startPreview = async (): Promise<string> => {
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        const networkIds = Array.from(
          contentPkg?.querySelectorAll('input[name="network"]:checked') ?? []
        ).map((cb: any) => (cb as HTMLInputElement).value);
        if (!outputDir) throw new Error(translate(this._lang || 'en', 'status.setOutputDir'));
        if (!networkIds.length) throw new Error(translate(this._lang || 'en', 'status.selectNetwork'));
        const result = await Editor.Message.request(
          'plbx-cocos-extension', 'start-preview', outputDir, networkIds,
        );
        console.log('[plbx] Preview opened:', result.url);
        return result.url;
      };
      this._startPreview = startPreview;

      btnPreview?.addEventListener('click', async () => {
        try {
          btnPreview.disabled = true;
          const url = await startPreview();
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.previewUrl').replace('{url}', url);
        } catch (err: any) {
          console.error('[plbx] Preview failed:', err.message || err);
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.previewError').replace('{msg}', String(err?.message ?? err));
        } finally {
          btnPreview.disabled = false;
        }
      });

      const btnGenAdapter = this.$.btnGenerateAdapter as HTMLButtonElement;
      btnGenAdapter?.addEventListener('click', async () => {
        btnGenAdapter.disabled = true;
        if (pkgStatus) pkgStatus.textContent = '';
        try {
          const result = await Editor.Message.request('plbx-cocos-extension', 'generate-adapter');
          if (result.created) {
            if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.createdPath').replace('{path}', result.path.split('/').slice(-3).join('/'));
          } else {
            if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.alreadyExists').replace('{path}', result.path.split('/').slice(-3).join('/'));
          }
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message ?? e));
        } finally {
          btnGenAdapter.disabled = false;
        }
      });

      const btnGenAxon = this.$.btnGenerateAxon as HTMLButtonElement;
      btnGenAxon?.addEventListener('click', async () => {
        btnGenAxon.disabled = true;
        if (pkgStatus) pkgStatus.textContent = '';
        try {
          const result = await Editor.Message.request('plbx-cocos-extension', 'generate-axon-helper');
          if (result.created) {
            if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.createdPath').replace('{path}', result.path.split('/').slice(-3).join('/'));
          } else {
            if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.alreadyExists').replace('{path}', result.path.split('/').slice(-3).join('/'));
          }
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message ?? e));
        } finally {
          btnGenAxon.disabled = false;
        }
      });

    },

    _renderPackageResults(this: any, results: any[]) {
      const tbody = this.$.pkgResultsTbody;
      if (!tbody) return;
      clearChildren(tbody);

      if (!results || results.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 6;
        td.textContent = translate(this._lang || 'en', 'status.noResults');
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      const maxSize = Math.max(...results.map(r => r.outputSize ?? r.size ?? 0), 1);

      for (const r of results) {
        const tr = document.createElement('tr');
        const fileSize = r.outputSize ?? r.size ?? 0;

        const tdNet = document.createElement('td');
        tdNet.textContent = r.networkName ?? r.network ?? r.id ?? '—';

        const tdFmt = document.createElement('td');
        tdFmt.textContent = r.format ?? '—';

        const tdSize = document.createElement('td');
        tdSize.className = 'col-size size-bar-cell';
        tdSize.appendChild(document.createTextNode(fmt(fileSize)));
        const barBg = document.createElement('div');
        barBg.className = 'size-bar-bg';
        const barFill = document.createElement('div');
        // A falsy maxSize (e.g. an existing build for an unknown network) means "no known limit".
        const limit = r.maxSize ?? r.limit;
        const overLimit = !r.withinLimit || (!!limit && fileSize > limit);
        barFill.className = 'size-bar-fill' + (overLimit ? ' over-limit' : '');
        barFill.style.width = Math.round((fileSize / maxSize) * 100) + '%';
        barBg.appendChild(barFill);
        tdSize.appendChild(barBg);

        const tdLimit = document.createElement('td');
        tdLimit.className = 'col-size';
        tdLimit.textContent = limit ? fmt(limit) : '—';

        // Created date/time (populated for existing builds; em dash for fresh packs)
        const tdCreated = document.createElement('td');
        tdCreated.className = 'col-created';
        tdCreated.textContent = r.createdAtLabel ?? '—';

        const tdStatus = document.createElement('td');
        const warnings: string[] = Array.isArray(r.warnings) ? r.warnings : [];
        if (r.error) {
          const b = makeBadge('badge-fail', 'error');
          b.title = r.error;
          tdStatus.appendChild(b);
        } else if (overLimit) {
          tdStatus.appendChild(makeBadge('badge-warn', 'over limit'));
        } else if (warnings.length) {
          const b = makeBadge('badge-warn', 'warning');
          b.title = warnings.join('\n');
          tdStatus.appendChild(b);
        } else {
          tdStatus.appendChild(makeBadge('badge-pass', 'pass'));
        }

        tr.appendChild(tdNet);
        tr.appendChild(tdFmt);
        tr.appendChild(tdSize);
        tr.appendChild(tdLimit);
        tr.appendChild(tdCreated);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
      }

      // Surface warnings as a visible list (the per-row badge tooltip is
      // hover-only and easy to miss). Advisory only — e.g. AppLovin Axon
      // event-spec conformance — the build itself still succeeds.
      this._renderPackageWarnings(results);
    },

    _renderPackageWarnings(this: any, results: any[]) {
      const box = this.$.pkgWarnings as HTMLDivElement | undefined;
      if (!box) return;
      clearChildren(box);

      const groups = (results || [])
        .map((r) => ({
          name: r.networkName ?? r.network ?? r.id ?? '—',
          warnings: (Array.isArray(r.warnings) ? r.warnings : []) as string[],
        }))
        .filter((g) => g.warnings.length > 0);

      // De-duplicate identical messages across networks. A store-URL/regional
      // warning is the same for every network (it's a property of the URL, not the
      // network), so list it once labelled "All networks" instead of repeating it
      // per network. Network-specific warnings (e.g. Axon) keep their own label.
      // First-seen order preserved.
      const order: string[] = [];
      const byMsg = new Map<string, Set<string>>();
      for (const g of groups) {
        for (const w of g.warnings) {
          let nets = byMsg.get(w);
          if (!nets) { nets = new Set(); byMsg.set(w, nets); order.push(w); }
          nets.add(g.name);
        }
      }

      if (order.length === 0) {
        box.style.display = 'none';
        return;
      }
      box.style.display = '';

      const header = document.createElement('div');
      header.className = 'pkg-warnings-title';
      header.textContent = '⚠ ' + translate(this._lang || 'en', 'package.advisoryWarnings').replace('{n}', String(order.length));
      box.appendChild(header);

      for (const w of order) {
        const nets = byMsg.get(w)!;
        const item = document.createElement('div');
        item.className = 'pkg-warning-item';
        const net = document.createElement('span');
        net.className = 'pkg-warning-net';
        net.textContent = nets.size === 1 ? Array.from(nets)[0] : translate(this._lang || 'en', 'package.allNetworks');
        const msg = document.createElement('span');
        msg.className = 'pkg-warning-msg';
        msg.textContent = w;
        item.appendChild(net);
        item.appendChild(msg);
        box.appendChild(item);
      }

      // Link to the Axon event spec only when an actual Axon advisory is shown —
      // keyed on the warning text, NOT the network name (else any AppLovin warning,
      // e.g. risky-audio, would surface an irrelevant Axon link).
      const hasAxon = groups.some((g) => g.warnings.some((w) => /axon/i.test(w)));
      if (hasAxon) {
        const link = document.createElement('a');
        link.className = 'pkg-warnings-link';
        link.href = AXON_SPEC_URL;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = translate(this._lang || 'en', 'package.axonSpecLink');
        box.appendChild(link);
      }
    },

    _initDeploy(this: any) {
      const tokenInput       = this.$.deployToken as HTMLInputElement;
      const btnSaveToken     = this.$.btnSaveToken as HTMLButtonElement;
      const loginStatus      = this.$.loginStatus as HTMLDivElement;
      const projectHidden    = this.$.deployProject as HTMLInputElement;
      const projectInput     = this.$.deployProjectInput as HTMLInputElement;
      const projectDropdown  = this.$.deployProjectDropdown as HTMLDivElement;
      const btnRefresh       = this.$.btnRefreshProjects as HTMLButtonElement;
      const btnNewProject    = this.$.btnNewProject as HTMLButtonElement;
      const btnCancelNew     = this.$.btnCancelNewProject as HTMLButtonElement;
      const projectNameInput = this.$.deployProjectName as HTMLInputElement;
      const newProjectRow    = this.$.deployNewProjectRow as HTMLDivElement;
      const deployNameInput  = this.$.deployName as HTMLInputElement;
      const deployNameHint   = this.$.deployNameHint as HTMLSpanElement;
      const networkSel       = this.$.deployNetwork as HTMLSelectElement;
      const buildPathInput   = this.$.deployBuildPath as HTMLInputElement;
      const btnDeploy        = this.$.btnDeploy as HTMLButtonElement;
      const deployStatus     = this.$.deployStatus as HTMLSpanElement;
      const resultDiv        = this.$.deployResult as HTMLDivElement;
      const resultUrl        = this.$.deployResultUrl as HTMLSpanElement;
      const btnCopyUrl       = this.$.btnCopyUrl as HTMLButtonElement;

      Promise.all([
        Editor.Message.request('plbx-cocos-extension', 'get-token'),
        Editor.Message.request('plbx-cocos-extension', 'get-settings'),
      ]).then(([token, settings]: [string, any]) => {
        if (token && tokenInput) {
          tokenInput.value = token;
          this._checkLoginStatus(token, loginStatus);
        }
        if (projectNameInput && settings?.projectName) {
          projectNameInput.value = settings.projectName;
        }
        if (deployNameInput && settings?.deploymentName) {
          deployNameInput.value = settings.deploymentName;
        }
        if (networkSel && settings?.defaultDeployNetwork) {
          networkSel.value = settings.defaultDeployNetwork;
        }
      }).catch((e: any) => { console.warn('[plbx]', e); });

      // Combobox: filter, select, toggle
      this._projectsList = [] as Array<{ id: string; slug: string; name: string }>;
      this._projectsComplete = false;
      this._projectsRestLoaded = false;

      const clearDropdown = (el: HTMLElement) => {
        while (el.firstChild) el.removeChild(el.firstChild);
      };

      // The first screen is one page of projects, newest first. Typing something
      // that page does not contain pulls the rest — once. Costs a request only
      // for the orgs big enough to need it, and never on tab open.
      const loadRestOnce = () => {
        if (this._projectsRestLoaded || this._projectsComplete) return;
        this._projectsRestLoaded = true;
        this._loadProjects(true).then((ok: boolean) => {
          // A walk that died leaves a short list behind. Clearing the guard is
          // what lets the next keystroke try again instead of searching a
          // 50-row subset forever.
          if (!ok) this._projectsRestLoaded = false;
          renderDropdown(projectInput?.value ?? '');
          this._checkDeployBuild?.();
        });
      };
      this._loadRestOfProjects = loadRestOnce;

      const renderDropdown = (filter: string) => {
        if (!projectDropdown) return;
        clearDropdown(projectDropdown);
        const q = filter.toLowerCase();
        const filtered = this._projectsList.filter((p: any) =>
          !q || p.name.toLowerCase().includes(q)
        );
        // Expand on "the list may be short", not on "nothing matched": a query
        // that hits one recent project would otherwise hide an older namesake
        // sitting past the first page, and the user sees a non-empty dropdown
        // with no hint that anything is missing.
        if (q && !this._projectsComplete) loadRestOnce();
        for (const p of filtered) {
          const div = document.createElement('div');
          div.className = 'combobox-item';
          div.textContent = p.name;
          div.dataset.id = p.id;
          div.dataset.slug = p.slug;
          div.addEventListener('mousedown', (e: Event) => {
            e.preventDefault();
            projectHidden.value = p.id;
            projectHidden.dataset.slug = p.slug;
            projectInput.value = p.name;
            projectDropdown.classList.remove('open');
            if (newProjectRow) newProjectRow.style.display = 'none';
            this._checkDeployBuild?.();
            this._loadDeployments(p.slug);
          });
          projectDropdown.appendChild(div);
        }
      };

      projectInput?.addEventListener('focus', () => {
        projectInput.select();
        renderDropdown('');
        projectDropdown?.classList.add('open');
      });
      projectInput?.addEventListener('input', () => {
        projectHidden.value = '';
        projectHidden.dataset.slug = '';
        renderDropdown(projectInput.value);
        projectDropdown?.classList.add('open');
        this._checkDeployBuild?.();
      });
      projectInput?.addEventListener('blur', () => {
        setTimeout(() => projectDropdown?.classList.remove('open'), 150);
      });

      // "+ New" / "Cancel" buttons for new project
      btnNewProject?.addEventListener('click', () => {
        projectHidden.value = '__new__';
        projectHidden.dataset.slug = '';
        projectInput.value = '';
        projectInput.placeholder = translate(this._lang || 'en', 'deploy.newProjectWillBeCreated');
        projectInput.disabled = true;
        if (newProjectRow) newProjectRow.style.display = '';
        const existingEl = this.$.deployExisting as HTMLElement;
        if (existingEl) existingEl.style.display = 'none';
        projectNameInput?.focus();
        this._checkDeployBuild?.();
      });
      btnCancelNew?.addEventListener('click', () => {
        projectHidden.value = '';
        projectHidden.dataset.slug = '';
        projectInput.value = '';
        projectInput.placeholder = translate(this._lang || 'en', 'deploy.projectPlaceholder');
        projectInput.disabled = false;
        if (newProjectRow) newProjectRow.style.display = 'none';
        this._checkDeployBuild?.();
      });

      // Validate deployment name: ASCII only, no dots, URL-safe
      deployNameInput?.addEventListener('input', () => {
        let val = deployNameInput.value;
        // Strip non-ASCII characters (catches Cyrillic lookalikes etc.)
        // eslint-disable-next-line no-control-regex
        const nonAscii = /[^\x00-\x7F]/g;
        if (nonAscii.test(val)) {
          val = val.replace(nonAscii, '');
          deployNameInput.value = val;
          if (deployNameHint) {
            deployNameHint.style.color = '#e8a040';
            deployNameHint.textContent = translate(this._lang || 'en', 'deploy.nonLatinRemoved');
          }
          setTimeout(() => { if (deployNameHint) { deployNameHint.textContent = ''; deployNameHint.style.color = ''; } }, 3000);
        }
        if (/[.]/.test(val)) {
          deployNameInput.value = val.replace(/\./g, '-');
          if (deployNameHint) {
            deployNameHint.style.color = '#e8a040';
            deployNameHint.textContent = translate(this._lang || 'en', 'deploy.dotsReplaced');
          }
          setTimeout(() => { if (deployNameHint) { deployNameHint.textContent = ''; deployNameHint.style.color = ''; } }, 2000);
        }
        this._checkDeployBuild?.();
      });
      // Naming a new project checks it against existing names, so that check
      // needs the whole catalogue, not just the first page.
      projectNameInput?.addEventListener('input', () => {
        this._loadRestOfProjects?.();
        this._checkDeployBuild?.();
      });

      btnSaveToken?.addEventListener('click', async () => {
        const token = tokenInput?.value.trim();
        if (!token) return;
        btnSaveToken.disabled = true;
        if (loginStatus) {
          loginStatus.textContent = translate(this._lang || 'en', 'deploy.connecting');
          loginStatus.className = 'login-status';
        }
        try {
          const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
          if (loginStatus) {
            loginStatus.textContent = translate(this._lang || 'en', 'deploy.connectedAs').replace('{name}', user?.organizations?.[0]?.name ?? user?.userId ?? 'user');
            loginStatus.className = 'login-status connected';
          }
          this._setDeployAuth(true);
          this._loadProjects();
        } catch (e: any) {
          if (loginStatus) {
            loginStatus.textContent = translate(this._lang || 'en', 'deploy.loginFailed').replace('{msg}', String(e?.message ?? e));
            loginStatus.className = 'login-status disconnected';
          }
          this._setDeployAuth(false);
        } finally {
          btnSaveToken.disabled = false;
        }
      });

      btnRefresh?.addEventListener('click', () => {
        this._projectsRestLoaded = false;
        this._loadProjects();
      });

      // Check deploy readiness: project selected + build exists
      this._checkDeployBuild = async () => {
        const pid = projectHidden?.value ?? '';
        const newName = projectNameInput?.value.trim() ?? '';
        const hasProject = pid && (pid !== '__new__' || newName);
        if (!hasProject) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = translate(this._lang || 'en', 'deploy.selectProjectFirst'); }
          if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.selectProject');
          return;
        }
        if (pid === '__new__' && newName) {
          const duplicate = this._projectsList?.find((p: any) => p.name.toLowerCase() === newName.toLowerCase());
          if (duplicate) {
            if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = translate(this._lang || 'en', 'deploy.projectNameExists'); }
            if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.projectExists').replace('{name}', duplicate.name);
            return;
          }
        }
        const name = deployNameInput?.value.trim() ?? '';
        if (!name) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = translate(this._lang || 'en', 'deploy.enterDeployNameTitle'); }
          if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.enterDeployName');
          return;
        }
        const buildPath = buildPathInput?.value.trim() ?? '';
        const network = networkSel?.value ?? '';
        if (!buildPath || !network) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = translate(this._lang || 'en', 'deploy.selectNetworkBuildTitle'); }
          if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.selectNetworkBuild');
          return;
        }
        const fullPath = buildPath + '/' + network;
        try {
          const exists = await Editor.Message.request('plbx-cocos-extension', 'check-path-exists', fullPath);
          if (btnDeploy) { btnDeploy.disabled = !exists; btnDeploy.title = exists ? '' : translate(this._lang || 'en', 'deploy.buildNotFoundTitle'); }
          if (deployStatus) deployStatus.textContent = exists ? '' : translate(this._lang || 'en', 'deploy.buildNotFound').replace('{path}', fullPath);
        } catch {
          if (btnDeploy) btnDeploy.disabled = false;
          if (deployStatus) deployStatus.textContent = '';
        }
      };

      // Moloco CDN card: visible only when a molocoV2 launcher-payload build
      // exists on disk (outputDir/molocoV2/payload.js).
      this._checkMolocoCdnCard = async () => {
        const card = this.$.molocoCdnCard as HTMLElement | null;
        if (!card) return;
        try {
          const s = await Editor.Message.request('plbx-cocos-extension', 'get-settings');
          const path = (s?.outputDir || 'build/plbx-html') + '/molocoV2/payload.js';
          const exists = await Editor.Message.request('plbx-cocos-extension', 'check-path-exists', path);
          card.style.display = exists ? '' : 'none';
          if (exists) {
            // Populate credentials: API key is global (secret), Ad Account ID per-project.
            const keyEl = this.$.molocoApiKey as HTMLInputElement | null;
            const accEl = this.$.molocoAdAccount as HTMLInputElement | null;
            if (keyEl && !keyEl.value) {
              keyEl.value = (await Editor.Message.request('plbx-cocos-extension', 'get-moloco-api-key')) || '';
            }
            if (accEl && !accEl.value) accEl.value = s?.molocoAdAccountId || '';
            // Launcher metadata, prefilled with the effective defaults the
            // packager would use (provider "Playbox", title = project name).
            const provEl = this.$.molocoAssetProvider as HTMLInputElement | null;
            const titleEl = this.$.molocoAssetTitle as HTMLInputElement | null;
            if (provEl && !provEl.value) provEl.value = s?.molocoAssetProvider || 'Playbox';
            if (titleEl && !titleEl.value) titleEl.value = s?.molocoAssetTitle || s?.projectName || '';
          }
        } catch {
          card.style.display = 'none';
        }
      };

      // Launcher metadata is consumed at PACKAGE time (not upload) — persist on
      // edit so the next Pack All picks it up without extra clicks.
      const provEl = this.$.molocoAssetProvider as HTMLInputElement | null;
      provEl?.addEventListener('change', () => {
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { molocoAssetProvider: provEl.value.trim() }).catch(() => {});
      });
      const titleEl = this.$.molocoAssetTitle as HTMLInputElement | null;
      titleEl?.addEventListener('change', () => {
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { molocoAssetTitle: titleEl.value.trim() }).catch(() => {});
      });

      const btnCdn = this.$.btnMolocoCdn as HTMLButtonElement | null;
      btnCdn?.addEventListener('click', async () => {
        const statusEl = this.$.molocoCdnStatus as HTMLElement | null;
        const t = (k: string) => translate(this._lang || 'en', k);
        btnCdn.disabled = true;
        if (statusEl) statusEl.textContent = t('package.molocoUploading');
        try {
          // Persist credentials from the card before uploading.
          const keyEl = this.$.molocoApiKey as HTMLInputElement | null;
          const accEl = this.$.molocoAdAccount as HTMLInputElement | null;
          await Editor.Message.request('plbx-cocos-extension', 'save-moloco-api-key', keyEl?.value?.trim() || '');
          await Editor.Message.request('plbx-cocos-extension', 'save-settings', { molocoAdAccountId: accEl?.value?.trim() || '' });
          const res = await Editor.Message.request('plbx-cocos-extension', 'upload-moloco-cdn');
          if (res?.ok) {
            if (statusEl) statusEl.textContent = t('package.molocoUploaded').replace('{url}', res.assetUrl || '');
          } else {
            const errKey =
              res?.error === 'no_api_key' ? 'package.molocoNoKey' :
              res?.error === 'no_ad_account_id' ? 'package.molocoNoAccount' :
              res?.error === 'no_payload' ? 'package.molocoNoPayload' : 'package.molocoFailed';
            if (statusEl) statusEl.textContent = t(errKey).replace('{msg}', res?.detail || '');
          }
        } catch (e: any) {
          if (statusEl) statusEl.textContent = t('package.molocoFailed').replace('{msg}', String(e?.message ?? e));
        } finally {
          btnCdn.disabled = false;
        }
      });

      networkSel?.addEventListener('change', () => this._checkDeployBuild?.());
      buildPathInput?.addEventListener('change', () => this._checkDeployBuild?.());
      // Initial check after settings load
      setTimeout(() => { this._checkDeployBuild?.(); this._checkMolocoCdnCard?.(); }, 500);

      btnDeploy?.addEventListener('click', async () => {
        const projectId   = projectHidden?.value;
        const projectSlug = projectHidden?.dataset?.slug ?? '';
        const name        = deployNameInput?.value.trim();
        const buildPath   = buildPathInput?.value.trim();
        const network     = networkSel?.value;
        const projectName = projectNameInput?.value.trim();
        const orientations = Array.from(
          (this.$.contentDeploy as HTMLElement | null)?.querySelectorAll('input[name="deploy-orientation"]:checked') ?? []
        ).map((cb: any) => (cb as HTMLInputElement).value);

        if (!projectId || projectId === '__new__' && !projectName) {
          if (deployStatus) deployStatus.textContent = projectId === '__new__' ? translate(this._lang || 'en', 'deploy.enterProjectName') : translate(this._lang || 'en', 'deploy.selectProject');
          return;
        }
        if (!name)      { if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.enterDeployName'); return; }
        if (!buildPath) { if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.enterBuildPath');  return; }
        if (!orientations.length) { if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.selectOrientation'); return; }

        if (projectId === '__new__') {
          const looksLikePath = projectName && /[\\/]|^[A-Za-z]:/.test(projectName);
          const detail = looksLikePath
            ? `The name "${projectName}" looks like a file path. A new project with this exact name will be created on plbx.ai. Continue?`
            : `No project named "${projectName}" exists yet. A new project will be created on plbx.ai. Continue?`;
          const dlg = await Editor.Dialog.info('Create new project?', {
            detail,
            buttons: ['Create', 'Cancel'],
            default: 0,
            cancel: 1,
          }).catch(() => null);
          if (!dlg || dlg.response !== 0) {
            if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.cancelled');
            return;
          }
        }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          deploymentName: name,
          deployProjectId: projectId === '__new__' ? '' : projectId,
          defaultDeployNetwork: network,
          projectName,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        if (btnDeploy) btnDeploy.disabled = true;
        if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.deploying');
        if (resultDiv) resultDiv.style.display = 'none';

        // Poll deploy progress from main process every 500ms
        const progressTimer = setInterval(async () => {
          try {
            const p = await Editor.Message.request('plbx-cocos-extension', 'get-deploy-progress');
            if (!p || !deployStatus) return;
            if (p.stage === 'uploading') {
              deployStatus.textContent = translate(this._lang || 'en', 'deploy.uploadingDetail').replace('{detail}', p.detail);
            } else if (p.stage === 'finalizing') {
              deployStatus.textContent = translate(this._lang || 'en', 'deploy.finalizing');
            }
          } catch {}
        }, 500);

        try {
          const networkBuildPath = buildPath + '/' + network;
          const result = await Editor.Message.request('plbx-cocos-extension', 'deploy', {
            projectId: projectId === '__new__' ? undefined : projectId,
            projectSlug: projectId !== '__new__' ? projectSlug : undefined,
            projectName: projectId === '__new__' ? projectName : undefined,
            name,
            buildPath: networkBuildPath,
            orientations,
          });
          const url = result?.publicUrl ?? result?.shareUrl ?? '';
          if (resultUrl) {
            resultUrl.textContent = url || 'Deployed successfully';
            if (url) {
              resultUrl.style.cursor = 'pointer';
              resultUrl.onclick = () => { window.open(url, '_blank'); };
            }
          }
          if (resultDiv) resultDiv.style.display = 'block';
          if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'deploy.done');
        } catch (e: any) {
          if (deployStatus) deployStatus.textContent = translate(this._lang || 'en', 'status.error').replace('{msg}', String(e?.message ?? e));
        } finally {
          clearInterval(progressTimer);
          if (btnDeploy) btnDeploy.disabled = false;
        }
      });

      btnCopyUrl?.addEventListener('click', () => {
        const url = resultUrl?.textContent ?? '';
        if (url && url !== '—') {
          navigator.clipboard?.writeText(url).catch((e: any) => { console.warn('[plbx]', e); });
        }
      });
    },

    _setDeployAuth(this: any, authenticated: boolean) {
      const body = this.$.deployBody as HTMLElement | null;
      if (body) body.style.display = authenticated ? '' : 'none';
    },

    async _checkLoginStatus(this: any, token: string, statusEl: HTMLElement) {
      try {
        const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
        if (statusEl) {
          statusEl.textContent = translate(this._lang || 'en', 'deploy.connectedAs').replace('{name}', user?.organizations?.[0]?.name ?? user?.userId ?? 'user');
          statusEl.className = 'login-status connected';
        }
        this._setDeployAuth(true);
        this._loadProjects();
      } catch {
        if (statusEl) {
          statusEl.textContent = translate(this._lang || 'en', 'settings.tokenSaved');
          statusEl.className = 'login-status';
        }
        this._setDeployAuth(false);
      }
    },

    /** Resolves true when the list is loaded (or was superseded by a newer
     *  load), false when the request failed. Callers use that to decide whether
     *  a retry is still allowed. */
    async _loadProjects(this: any, all?: boolean): Promise<boolean> {
      const projectHidden = this.$.deployProject as HTMLInputElement;
      const projectInput  = this.$.deployProjectInput as HTMLInputElement;
      if (!projectHidden) return false;
      // Two loads can be in flight — the tab opens with page one while the user
      // is already typing, which starts a full walk. Without a generation the
      // slower reply wins, and a late page one would overwrite the full list
      // with 50 rows while the "already walked" guard stays set.
      const generation = (this._projectsGeneration = (this._projectsGeneration ?? 0) + 1);
      try {
        const projects = await Editor.Message.request('plbx-cocos-extension', 'plbx-list-projects', all);
        if (generation !== this._projectsGeneration) return true;
        const list = Array.isArray(projects) ? projects : projects?.projects ?? projects?.data ?? [];
        // Assume more exist unless the API said otherwise — an older build that
        // reports no total must not look like a complete catalogue.
        this._projectsComplete = projects?.complete === true;
        this._projectsList = list.map((p: any) => ({
          id:   p.id ?? p.projectId ?? '',
          slug: p.slug ?? '',
          name: p.name ?? p.id ?? '—',
        }));

        // Restore saved project selection
        const settings = await Editor.Message.request('plbx-cocos-extension', 'get-settings').catch(() => null);
        if (settings?.deployProjectId) {
          const saved = this._projectsList.find((p: any) => p.id === settings.deployProjectId);
          if (saved) {
            projectHidden.value = saved.id;
            projectHidden.dataset.slug = saved.slug;
            if (projectInput) projectInput.value = saved.name;
            this._loadDeployments(saved.slug);
          } else if (!all && !this._projectsComplete) {
            // Saved project sits past the first page — a project nobody has
            // touched in a while is exactly the case, since rows come back
            // newest-first. Pull the rest so the field restores as before.
            this._projectsRestLoaded = true;
            if (!(await this._loadProjects(true))) this._projectsRestLoaded = false;
          }
        }
        return true;
      } catch (e: any) {
        console.error('[plbx] loadProjects error:', e?.message ?? e);
        return false;
      }
    },

    async _loadDeployments(this: any, projectSlug: string) {
      const container = this.$.deployExisting as HTMLElement;
      const list = this.$.deployExistingList as HTMLElement;
      const deployNameInput = this.$.deployName as HTMLInputElement;
      if (!container || !list) return;

      if (!projectSlug) {
        container.style.display = 'none';
        return;
      }

      try {
        const deps = await Editor.Message.request('plbx-cocos-extension', 'plbx-list-deployments', projectSlug);
        if (!deps?.length) {
          container.style.display = 'none';
          return;
        }

        while (list.firstChild) list.removeChild(list.firstChild);

        for (const d of deps) {
          const row = document.createElement('div');
          row.className = 'deploy-existing-item';
          row.title = d.publicUrl || '';

          const slug = document.createElement('span');
          slug.className = 'dep-slug';
          slug.textContent = d.slug;

          const status = document.createElement('span');
          status.className = 'dep-status' + (d.status !== 'ready' ? ' uploading' : '');
          status.textContent = d.status;

          const size = document.createElement('span');
          size.className = 'dep-size';
          size.textContent = d.bundleSizeBytes ? (d.bundleSizeBytes / 1024 / 1024).toFixed(1) + ' MB' : '—';

          const date = document.createElement('span');
          date.className = 'dep-date';
          date.textContent = d.deployedAt?.substring(0, 10) ?? '';

          row.appendChild(slug);
          row.appendChild(status);
          row.appendChild(size);
          row.appendChild(date);

          row.addEventListener('click', () => {
            if (deployNameInput) deployNameInput.value = d.slug;
            this._checkDeployBuild?.();
          });

          list.appendChild(row);
        }

        container.style.display = '';
      } catch {
        container.style.display = 'none';
      }
    },
  },
});
