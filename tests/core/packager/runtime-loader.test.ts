import { describe, it, expect } from 'vitest';
import { generateRuntimeLoader, getJSZipRuntime, generateFullHtml } from '../../../src/core/packager/runtime-loader';

describe('generateRuntimeLoader', () => {
  it('should generate JavaScript code string', () => {
    const code = generateRuntimeLoader();
    expect(typeof code).toBe('string');
    expect(code.length).toBeGreaterThan(100);
  });

  it('should contain XHR patching code', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('XMLHttpRequest');
    expect(code).toContain('window.__res');
  });

  it('should contain Image patching code', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('Image');
    expect(code).toContain('origSrcDesc');
  });

  it('should contain script createElement patching', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('createElement');
    expect(code).toContain('script');
  });

  it('should contain font loader registration', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('FontFace');
    expect(code).toContain('.ttf');
    expect(code).toContain('.woff');
  });

  it('should contain ZIP unpack code', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('JSZip');
    expect(code).toContain('loadAsync');
    expect(code).toContain('window.__zip');
    expect(code).toContain('base64');
  });

  it('should enable debug logging when debug=true', () => {
    const code = generateRuntimeLoader({ debug: true });
    expect(code).toContain('DEBUG = true');
  });

  it('should disable debug logging by default', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('DEBUG = false');
  });

  it('should contain _findAsset helper with suffix matching', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_findAsset');
    expect(code).toContain('_suffixMatch');
    expect(code).toContain('endsWith');
  });

  it('should contain base64 to ArrayBuffer converter', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_base64ToArrayBuffer');
    expect(code).toContain('atob');
  });

  it('should handle XHR responseType: json, arraybuffer, text, blob', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain("'json'");
    expect(code).toContain("'arraybuffer'");
    expect(code).toContain("'blob'");
    expect(code).toContain("'text'");
  });

  it('should free __zip after unpack to save memory', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('delete window.__zip');
  });

  it('should define gameStart/gameClose and poll for gameReady', () => {
    const code = generateRuntimeLoader();
    // Should define gameStart and gameClose for validators to call
    expect(code).toContain('window.gameStart');
    expect(code).toContain('window.gameClose');
    // Should poll for gameReady (defined by the ad-network validator)
    expect(code).toContain('signalLifecycle');
    expect(code).toContain('window.gameReady');
    expect(code).toContain('setTimeout(signalLifecycle');
    expect(code).toContain('_lifecycleDone');
  });
});

describe('binary vs text file handling', () => {
  it('should classify text files for string extraction', () => {
    const code = generateRuntimeLoader();
    // TEXT_EXTS must include all common text formats
    expect(code).toContain("'.js':1");
    expect(code).toContain("'.json':1");
    expect(code).toContain("'.css':1");
    expect(code).toContain("'.html':1");
    expect(code).toContain("'.svg':1");
    expect(code).toContain("'.glsl':1");
    expect(code).toContain("'.effect':1");
  });

  it('should store binary files in __bin and text files in __res', () => {
    const code = generateRuntimeLoader();
    // Binary files go to __bin, text to __res
    expect(code).toContain('window.__bin');
    expect(code).toContain('window.__res');
    expect(code).toContain("text ? 'string' : 'base64'");
  });

  it('should contain MIME type map for data URI generation', () => {
    const code = generateRuntimeLoader();
    // Image types
    expect(code).toContain("'.png':'image/png'");
    expect(code).toContain("'.jpg':'image/jpeg'");
    expect(code).toContain("'.webp':'image/webp'");
    // Audio types
    expect(code).toContain("'.mp3':'audio/mpeg'");
    expect(code).toContain("'.ogg':'audio/ogg'");
    // Binary Cocos types
    expect(code).toContain("'.bin':'application/octet-stream'");
    expect(code).toContain("'.cconb':'application/octet-stream'");
    // Font types
    expect(code).toContain("'.woff':'font/woff'");
    expect(code).toContain("'.woff2':'font/woff2'");
    expect(code).toContain("'.ttf':'font/ttf'");
  });

  it('should generate _toDataUri helper for base64→data URI conversion', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_toDataUri');
    expect(code).toContain("'data:' + _getMime(url) + ';base64,' + base64");
  });

  it('should convert binary base64 to data URI for Image src patch', () => {
    const code = generateRuntimeLoader();
    // Image patch uses _findAsset and checks asset.binary for data URI conversion
    expect(code).toContain('_findAsset(url)');
    expect(code).toContain('asset.binary');
    expect(code).toContain('_toDataUri(url, asset.data)');
  });

  it('should convert binary base64 to data URI for font loading', () => {
    const code = generateRuntimeLoader();
    // Font loader uses _findAsset and checks binary flag
    expect(code).toContain('asset.binary ? _toDataUri(url, asset.data)');
  });

  it('should use asset.binary flag for arraybuffer XHR responses', () => {
    const code = generateRuntimeLoader();
    // Deterministic: binary → _base64ToArrayBuffer, text → _stringToArrayBuffer
    expect(code).toContain('_base64ToArrayBuffer(asset.data)');
    expect(code).toContain('_stringToArrayBuffer(asset.data)');
    expect(code).toContain('TextEncoder');
  });

  it('should use asset.binary flag for blob XHR responses', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('new Blob([arr], { type: mime })');
    expect(code).toContain('new Blob([asset.data], { type: mime })');
  });

  it('should use _findAsset returning { data, binary } for deterministic type handling', () => {
    const code = generateRuntimeLoader();
    // No heuristic — _findAsset knows if data is from __res (text) or __bin (binary)
    expect(code).toContain('{ data: text, binary: false }');
    expect(code).toContain('{ data: bin, binary: true }');
    // No _isBase64 heuristic
    expect(code).not.toContain('_isBase64');
  });

  it('should use asset.binary for JSON responseType', () => {
    const code = generateRuntimeLoader();
    // Binary JSON → atob then parse; text JSON → parse directly
    expect(code).toContain('JSON.parse(atob(asset.data))');
    expect(code).toContain('JSON.parse(asset.data)');
  });
});

describe('generateFullHtml binary handling', () => {
  it('should separate binary files into __bin and text into __res', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    expect(html).toContain('window.__bin');
    expect(html).toContain('window.__res');
    expect(html).toContain('TEXT_EXTS');
    // .bin should NOT be in TEXT_EXTS (it's binary → goes to __bin)
    expect(html).not.toContain("'.bin':1");
  });

  it('should use _findAsset for deterministic binary/text lookup', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    expect(html).toContain('_findAsset');
    expect(html).toContain('_toDataUri');
    expect(html).toContain('_base64ToArrayBuffer');
    // Must NOT contain unreliable _isBase64 heuristic
    expect(html).not.toContain('_isBase64');
  });
});

describe('Image/script src patching must be configurable', () => {
  // Regression guard: instance-level Object.defineProperty(img, 'src', ...)
  // must declare `configurable: true`. Otherwise the accessor is locked on
  // the instance, and any downstream code that tries to redefine `src`
  // (preview-util re-sync, asset manager, HMR, other patchers) throws
  // "Cannot redefine property: src" — observed as flaky first-load in the
  // extension's preview panel.
  it('Image src defineProperty must be configurable', () => {
    const code = generateRuntimeLoader();
    // Find the Image patch block and verify configurable: true appears before
    // the setter body (i.e., inside the descriptor object literal).
    const imgBlock = code.slice(code.indexOf("Object.defineProperty(img, 'src'"));
    expect(imgBlock).toMatch(/configurable:\s*true/);
  });

  it('Script src defineProperty must be configurable', () => {
    const code = generateRuntimeLoader();
    const elBlock = code.slice(code.indexOf("Object.defineProperty(el, 'src'"));
    expect(elBlock).toMatch(/configurable:\s*true/);
  });
});

describe('validator-forbidden string hygiene', () => {
  // Mintegral's PlayTurbo validator naively greps the whole HTML as text
  // (including JS comments) and rejects creatives that mention "preview-util.js".
  // This is a regression guard: the runtime loader embeds browser JS as a
  // template literal, so any stray // comment inside those backticks leaks
  // verbatim into the final HTML. tsc does not strip comments from string
  // contents, so we must grep the generated output ourselves.
  const FORBIDDEN = ['preview-util.js', 'preview-util'];

  it('generateRuntimeLoader output must not contain validator-forbidden strings', () => {
    const code = generateRuntimeLoader();
    for (const needle of FORBIDDEN) {
      expect(code, `runtime loader leaked "${needle}"`).not.toContain(needle);
    }
  });

  it('generateRuntimeLoader with debug=true must not contain forbidden strings', () => {
    const code = generateRuntimeLoader({ debug: true });
    for (const needle of FORBIDDEN) {
      expect(code).not.toContain(needle);
    }
  });

  it('generateFullHtml output must not contain validator-forbidden strings', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head><title>G</title></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    for (const needle of FORBIDDEN) {
      expect(html, `final HTML leaked "${needle}"`).not.toContain(needle);
    }
  });

  it('generateFullHtml with jsModules + debug must not leak forbidden strings', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
      jsModules: { 'src/main.js': 'console.log(1)' },
      loaderOptions: { debug: true },
    });
    for (const needle of FORBIDDEN) {
      expect(html).not.toContain(needle);
    }
  });
});

describe('getJSZipRuntime', () => {
  it('should return JSZip minified source code', () => {
    const jszip = getJSZipRuntime();
    expect(typeof jszip).toBe('string');
    expect(jszip.length).toBeGreaterThan(10000); // jszip.min.js is ~45KB
    expect(jszip).toContain('JSZip'); // should contain JSZip reference
  });
});

describe('generateFullHtml', () => {
  const sampleHtml = '<!DOCTYPE html><html><head><title>Game</title></head><body></body></html>';
  const fakeZipBase64 = 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA=='; // minimal valid ZIP

  it('should inject all components into HTML', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
    });
    expect(result).toContain('window.__zip');
    expect(result).toContain('window.__res');
    expect(result).toContain('JSZip');
    expect(result).toContain('XMLHttpRequest');
    expect(result).toContain(fakeZipBase64);
  });

  it('should inject before </body>', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
    });
    // __zip should appear after <title> (scripts now in body, not head)
    const zipPos = result.indexOf('__zip');
    const bodyClosePos = result.indexOf('</body>');
    expect(zipPos).toBeGreaterThan(0);
    expect(zipPos).toBeLessThan(bodyClosePos);
  });

  it('should include pre-populated JS modules when provided', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
      jsModules: { 'src/main.js': 'console.log("hello")' },
    });
    expect(result).toContain('src/main.js');
  });

  it('should enable debug mode when specified', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
      loaderOptions: { debug: true },
    });
    expect(result).toContain('DEBUG = true');
  });
});
