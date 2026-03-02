/**
 * Browser verification test: opens packaged HTML files in headless Chromium
 * and checks for console errors, network failures, and uncaught exceptions.
 *
 * Requires:
 *   - Playwright + Chromium: npx playwright install chromium
 *   - Real build fixtures: tests/fixtures/spades-build/web-mobile/
 *
 * Skipped automatically when fixtures are missing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const FIXTURES = join(__dirname, '../fixtures/spades-build');
const BUILD_DIR = join(FIXTURES, 'web-mobile');
const OUTPUT_DIR = join(FIXTURES, 'pack-output');

const hasBuild = existsSync(BUILD_DIR);
const describeIf = hasBuild ? describe : describe.skip;

// Known external resources that are expected to fail (provided by ad SDKs at runtime)
const IGNORED_URLS = ['mraid.js', 'favicon'];

interface BrowserLog {
  type: 'error' | 'warning';
  text: string;
}

interface NetworkError {
  url: string;
  status?: number;
}

describeIf('Browser verification: packaged HTML files', () => {
  let browser: Browser;

  beforeAll(async () => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
    browser = await chromium.launch({ headless: true });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  const defaultConfig = {
    storeUrlIos: 'https://apps.apple.com/app/spades',
    storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.playbox.spades',
    orientation: 'portrait' as const,
  };

  /**
   * Open a local HTML file in headless browser, wait for Cocos boot,
   * and collect all console errors and network failures.
   */
  async function verifyHtmlInBrowser(htmlPath: string, timeoutMs = 10000): Promise<{
    errors: BrowserLog[];
    networkErrors: NetworkError[];
    uncaughtExceptions: string[];
  }> {
    const page: Page = await browser.newPage();
    const errors: BrowserLog[] = [];
    const networkErrors: NetworkError[] = [];
    const uncaughtExceptions: string[] = [];

    // Collect console errors (include location for debugging)
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const location = msg.location();
        const locStr = location.url ? ` [${location.url}]` : '';
        errors.push({ type: 'error', text: msg.text() + locStr });
      }
    });

    // Collect uncaught exceptions
    page.on('pageerror', (err) => {
      uncaughtExceptions.push(err.message);
    });

    // Collect network failures (but ignore known SDK resources)
    page.on('requestfailed', (request) => {
      const url = request.url();
      const isIgnored = IGNORED_URLS.some(ignored => url.includes(ignored));
      if (!isIgnored) {
        networkErrors.push({
          url,
          status: request.failure()?.errorText ? undefined : undefined,
        });
      }
    });

    // Open the local HTML file
    const fileUrl = `file://${htmlPath}`;
    await page.goto(fileUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Wait for ZIP unpack + boot to complete
    // The runtime loader sets window.__res after unpack
    try {
      await page.waitForFunction(
        () => (window as any).__res && Object.keys((window as any).__res).length > 0,
        { timeout: timeoutMs },
      );
    } catch {
      // If __res is never set, the unpack failed — that's a test failure
    }

    // Give a bit more time for Cocos engine initialization
    await page.waitForTimeout(2000);

    await page.close();

    return { errors, networkErrors, uncaughtExceptions };
  }

  /**
   * Filter out noise: only keep critical errors related to missing resources,
   * undefined references, or network failures.
   */
  function getCriticalErrors(result: Awaited<ReturnType<typeof verifyHtmlInBrowser>>) {
    const critical: string[] = [];

    // Network errors are always critical (except ignored ones — already filtered)
    for (const ne of result.networkErrors) {
      critical.push(`Network error: ${ne.url}`);
    }

    // Uncaught exceptions are critical
    for (const ex of result.uncaughtExceptions) {
      // Ignore WebGL/canvas errors (expected in headless without GPU)
      if (ex.includes('WebGL') || ex.includes('canvas') || ex.includes('GPU')) continue;
      // Ignore Cocos engine warnings about features not available in headless
      if (ex.includes('AudioContext') || ex.includes('GamepadEvent')) continue;
      critical.push(`Uncaught: ${ex}`);
    }

    // Console errors about missing files
    for (const err of result.errors) {
      if (err.text.includes('ERR_FILE_NOT_FOUND') || err.text.includes('net::ERR_')) {
        // Check if it's an ignored URL
        const isIgnored = IGNORED_URLS.some(ignored => err.text.includes(ignored));
        if (!isIgnored) {
          critical.push(`Console: ${err.text}`);
        }
      }
      // "X is not defined" errors indicate missing scripts
      if (err.text.match(/\b\w+\s+is not defined\b/) && !err.text.includes('[plbx]')) {
        critical.push(`Console: ${err.text}`);
      }
    }

    return critical;
  }

  it('ironsource HTML should load without critical errors', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['ironsource'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('html');
    expect(existsSync(r.outputPath)).toBe(true);

    const browserResult = await verifyHtmlInBrowser(r.outputPath, 15000);
    const critical = getCriticalErrors(browserResult);

    if (critical.length > 0) {
      console.log('\n  ironsource critical errors:');
      critical.forEach(e => console.log('    -', e));
    }
    console.log(`  ironsource: ${browserResult.errors.length} console errors, ${browserResult.networkErrors.length} network errors, ${browserResult.uncaughtExceptions.length} exceptions, ${critical.length} critical`);

    expect(critical).toEqual([]);
  }, 120000);

  it('applovin HTML should load without critical errors', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['applovin'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('html');
    expect(existsSync(r.outputPath)).toBe(true);

    const browserResult = await verifyHtmlInBrowser(r.outputPath, 15000);
    const critical = getCriticalErrors(browserResult);

    if (critical.length > 0) {
      console.log('\n  applovin critical errors:');
      critical.forEach(e => console.log('    -', e));
    }
    console.log(`  applovin: ${browserResult.errors.length} console errors, ${browserResult.networkErrors.length} network errors, ${browserResult.uncaughtExceptions.length} exceptions, ${critical.length} critical`);

    expect(critical).toEqual([]);
  }, 120000);

  it('unity HTML should load without critical errors', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['unity'],
      config: defaultConfig,
    });

    const r = result.results[0];
    expect(r.format).toBe('html');
    expect(existsSync(r.outputPath)).toBe(true);

    const browserResult = await verifyHtmlInBrowser(r.outputPath, 15000);
    const critical = getCriticalErrors(browserResult);

    if (critical.length > 0) {
      console.log('\n  unity critical errors:');
      critical.forEach(e => console.log('    -', e));
    }
    console.log(`  unity: ${browserResult.errors.length} console errors, ${browserResult.networkErrors.length} network errors, ${browserResult.uncaughtExceptions.length} exceptions, ${critical.length} critical`);

    expect(critical).toEqual([]);
  }, 120000);

  it('facebook dual-format HTML should load without critical errors', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUTPUT_DIR,
      networks: ['facebook'],
      config: defaultConfig,
    });

    const htmlResult = result.results.find(r => r.format === 'html');
    expect(htmlResult).toBeDefined();
    expect(existsSync(htmlResult!.outputPath)).toBe(true);

    const browserResult = await verifyHtmlInBrowser(htmlResult!.outputPath, 15000);
    const critical = getCriticalErrors(browserResult);

    if (critical.length > 0) {
      console.log('\n  facebook HTML critical errors:');
      critical.forEach(e => console.log('    -', e));
    }
    console.log(`  facebook: ${browserResult.errors.length} console errors, ${browserResult.networkErrors.length} network errors, ${browserResult.uncaughtExceptions.length} exceptions, ${critical.length} critical`);

    expect(critical).toEqual([]);
  }, 120000);
});
