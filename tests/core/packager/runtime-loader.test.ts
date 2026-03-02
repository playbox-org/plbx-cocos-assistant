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

  it('should contain _findInRes helper with suffix matching', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_findInRes');
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

  it('should use isText() to choose extraction mode', () => {
    const code = generateRuntimeLoader();
    // Binary files extracted as base64, text as string
    expect(code).toContain("isText(filePath) ? 'string' : 'base64'");
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

  it('should convert base64 to data URI for Image src patch', () => {
    const code = generateRuntimeLoader();
    // Image patch should detect if cached value is already a data URI or raw base64
    expect(code).toContain("cached.indexOf('data:') === 0");
    expect(code).toContain('_toDataUri(url, cached)');
  });

  it('should convert base64 to data URI for font loading', () => {
    const code = generateRuntimeLoader();
    // Font loader should build data URIs from base64
    expect(code).toContain("data.indexOf('data:') === 0");
    expect(code).toContain('_toDataUri(url, data)');
  });

  it('should handle arraybuffer responseType for both text and binary content', () => {
    const code = generateRuntimeLoader();
    // Must use _cachedToArrayBuffer which auto-detects text vs base64
    expect(code).toContain('_cachedToArrayBuffer(cached)');
    // Must have both converters
    expect(code).toContain('_base64ToArrayBuffer');
    expect(code).toContain('_stringToArrayBuffer');
    expect(code).toContain('TextEncoder');
  });

  it('should handle blob responseType for both text and binary content', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_cachedToBlob(cached)');
  });

  it('should detect base64 vs text content via _isBase64 heuristic', () => {
    const code = generateRuntimeLoader();
    expect(code).toContain('_isBase64');
    // Must detect JSON (starts with { or [) as NOT base64
    expect(code).toContain('c === 123'); // {
    expect(code).toContain('c === 91');  // [
  });

  it('should handle JSON responseType for both text and base64 content', () => {
    const code = generateRuntimeLoader();
    // JSON requested as 'json' responseType: might be plain string or base64
    expect(code).toContain("_isBase64(cached)");
    expect(code).toContain('JSON.parse(atob(cached))');
    expect(code).toContain('JSON.parse(cached)');
  });
});

describe('generateFullHtml binary handling', () => {
  it('should produce HTML where isText classifies effect.bin as binary', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    // The generated HTML must contain isText and TEXT_EXTS
    // so that binary files like effect.bin get base64 extraction
    expect(html).toContain('TEXT_EXTS');
    expect(html).toContain("isText(filePath) ? 'string' : 'base64'");
    // .bin should NOT be in TEXT_EXTS (it's binary)
    expect(html).not.toContain("'.bin':1");
  });

  it('should produce HTML with _getMime for arraybuffer XHR responses', () => {
    const html = generateFullHtml({
      originalHtml: '<!DOCTYPE html><html><head></head><body></body></html>',
      zipBase64: 'UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==',
    });
    expect(html).toContain('_getMime');
    expect(html).toContain('_toDataUri');
    expect(html).toContain('_base64ToArrayBuffer');
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

  it('should inject before existing head content', () => {
    const result = generateFullHtml({
      originalHtml: sampleHtml,
      zipBase64: fakeZipBase64,
    });
    // __zip should appear before <title>
    const zipPos = result.indexOf('__zip');
    const titlePos = result.indexOf('<title>');
    expect(zipPos).toBeLessThan(titlePos);
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
