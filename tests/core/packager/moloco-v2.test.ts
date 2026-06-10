import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { packageForNetworks } from '../../../src/core/packager/packager';
import {
  buildLauncher,
  fillLauncherPayloadUrl,
  validateLauncher,
  MOLOCO_V2_MACRO_SPEC,
  LAUNCHER_MAX_BYTES,
  PAYLOAD_URL_RESERVE_BYTES,
  effectiveLauncherBytes,
} from '../../../src/core/packager/launcher-builder';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';
import vm from 'vm';
import { MolocoV2Adapter } from '../../../src/core/packager/network-adapters/moloco-v2';

const FIXTURES = join(__dirname, '../../fixtures');
const MOCK_BUILD = join(FIXTURES, 'mock-build-mv2');
const PACK_OUTPUT = join(FIXTURES, 'pack-output-mv2');

beforeAll(() => {
  mkdirSync(MOCK_BUILD, { recursive: true });
  mkdirSync(join(MOCK_BUILD, 'assets'), { recursive: true });
  writeFileSync(
    join(MOCK_BUILD, 'index.html'),
    '<!DOCTYPE html><html><head><title>Game</title></head><body><canvas id="GameCanvas"></canvas><script src="main.js"></script></body></html>',
  );
  writeFileSync(join(MOCK_BUILD, 'main.js'), 'console.log("game");');
  writeFileSync(join(MOCK_BUILD, 'assets', 'sprite.png'), Buffer.alloc(200));
});

afterAll(() => {
  if (existsSync(MOCK_BUILD)) rmSync(MOCK_BUILD, { recursive: true, force: true });
  if (existsSync(PACK_OUTPUT)) rmSync(PACK_OUTPUT, { recursive: true, force: true });
});

const defaultConfig = {
  storeUrlIos: 'https://apps.apple.com/app/123',
  storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.test',
  orientation: 'portrait' as const,
};

describe('MolocoV2 target', () => {
  it('produces launcher.html under 3 KB strict limit', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    expect(r.results).toHaveLength(1);
    expect(r.results[0].format).toBe('launcher-payload');
    expect(r.results[0].outputSize).toBeLessThan(3072);
    expect(r.results[0].withinLimit).toBe(true);
  });

  it('honors templateVariables.assetProvider / assetTitle in the launcher metadata', async () => {
    await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
      templateVariables: { assetProvider: 'MyStudio', assetTitle: 'My Great Game' },
    });
    const launcher = readFileSync(join(PACK_OUTPUT, 'molocoV2', 'launcher.html'), 'utf-8');
    expect(launcher).toContain('ASSET_PROVIDER=MyStudio;');
    expect(launcher).toContain('ASSET_TITLE=My Great Game;');
  });

  it('default includeSplash:false fits well under 2 KB to leave headroom for asset titles', async () => {
    const launcher = buildLauncher({
      assetProvider: 'Playbox',
      assetTitle: 'A reasonably-titled playable ad with descriptive name',
      assetRevision: '2026-05-28',
      assetVersion: '2.0',
      payloadUrl: '#PAYLOAD_URL#',
      includeSplash: false,
    });
    expect(Buffer.byteLength(launcher, 'utf-8')).toBeLessThan(2048);
  });

  it('emits payload.js as an IIFE', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payloadPath = r.results[0].secondaryPath!;
    expect(payloadPath).toBeDefined();
    const payload = readFileSync(payloadPath, 'utf-8');
    expect(payload.startsWith('(function(){')).toBe(true);
    expect(payload.trimEnd().endsWith('})();')).toBe(true);
  });

  it('fires the mraid_viewable beacon exactly once (fireOnce, not fire)', async () => {
    // Regression: fireMraidViewable guards on _fired['mraid_viewable'], but only
    // fireOnce() writes _fired — a bare fire() leaves the guard permanently false
    // so the beacon re-fires on every viewableChange / poll tick (Moloco DSP
    // expects one viewable per session).
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payload = readFileSync(r.results[0].secondaryPath!, 'utf-8');
    expect(payload).toContain("fireOnce('mraid_viewable')");
    expect(payload).not.toContain("fire('mraid_viewable')");
  });

  it('launcher contains all required structural elements + macros', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const launcher = readFileSync(r.results[0].outputPath, 'utf-8');
    expect(launcher).toContain('window.MOLOCO_MACROS');
    // Twelve macros: 4 validator-required + lifecycle + thresholds + cachebuster + close
    for (const key of [
      'mraid_viewable',
      'game_viewable',
      'click',
      'final_url',
      'engagement',
      'complete',
      'redirection',
      'start_muted',
      'taps_for_engagement',
      'taps_for_redirection',
      'cachebuster',
      'draw_custom_close_button',
    ]) {
      expect(launcher).toContain(key);
    }
    expect(launcher).toMatch(/%\{IMP_BEACON\}\s*<\/body>/);
    expect(launcher).toMatch(/<!--\s*ASSET_PROVIDER=Playbox/);
    expect(launcher).toContain('#PAYLOAD_URL#');
    expect(launcher).toMatch(/<script\s+src=["']?mraid\.js/);
  });

  it('emits self-contained launcher-local.html with inlined payload for QA', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const launcherPath = r.results[0].outputPath;
    const localPath = launcherPath.replace(/launcher\.html$/, 'launcher-local.html');
    expect(existsSync(localPath)).toBe(true);
    const local = readFileSync(localPath, 'utf-8');
    expect(local).not.toContain('#PAYLOAD_URL#');
    // No external script ref — payload inlined
    expect(local).not.toMatch(/<script\s+src=["']?\.?\/?payload\.js/);
    // Inline payload IIFE present
    expect(local).toContain('(function(){');
    expect(local).toContain('DOMParser');
    // Find the inline payload script block — the one right before %{IMP_BEACON}.
    // Using negative-lookahead pattern to skip nested matches and grab only the
    // final <script>…</script> immediately before the beacon placeholder.
    const inlineMatch = local.match(/<script>((?:(?!<\/script>)[\s\S])*)<\/script>\s*%\{IMP_BEACON\}/);
    expect(inlineMatch).not.toBeNull();
    // Verify the inlined block has no raw </script> sequence (escaped to <\/script>)
    expect(inlineMatch![1]).not.toMatch(/<\/script>/i);
    expect(inlineMatch![1]).toContain('(function(){');
    // Production launcher.html keeps placeholder + external script ref
    const production = readFileSync(launcherPath, 'utf-8');
    expect(production).toContain('#PAYLOAD_URL#');
    expect(production).toMatch(/<script\s+src=["']?#PAYLOAD_URL#/);
  });

  it('derives assetTitle from buildDir basename when templateVariables missing', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const launcher = readFileSync(r.results[0].outputPath, 'utf-8');
    // MOCK_BUILD basename is "mock-build-mv2" — should be in the metadata header,
    // NOT the network display name "Moloco V2.0 (Launcher API)"
    expect(launcher).toContain('ASSET_TITLE=mock-build-mv2');
  });

  it('respects templateVariables.assetTitle override', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
      templateVariables: { assetTitle: 'Piggy Merge' },
    });
    const launcher = readFileSync(r.results[0].outputPath, 'utf-8');
    expect(launcher).toContain('ASSET_TITLE=Piggy Merge');
  });

  it('payload contains MOLOCO_MACROS handler shim + DOMParser-based injection', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payload = readFileSync(r.results[0].secondaryPath!, 'utf-8');
    // Uses DOMParser, not innerHTML, for body content
    expect(payload).toContain('DOMParser');
    expect(payload).not.toMatch(/\.innerHTML\s*=/);
    // Re-creates <script> via createElement, not dynamic-eval primitives
    expect(payload).toContain("createElement('script')");
    // MOLOCO_MACROS bridge + lifecycle hooks
    expect(payload).toContain('window.plbx_html.report');
    expect(payload).toContain('decodeURIComponent');
    expect(payload).toContain('MOLOCO_MACROS');
    // Defer-boot gate carried into payload
    expect(payload).toContain("mraid.addEventListener('viewableChange'");
    // Viewability must ALSO be polled via isViewable(): the launcher can fire the
    // first viewableChange before this payload's listener attaches, losing the
    // pulse (splash stuck until a 2nd pulse — "viewable only works the 2nd time").
    // Polling catches the already-viewable / missed-first-pulse case.
    expect(payload).toContain('mraid.isViewable()');
    expect(payload).toMatch(/setTimeout\(function\(\)\s*\{\s*poll\(/);
  });

  it('tap thresholds dynamic via taps_for_engagement / taps_for_redirection macros', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payload = readFileSync(r.results[0].secondaryPath!, 'utf-8');
    expect(payload).toContain("'taps_for_engagement'");
    expect(payload).toContain("'taps_for_redirection'");
    // Hardcoded === 1 / === 3 must NOT appear in the tap handler
    expect(payload).not.toMatch(/taps\s*===\s*1\b/);
    expect(payload).not.toMatch(/taps\s*===\s*3\b/);
  });

  it('payload does NOT define FbPlayableAd shim (MRAID-only path)', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payload = readFileSync(r.results[0].secondaryPath!, 'utf-8');
    // No legacy FAN bridge — CTA goes purely through mraid.open(final_url)
    expect(payload).not.toContain('window.FbPlayableAd');
    expect(payload).not.toContain('onCTAClick');
    // Sanity: still has the mraid CTA path
    expect(payload).toContain('mraid.open(dest)');
  });

  it('rejects build when content contains forbidden tracker strings', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: {
        ...defaultConfig,
        customInjectBody: '/* pulled from google-analytics.com docs */',
      },
    });
    expect(r.results[0].outputPath).toBe('');
    expect(r.results[0].outputSize).toBe(0);
  });

  it('renders the branded splash with an auto-hide hook, still under 3 KB', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const launcher = readFileSync(r.results[0].outputPath, 'utf-8');
    // Splash DOM + branded PLBX pinwheel mark (compact mode: whole-mark pulse,
    // CSS-text wordmark — the SVG wordmark would blow the 3 KB budget)
    expect(launcher).toContain('<div id="s">');
    expect(launcher).toContain('Playbox');
    expect(launcher).toContain('<svg id="lg"');
    expect(launcher).toContain('@keyframes pq');
    expect(launcher).toContain('url(#p0)');
    // Auto-hide hook + fallback timeout so the splash can never get stuck
    expect(launcher).toContain('window.__plbx_splash_hide');
    expect(launcher).toMatch(/setTimeout\(window\.__plbx_splash_hide,\s*\d+\)/);
    // Budget still respected with splash on
    expect(r.results[0].outputSize).toBeLessThan(3072);
    expect(r.results[0].withinLimit).toBe(true);
  });

  it('payload game_ready dismisses the launcher splash', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const payload = readFileSync(r.results[0].secondaryPath!, 'utf-8');
    // game_ready calls the splash hook guardedly (no-op when splash absent)
    expect(payload).toContain('__plbx_splash_hide');
    expect(payload).toMatch(/game_ready\s*=\s*function/);
  });

  it('quotes critical launcher attributes for strict QA parsers', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['molocoV2'],
      config: defaultConfig,
    });
    const launcher = readFileSync(r.results[0].outputPath, 'utf-8');
    expect(launcher).toContain('<script src="mraid.js"></script>');
    expect(launcher).toContain('<meta charset="utf-8">');
  });

  it('fillLauncherPayloadUrl substitutes placeholder with real CDN URL', () => {
    const launcher = buildLauncher({
      assetProvider: 'Playbox',
      assetTitle: 'Test',
      assetRevision: '2026-05-28',
      assetVersion: '2.0',
      payloadUrl: '#PAYLOAD_URL#',
      includeSplash: false,
    });
    const replaced = fillLauncherPayloadUrl(launcher, 'https://cdn.moloco.com/abc/payload.js');
    expect(replaced).not.toContain('#PAYLOAD_URL#');
    expect(replaced).toContain('https://cdn.moloco.com/abc/payload.js');
  });
});

describe('plbx_html stub additions regression', () => {
  it('existing networks still produce withinLimit builds after adding is_muted/report/tap stubs', async () => {
    const r = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin', 'mintegral', 'facebook', 'moloco'],
      config: defaultConfig,
    });
    // facebook + moloco are dualFormat → 2 entries each; applovin + mintegral → 1 each
    expect(r.results.length).toBeGreaterThan(0);
    for (const result of r.results) {
      expect(result.outputPath).not.toBe('');
      expect(result.outputSize).toBeGreaterThan(0);
      expect(result.withinLimit).toBe(true);
    }
  });
});

describe('validateLauncher (spec compliance gate)', () => {
  const baseOpts = {
    assetProvider: 'Playbox',
    assetTitle: 'Test Game',
    assetRevision: '20260603.00',
    assetVersion: '2.0',
    payloadUrl: '#PAYLOAD_URL#',
    includeSplash: false,
  };

  function fail(html: string, id: string): string | undefined {
    return validateLauncher(html).find((c) => c.id === id && !c.ok)?.detail;
  }

  it('passes a freshly built launcher on every check', () => {
    const checks = validateLauncher(buildLauncher(baseOpts));
    const failed = checks.filter((c) => !c.ok);
    expect(failed, JSON.stringify(failed)).toHaveLength(0);
  });

  it('emits exactly the Moloco spec placeholder tokens', () => {
    const launcher = buildLauncher(baseOpts);
    for (const m of MOLOCO_V2_MACRO_SPEC) {
      expect(launcher).toContain(`${m.key}:"${m.placeholder}"`);
    }
  });

  it('flags a non-spec macro value (the v0.2.4 regression)', () => {
    const bad = buildLauncher(baseOpts).replace('#CLICK_TEMPLATE_ESC#', '#CLICK#');
    expect(fail(bad, 'macro_values')).toContain('click');
  });

  it('flags a malformed ASSET_REVISION (ISO instead of YYYYMMDD.NN)', () => {
    const bad = buildLauncher({ ...baseOpts, assetRevision: '2026-06-03' });
    expect(fail(bad, 'asset_revision')).toBeTruthy();
  });

  it('accepts the #PAYLOAD_URL# placeholder and an absolute payload URL', () => {
    expect(fail(buildLauncher(baseOpts), 'no_relative_payload')).toBeUndefined();
    const filled = fillLauncherPayloadUrl(buildLauncher(baseOpts), 'https://cdn-f.adsmoloco.com/x/p.js');
    expect(fail(filled, 'no_relative_payload')).toBeUndefined();
  });

  it('flags a relative payload <script src> (but not mraid.js)', () => {
    const bad = buildLauncher(baseOpts).replace('#PAYLOAD_URL#', 'payload.js');
    expect(fail(bad, 'no_relative_payload')).toContain('payload.js');
  });

  describe('asset metadata sanitization', () => {
    // The metadata block is `<!--ASSET_PROVIDER=X;ASSET_TITLE=Y;...-->`:
    // `;`/`=` break key-value parsing, `--`/`>` break the HTML comment itself,
    // and Moloco QA expects plain names. Only a safe charset may pass through.

    it('strips structure-breaking characters from provider and title', () => {
      const launcher = buildLauncher({
        ...baseOpts,
        assetProvider: 'My;Studio=Inc--<b>',
        assetTitle: 'Game; Title=2 -- "quoted" <tag>',
      });
      const meta = launcher.slice(0, launcher.indexOf('-->') + 3);
      expect(meta).toContain('ASSET_PROVIDER=MyStudioInc');
      expect(meta).toContain('ASSET_TITLE=Game Title2 quoted');
      // No stray separators or comment-breakers inside values
      expect(meta).not.toMatch(/ASSET_TITLE=[^;]*[<>="]/);
    });

    it('collapses whitespace and trims', () => {
      const launcher = buildLauncher({ ...baseOpts, assetTitle: '  My   Game  ' });
      expect(launcher).toContain('ASSET_TITLE=My Game;');
    });

    it('keeps letters, digits, space, dash, underscore, dot untouched', () => {
      const launcher = buildLauncher({ ...baseOpts, assetTitle: 'piggy-merge_v2.0 RU' });
      expect(launcher).toContain('ASSET_TITLE=piggy-merge_v2.0 RU;');
    });

    it('still passes full validation after sanitization', () => {
      const launcher = buildLauncher({ ...baseOpts, assetTitle: 'Bad;Name=--' });
      expect(validateLauncher(launcher).filter((c) => !c.ok)).toHaveLength(0);
    });
  });

  it('flags IMP_BEACON that is not last before </body>', () => {
    const bad = buildLauncher(baseOpts).replace('%{IMP_BEACON}</body>', '%{IMP_BEACON}<div></div></body>');
    expect(fail(bad, 'imp_beacon')).toBeTruthy();
  });

  describe('size gate accounts for the real CDN URL (launcher-final regression)', () => {
    // Regression: launcher.html passed at 3020 B with the 13-char #PAYLOAD_URL#
    // placeholder, but launcher-final.html (real ~93-char CDN URL substituted)
    // came out 3097 B > 3072. The gate must reserve room for URL expansion.

    it('exports a reserve at least as long as a real Moloco CDN asset URL', () => {
      const real = 'https://cdn-f.adsmoloco.com/lkzEvERvJWoAD5Io/external/mq7w2jd2_atzkfgu_ol5h5sbyftowwphk.js';
      expect(PAYLOAD_URL_RESERVE_BYTES).toBeGreaterThanOrEqual(real.length);
    });

    it('effectiveLauncherBytes adds the URL reserve while the placeholder is present', () => {
      const launcher = buildLauncher(baseOpts);
      const raw = Buffer.byteLength(launcher, 'utf-8');
      expect(effectiveLauncherBytes(launcher)).toBe(raw - '#PAYLOAD_URL#'.length + PAYLOAD_URL_RESERVE_BYTES);
      // Once filled, the real size speaks for itself — no reserve.
      const filled = fillLauncherPayloadUrl(launcher, 'https://cdn-f.adsmoloco.com/x/p.js');
      expect(effectiveLauncherBytes(filled)).toBe(Buffer.byteLength(filled, 'utf-8'));
    });

    it('validateLauncher fails size when placeholder + reserve exceed the ceiling', () => {
      // Pad a valid launcher to just under the raw ceiling — placeholder form
      // passes a naive byte count but must fail once the reserve is applied.
      const launcher = buildLauncher(baseOpts);
      const pad = LAUNCHER_MAX_BYTES - Buffer.byteLength(launcher, 'utf-8') - 10;
      const padded = launcher.replace('<body>', `<body><!--${'x'.repeat(pad - 7)}-->`);
      expect(Buffer.byteLength(padded, 'utf-8')).toBeLessThanOrEqual(LAUNCHER_MAX_BYTES);
      expect(fail(padded, 'size')).toBeTruthy();
    });

    it('a compact-splash launcher with a long title fits the ceiling WITH the URL reserve', () => {
      // Mirrors the piggy-merge production config that overflowed.
      const launcher = buildLauncher({
        ...baseOpts,
        assetTitle: 'moloco-piggy-merge',
        includeSplash: true,
      });
      expect(effectiveLauncherBytes(launcher)).toBeLessThanOrEqual(LAUNCHER_MAX_BYTES);
      const failed = validateLauncher(launcher).filter((c) => !c.ok);
      expect(failed, JSON.stringify(failed)).toHaveLength(0);
    });
  });
});

describe('molocoV2 bridge — CTA fire & final_url fallback (§2.4)', () => {
  // Evaluate the real payload bridge in a sandbox with a fake window/mraid so we
  // can drive plbx_html.download() and observe mraid.open() + click beacons.
  function runBridge(macros: Record<string, string>) {
    const adapter = new MolocoV2Adapter('molocoV2', {} as any);
    const bridge: string = (adapter as any).getPlbxBridge({});
    const opens: string[] = [];
    const beacons: string[] = [];
    const mraid = {
      open: (u: string) => opens.push(u),
      addEventListener: () => {},
      removeEventListener: () => {},
      getState: () => 'default',
      isViewable: () => true,
      getAudioVolume: () => 100,
    };
    class FakeImage {
      set src(v: string) {
        beacons.push(v);
      }
    }
    const win: any = { mraid, MOLOCO_MACROS: macros, open: () => {} };
    const ctx: any = {
      window: win,
      mraid,
      Image: FakeImage,
      Date,
      setTimeout: () => 0,
      clearTimeout: () => {},
      console,
      decodeURIComponent,
    };
    vm.createContext(ctx);
    vm.runInContext(bridge, ctx);
    return { win, opens, beacons };
  }

  it('fires the CTA once per click even when download() is called twice (double-fire collapse)', () => {
    const { win, opens, beacons } = runBridge({ final_url: 'https://final', click: 'https://click' });
    win.plbx_html.download();
    win.plbx_html.download(); // same tap re-dispatched via super_html alias / synthesized click
    expect(opens).toEqual(['https://final']); // one mraid.open, final_url precedence
    expect(beacons.filter((b) => b === 'https://click')).toHaveLength(1); // one click beacon
  });

  it('falls back to click when final_url is empty (§2.4)', () => {
    const { win, opens } = runBridge({ final_url: '', click: 'https://click' });
    win.plbx_html.download();
    expect(opens).toEqual(['https://click']);
  });

  it('still triggers mraid.open() when both final_url and click are empty (§2.4)', () => {
    const { win, opens } = runBridge({ final_url: '', click: '' });
    win.plbx_html.download();
    expect(opens).toEqual(['']); // mraid.open fired regardless of value
  });
});
