declare const Editor: any;

import { readFileSync } from 'fs';
import { join } from 'path';

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
    btnCompressAll:   '#btn-compress-all',
    compressFormat:   '#compress-format',
    compressTbody:    '#compress-tbody',

    // Package tab
    btnGenerateAdapter: '#btn-generate-adapter',
    networkGrid:      '#network-grid',
    networkGridMore:  '#network-grid-more',
    networkMoreWrap:  '#network-more-wrap',
    btnToggleMoreNets:'#btn-toggle-more-nets',
    btnBuildAll:      '#btn-build-all',
    btnPreview:       '#btn-preview',
    btnOpenOutput:    '#btn-open-output',
    pkgStatus:        '#pkg-status',
    pkgStoreIos:      '#pkg-store-ios',
    pkgStoreAndroid:  '#pkg-store-android',
    pkgBuildDir:      '#pkg-build-dir',
    pkgOutputDir:     '#pkg-output-dir',
    pkgResultsTbody:  '#pkg-results-tbody',
    pkgAutoPackage:   '#pkg-auto-package',
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

    this._initBuildReport();
    this._initCompress();
    this._initPackage();
    this._initDeploy();
    this._initPreview();
  },

  close() {},

  methods: {
    _initBuildReport(this: any) {
      const btnAnalyze  = this.$.btnAnalyze as HTMLButtonElement;
      const scanStatus  = this.$.scanStatus as HTMLSpanElement;

      this._reportSortKey = 'buildSize';
      this._reportSortAsc = false;

      btnAnalyze?.addEventListener('click', async () => {
        btnAnalyze.disabled = true;
        if (scanStatus) scanStatus.textContent = 'Scanning…';
        try {
          const report = await Editor.Message.request('plbx-cocos-extension', 'scan-assets-hybrid');
          this._reportData = report;
          this._renderReport(report, this._reportSortKey);
          if (scanStatus) scanStatus.textContent = '';
          this._populateCompressTable(report);
        } catch (e: any) {
          if (scanStatus) scanStatus.textContent = 'Error: ' + (e?.message || e);
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
        es.textContent = 'No assets found';
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
          tdBuild.title = 'Real size from build';
        } else {
          tdBuild.title = 'Estimated';
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
          tdStatus.title = 'Confirmed in build';
        } else if (status === 'predicted') {
          tdStatus.textContent = '~';
          tdStatus.style.color = '#ff9800';
          tdStatus.title = 'Predicted (referenced by scene)';
        } else {
          tdStatus.textContent = '○';
          tdStatus.style.color = '#999';
          tdStatus.title = 'Not used in build';
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
      if (bdTitle) bdTitle.textContent = `Build Details · ${fmt(total)}`;

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
      sectionLabel.textContent = 'Packed HTML per network';
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
          warn.textContent = '⚠ >5MB';
          row.appendChild(warn);
        }

        bdHtmls.appendChild(row);
      }
    },

    _initCompress(this: any) {
      const qualitySlider  = this.$.compressQuality as HTMLInputElement;
      const qualityVal     = this.$.compressQualityVal as HTMLSpanElement;
      const ffmpegStatus   = this.$.ffmpegStatus as HTMLSpanElement;
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
            ? 'FFmpeg: available (audio compression enabled)'
            : 'FFmpeg: not found (audio compression disabled)';
          ffmpegStatus.style.color = ok ? '#4caf50' : '#ff9800';
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
        es.textContent = 'No compressible assets found';
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
        btn.textContent = 'Compress';
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
      if (title) title.textContent = 'Preview: ' + (asset.name ?? '\u2014');

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
      if (origMeta) origMeta.textContent = 'Loading...';

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
        if (origMeta) origMeta.textContent = 'Failed to load';
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
      if (compMeta) compMeta.textContent = 'Compressing...';

      try {
        let result: any;
        if (isAudio) {
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio-preview', asset.file, format, quality);
        } else {
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
        if (compMeta) compMeta.textContent = 'Error: ' + (e?.message ?? e);
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
      if (applyBtn) { applyBtn.disabled = true; applyBtn.textContent = 'Applying...'; }

      try {
        let result: any;
        if (isAudio) {
          const audioFormat = format === 'mp3' || format === 'ogg' ? format : 'mp3';
          result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio', asset.file, audioFormat, quality);
        } else {
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
        if (applyBtn) { applyBtn.disabled = false; applyBtn.textContent = 'Apply'; }
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
        cb.addEventListener('change', () => label.classList.toggle('checked', cb.checked));

        const nameSpan = document.createElement('span');
        nameSpan.textContent = net.name ?? net.id;

        const fmtTag = document.createElement('span');
        fmtTag.className = 'network-format-tag';
        fmtTag.textContent = net.format ?? '';

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
        if (pkgStatus) pkgStatus.textContent = 'Could not load networks';
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
        templatePreview.textContent = 'Preview: ' + preview;

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
            input.placeholder = `Value for {${varName}}`;
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

      // --- Restore settings ---
      Editor.Message.request('plbx-cocos-extension', 'get-settings').then((settings: any) => {
        const iosInput     = this.$.pkgStoreIos as HTMLInputElement;
        const androidInput = this.$.pkgStoreAndroid as HTMLInputElement;
        const buildDirInput = this.$.pkgBuildDir as HTMLInputElement;
        const outputDirInput = this.$.pkgOutputDir as HTMLInputElement;
        const autoPackageCb = this.$.pkgAutoPackage as HTMLInputElement;

        if (iosInput)     iosInput.value     = settings?.storeUrlIos ?? '';
        if (androidInput) androidInput.value = settings?.storeUrlAndroid ?? '';
        if (buildDirInput && settings?.buildDir) buildDirInput.value = settings.buildDir;
        if (outputDirInput && settings?.outputDir) outputDirInput.value = settings.outputDir;
        if (autoPackageCb) autoPackageCb.checked = settings?.autoPackage !== false;

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

        // Restore selected networks
        if (settings?.selectedNetworks?.length) {
          const allCbs = contentPkg?.querySelectorAll('input[name="network"]');
          allCbs?.forEach((cb: any) => {
            const input = cb as HTMLInputElement;
            input.checked = settings.selectedNetworks.includes(input.value);
            input.closest('label')?.classList.toggle('checked', input.checked);
          });
        }

        // Check if builds already exist — show Validate button
        if (settings?.outputDir) {
          Editor.Message.request('plbx-cocos-extension', 'check-output-has-builds', settings.outputDir)
            .then((hasBuild: boolean) => {
              if (hasBuild && btnPreview) btnPreview.style.display = '';
            })
            .catch(() => {});
        }
      }).catch((e: any) => { console.warn('[plbx]', e); });

      // Save auto-package toggle on change
      (this.$.pkgAutoPackage as HTMLInputElement)?.addEventListener('change', () => {
        const checked = (this.$.pkgAutoPackage as HTMLInputElement)?.checked ?? true;
        Editor.Message.request('plbx-cocos-extension', 'save-settings', { autoPackage: checked })
          .catch((e: any) => { console.warn('[plbx]', e); });
      });

      // --- Build All ---
      btnBuildAll?.addEventListener('click', async () => {
        const buildDir  = (this.$.pkgBuildDir as HTMLInputElement)?.value.trim() ?? '';
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        const storeIos  = (this.$.pkgStoreIos as HTMLInputElement)?.value.trim() ?? '';
        const storeAnd  = (this.$.pkgStoreAndroid as HTMLInputElement)?.value.trim() ?? '';
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

        if (!buildDir)        { if (pkgStatus) pkgStatus.textContent = 'Set build directory first';    return; }
        if (!outputDir)       { if (pkgStatus) pkgStatus.textContent = 'Set output directory first';   return; }
        if (!selected.length) { if (pkgStatus) pkgStatus.textContent = 'Select at least one network'; return; }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          selectedNetworks: selected,
          storeUrlIos: storeIos,
          storeUrlAndroid: storeAnd,
          orientation,
          buildDir,
          outputDir,
          outputTemplate,
          templateVariables,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        btnBuildAll.disabled = true;
        if (pkgStatus) pkgStatus.textContent = 'Packing…';

        const config = { storeUrlIos: storeIos, storeUrlAndroid: storeAnd, orientation };
        try {
          const response = await Editor.Message.request(
            'plbx-cocos-extension', 'package-networks',
            buildDir, outputDir, selected, config, outputTemplate, templateVariables,
          );
          const results = Array.isArray(response) ? response : response?.results ?? [];
          this._renderPackageResults(results);
          if (pkgStatus) pkgStatus.textContent = 'Pack complete';
          if (btnPreview) btnPreview.style.display = '';
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = 'Error: ' + (e?.message ?? e);
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
          if (pkgStatus) pkgStatus.textContent = 'Error: ' + (e?.message ?? e);
        }
      });

      btnPreview?.addEventListener('click', async () => {
        try {
          btnPreview.disabled = true;
          const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
          const networkIds = Array.from(
            contentPkg?.querySelectorAll('input[name="network"]:checked') ?? []
          ).map((cb: any) => (cb as HTMLInputElement).value);
          if (!outputDir) { if (pkgStatus) pkgStatus.textContent = 'Set output directory first'; return; }
          if (!networkIds.length) { if (pkgStatus) pkgStatus.textContent = 'Select at least one network'; return; }
          const result = await Editor.Message.request('plbx-cocos-extension', 'start-preview', outputDir, networkIds);
          console.log('[plbx] Preview opened:', result.url);
          if (pkgStatus) pkgStatus.textContent = 'Preview: ' + result.url;
        } catch (err: any) {
          console.error('[plbx] Preview failed:', err.message || err);
          if (pkgStatus) pkgStatus.textContent = 'Preview error: ' + (err?.message ?? err);
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
            if (pkgStatus) pkgStatus.textContent = 'Created: ' + result.path.split('/').slice(-3).join('/');
          } else {
            if (pkgStatus) pkgStatus.textContent = 'Already exists: ' + result.path.split('/').slice(-3).join('/');
          }
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = 'Error: ' + (e?.message ?? e);
        } finally {
          btnGenAdapter.disabled = false;
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
        td.colSpan = 5;
        td.textContent = 'No results';
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
        const overLimit = !r.withinLimit || fileSize > (r.maxSize ?? Infinity);
        barFill.className = 'size-bar-fill' + (overLimit ? ' over-limit' : '');
        barFill.style.width = Math.round((fileSize / maxSize) * 100) + '%';
        barBg.appendChild(barFill);
        tdSize.appendChild(barBg);

        const tdLimit = document.createElement('td');
        tdLimit.className = 'col-size';
        tdLimit.textContent = fmt(r.maxSize ?? r.limit);

        const tdStatus = document.createElement('td');
        if (r.error) {
          const b = makeBadge('badge-fail', 'error');
          b.title = r.error;
          tdStatus.appendChild(b);
        } else if (overLimit) {
          tdStatus.appendChild(makeBadge('badge-warn', 'over limit'));
        } else {
          tdStatus.appendChild(makeBadge('badge-pass', 'pass'));
        }

        tr.appendChild(tdNet);
        tr.appendChild(tdFmt);
        tr.appendChild(tdSize);
        tr.appendChild(tdLimit);
        tr.appendChild(tdStatus);
        tbody.appendChild(tr);
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

      const clearDropdown = (el: HTMLElement) => {
        while (el.firstChild) el.removeChild(el.firstChild);
      };

      const renderDropdown = (filter: string) => {
        if (!projectDropdown) return;
        clearDropdown(projectDropdown);
        const q = filter.toLowerCase();
        const filtered = this._projectsList.filter((p: any) =>
          !q || p.name.toLowerCase().includes(q)
        );
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
        projectInput.placeholder = 'New project will be created';
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
        projectInput.placeholder = 'Search or select project...';
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
            deployNameHint.textContent = 'Non-Latin characters removed (only a-z, 0-9, dashes)';
          }
          setTimeout(() => { if (deployNameHint) { deployNameHint.textContent = ''; deployNameHint.style.color = ''; } }, 3000);
        }
        if (/[.]/.test(val)) {
          deployNameInput.value = val.replace(/\./g, '-');
          if (deployNameHint) {
            deployNameHint.style.color = '#e8a040';
            deployNameHint.textContent = 'Dots replaced with dashes (URL slug)';
          }
          setTimeout(() => { if (deployNameHint) { deployNameHint.textContent = ''; deployNameHint.style.color = ''; } }, 2000);
        }
        this._checkDeployBuild?.();
      });
      projectNameInput?.addEventListener('input', () => this._checkDeployBuild?.());

      btnSaveToken?.addEventListener('click', async () => {
        const token = tokenInput?.value.trim();
        if (!token) return;
        btnSaveToken.disabled = true;
        if (loginStatus) {
          loginStatus.textContent = 'Connecting…';
          loginStatus.className = 'login-status';
        }
        try {
          const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
          if (loginStatus) {
            loginStatus.textContent = 'Connected as ' + (user?.organizations?.[0]?.name ?? user?.userId ?? 'user');
            loginStatus.className = 'login-status connected';
          }
          this._setDeployAuth(true);
          this._loadProjects();
        } catch (e: any) {
          if (loginStatus) {
            loginStatus.textContent = 'Login failed: ' + (e?.message ?? e);
            loginStatus.className = 'login-status disconnected';
          }
          this._setDeployAuth(false);
        } finally {
          btnSaveToken.disabled = false;
        }
      });

      btnRefresh?.addEventListener('click', () => this._loadProjects());

      // Check deploy readiness: project selected + build exists
      this._checkDeployBuild = async () => {
        const pid = projectHidden?.value ?? '';
        const newName = projectNameInput?.value.trim() ?? '';
        const hasProject = pid && (pid !== '__new__' || newName);
        if (!hasProject) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = 'Select a project first'; }
          if (deployStatus) deployStatus.textContent = 'Select a project';
          return;
        }
        if (pid === '__new__' && newName) {
          const duplicate = this._projectsList?.find((p: any) => p.name.toLowerCase() === newName.toLowerCase());
          if (duplicate) {
            if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = 'Project with this name already exists'; }
            if (deployStatus) deployStatus.textContent = `Project "${duplicate.name}" already exists — select it from the list`;
            return;
          }
        }
        const name = deployNameInput?.value.trim() ?? '';
        if (!name) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = 'Enter a deployment name'; }
          if (deployStatus) deployStatus.textContent = 'Enter a deployment name';
          return;
        }
        const buildPath = buildPathInput?.value.trim() ?? '';
        const network = networkSel?.value ?? '';
        if (!buildPath || !network) {
          if (btnDeploy) { btnDeploy.disabled = true; btnDeploy.title = 'Select network and build path'; }
          if (deployStatus) deployStatus.textContent = 'Select network and build path';
          return;
        }
        const fullPath = buildPath + '/' + network;
        try {
          const exists = await Editor.Message.request('plbx-cocos-extension', 'check-path-exists', fullPath);
          if (btnDeploy) { btnDeploy.disabled = !exists; btnDeploy.title = exists ? '' : 'Build not found'; }
          if (deployStatus) deployStatus.textContent = exists ? '' : `Build not found: ${fullPath} — run Package first`;
        } catch {
          if (btnDeploy) btnDeploy.disabled = false;
          if (deployStatus) deployStatus.textContent = '';
        }
      };

      networkSel?.addEventListener('change', () => this._checkDeployBuild?.());
      buildPathInput?.addEventListener('change', () => this._checkDeployBuild?.());
      // Initial check after settings load
      setTimeout(() => this._checkDeployBuild?.(), 500);

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
          if (deployStatus) deployStatus.textContent = projectId === '__new__' ? 'Enter project name' : 'Select a project';
          return;
        }
        if (!name)      { if (deployStatus) deployStatus.textContent = 'Enter a deployment name'; return; }
        if (!buildPath) { if (deployStatus) deployStatus.textContent = 'Enter build path';        return; }
        if (!orientations.length) { if (deployStatus) deployStatus.textContent = 'Select at least one orientation'; return; }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          deploymentName: name,
          deployProjectId: projectId === '__new__' ? '' : projectId,
          defaultDeployNetwork: network,
          projectName,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        if (btnDeploy) btnDeploy.disabled = true;
        if (deployStatus) deployStatus.textContent = 'Deploying…';
        if (resultDiv) resultDiv.style.display = 'none';

        // Poll deploy progress from main process every 500ms
        const progressTimer = setInterval(async () => {
          try {
            const p = await Editor.Message.request('plbx-cocos-extension', 'get-deploy-progress');
            if (!p || !deployStatus) return;
            if (p.stage === 'uploading') {
              deployStatus.textContent = `Uploading ${p.detail}…`;
            } else if (p.stage === 'finalizing') {
              deployStatus.textContent = 'Finalizing…';
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
          if (deployStatus) deployStatus.textContent = 'Done';
        } catch (e: any) {
          if (deployStatus) deployStatus.textContent = 'Error: ' + (e?.message ?? e);
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
          statusEl.textContent = 'Connected as ' + (user?.organizations?.[0]?.name ?? user?.userId ?? 'user');
          statusEl.className = 'login-status connected';
        }
        this._setDeployAuth(true);
        this._loadProjects();
      } catch {
        if (statusEl) {
          statusEl.textContent = 'Token saved (not verified)';
          statusEl.className = 'login-status';
        }
        this._setDeployAuth(false);
      }
    },

    async _loadProjects(this: any) {
      const projectHidden = this.$.deployProject as HTMLInputElement;
      const projectInput  = this.$.deployProjectInput as HTMLInputElement;
      if (!projectHidden) return;
      try {
        const projects = await Editor.Message.request('plbx-cocos-extension', 'plbx-list-projects');
        const list = Array.isArray(projects) ? projects : projects?.projects ?? projects?.data ?? [];
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
          }
        }
      } catch (e: any) {
        console.error('[plbx] loadProjects error:', e?.message ?? e);
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
