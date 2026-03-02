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
