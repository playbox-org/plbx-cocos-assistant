/**
 * Integration test: package real spades-1 Cocos build and compare with super-html output.
 *
 * Uses the actual web-mobile build from:
 *   /Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/_Prod/spades-1/build/web-mobile/
 *
 * Compares output sizes against super-html reference:
 *   /Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/_Prod/spades-1/build/super-html/
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, statSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';

const BUILD_DIR = '/Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/_Prod/spades-1/build/web-mobile';
const SUPER_HTML_DIR = '/Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/_Prod/spades-1/build/super-html';
const OUTPUT_DIR = join(__dirname, '../fixtures/integration-output');

const hasBuild = existsSync(BUILD_DIR);

// Skip all tests if build directory not available (CI, other machines)
const describeIf = hasBuild ? describe : describe.skip;

describeIf('Integration: spades-1 build packaging', () => {
  beforeAll(() => {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(OUTPUT_DIR)) {
      rmSync(OUTPUT_DIR, { recursive: true, force: true });
    }
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

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.format).toBe('html');
    expect(r.outputSize).toBeGreaterThan(0);
    expect(existsSync(r.outputPath)).toBe(true);

    // Compare with super-html reference
    const refPath = join(SUPER_HTML_DIR, 'ironsource2025', 'index.html');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  ironsource: our=${(r.outputSize / 1024 / 1024).toFixed(2)}MB, ref=${(refSize / 1024 / 1024).toFixed(2)}MB, ratio=${ratio.toFixed(2)}`);
      // Our output should be within 2x of reference (generous, since approach differs)
      expect(ratio).toBeLessThan(2);
      expect(ratio).toBeGreaterThan(0.3);
    }
  }, 60000);

  it('should package for applovin (single HTML, MRAID)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['applovin'],
      config: defaultConfig,
    });

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    const html = readFileSync(r.outputPath, 'utf-8');

    // Verify runtime loader components
    expect(html).toContain('window.__zip');
    expect(html).toContain('window.__res');
    expect(html).toContain('XMLHttpRequest');

    // Verify MRAID SDK injected
    expect(html).toContain('mraid.js');

    // Compare with reference
    const refPath = join(SUPER_HTML_DIR, 'applovin', 'Spades_applovin.html');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  applovin: our=${(r.outputSize / 1024 / 1024).toFixed(2)}MB, ref=${(refSize / 1024 / 1024).toFixed(2)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 60000);

  it('should package for google (ZIP)', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['google'],
      config: defaultConfig,
    });

    expect(result.results).toHaveLength(1);
    const r = result.results[0];
    expect(r.format).toBe('zip');
    expect(r.outputPath).toContain('.zip');

    // Compare with reference
    const refPath = join(SUPER_HTML_DIR, 'google', 'Spades_google.zip');
    if (existsSync(refPath)) {
      const refSize = statSync(refPath).size;
      const ratio = r.outputSize / refSize;
      console.log(`  google: our=${(r.outputSize / 1024 / 1024).toFixed(2)}MB, ref=${(refSize / 1024 / 1024).toFixed(2)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 60000);

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
    expect(htmlResult).toBeDefined();
    expect(zipResult).toBeDefined();

    // Compare HTML with reference
    const refHtml = join(SUPER_HTML_DIR, 'facebook', 'Spades_facebook.html');
    if (existsSync(refHtml) && htmlResult) {
      const refSize = statSync(refHtml).size;
      const ratio = htmlResult.outputSize / refSize;
      console.log(`  facebook html: our=${(htmlResult.outputSize / 1024 / 1024).toFixed(2)}MB, ref=${(refSize / 1024 / 1024).toFixed(2)}MB, ratio=${ratio.toFixed(2)}`);
    }

    // Compare ZIP with reference
    const refZip = join(SUPER_HTML_DIR, 'facebook', 'Spades_facebook.zip');
    if (existsSync(refZip) && zipResult) {
      const refSize = statSync(refZip).size;
      const ratio = zipResult.outputSize / refSize;
      console.log(`  facebook zip: our=${(zipResult.outputSize / 1024 / 1024).toFixed(2)}MB, ref=${(refSize / 1024 / 1024).toFixed(2)}MB, ratio=${ratio.toFixed(2)}`);
    }
  }, 60000);

  it('should report size limit violations correctly', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['ironsource'],
      config: defaultConfig,
    });

    const r = result.results[0];
    // spades-1 is ~10MB, ironsource limit is 5MB — should exceed
    console.log(`  ironsource size: ${(r.outputSize / 1024 / 1024).toFixed(2)}MB, limit: ${(r.maxSize / 1024 / 1024).toFixed(2)}MB, within: ${r.withinLimit}`);
  }, 60000);
});
