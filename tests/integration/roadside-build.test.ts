/**
 * Integration test: package real roadside Cocos build and compare with super-html output.
 *
 * Uses local copies:
 *   tests/fixtures/roadside-build/web-mobile/     — source Cocos build
 *   tests/fixtures/roadside-build/super-html-ref/ — reference outputs for comparison
 *   tests/fixtures/roadside-build/output/         — our packager output (inspectable)
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, statSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '../fixtures/roadside-build');
const BUILD_DIR = join(FIXTURES, 'web-mobile');
const REF_DIR = join(FIXTURES, 'super-html-ref');
const OUTPUT_DIR = join(FIXTURES, 'output');

const hasBuild = existsSync(BUILD_DIR);
const describeIf = hasBuild ? describe : describe.skip;

function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

describeIf('Integration: roadside build packaging', () => {
  beforeAll(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  const defaultConfig = {
    storeUrlIos: 'https://apps.apple.com/app/roadside',
    storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.playbox.roadside',
    orientation: 'landscape' as const,
  };

  it('should package for ironsource (single HTML)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['ironsource'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('html');
    expect(r.outputSize).toBeGreaterThan(0);
    expect(existsSync(r.outputPath)).toBe(true);

    const refPath = join(REF_DIR, 'ironsource2025', 'index.html');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  ironsource: our=${formatMB(r.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}, delta=${formatMB(r.outputSize - refSize)}MB`);
      expect(ratio).toBeLessThan(1.5);
    }
  }, 120000);

  it('should package for applovin (single HTML, MRAID)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['applovin'],
      config: defaultConfig,
    });

    const r = result.results[0];
    const html = readFileSync(r.outputPath, 'utf-8');

    expect(html).toContain('window.__zip');
    expect(html).toContain('window.__res');
    expect(html).toContain('XMLHttpRequest');
    expect(html).toContain('mraid.js');

    const refPath = join(REF_DIR, 'applovin', 'Roadside_applovin.html');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  applovin: our=${formatMB(r.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 120000);

  it('should package for google (ZIP)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['google'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('zip');

    const refPath = join(REF_DIR, 'google', 'Roadside_google.zip');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  google: our=${formatMB(r.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 120000);

  it('should package for facebook (dual format: HTML + ZIP)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['facebook'],
      config: defaultConfig,
    });

    expect(result.results).toHaveLength(2);
    const htmlResult = result.results.find(r => r.format === 'html');
    const zipResult = result.results.find(r => r.format === 'zip');

    const refHtml = join(REF_DIR, 'facebook', 'Roadside_facebook.html');
    if (existsSync(refHtml) && htmlResult) {
      const refSize = statSync(refHtml).size;
      const ratio = htmlResult.outputSize / refSize;
      console.log(`  facebook html: our=${formatMB(htmlResult.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
    const refZip = join(REF_DIR, 'facebook', 'Roadside_facebook.zip');
    if (existsSync(refZip) && zipResult) {
      const refSize = statSync(refZip).size;
      const ratio = zipResult.outputSize / refSize;
      console.log(`  facebook zip: our=${formatMB(zipResult.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 120000);

  it('mintegral ZIP should contain single HTML with correct structure', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['mintegral'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('zip');
    expect(r.outputSize).toBeGreaterThan(0);
    expect(r.outputSize).toBeLessThanOrEqual(5 * 1024 * 1024); // 5MB limit

    // Verify ZIP contains exactly one index.html
    const JSZip = (await import('jszip')).default;
    const zipData = readFileSync(r.outputPath);
    const zip = await JSZip.loadAsync(zipData);
    const fileNames = Object.keys(zip.files).filter(f => !zip.files[f].dir);
    expect(fileNames).toEqual(['index.html']);

    // Verify HTML content
    const html = await zip.file('index.html')!.async('string');

    // Scripts should be in <body>, not <head>
    const headContent = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] || '';
    expect(headContent).not.toContain('__zip');
    expect(headContent).not.toContain('JSZip');

    // Runtime loader should contain lifecycle signaling
    expect(html).toContain('gameReady');
    expect(html).toContain('signalLifecycle');
    // Mintegral bridge should use install() for CTA
    expect(html).toContain('window.install');

    // Should contain runtime loader
    expect(html).toContain('__zip');
    expect(html).toContain('__plbx_boot');
    expect(html).toContain('bootCocos');

    // Should have inlined CSS (no external stylesheet links)
    expect(html).not.toMatch(/<link[^>]*rel=["']stylesheet["']/);

    // External script tags should be removed (loaded from ZIP)
    expect(html).not.toContain('src="src/polyfills.bundle.js"');
    expect(html).not.toContain('src="src/system.bundle.js"');

    console.log(`  mintegral ZIP: ${formatMB(r.outputSize)}MB, HTML: ${formatMB(html.length)}MB`);
  }, 120000);

  it('should package all major networks', async () => {
    const networks = ['ironsource', 'applovin', 'google', 'facebook', 'unity', 'mintegral', 'tiktok'];
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks,
      config: defaultConfig,
    });

    console.log('\n  === Roadside: All Networks Summary ===');
    for (const r of result.results) {
      const status = r.withinLimit ? 'OK' : 'OVER';
      console.log(`  ${r.networkId.padEnd(20)} ${r.format.padEnd(5)} ${formatMB(r.outputSize).padStart(8)}MB / ${formatMB(r.maxSize).padStart(5)}MB [${status}]`);
    }
    console.log(`  Total time: ${result.totalTime}ms`);

    for (const r of result.results) {
      expect(r.outputSize).toBeGreaterThan(0);
      expect(existsSync(r.outputPath)).toBe(true);
    }
  }, 300000);
});
