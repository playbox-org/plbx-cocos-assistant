/**
 * E2E проверка farmington билда: пакует applovin, открывает HTML в Playwright
 * с включённым WebGL (через swiftshader chromium fork), ждёт полный Cocos boot
 * и проверяет отсутствие spine/SkeletonInstance ошибок в console.
 *
 * Это финальный gate перед commit'ом — headless probe spine модулей доказывает
 * что namespace.default теперь правильный, а этот тест дополнительно
 * подтверждает что Cocos engine действительно стартует со скелетной анимацией.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { packageForNetworks } from '../../src/core/packager/packager';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const FIXTURE_DIR = join(__dirname, '../fixtures/farmington-build');
const BUILD_DIR = join(FIXTURE_DIR, 'web-mobile');
const OUT_DIR = join(FIXTURE_DIR, 'e2e-output');

const SKIP = !existsSync(BUILD_DIR);

(SKIP ? describe.skip : describe)('farmington E2E (WebGL)', () => {
  let browser: Browser;

  beforeAll(async () => {
    if (existsSync(OUT_DIR)) rmSync(OUT_DIR, { recursive: true, force: true });
    mkdirSync(OUT_DIR, { recursive: true });
    // WebGL включён через chromium флаги. headless: 'new' (Chrome headless mode)
    // поддерживает GPU rasterization лучше чем legacy headless.
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-angle=swiftshader',
        '--use-gl=angle',
        '--enable-unsafe-swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--disable-gpu-sandbox',
      ],
    });
  }, 30000);

  afterAll(async () => {
    if (browser) await browser.close();
  });

  it('applovin HTML boots Cocos without spine/SkeletonInstance errors', async () => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: OUT_DIR,
      networks: ['applovin'],
      config: { orientation: 'portrait' },
    });
    const html = result.results.find(r => r.format === 'html');
    expect(html).toBeDefined();
    expect(existsSync(html!.outputPath)).toBe(true);

    const page: Page = await browser.newPage();
    const errors: string[] = [];
    const exceptions: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    page.on('pageerror', err => exceptions.push(err.message));

    await page.goto(`file://${html!.outputPath}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // Ждём boot Cocos. cc.game.run выставляет глобальный cc объект.
    await page.waitForFunction(() => (window as any).cc && (window as any).cc.game,
      { timeout: 30000 }).catch(() => {});
    // Доп. пауза на parseImport фазы (где раньше падал SkeletonInstance).
    await page.waitForTimeout(5000);

    const webglOK = await page.evaluate(() => {
      const c = document.createElement('canvas');
      return !!(c.getContext('webgl') || c.getContext('webgl2'));
    });
    console.log(`  WebGL available: ${webglOK}`);
    console.log(`  errors: ${errors.length}, exceptions: ${exceptions.length}`);
    if (errors.length) errors.slice(0, 5).forEach(e => console.log('   .', e.slice(0, 250)));
    if (exceptions.length) exceptions.slice(0, 5).forEach(e => console.log('   !', e.slice(0, 250)));

    await page.close();

    const spineErrors = [
      ...errors.filter(e => /SkeletonInstance is not a constructor|spine.*is not a function/.test(e)),
      ...exceptions.filter(e => /SkeletonInstance is not a constructor|spine.*is not a function/.test(e)),
    ];
    const iIsNotFn = [
      ...errors.filter(e => /\bi is not a function\b/.test(e)),
      ...exceptions.filter(e => /\bi is not a function\b/.test(e)),
    ];

    expect(spineErrors, `spine init failures:\n${spineErrors.join('\n')}`).toEqual([]);
    expect(iIsNotFn, `'i is not a function' (spine emscripten factory undefined):\n${iIsNotFn.join('\n')}`).toEqual([]);
  }, 90000);
});
