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

export const PanelDefinition = Editor.Panel.define({
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
  },

  ready() {
    // ---- Tab switching ----
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

    // ---- Wire each tab ----
    this._initBuildReport();
    this._initCompress();
    this._initPackage();
    this._initDeploy();
  },

  // ==========================================================================
  // BUILD REPORT TAB
  // ==========================================================================
  _reportData: null as any,

  _initBuildReport() {
    const btnAnalyze  = document.getElementById('btn-analyze') as HTMLButtonElement;
    const btnSortSize = document.getElementById('btn-sort-size') as HTMLButtonElement;
    const btnSortName = document.getElementById('btn-sort-name') as HTMLButtonElement;
    const scanStatus  = document.getElementById('scan-status') as HTMLSpanElement;

    let sortKey: 'sourceSize' | 'buildSize' | 'name' = 'buildSize';

    btnAnalyze?.addEventListener('click', async () => {
      btnAnalyze.disabled = true;
      scanStatus.textContent = 'Scanning…';
      try {
        const report = await Editor.Message.request('plbx-cocos-extension', 'scan-assets');
        this._reportData = report;
        this._renderReport(report, sortKey);
        scanStatus.textContent = '';
        // populate compress tab with same data
        this._populateCompressTable(report);
      } catch (e: any) {
        scanStatus.textContent = 'Error: ' + (e?.message || e);
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

  _renderReport(report: any, sortKey: string) {
    const summary  = document.getElementById('report-summary')!;
    const tbody    = document.getElementById('report-tbody')!;
    const countEl  = document.getElementById('summary-count')!;
    const srcEl    = document.getElementById('summary-source-size')!;
    const buildEl  = document.getElementById('summary-build-size')!;
    const imgEl    = document.getElementById('summary-images')!;
    const audioEl  = document.getElementById('summary-audio')!;

    const assets: any[] = report?.assets ?? [];

    // Sort
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

    // Build rows
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

  // ==========================================================================
  // COMPRESS TAB
  // ==========================================================================
  _initCompress() {
    const qualitySlider  = document.getElementById('compress-quality') as HTMLInputElement;
    const qualityVal     = document.getElementById('compress-quality-val') as HTMLSpanElement;
    const ffmpegStatus   = document.getElementById('ffmpeg-status') as HTMLSpanElement;
    const btnCompressAll = document.getElementById('btn-compress-all') as HTMLButtonElement;

    // Quality slider live update
    qualitySlider?.addEventListener('input', () => {
      qualityVal.textContent = qualitySlider.value;
    });

    // Presets
    document.querySelectorAll<HTMLButtonElement>('.btn-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const formatSel = document.getElementById('compress-format') as HTMLSelectElement;
        switch (btn.dataset.preset) {
          case 'web':
            formatSel.value = 'webp';
            qualitySlider.value = '80';
            break;
          case 'max':
            formatSel.value = 'png';
            qualitySlider.value = '100';
            break;
          case 'fast':
            formatSel.value = 'jpeg';
            qualitySlider.value = '75';
            break;
          case 'high':
            formatSel.value = 'webp';
            qualitySlider.value = '50';
            break;
        }
        qualityVal.textContent = qualitySlider.value;
      });
    });

    // Check ffmpeg availability
    Editor.Message.request('plbx-cocos-extension', 'check-ffmpeg').then((ok: boolean) => {
      if (ffmpegStatus) {
        ffmpegStatus.textContent = ok
          ? 'FFmpeg: available (audio compression enabled)'
          : 'FFmpeg: not found (audio compression disabled)';
        ffmpegStatus.style.color = ok ? '#4caf50' : '#ff9800';
      }
    }).catch(() => {});

    // Compress all
    btnCompressAll?.addEventListener('click', () => {
      const format  = (document.getElementById('compress-format') as HTMLSelectElement).value;
      const quality = parseInt((document.getElementById('compress-quality') as HTMLInputElement).value, 10);
      this._compressAll(format, quality);
    });
  },

  _populateCompressTable(report: any) {
    const tbody = document.getElementById('compress-tbody')!;
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
        const format  = (document.getElementById('compress-format') as HTMLSelectElement).value;
        const quality = parseInt((document.getElementById('compress-quality') as HTMLInputElement).value, 10);
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

  async _compressSingle(asset: any, format: string, quality: number, tdComp: HTMLElement, tdSav: HTMLElement, tdStatus: HTMLElement, btn: HTMLButtonElement) {
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
        result = await Editor.Message.request('plbx-cocos-extension', 'compress-audio', asset.path, audioFormat, quality);
      } else {
        result = await Editor.Message.request('plbx-cocos-extension', 'compress-image', asset.path, format, quality);
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

  _compressAll(format: string, quality: number) {
    const rows = document.querySelectorAll<HTMLTableRowElement>('#compress-tbody tr[id^="compress-row-"]');
    for (const row of Array.from(rows)) {
      const btn = row.querySelector<HTMLButtonElement>('button');
      if (btn) btn.click();
    }
  },

  // ==========================================================================
  // PACKAGE TAB
  // ==========================================================================
  _initPackage() {
    const grid          = document.getElementById('network-grid')!;
    const btnBuildAll   = document.getElementById('btn-build-all') as HTMLButtonElement;
    const btnOpenOutput = document.getElementById('btn-open-output') as HTMLButtonElement;
    const pkgStatus     = document.getElementById('pkg-status') as HTMLSpanElement;

    // Populate network checkboxes
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
    }).catch(() => {
      pkgStatus.textContent = 'Could not load networks';
    });

    // Load saved settings
    Editor.Message.request('plbx-cocos-extension', 'get-settings').then((settings: any) => {
      const iosInput     = document.getElementById('pkg-store-ios') as HTMLInputElement;
      const androidInput = document.getElementById('pkg-store-android') as HTMLInputElement;
      if (iosInput)     iosInput.value     = settings?.storeUrlIos ?? '';
      if (androidInput) androidInput.value = settings?.storeUrlAndroid ?? '';
      const ori = settings?.orientation ?? 'portrait';
      const radioEl = document.querySelector<HTMLInputElement>(`input[name="orientation"][value="${ori}"]`);
      if (radioEl) radioEl.checked = true;
    }).catch(() => {});

    btnBuildAll?.addEventListener('click', async () => {
      const buildDir  = (document.getElementById('pkg-build-dir') as HTMLInputElement).value.trim();
      const outputDir = (document.getElementById('pkg-output-dir') as HTMLInputElement).value.trim();
      const storeIos  = (document.getElementById('pkg-store-ios') as HTMLInputElement).value.trim();
      const storeAnd  = (document.getElementById('pkg-store-android') as HTMLInputElement).value.trim();
      const orientation = (document.querySelector<HTMLInputElement>('input[name="orientation"]:checked')?.value ?? 'portrait') as any;

      const selected = Array.from(
        document.querySelectorAll<HTMLInputElement>('input[name="network"]:checked')
      ).map(cb => cb.value);

      if (!buildDir)        { pkgStatus.textContent = 'Set build directory first';    return; }
      if (!outputDir)       { pkgStatus.textContent = 'Set output directory first';   return; }
      if (!selected.length) { pkgStatus.textContent = 'Select at least one network'; return; }

      // Persist
      await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
        selectedNetworks: selected,
        storeUrlIos: storeIos,
        storeUrlAndroid: storeAnd,
        orientation,
      }).catch(() => {});

      btnBuildAll.disabled = true;
      pkgStatus.textContent = 'Building…';

      const config = { storeUrlIos: storeIos, storeUrlAndroid: storeAnd, orientation };
      try {
        const results = await Editor.Message.request('plbx-cocos-extension', 'package-networks', buildDir, outputDir, selected, config);
        this._renderPackageResults(results);
        pkgStatus.textContent = 'Build complete';
      } catch (e: any) {
        pkgStatus.textContent = 'Error: ' + (e?.message ?? e);
      } finally {
        btnBuildAll.disabled = false;
      }
    });

    btnOpenOutput?.addEventListener('click', () => {
      const outputDir = (document.getElementById('pkg-output-dir') as HTMLInputElement).value.trim();
      if (outputDir) {
        Editor.Message.send('shell', 'open-file', outputDir);
      }
    });
  },

  _renderPackageResults(results: any[]) {
    const tbody = document.getElementById('pkg-results-tbody')!;
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

  // ==========================================================================
  // DEPLOY TAB
  // ==========================================================================
  _initDeploy() {
    const tokenInput       = document.getElementById('deploy-token') as HTMLInputElement;
    const btnSaveToken     = document.getElementById('btn-save-token') as HTMLButtonElement;
    const loginStatus      = document.getElementById('login-status') as HTMLDivElement;
    const projectSel       = document.getElementById('deploy-project') as HTMLSelectElement;
    const btnRefresh       = document.getElementById('btn-refresh-projects') as HTMLButtonElement;
    const projectNameInput = document.getElementById('deploy-project-name') as HTMLInputElement;
    const deployNameInput  = document.getElementById('deploy-name') as HTMLInputElement;
    const networkSel       = document.getElementById('deploy-network') as HTMLSelectElement;
    const buildPathInput   = document.getElementById('deploy-build-path') as HTMLInputElement;
    const btnDeploy        = document.getElementById('btn-deploy') as HTMLButtonElement;
    const deployStatus     = document.getElementById('deploy-status') as HTMLSpanElement;
    const resultDiv        = document.getElementById('deploy-result') as HTMLDivElement;
    const resultUrl        = document.getElementById('deploy-result-url') as HTMLSpanElement;
    const btnCopyUrl       = document.getElementById('btn-copy-url') as HTMLButtonElement;

    // Load saved token and settings
    Promise.all([
      Editor.Message.request('plbx-cocos-extension', 'get-token'),
      Editor.Message.request('plbx-cocos-extension', 'get-settings'),
    ]).then(([token, settings]: [string, any]) => {
      if (token) {
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
    }).catch(() => {});

    // Save token + login
    btnSaveToken?.addEventListener('click', async () => {
      const token = tokenInput.value.trim();
      if (!token) return;
      btnSaveToken.disabled = true;
      loginStatus.textContent = 'Connecting…';
      loginStatus.className = 'login-status';
      try {
        const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
        loginStatus.textContent = 'Connected as ' + (user?.email ?? user?.name ?? 'user');
        loginStatus.className = 'login-status connected';
        this._loadProjects(projectSel);
      } catch (e: any) {
        loginStatus.textContent = 'Login failed: ' + (e?.message ?? e);
        loginStatus.className = 'login-status disconnected';
      } finally {
        btnSaveToken.disabled = false;
      }
    });

    // Refresh project list
    btnRefresh?.addEventListener('click', () => this._loadProjects(projectSel));

    // Deploy
    btnDeploy?.addEventListener('click', async () => {
      const projectId   = projectSel.value;
      const name        = deployNameInput.value.trim();
      const buildPath   = buildPathInput.value.trim();
      const network     = networkSel.value;
      const projectName = projectNameInput.value.trim();

      if (!projectId) { deployStatus.textContent = 'Select a project';        return; }
      if (!name)      { deployStatus.textContent = 'Enter a deployment name'; return; }
      if (!buildPath) { deployStatus.textContent = 'Enter build path';        return; }

      // Persist
      await Editor.Message.request('plbx-cocos-extension', 'save-settings', {
        deploymentName: name,
        defaultDeployNetwork: network,
        projectName,
      }).catch(() => {});

      btnDeploy.disabled = true;
      deployStatus.textContent = 'Deploying…';
      resultDiv.style.display = 'none';

      try {
        const result = await Editor.Message.request('plbx-cocos-extension', 'deploy', {
          projectId,
          name,
          entryPoint: 'index.html',
          files: [],
          buildPath,
        });
        const url = result?.url ?? result?.deploymentUrl ?? '';
        resultUrl.textContent = url || 'Deployed successfully';
        resultDiv.style.display = 'block';
        deployStatus.textContent = 'Done';
      } catch (e: any) {
        deployStatus.textContent = 'Error: ' + (e?.message ?? e);
      } finally {
        btnDeploy.disabled = false;
      }
    });

    // Copy URL
    btnCopyUrl?.addEventListener('click', () => {
      const url = resultUrl.textContent ?? '';
      if (url && url !== '—') {
        navigator.clipboard?.writeText(url).catch(() => {});
      }
    });
  },

  async _checkLoginStatus(token: string, statusEl: HTMLElement, projectSel: HTMLSelectElement) {
    try {
      const user = await Editor.Message.request('plbx-cocos-extension', 'plbx-login', token);
      statusEl.textContent = 'Connected as ' + (user?.email ?? user?.name ?? 'user');
      statusEl.className = 'login-status connected';
      this._loadProjects(projectSel);
    } catch {
      statusEl.textContent = 'Token saved (not verified)';
      statusEl.className = 'login-status';
    }
  },

  async _loadProjects(selectEl: HTMLSelectElement) {
    if (!selectEl) return;
    try {
      const projects = await Editor.Message.request('plbx-cocos-extension', 'plbx-list-projects');
      // Remove all options except placeholder
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

  close() {
    // cleanup if needed
  },
});
