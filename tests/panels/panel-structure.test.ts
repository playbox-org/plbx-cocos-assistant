/**
 * Panel structure tests: verify the extension panel files are correct
 * without requiring Cocos Creator runtime.
 *
 * Checks: file existence, export format, template IDs, CSS selectors,
 * i18n keys, package.json panel config consistency.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../..');
const DIST = join(ROOT, 'dist/panels/default.js');
const SRC = join(ROOT, 'src/panels/default.ts');
const TEMPLATE = join(ROOT, 'static/template/index.html');
const STYLE = join(ROOT, 'static/style/index.css');
const PKG = join(ROOT, 'package.json');
const I18N_EN = join(ROOT, 'i18n/en.js');

describe('panel file structure', () => {
  it('should have all required panel files', () => {
    expect(existsSync(SRC)).toBe(true);
    expect(existsSync(TEMPLATE)).toBe(true);
    expect(existsSync(STYLE)).toBe(true);
    expect(existsSync(I18N_EN)).toBe(true);
  });

  it('should have compiled output', () => {
    expect(existsSync(DIST)).toBe(true);
  });
});

describe('panel export format', () => {
  const distCode = readFileSync(DIST, 'utf-8');

  it('should use module.exports (not named export)', () => {
    expect(distCode).toContain('module.exports =');
    expect(distCode).not.toMatch(/exports\.PanelDefinition\s*=/);
  });

  it('should call Editor.Panel.define()', () => {
    expect(distCode).toContain('Editor.Panel.define(');
  });

  it('should have template and style properties', () => {
    expect(distCode).toMatch(/template[,\s]/);
    expect(distCode).toMatch(/style[,\s]/);
  });

  it('should have ready() lifecycle method', () => {
    expect(distCode).toContain('ready(');
  });

  it('should have close() lifecycle method', () => {
    expect(distCode).toContain('close(');
  });

  it('should have methods block with custom methods', () => {
    expect(distCode).toContain('methods:');
    expect(distCode).toContain('_initBuildReport');
    expect(distCode).toContain('_initCompress');
    expect(distCode).toContain('_initPackage');
    expect(distCode).toContain('_initDeploy');
    expect(distCode).toContain('_renderReport');
    expect(distCode).toContain('_renderPackageResults');
    expect(distCode).toContain('_compressSingle');
    expect(distCode).toContain('_compressAll');
    expect(distCode).toContain('_checkLoginStatus');
    expect(distCode).toContain('_loadProjects');
    expect(distCode).toContain('_populateCompressTable');
    expect(distCode).toContain('_initPreview');
    expect(distCode).toContain('_openPreview');
    expect(distCode).toContain('_closePreview');
    expect(distCode).toContain('_updatePreview');
    expect(distCode).toContain('_applyPreview');
  });
});

describe('panel DOM scoping', () => {
  const distCode = readFileSync(DIST, 'utf-8');

  it('should NOT use document.getElementById', () => {
    expect(distCode).not.toContain('document.getElementById');
  });

  it('should NOT use document.querySelector for element lookup', () => {
    // querySelector is allowed only on known $ parent elements
    // direct document.querySelector should not appear
    const lines = distCode.split('\n');
    for (const line of lines) {
      if (line.includes('document.querySelector') && !line.includes('document.createElement')) {
        throw new Error(`Found document.querySelector: ${line.trim()}`);
      }
    }
  });

  it('should use this.$ for element access', () => {
    expect(distCode).toContain('this.$.btnAnalyze');
    expect(distCode).toContain('this.$.reportTbody');
    expect(distCode).toContain('this.$.compressFormat');
    expect(distCode).toContain('this.$.networkGrid');
    expect(distCode).toContain('this.$.deployToken');
  });

  it('should NOT use this._root (no shadow DOM in Cocos 3.8.x)', () => {
    expect(distCode).not.toContain('this._root');
  });
});

describe('template ↔ $ selector consistency', () => {
  const srcCode = readFileSync(SRC, 'utf-8');
  const templateHtml = readFileSync(TEMPLATE, 'utf-8');

  // Extract all IDs from the $ selector map (lines like: key: '#some-id',)
  const selectorBlock = srcCode.slice(srcCode.indexOf('$: {'), srcCode.indexOf('},', srcCode.indexOf('$: {')));
  const selectorMatches = selectorBlock.match(/'#([a-z][a-z0-9-]+)'/g) ?? [];
  const selectorIds = selectorMatches.map(m => m.replace(/'/g, '').replace('#', ''));

  it('should have all $ selector IDs present in template', () => {
    const missing: string[] = [];
    for (const id of selectorIds) {
      if (!templateHtml.includes(`id="${id}"`)) {
        missing.push(id);
      }
    }
    expect(missing).toEqual([]);
  });

  it('should have at least 30 selectors defined', () => {
    // We expanded from 8 to 30+ selectors
    expect(selectorIds.length).toBeGreaterThanOrEqual(30);
  });
});

describe('template structure', () => {
  const templateHtml = readFileSync(TEMPLATE, 'utf-8');

  it('should have panel-root container', () => {
    expect(templateHtml).toContain('class="panel-root"');
  });

  it('should have 4 tab buttons', () => {
    expect(templateHtml).toContain('id="tab-build-report"');
    expect(templateHtml).toContain('id="tab-compress"');
    expect(templateHtml).toContain('id="tab-package"');
    expect(templateHtml).toContain('id="tab-deploy"');
  });

  it('should have 4 content panes', () => {
    expect(templateHtml).toContain('id="content-build-report"');
    expect(templateHtml).toContain('id="content-compress"');
    expect(templateHtml).toContain('id="content-package"');
    expect(templateHtml).toContain('id="content-deploy"');
  });

  it('should have Build Report tab elements', () => {
    expect(templateHtml).toContain('id="btn-analyze"');
    expect(templateHtml).toContain('id="report-tbody"');
    expect(templateHtml).toContain('id="report-summary"');
  });

  it('should have Compress tab elements', () => {
    expect(templateHtml).toContain('id="compress-quality"');
    expect(templateHtml).toContain('id="compress-format"');
    expect(templateHtml).toContain('id="compress-tbody"');
  });

  it('should have Package tab elements', () => {
    expect(templateHtml).toContain('id="network-grid"');
    expect(templateHtml).toContain('id="btn-build-all"');
    expect(templateHtml).toContain('id="pkg-results-tbody"');
  });

  it('should have Deploy tab elements', () => {
    expect(templateHtml).toContain('id="deploy-token"');
    expect(templateHtml).toContain('id="btn-deploy"');
    expect(templateHtml).toContain('id="deploy-result"');
  });

  it('should have preview overlay elements', () => {
    expect(templateHtml).toContain('id="preview-overlay"');
    expect(templateHtml).toContain('id="preview-format"');
    expect(templateHtml).toContain('id="preview-quality"');
    expect(templateHtml).toContain('id="preview-apply"');
    expect(templateHtml).toContain('id="preview-close"');
  });
});

describe('CSS completeness', () => {
  const cssContent = readFileSync(STYLE, 'utf-8');

  it('should style panel-root', () => {
    expect(cssContent).toContain('.panel-root');
  });

  it('should style tab components', () => {
    expect(cssContent).toContain('.tab-header');
    expect(cssContent).toContain('.tab-btn');
    expect(cssContent).toContain('.tab-btn.active');
    expect(cssContent).toContain('.tab-content');
    expect(cssContent).toContain('.tab-pane');
  });

  it('should style data tables', () => {
    expect(cssContent).toContain('.data-table');
    expect(cssContent).toContain('.data-table-wrap');
  });

  it('should style buttons', () => {
    expect(cssContent).toContain('.btn');
    expect(cssContent).toContain('.btn-secondary');
    expect(cssContent).toContain('.btn-small');
  });

  it('should style form elements', () => {
    expect(cssContent).toContain('.form-input');
    expect(cssContent).toContain('.form-select');
    expect(cssContent).toContain('.form-slider');
  });

  it('should style badges', () => {
    expect(cssContent).toContain('.badge-pass');
    expect(cssContent).toContain('.badge-fail');
    expect(cssContent).toContain('.badge-warn');
    expect(cssContent).toContain('.badge-info');
  });

  it('should style network grid', () => {
    expect(cssContent).toContain('.network-grid');
    expect(cssContent).toContain('.network-check-label');
  });

  it('should have spinner animation', () => {
    expect(cssContent).toContain('.spinner');
    expect(cssContent).toContain('@keyframes spin');
  });

  it('should style size bars', () => {
    expect(cssContent).toContain('.size-bar-fill');
    expect(cssContent).toContain('.over-limit');
  });

  it('should style preview overlay', () => {
    expect(cssContent).toContain('.preview-overlay');
    expect(cssContent).toContain('.preview-modal');
    expect(cssContent).toContain('.preview-body');
    expect(cssContent).toContain('.preview-controls');
  });
});

describe('package.json panel config', () => {
  const pkg = JSON.parse(readFileSync(PKG, 'utf-8'));

  it('should define default panel', () => {
    expect(pkg.panels).toBeDefined();
    expect(pkg.panels.default).toBeDefined();
  });

  it('should have panel title', () => {
    expect(pkg.panels.default.title).toBe('Playbox');
  });

  it('should point to correct panel main', () => {
    expect(pkg.panels.default.main).toBe('./dist/panels/default');
  });

  it('should have dockable panel type', () => {
    expect(pkg.panels.default.type).toBe('dockable');
  });

  it('should have reasonable min dimensions', () => {
    expect(pkg.panels.default.size['min-width']).toBeGreaterThanOrEqual(600);
    expect(pkg.panels.default.size['min-height']).toBeGreaterThanOrEqual(400);
  });

  it('should define all message handlers', () => {
    const msgs = pkg.contributions.messages;
    expect(msgs['scan-assets']).toBeDefined();
    expect(msgs['package-networks']).toBeDefined();
    expect(msgs['get-networks']).toBeDefined();
    expect(msgs['compress-image']).toBeDefined();
    expect(msgs['compress-audio']).toBeDefined();
    expect(msgs['check-ffmpeg']).toBeDefined();
    expect(msgs['deploy']).toBeDefined();
    expect(msgs['get-settings']).toBeDefined();
    expect(msgs['save-settings']).toBeDefined();
    expect(msgs['get-token']).toBeDefined();
    expect(msgs['save-token']).toBeDefined();
  });
});

describe('i18n keys', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const i18n = require(I18N_EN);

  it('should have extension namespace', () => {
    expect(i18n['plbx-cocos-extension']).toBeDefined();
  });

  it('should have title and description', () => {
    const ns = i18n['plbx-cocos-extension'];
    expect(ns.title).toBeTruthy();
    expect(ns.description).toBeTruthy();
  });

  it('should have panel title', () => {
    expect(i18n['plbx-cocos-extension'].panels.default.title).toBe('Playbox');
  });

  it('should have open-panel label', () => {
    expect(i18n['plbx-cocos-extension']['open-panel']).toBeTruthy();
  });
});

describe('panel null safety', () => {
  const srcCode = readFileSync(SRC, 'utf-8');

  it('should not use non-null assertions on DOM lookups', () => {
    // No ! after getElementById or this.$ lookups for mandatory elements
    // (allowed on document.createElement since those always succeed)
    const lines = srcCode.split('\n');
    for (const line of lines) {
      if (line.includes('this.$.') && line.includes('!;')) {
        throw new Error(`Non-null assertion on this.$: ${line.trim()}`);
      }
    }
  });

  it('should use null guards in render methods', () => {
    expect(srcCode).toContain('if (!summary || !tbody');
    expect(srcCode).toContain('if (!tbody) return');
    expect(srcCode).toContain('if (!grid) return');
  });

  it('should use optional chaining for event handlers', () => {
    expect(srcCode).toContain('btnAnalyze?.addEventListener');
    expect(srcCode).toContain('btnCompressAll?.addEventListener');
    expect(srcCode).toContain('btnBuildAll?.addEventListener');
    expect(srcCode).toContain('btnDeploy?.addEventListener');
  });

  it('should log errors instead of silently catching', () => {
    // Count console.warn('[plbx]') calls — should be several
    const warnCount = (srcCode.match(/console\.warn\('\[plbx\]'/g) ?? []).length;
    expect(warnCount).toBeGreaterThanOrEqual(4);
  });
});
