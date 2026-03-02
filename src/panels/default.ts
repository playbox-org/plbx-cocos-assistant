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

    // Build Report tab
    btnAnalyze:       '#btn-analyze',
    btnSortSize:      '#btn-sort-size',
    btnSortName:      '#btn-sort-name',
    scanStatus:       '#scan-status',
    reportSummary:    '#report-summary',
    reportTbody:      '#report-tbody',
    summaryCount:     '#summary-count',
    summarySourceSize:'#summary-source-size',
    summaryBuildSize: '#summary-build-size',
    summaryImages:    '#summary-images',
    summaryAudio:     '#summary-audio',

    // Compress tab
    compressQuality:  '#compress-quality',
    compressQualityVal:'#compress-quality-val',
    ffmpegStatus:     '#ffmpeg-status',
    btnCompressAll:   '#btn-compress-all',
    compressFormat:   '#compress-format',
    compressTbody:    '#compress-tbody',

    // Package tab
    networkGrid:      '#network-grid',
    btnBuildAll:      '#btn-build-all',
    btnOpenOutput:    '#btn-open-output',
    pkgStatus:        '#pkg-status',
    pkgStoreIos:      '#pkg-store-ios',
    pkgStoreAndroid:  '#pkg-store-android',
    pkgBuildDir:      '#pkg-build-dir',
    pkgOutputDir:     '#pkg-output-dir',
    pkgResultsTbody:  '#pkg-results-tbody',

    // Deploy tab
    deployToken:       '#deploy-token',
    btnSaveToken:      '#btn-save-token',
    loginStatus:       '#login-status',
    deployProject:     '#deploy-project',
    btnRefreshProjects:'#btn-refresh-projects',
    deployProjectName: '#deploy-project-name',
    deployName:        '#deploy-name',
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
    };

    tabs.forEach((t, i) => {
      if (t.btn) t.btn.addEventListener('click', () => activateTab(i));
    });
    activateTab(0);

    this._reportData = null;

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
      const btnSortSize = this.$.btnSortSize as HTMLButtonElement;
      const btnSortName = this.$.btnSortName as HTMLButtonElement;
      const scanStatus  = this.$.scanStatus as HTMLSpanElement;

      let sortKey: 'sourceSize' | 'buildSize' | 'name' = 'buildSize';

      btnAnalyze?.addEventListener('click', async () => {
        btnAnalyze.disabled = true;
        if (scanStatus) scanStatus.textContent = 'Scanning…';
        try {
          const report = await Editor.Message.request('plbx-cocos-extension', 'scan-assets');
          this._reportData = report;
          this._renderReport(report, sortKey);
          if (scanStatus) scanStatus.textContent = '';
          this._populateCompressTable(report);
        } catch (e: any) {
          if (scanStatus) scanStatus.textContent = 'Error: ' + (e?.message || e);
        } finally {
          btnAnalyze.disabled = false;
        }
      });

      btnSortSize?.addEventListener('click', () => {
        sortKey = 'buildSize';
        if (this._reportData) this._renderReport(this._reportData, sortKey);
      });

      btnSortName?.addEventListener('click', () => {
        sortKey = 'name';
        if (this._reportData) this._renderReport(this._reportData, sortKey);
      });
    },

    _renderReport(this: any, report: any, sortKey: string) {
      const summary  = this.$.reportSummary;
      const tbody    = this.$.reportTbody;
      const countEl  = this.$.summaryCount;
      const srcEl    = this.$.summarySourceSize;
      const buildEl  = this.$.summaryBuildSize;
      const imgEl    = this.$.summaryImages;
      const audioEl  = this.$.summaryAudio;

      if (!summary || !tbody || !countEl || !srcEl || !buildEl || !imgEl || !audioEl) return;

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

      const sorted = [...assets].sort((a, b) => {
        if (sortKey === 'name') return (a.name || '').localeCompare(b.name || '');
        const av = sortKey === 'buildSize' ? (a.buildSize ?? a.sourceSize ?? 0) : (a.sourceSize ?? 0);
        const bv = sortKey === 'buildSize' ? (b.buildSize ?? b.sourceSize ?? 0) : (b.sourceSize ?? 0);
        return bv - av;
      });

      const totalSrc   = assets.reduce((s, a) => s + (a.sourceSize ?? 0), 0);
      const totalBuild = assets.reduce((s, a) => s + (a.buildSize ?? a.sourceSize ?? 0), 0);
      const images = assets.filter(a => a.type === 'image' || /\.(png|jpg|jpeg|webp|avif|gif)$/i.test(a.name ?? '')).length;
      const audio  = assets.filter(a => a.type === 'audio' || /\.(mp3|ogg|wav|m4a)$/i.test(a.name ?? '')).length;

      countEl.textContent  = String(assets.length);
      srcEl.textContent    = fmt(totalSrc);
      buildEl.textContent  = fmt(totalBuild);
      imgEl.textContent    = String(images);
      audioEl.textContent  = String(audio);
      summary.style.display = 'flex';

      clearChildren(tbody);
      if (sorted.length === 0) {
        const tr = document.createElement('tr');
        const td = document.createElement('td');
        td.colSpan = 5;
        const es = document.createElement('div');
        es.className = 'empty-state';
        es.textContent = 'No assets found';
        td.appendChild(es);
        tr.appendChild(td);
        tbody.appendChild(tr);
        return;
      }

      for (const asset of sorted) {
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
        tdBuild.textContent = fmt(asset.buildSize ?? asset.sourceSize);

        const tdExt = document.createElement('td');
        tdExt.className = 'col-type';
        const ext = (asset.name ?? '').split('.').pop() ?? '';
        tdExt.textContent = ext ? '.' + ext : '—';

        tr.appendChild(tdName);
        tr.appendChild(tdType);
        tr.appendChild(tdSrc);
        tr.appendChild(tdBuild);
        tr.appendChild(tdExt);
        tbody.appendChild(tr);
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
    },

    _populateCompressTable(this: any, report: any) {
      const tbody = this.$.compressTbody;
      if (!tbody) return;
      const assets: any[] = (report?.assets ?? []).filter((a: any) => {
        const name = (a.name ?? '').toLowerCase();
        return /\.(png|jpg|jpeg|webp|avif|gif|mp3|ogg|wav|m4a)$/.test(name);
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
      const grid          = this.$.networkGrid;
      const btnBuildAll   = this.$.btnBuildAll as HTMLButtonElement;
      const btnOpenOutput = this.$.btnOpenOutput as HTMLButtonElement;
      const pkgStatus     = this.$.pkgStatus as HTMLSpanElement;

      if (!grid) return;

      Editor.Message.request('plbx-cocos-extension', 'get-networks').then((networks: any[]) => {
        clearChildren(grid);
        for (const net of networks) {
          const label = document.createElement('label');
          label.className = 'network-check-label';

          const cb = document.createElement('input');
          cb.type    = 'checkbox';
          cb.name    = 'network';
          cb.value   = net.id;
          cb.checked = ['ironsource', 'applovin', 'google', 'facebook', 'unity'].includes(net.id);
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
          grid.appendChild(label);
        }
      }).catch((e: any) => {
        console.warn('[plbx]', e);
        if (pkgStatus) pkgStatus.textContent = 'Could not load networks';
      });

      Editor.Message.request('plbx-cocos-extension', 'get-settings').then((settings: any) => {
        const iosInput     = this.$.pkgStoreIos as HTMLInputElement;
        const androidInput = this.$.pkgStoreAndroid as HTMLInputElement;
        if (iosInput)     iosInput.value     = settings?.storeUrlIos ?? '';
        if (androidInput) androidInput.value = settings?.storeUrlAndroid ?? '';
        const ori = settings?.orientation ?? 'portrait';
        const radioEl = (this.$.contentPackage as HTMLElement | null)?.querySelector(`input[name="orientation"][value="${ori}"]`) as HTMLInputElement | null;
        if (radioEl) radioEl.checked = true;
      }).catch((e: any) => { console.warn('[plbx]', e); });

      btnBuildAll?.addEventListener('click', async () => {
        const buildDir  = (this.$.pkgBuildDir as HTMLInputElement)?.value.trim() ?? '';
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        const storeIos  = (this.$.pkgStoreIos as HTMLInputElement)?.value.trim() ?? '';
        const storeAnd  = (this.$.pkgStoreAndroid as HTMLInputElement)?.value.trim() ?? '';
        const orientation = (((this.$.contentPackage as HTMLElement | null)?.querySelector('input[name="orientation"]:checked') as HTMLInputElement | null)?.value ?? 'portrait') as any;

        const selected = Array.from(
          (this.$.networkGrid as HTMLElement | null)?.querySelectorAll('input[name="network"]:checked') ?? []
        ).map((cb: any) => (cb as HTMLInputElement).value);

        if (!buildDir)        { if (pkgStatus) pkgStatus.textContent = 'Set build directory first';    return; }
        if (!outputDir)       { if (pkgStatus) pkgStatus.textContent = 'Set output directory first';   return; }
        if (!selected.length) { if (pkgStatus) pkgStatus.textContent = 'Select at least one network'; return; }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          selectedNetworks: selected,
          storeUrlIos: storeIos,
          storeUrlAndroid: storeAnd,
          orientation,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        btnBuildAll.disabled = true;
        if (pkgStatus) pkgStatus.textContent = 'Building…';

        const config = { storeUrlIos: storeIos, storeUrlAndroid: storeAnd, orientation };
        try {
          const results = await Editor.Message.request('plbx-cocos-extension', 'package-networks', buildDir, outputDir, selected, config);
          this._renderPackageResults(results);
          if (pkgStatus) pkgStatus.textContent = 'Build complete';
        } catch (e: any) {
          if (pkgStatus) pkgStatus.textContent = 'Error: ' + (e?.message ?? e);
        } finally {
          btnBuildAll.disabled = false;
        }
      });

      btnOpenOutput?.addEventListener('click', () => {
        const outputDir = (this.$.pkgOutputDir as HTMLInputElement)?.value.trim() ?? '';
        if (outputDir) {
          Editor.Message.send('shell', 'open-file', outputDir);
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

      const maxSize = Math.max(...results.map(r => r.size ?? 0), 1);

      for (const r of results) {
        const tr = document.createElement('tr');

        const tdNet = document.createElement('td');
        tdNet.textContent = r.networkName ?? r.network ?? r.id ?? '—';

        const tdFmt = document.createElement('td');
        tdFmt.textContent = r.format ?? '—';

        const tdSize = document.createElement('td');
        tdSize.className = 'col-size size-bar-cell';
        tdSize.appendChild(document.createTextNode(fmt(r.size)));
        const barBg = document.createElement('div');
        barBg.className = 'size-bar-bg';
        const barFill = document.createElement('div');
        barFill.className = 'size-bar-fill' + (r.overLimit ? ' over-limit' : '');
        barFill.style.width = Math.round(((r.size ?? 0) / maxSize) * 100) + '%';
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
        } else if (r.overLimit) {
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
      const projectSel       = this.$.deployProject as HTMLSelectElement;
      const btnRefresh       = this.$.btnRefreshProjects as HTMLButtonElement;
      const projectNameInput = this.$.deployProjectName as HTMLInputElement;
      const deployNameInput  = this.$.deployName as HTMLInputElement;
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
          this._checkLoginStatus(token, loginStatus, projectSel);
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
            loginStatus.textContent = 'Connected as ' + (user?.email ?? user?.name ?? 'user');
            loginStatus.className = 'login-status connected';
          }
          this._loadProjects(projectSel);
        } catch (e: any) {
          if (loginStatus) {
            loginStatus.textContent = 'Login failed: ' + (e?.message ?? e);
            loginStatus.className = 'login-status disconnected';
          }
        } finally {
          btnSaveToken.disabled = false;
        }
      });

      btnRefresh?.addEventListener('click', () => this._loadProjects(projectSel));

      btnDeploy?.addEventListener('click', async () => {
        const projectId   = projectSel?.value;
        const name        = deployNameInput?.value.trim();
        const buildPath   = buildPathInput?.value.trim();
        const network     = networkSel?.value;
        const projectName = projectNameInput?.value.trim();

        if (!projectId) { if (deployStatus) deployStatus.textContent = 'Select a project';        return; }
        if (!name)      { if (deployStatus) deployStatus.textContent = 'Enter a deployment name'; return; }
        if (!buildPath) { if (deployStatus) deployStatus.textContent = 'Enter build path';        return; }

        await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
          deploymentName: name,
          defaultDeployNetwork: network,
          projectName,
        }).catch((e: any) => { console.warn('[plbx]', e); });

        if (btnDeploy) btnDeploy.disabled = true;
        if (deployStatus) deployStatus.textContent = 'Deploying…';
        if (resultDiv) resultDiv.style.display = 'none';

        try {
          const result = await Editor.Message.request('plbx-cocos-extension', 'deploy', {
            projectId,
            name,
            entryPoint: 'index.html',
            files: [], // TODO: populate with actual file descriptors from buildPath
            buildPath,
          });
          const url = result?.url ?? result?.deploymentUrl ?? '';
          if (resultUrl) resultUrl.textContent = url || 'Deployed successfully';
          if (resultDiv) resultDiv.style.display = 'block';
          if (deployStatus) deployStatus.textContent = 'Done';
        } catch (e: any) {
          if (deployStatus) deployStatus.textContent = 'Error: ' + (e?.message ?? e);
        } finally {
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

    async _checkLoginStatus(this: any, token: string, statusEl: HTMLElement, projectSel: HTMLSelectElement) {
      try {
        const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
        if (statusEl) {
          statusEl.textContent = 'Connected as ' + (user?.email ?? user?.name ?? 'user');
          statusEl.className = 'login-status connected';
        }
        this._loadProjects(projectSel);
      } catch {
        if (statusEl) {
          statusEl.textContent = 'Token saved (not verified)';
          statusEl.className = 'login-status';
        }
      }
    },

    async _loadProjects(this: any, selectEl: HTMLSelectElement) {
      if (!selectEl) return;
      try {
        const projects = await Editor.Message.request('plbx-cocos-extension', 'plbx-list-projects');
        while (selectEl.options.length > 1) selectEl.remove(1);
        for (const p of projects ?? []) {
          const opt = document.createElement('option');
          opt.value       = p.id ?? p.projectId ?? '';
          opt.textContent = p.name ?? p.id ?? '—';
          selectEl.appendChild(opt);
        }
      } catch {
        // silent — user may not be logged in yet
      }
    },
  },
});
