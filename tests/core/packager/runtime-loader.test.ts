import { describe, it, expect } from 'vitest';
import { generateRuntimeLoader, getJSZipRuntime, generateFullHtml } from '../../../src/core/packager/runtime-loader';

// ─────────────────────────────────────────────────────────────────────────────
// The default loader is now the self-contained (origin-independent) loader.
// The legacy global-patch loader is still emitted for `mode: 'systemjs'` as the
// per-network rollback path, so its assertions are pinned to that mode.
// ─────────────────────────────────────────────────────────────────────────────

describe('generateRuntimeLoader — shared invariants (both modes)', () => {
  for (const mode of ['self-contained', 'systemjs'] as const) {
    it(`[${mode}] generates a JS string`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(100);
    });

    it(`[${mode}] contains ZIP unpack via JSZip`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain('JSZip');
      expect(code).toContain('loadAsync');
      expect(code).toContain('base64');
    });

    it(`[${mode}] toggles DEBUG flag`, () => {
      expect(generateRuntimeLoader({ mode, debug: true })).toContain('DEBUG = true');
      expect(generateRuntimeLoader({ mode })).toContain('DEBUG = false');
    });

    it(`[${mode}] has suffix-match asset lookup helpers`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain('_findAsset');
      expect(code).toContain('_suffixMatch');
      expect(code).toContain('endsWith');
    });

    it(`[${mode}] has base64→ArrayBuffer + data-uri helpers`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain('_base64ToArrayBuffer');
      expect(code).toContain('atob');
      expect(code).toContain('_toDataUri');
      expect(code).toContain("'data:' + _getMime(url) + ';base64,' + base64");
    });

    it(`[${mode}] defines gameStart/gameClose and polls for gameReady`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain('window.gameStart');
      expect(code).toContain('window.gameClose');
      expect(code).toContain('window.gameReady');
    });

    it(`[${mode}] supports __plbx_pre_boot MRAID defer-boot gate`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain('__plbx_pre_boot');
      expect(code).toContain('window.__plbx_pre_boot(doBoot)');
    });

    it(`[${mode}] has MIME type map`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain("'.png':'image/png'");
      expect(code).toContain("'.mp3':'audio/mpeg'");
      expect(code).toContain("'.bin':'application/octet-stream'");
      expect(code).toContain("'.woff':'font/woff'");
      expect(code).toContain("'.ttf':'font/ttf'");
    });

    it(`[${mode}] classifies text vs binary on unpack`, () => {
      const code = generateRuntimeLoader({ mode });
      expect(code).toContain("'.js':1");
      expect(code).toContain("'.json':1");
      expect(code).toContain("'.glsl':1");
      expect(code).toContain("text ? 'string' : 'base64'");
    });
  }
});

describe('self-contained loader (default mode)', () => {
  it('emits the plbx cache-native loader', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('plbx_boot');
    expect(code).toContain('plbx_patch_system');
    expect(code).toContain('window.__plbx_res');
    expect(code).toContain('delete window.__plbx_zip');
  });

  it('is Facebook-safe: no literal XMLHttpRequest, uses _XMLLocalRequest', () => {
    const code = generateRuntimeLoader();
    // FB blocks/rewrites the literal "XMLHttpRequest" → _xrq_. The loader must
    // not reference it; the engine is rewritten to use _XMLLocalRequest.
    expect(code).not.toContain('XMLHttpRequest');
    expect(code).toContain('window._XMLLocalRequest =');
  });

  it('loads bundle scripts via _createLocalJSElement, not a real <script>', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('window._createLocalJSElement =');
    expect(code).not.toContain("createElement('script')");
  });

  it('_XMLLocalRequest completes via direct onload (no dispatchEvent)', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('self.onload()');
    expect(code).not.toContain('dispatchEvent');
  });

  it('resolves modules without depending on document.baseURI (cures bug #1)', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('function _deAbout');
    expect(code).toContain('_fakeBase');
  });

  it('registers media downloader handlers reading plbx_getRes', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('assetManager.downloader.register');
    expect(code).toContain('plbx_getRes');
    expect(code).toContain("'.ttf': loadFont");
    expect(code).toContain("'.png': loadImage");
  });

  it('enforces no-network policy for off-cache relative assets', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('function _isExternalUrl');
    expect(code).toContain('blocked off-cache fetch');
  });
});

describe('legacy loader (mode: systemjs)', () => {
  it('contains XHR patching', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('XMLHttpRequest');
    expect(code).toContain('window.__res');
  });

  it('contains Image patching', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('Image');
    expect(code).toContain('origSrcDesc');
  });

  it('contains script createElement patching', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('createElement');
    expect(code).toContain('script');
  });

  it('contains font loader registration', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('FontFace');
    expect(code).toContain('.ttf');
    expect(code).toContain('.woff');
  });

  it('uses window.__zip and frees it after unpack', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('window.__zip');
    expect(code).toContain('delete window.__zip');
  });

  it('handles XHR responseType json/arraybuffer/text/blob', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain("'json'");
    expect(code).toContain("'arraybuffer'");
    expect(code).toContain("'blob'");
    expect(code).toContain("'text'");
  });

  it('stores binary in __bin and text in __res', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    expect(code).toContain('window.__bin');
    expect(code).toContain('window.__res');
  });

  it('Image src defineProperty is configurable', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    const imgBlock = code.slice(code.indexOf("Object.defineProperty(img, 'src'"));
    expect(imgBlock).toMatch(/configurable:\s*true/);
  });

  it('Script src defineProperty is configurable', () => {
    const code = generateRuntimeLoader({ mode: 'systemjs' });
    const elBlock = code.slice(code.indexOf("Object.defineProperty(el, 'src'"));
    expect(elBlock).toMatch(/configurable:\s*true/);
  });
});

describe('validator-forbidden string hygiene', () => {
  // Mintegral's PlayTurbo validator greps the whole HTML as text (including JS
  // comments) and rejects creatives mentioning "preview-util.js". Guard both modes.
  const FORBIDDEN = ['preview-util.js', 'preview-util'];

  for (const mode of ['self-contained', 'systemjs'] as const) {
    it(`[${mode}] runtime loader has no forbidden strings`, () => {
      const code = generateRuntimeLoader({ mode });
      for (const needle of FORBIDDEN) expect(code, `leaked "${needle}"`).not.toContain(needle);
    });
    it(`[${mode}] runtime loader with debug has no forbidden strings`, () => {
      const code = generateRuntimeLoader({ mode, debug: true });
      for (const needle of FORBIDDEN) expect(code).not.toContain(needle);
    });
  }

  it('generateFullHtml output has no forbidden strings', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head><title>G</title></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    for (const needle of FORBIDDEN) expect(html, `final HTML leaked "${needle}"`).not.toContain(needle);
  });
});

describe('getJSZipRuntime', () => {
  it('returns JSZip minified source', () => {
    const jszip = getJSZipRuntime();
    expect(typeof jszip).toBe('string');
    expect(jszip.length).toBeGreaterThan(10000);
    expect(jszip).toContain('JSZip');
  });
});

describe('generateFullHtml', () => {
  const sampleHtml = '<!DOCTYPE html><html><head><title>Game</title></head><body></body></html>';
  const fakeZipBase64 = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==';

  it('[self-contained] injects __plbx_zip + JSZip + plbx loader before </body>', () => {
    const result = generateFullHtml({ originalHtml: sampleHtml, zipBase64: fakeZipBase64 });
    expect(result).toContain('window.__plbx_zip');
    expect(result).toContain('JSZip');
    expect(result).toContain('plbx_boot');
    expect(result).toContain(fakeZipBase64);
    const zipPos = result.indexOf('__plbx_zip');
    const bodyClosePos = result.indexOf('</body>');
    expect(zipPos).toBeGreaterThan(0);
    expect(zipPos).toBeLessThan(bodyClosePos);
  });

  it('[systemjs] injects __zip + __res + XHR patch', () => {
    const result = generateFullHtml({ originalHtml: sampleHtml, zipBase64: fakeZipBase64, loaderMode: 'systemjs' });
    expect(result).toContain('window.__zip');
    expect(result).toContain('window.__res');
    expect(result).toContain('XMLHttpRequest');
    expect(result).toContain(fakeZipBase64);
  });

  it('[systemjs] includes pre-populated JS modules when provided', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
      jsModules: { 'src/main.js': 'console.log("hello")' },
      loaderMode: 'systemjs',
    });
    expect(result).toContain('src/main.js');
  });

  it('enables debug mode when specified', () => {
    const result = generateFullHtml({ originalHtml: sampleHtml, zipBase64: fakeZipBase64, loaderOptions: { debug: true } });
    expect(result).toContain('DEBUG = true');
  });

  it('[systemjs] separates binary into __bin and text into __res', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: fakeZipBase64,
      loaderMode: 'systemjs',
    });
    expect(html).toContain('window.__bin');
    expect(html).toContain('window.__res');
    expect(html).toContain('TEXT_EXTS');
    expect(html).not.toContain("'.bin':1");
  });
});
