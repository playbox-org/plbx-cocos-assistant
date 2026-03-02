/**
 * Browser verification test: opens packaged HTML files in headless Chromium
 * and checks for console errors, network failures, and uncaught exceptions.
 *
 * Requires:
 *   - Playwright + Chromium: npx playwright install chromium
 *   - Real build fixtures: tests/fixtures/<project>-build/web-mobile/
 *
 * Skipped automatically when fixtures are missing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

// Known external resources that are expected to fail (provided by ad SDKs at runtime)
const IGNORED_URLS = ['mraid.js', 'favicon'];

interface BrowserLog {
  type: 'error' | 'warning';
  text: string;
}

interface NetworkError {
  url: string;
}

/**
 * Open a local HTML file in headless browser, wait for Cocos boot,
 * and collect all console errors and network failures.
 */
async function verifyHtmlInBrowser(browser: Browser, htmlPath: string, timeoutMs = 10000): Promise<{
  errors: BrowserLog[];
  networkErrors: NetworkError[];
  uncaughtExceptions: string[];
}> {
  const page: Page = await browser.newPage();
  const errors: BrowserLog[] = [];
  const networkErrors: NetworkError[] = [];
  const uncaughtExceptions: string[] = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const location = msg.location();
      const locStr = location.url ? ` [${location.url}]` : '';
      errors.push({ type: 'error', text: msg.text() + locStr });
    }
  });

  page.on('pageerror', (err) => {
    uncaughtExceptions.push(err.message);
  });

  page.on('requestfailed', (request) => {
    const url = request.url();
    const isIgnored = IGNORED_URLS.some(ignored => url.includes(ignored));
    if (!isIgnored) {
      networkErrors.push({ url });
    }
  });

  await page.goto(`file://${htmlPath}`, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

  try {
    await page.waitForFunction(
      () => (window as any).__res && Object.keys((window as any).__res).length > 0,
      { timeout: timeoutMs },
    );
  } catch {
    // unpack failed — will show up as test failure via critical errors
  }

  // Allow time for Cocos engine initialization
  await page.waitForTimeout(2000);
  await page.close();

  return { errors, networkErrors, uncaughtExceptions };
}

/**
 * Filter out noise: only keep critical errors related to missing resources,
 * undefined references, broken asset loading, or shader failures.
 */
function getCriticalErrors(result: Awaited<ReturnType<typeof verifyHtmlInBrowser>>) {
  const critical: string[] = [];

  // Network errors are always critical (ignored ones already filtered)
  for (const ne of result.networkErrors) {
    critical.push(`Network error: ${ne.url}`);
  }

  // Uncaught exceptions
  for (const ex of result.uncaughtExceptions) {
    // Ignore WebGL/canvas/audio errors (expected in headless without GPU/audio)
    if (ex.includes('WebGL') || ex.includes('canvas') || ex.includes('GPU')) continue;
    if (ex.includes('AudioContext') || ex.includes('GamepadEvent')) continue;
    critical.push(`Uncaught: ${ex}`);

    // Specific: broken binary asset loading
    if (ex.includes('Cannot read properties of') && ex.includes("reading 'length'")) {
      critical.push(`AssetLoad: ${ex}`);
    }
    // Specific: shader init failure from corrupted effect.bin
    if (ex.includes('Cannot read properties of null') && ex.includes("reading 'blocks'")) {
      critical.push(`ShaderInit: ${ex}`);
    }
  }

  for (const err of result.errors) {
    // Network file-not-found errors
    if (err.text.includes('ERR_FILE_NOT_FOUND') || err.text.includes('net::ERR_')) {
      const isIgnored = IGNORED_URLS.some(ignored => err.text.includes(ignored));
      if (!isIgnored) {
        critical.push(`Console: ${err.text}`);
      }
    }
    // "X is not defined" errors indicate missing scripts
    if (err.text.match(/\b\w+\s+is not defined\b/) && !err.text.includes('[plbx]')) {
      critical.push(`Console: ${err.text}`);
    }
    // Shader program errors indicate binary effect.bin loaded incorrectly
    if (err.text.includes('program:') && err.text.includes('not found')) {
      critical.push(`Shader: ${err.text}`);
    }
  }

  return critical;
}

// ─── Test Projects ───────────────────────────────────────────────────────────

const PROJECTS = [
  {
    name: 'spades',
    fixtureDir: join(__dirname, '../fixtures/spades-build'),
    config: {
      storeUrlIos: 'https://apps.apple.com/app/spades',
      storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.playbox.spades',
      orientation: 'portrait' as const,
    },
  },
  {
    name: 'roadside',
    fixtureDir: join(__dirname, '../fixtures/roadside-build'),
    config: {
      storeUrlIos: 'https://apps.apple.com/app/roadside',
      storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.playbox.roadside',
      orientation: 'landscape' as const,
    },
  },
];

const HTML_NETWORKS = ['ironsource', 'applovin', 'unity', 'facebook'] as const;

for (const project of PROJECTS) {
  const buildDir = join(project.fixtureDir, 'web-mobile');
  const outputDir = join(project.fixtureDir, 'pack-output');
  const hasBuild = existsSync(buildDir);
  const describeIf = hasBuild ? describe : describe.skip;

  describeIf(`Browser verification: ${project.name}`, () => {
    let browser: Browser;

    beforeAll(async () => {
      if (existsSync(outputDir)) rmSync(outputDir, { recursive: true, force: true });
      mkdirSync(outputDir, { recursive: true });
      browser = await chromium.launch({ headless: true });
    }, 30000);

    afterAll(async () => {
      if (browser) await browser.close();
    });

    for (const networkId of HTML_NETWORKS) {
      it(`${networkId} HTML should load without critical errors`, async () => {
        const result = await packageForNetworks({
          buildDir,
          outputDir,
          networks: [networkId],
          config: project.config,
        });

        const htmlResult = result.results.find(r => r.format === 'html');
        expect(htmlResult).toBeDefined();
        expect(existsSync(htmlResult!.outputPath)).toBe(true);

        const browserResult = await verifyHtmlInBrowser(browser, htmlResult!.outputPath, 15000);
        const critical = getCriticalErrors(browserResult);

        if (critical.length > 0) {
          console.log(`\n  ${project.name}/${networkId} critical errors:`);
          critical.forEach(e => console.log('    -', e));
        }
        console.log(`  ${project.name}/${networkId}: ${browserResult.errors.length} console, ${browserResult.networkErrors.length} network, ${browserResult.uncaughtExceptions.length} exceptions, ${critical.length} critical`);

        expect(critical).toEqual([]);
      }, 120000);
    }
  });
}
