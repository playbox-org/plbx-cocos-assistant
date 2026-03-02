/**
 * Integration test: package real spades-1 Cocos build and compare with super-html output.
 *
 * Uses local copies:
 *   tests/fixtures/spades-build/web-mobile/     — source Cocos build
 *   tests/fixtures/spades-build/super-html-ref/ — reference outputs for comparison
 *   tests/fixtures/spades-build/output/         — our packager output (inspectable)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, statSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '../fixtures/spades-build');
const BUILD_DIR = join(FIXTURES, 'web-mobile');
const REF_DIR = join(FIXTURES, 'super-html-ref');
const OUTPUT_DIR = join(FIXTURES, 'output');

const hasBuild = existsSync(BUILD_DIR);
const describeIf = hasBuild ? describe : describe.skip;

function formatMB(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(2);
}

describeIf('Integration: spades-1 build packaging', () => {
  beforeAll(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  const defaultConfig = {
    storeUrlIos: 'https://apps.apple.com/app/spades',
    storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.playbox.spades',
    orientation: 'portrait' as const,
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

    // Verify runtime loader components
    expect(html).toContain('window.__zip');
    expect(html).toContain('window.__res');
    expect(html).toContain('XMLHttpRequest');
    expect(html).toContain('mraid.js');

    const refPath = join(REF_DIR, 'applovin', 'Spades_applovin.html');
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

    const refPath = join(REF_DIR, 'google', 'Spades_google.zip');
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

    const refHtml = join(REF_DIR, 'facebook', 'Spades_facebook.html');
    if (existsSync(refHtml) && htmlResult) {
      const refSize = statSync(refHtml).size;
      const ratio = htmlResult.outputSize / refSize;
      console.log(`  facebook html: our=${formatMB(htmlResult.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
    const refZip = join(REF_DIR, 'facebook', 'Spades_facebook.zip');
    if (existsSync(refZip) && zipResult) {
      const refSize = statSync(refZip).size;
      const ratio = zipResult.outputSize / refSize;
      console.log(`  facebook zip: our=${formatMB(zipResult.outputSize)}MB, ref=${formatMB(refSize)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 120000);

  it('should report size limit violations', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['ironsource'],
      config: defaultConfig,
    });
    const r = result.results[0];
    console.log(`  size: ${formatMB(r.outputSize)}MB, limit: ${formatMB(r.maxSize)}MB, within: ${r.withinLimit}`);
  }, 120000);

  it('should package all major networks', async () => {
    const networks = ['ironsource', 'applovin', 'google', 'facebook', 'unity', 'mintegral', 'tiktok'];
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks,
      config: defaultConfig,
    });

    console.log('\n  === All Networks Summary ===');
    for (const r of result.results) {
      const status = r.withinLimit ? 'OK' : 'OVER';
      console.log(`  ${r.networkId.padEnd(20)} ${r.format.padEnd(5)} ${formatMB(r.outputSize).padStart(8)}MB / ${formatMB(r.maxSize).padStart(5)}MB [${status}]`);
    }
    console.log(`  Total time: ${result.totalTime}ms`);

    // All should have produced output
    for (const r of result.results) {
      expect(r.outputSize).toBeGreaterThan(0);
      expect(existsSync(r.outputPath)).toBe(true);
    }
  }, 300000);
});
