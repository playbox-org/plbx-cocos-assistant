import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import JSZip from 'jszip';
import { packageForNetworks } from '../../../src/core/packager/packager';
import { join } from 'path';
import { mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'fs';

const FIXTURES = join(__dirname, '../../fixtures');
const MOCK_BUILD = join(FIXTURES, 'mock-build');
const PACK_OUTPUT = join(FIXTURES, 'pack-output');

beforeAll(() => {
  mkdirSync(MOCK_BUILD, { recursive: true });
  mkdirSync(join(MOCK_BUILD, 'assets'), { recursive: true });
  // Create a minimal Cocos-like build output
  writeFileSync(
    join(MOCK_BUILD, 'index.html'),
    '<!DOCTYPE html><html><head><title>Game</title></head><body><script src="main.js"></script></body></html>',
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

describe('packageForNetworks', () => {
  it('should package for a single HTML network', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].networkId).toBe('applovin');
    expect(result.results[0].format).toBe('html');
    expect(result.results[0].outputSize).toBeGreaterThan(0);
    expect(existsSync(result.results[0].outputPath)).toBe(true);
  });

  it('should package for a ZIP network', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['google'],
      config: defaultConfig,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].format).toBe('zip');
    expect(result.results[0].outputPath).toContain('.zip');
  });

  it('should package for multiple networks', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin', 'google', 'facebook'],
      config: defaultConfig,
    });
    // facebook has dualFormat=true, so it produces 2 results (html + zip)
    expect(result.results).toHaveLength(4);
    expect(result.totalTime).toBeGreaterThan(0);
  });

  it('should produce dual format outputs for dualFormat networks', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['facebook'],
      config: defaultConfig,
    });
    expect(result.results).toHaveLength(2);
    const formats = result.results.map((r) => r.format);
    expect(formats).toContain('html');
    expect(formats).toContain('zip');
  });

  it('should produce dual format outputs for liftoff (html + self-contained zip)', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['liftoff'],
      config: defaultConfig,
    });
    expect(result.results).toHaveLength(2);
    const htmlResult = result.results.find((r) => r.format === 'html');
    const zipResult = result.results.find((r) => r.format === 'zip');
    expect(htmlResult).toBeDefined();
    expect(zipResult).toBeDefined();
    expect(htmlResult!.outputSize).toBeGreaterThan(0);
    expect(zipResult!.outputSize).toBeGreaterThan(0);
    // ZIP should contain self-contained HTML (smaller than raw HTML due to compression)
    expect(zipResult!.outputPath).toContain('.zip');
    // HTML output should contain inlined assets
    const html = readFileSync(htmlResult!.outputPath, 'utf-8');
    expect(html).toContain('window.__plbx_zip');
    expect(html).toContain('mraid.js');
  });

  it('should embed runtime loader in HTML output', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
    });
    const htmlPath = result.results[0].outputPath;
    const html = readFileSync(htmlPath, 'utf-8');
    expect(html).toContain('window.__plbx_zip');
    expect(html).toContain('window.__plbx_res');
    expect(html).toContain('JSZip');
    expect(html).toContain('plbx_boot');
  });

  it('should validate size limits', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
    });
    // Our mock build is tiny, should be within limit
    expect(result.results[0].withinLimit).toBe(true);
  });

  it('should call onProgress callback', async () => {
    const onProgress = vi.fn();
    await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
      onProgress,
    });
    expect(onProgress).toHaveBeenCalledWith('applovin', 'starting');
    expect(onProgress).toHaveBeenCalledWith('applovin', 'done');
  });

  it('should handle unknown network gracefully', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['nonexistent'],
      config: defaultConfig,
    });
    expect(result.results[0].withinLimit).toBe(false);
    expect(result.results[0].outputSize).toBe(0);
  });

  it('should throw when build HTML is missing', async () => {
    await expect(
      packageForNetworks({
        buildDir: '/nonexistent/path',
        outputDir: PACK_OUTPUT,
        networks: ['applovin'],
        config: defaultConfig,
      }),
    ).rejects.toThrow('Build HTML not found');
  });
});

describe('validator-forbidden string enforcement', () => {
  it('should succeed for mintegral when HTML is clean', async () => {
    const onProgress = vi.fn();
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: defaultConfig,
      onProgress,
    });
    expect(result.results).toHaveLength(1);
    expect(result.results[0].outputPath).not.toBe('');
    expect(result.results[0].outputSize).toBeGreaterThan(0);
    expect(onProgress).toHaveBeenCalledWith('mintegral', 'done');
  });

  it('mintegral inner HTML + zip filename use only letters/numbers/underscores (no dashes)', async () => {
    // Mintegral 2026 moderation: "Html file name are supported with letters,
    // Numbers, and underscores only." The auto-name path derives the playable
    // name from assetTitle / projectName / the build folder; a hyphenated source
    // like "candivore-carousel-of-seasons" must NOT leak dashes into the entry
    // name (htmlMatchesZipName → inner HTML == zip basename, so sanitize both).
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: defaultConfig,
      templateVariables: { assetTitle: 'candivore-carousel-of-seasons' },
    });
    const out = result.results[0];
    expect(out.error).toBeFalsy();
    const zip = await JSZip.loadAsync(readFileSync(out.outputPath));
    const htmlEntries = Object.keys(zip.files).filter((f) => f.endsWith('.html'));
    expect(htmlEntries).toHaveLength(1);
    const innerBase = htmlEntries[0].replace(/\.html$/, '').split('/').pop()!;
    expect(innerBase).toMatch(/^[A-Za-z0-9_]+$/);
    // htmlMatchesZipName: the outer .zip basename must equal the inner HTML base.
    const zipBase = out.outputPath.split('/').pop()!.replace(/\.zip$/, '');
    expect(zipBase).toBe(innerBase);
  });

  it('should fail mintegral build when injected content contains preview-util.js', async () => {
    const onProgress = vi.fn();
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: {
        ...defaultConfig,
        // User-supplied inject that would otherwise land in the final HTML
        // and trip the PlayTurbo validator.
        customInjectBody: '/* pulled from preview-util.js docs */',
      },
      onProgress,
    });
    expect(result.results[0].outputPath).toBe('');
    expect(result.results[0].outputSize).toBe(0);
    const errorCall = onProgress.mock.calls.find(([, phase]) => phase === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall![2]).toContain('preview-util');
    expect(errorCall![2]).toContain('Mintegral');
  });

  it('should NOT fail applovin build when content contains preview-util.js', async () => {
    // Other networks have no forbidden list, so this string is fine for them.
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: {
        ...defaultConfig,
        customInjectBody: '/* preview-util.js ref */',
      },
    });
    expect(result.results[0].outputPath).not.toBe('');
    expect(result.results[0].outputSize).toBeGreaterThan(0);
  });
});

describe('startup version banner', () => {
  it('injects the assistant name + version banner into the HTML output', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
      packagerVersion: '0.2.3',
    });
    const html = readFileSync(result.results[0].outputPath, 'utf-8');
    expect(html).toContain('@playbox-org/plbx-cocos-assistant');
    expect(html).toContain('v0.2.3');
    expect(html).toContain('https://github.com/playbox-org/plbx-cocos-assistant');
  });
});

describe('store URL <head> comment (validator parity with super-html)', () => {
  it('mirrors a PackageConfig store URL as a plaintext <head> comment', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['unity'],
      config: defaultConfig,
    });
    const html = readFileSync(result.results[0].outputPath, 'utf-8');
    const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
    expect(head).toContain('<!-- https://play.google.com/store/apps/details?id=com.test -->');
  });

  it('extracts a store URL from the build source (set_google_play_url) into a <head> comment', async () => {
    const extractBuild = join(FIXTURES, 'extract-build');
    mkdirSync(extractBuild, { recursive: true });
    writeFileSync(
      join(extractBuild, 'index.html'),
      '<!DOCTYPE html><html><head><title>Game</title></head><body><script src="main.js"></script></body></html>',
    );
    writeFileSync(
      join(extractBuild, 'main.js'),
      'plbx.set_google_play_url("https://play.google.com/store/apps/details?id=com.extracted.game");',
    );
    try {
      const result = await packageForNetworks({
        buildDir: extractBuild,
        outputDir: PACK_OUTPUT,
        networks: ['unity'],
        // No store URL in config — must come from the extracted code literal.
        config: { orientation: 'portrait' as const },
      });
      const html = readFileSync(result.results[0].outputPath, 'utf-8');
      const head = html.match(/<head>([\s\S]*?)<\/head>/)?.[1] ?? '';
      expect(head).toContain('<!-- https://play.google.com/store/apps/details?id=com.extracted.game -->');
      expect(result.results[0].warnings ?? []).toHaveLength(0);
    } finally {
      rmSync(extractBuild, { recursive: true, force: true });
    }
  });
});

describe('Google Play URL warning (requiresStoreUrl networks)', () => {
  it('warns (does not fail) when Unity build has no Google Play Store URL', async () => {
    const onProgress = vi.fn();
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD, // main.js has no store URL
      outputDir: PACK_OUTPUT,
      networks: ['unity'],
      config: { orientation: 'portrait' as const }, // no store URLs
      onProgress,
    });
    // Build still succeeds (non-fatal)
    expect(result.results[0].outputPath).not.toBe('');
    expect(result.results[0].outputSize).toBeGreaterThan(0);
    // Warning is surfaced on the result and via onProgress
    const warnings = result.results[0].warnings ?? [];
    expect(warnings.some((w) => w.includes('Google Play Store URL'))).toBe(true);
    expect(onProgress).toHaveBeenCalledWith('unity', 'done');
    const warnCall = onProgress.mock.calls.find(([, phase, msg]) => phase === 'processing' && /Google Play/.test(msg ?? ''));
    expect(warnCall).toBeDefined();
  });

  it('does NOT warn for Unity when a Google Play URL is present', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['unity'],
      config: defaultConfig, // has play.google URL
    });
    expect(result.results[0].warnings ?? []).toHaveLength(0);
  });

  it('does NOT warn for non-requiresStoreUrl networks (applovin) without a store URL', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: { orientation: 'portrait' as const },
    });
    // applovin is not requiresStoreUrl → no Google Play Store URL warning.
    // (Axon advisory warnings may still appear and are asserted separately.)
    const storeWarnings = (result.results[0].warnings ?? []).filter((w) => w.includes('Google Play Store URL'));
    expect(storeWarnings).toHaveLength(0);
  });
});

describe('AppLovin Axon event-spec warnings', () => {
  it('stays silent when the build uses no Axon events at all (optional integration)', async () => {
    // MOCK_BUILD's main.js has no trackEvent() calls — Axon is optional, so a
    // game that never integrates it must not get an advisory on every package.
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
    });
    const axonWarnings = (result.results[0].warnings ?? []).filter((w) => w.includes('Axon'));
    expect(axonWarnings).toHaveLength(0);
    expect(result.results[0].outputSize).toBeGreaterThan(0);
  });

  it('does NOT warn about Axon for non-AppLovin networks', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['unity'],
      config: defaultConfig,
    });
    const axonWarnings = (result.results[0].warnings ?? []).filter((w) => w.includes('Axon'));
    expect(axonWarnings).toHaveLength(0);
  });
});

describe('Regional store-URL warnings', () => {
  const regional = (r: any) => (r.warnings ?? []).filter((w: string) => /regional/i.test(w));

  it('warns (any network) when a store URL carries a regional parameter', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['google'],
      config: {
        storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.test&gl=US',
        orientation: 'portrait' as const,
      },
    });
    expect(regional(result.results[0]).length).toBeGreaterThan(0);
  });

  it('does NOT warn for a region-clean store URL', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['google'],
      config: {
        storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.test',
        orientation: 'portrait' as const,
      },
    });
    expect(regional(result.results[0])).toHaveLength(0);
  });
});

describe('Mintegral inner HTML filename (matches outer ZIP name)', () => {
  const innerNames = async (outputPath: string): Promise<string[]> => {
    const zip = await JSZip.loadAsync(readFileSync(outputPath));
    return Object.keys(zip.files).filter((p) => !zip.files[p].dir);
  };

  it('names the inner HTML after the outer .zip basename when template is explicit (Mintegral 2026 rule)', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: defaultConfig,
      outputTemplate: '{networkId}/RISE_play036_01.{ext}',
    });
    const r = result.results.find((x) => x.networkId === 'mintegral')!;
    expect(r.outputPath).toContain('RISE_play036_01.zip');
    const names = await innerNames(r.outputPath);
    expect(names).toContain('RISE_play036_01.html');
    expect(names).not.toContain('index.html');
  });

  it('auto-names zip + inner HTML after the playable (build dir) with the DEFAULT template — works out of the box', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: defaultConfig,
      // no outputTemplate → default {networkId}/index.{ext}; must NOT stay index
    });
    const r = result.results.find((x) => x.networkId === 'mintegral')!;
    // MOCK_BUILD's folder name ("mock-build") is the derived playable name. The
    // dash is sanitized to an underscore — Mintegral moderation allows only
    // letters/numbers/underscores in the HTML/zip filename.
    expect(r.outputPath).toContain('mock_build.zip');
    expect(r.outputPath).not.toContain('mock-build.zip');
    expect(r.outputPath).not.toContain('index.zip');
    const names = await innerNames(r.outputPath);
    expect(names).toContain('mock_build.html');
    expect(names).not.toContain('index.html');
  });

  it('lets templateVariables.assetTitle override the derived playable name (default template)', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mintegral'],
      config: defaultConfig,
      templateVariables: { assetTitle: 'RISE_play036_01' },
    });
    const r = result.results.find((x) => x.networkId === 'mintegral')!;
    expect(r.outputPath).toContain('RISE_play036_01.zip');
    const names = await innerNames(r.outputPath);
    expect(names).toContain('RISE_play036_01.html');
    expect(names).not.toContain('index.html');
  });

  it('does NOT rename inner HTML for other singleFileZip networks (scope = Mintegral only)', async () => {
    const result = await packageForNetworks({
      buildDir: MOCK_BUILD,
      outputDir: PACK_OUTPUT,
      networks: ['mytarget'],
      config: defaultConfig,
      outputTemplate: '{networkId}/RISE_play036_01.{ext}',
    });
    const r = result.results.find((x) => x.networkId === 'mytarget')!;
    const names = await innerNames(r.outputPath);
    expect(names).toContain('index.html');
    expect(names).not.toContain('RISE_play036_01.html');
  });
});
