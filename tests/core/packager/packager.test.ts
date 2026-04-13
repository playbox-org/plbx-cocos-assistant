import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
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
  writeFileSync(join(MOCK_BUILD, 'index.html'),
    '<!DOCTYPE html><html><head><title>Game</title></head><body><script src="main.js"></script></body></html>');
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
    const formats = result.results.map(r => r.format);
    expect(formats).toContain('html');
    expect(formats).toContain('zip');
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
    expect(html).toContain('window.__zip');
    expect(html).toContain('window.__res');
    expect(html).toContain('JSZip');
    expect(html).toContain('XMLHttpRequest');
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
    await expect(packageForNetworks({
      buildDir: '/nonexistent/path',
      outputDir: PACK_OUTPUT,
      networks: ['applovin'],
      config: defaultConfig,
    })).rejects.toThrow('Build HTML not found');
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
    const errorCall = onProgress.mock.calls.find(
      ([, phase]) => phase === 'error',
    );
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
