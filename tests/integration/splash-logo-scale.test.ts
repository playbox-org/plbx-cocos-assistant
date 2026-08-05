/**
 * Integration: the custom splash logo size travels the whole editor path —
 * ProjectSettings → toPackageConfig → the kit's packager → emitted HTML.
 *
 * The unit tests cover each hop; this one guards the seam. The reported bug was
 * a logo shipping at a size nobody chose, which only a full-path assertion
 * catches.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { packageForNetworks } from '@playbox-ai/playable-kit';
import { existsSync, readFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { DEFAULT_SETTINGS, toPackageConfig } from '../../src/core/settings';

const FIXTURES = join(__dirname, '../fixtures');
// sample-build, not roadside-build: the real Cocos build is not in the repo, and
// the packager only requires an index.html to produce a full HTML artifact.
const BUILD_DIR = join(FIXTURES, 'sample-build');
const OUTPUT_DIR = join(FIXTURES, 'output-splash-scale');
const LOGO = join(FIXTURES, 'test-image.png');

describe('Integration: custom splash logo scale reaches the build', () => {
  beforeAll(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
    mkdirSync(OUTPUT_DIR, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(OUTPUT_DIR)) rmSync(OUTPUT_DIR, { recursive: true, force: true });
  });

  const packageWith = async (settings: Partial<typeof DEFAULT_SETTINGS>, outDir: string) => {
    const result = await packageForNetworks({
      buildDir: BUILD_DIR,
      outputDir: outDir,
      networks: ['ironsource'],
      config: toPackageConfig({ ...DEFAULT_SETTINGS, orientation: 'landscape', ...settings }),
    });
    return readFileSync(result.results[0].outputPath, 'utf-8');
  };

  it('emits the configured scale and drops the old fixed px cap', async () => {
    const html = await packageWith(
      { splashMode: 'custom', customSplashLogo: LOGO, splashLogoScale: 60 },
      join(OUTPUT_DIR, 'scaled'),
    );
    expect(html).toContain('max-width:60vmin');
    expect(html).toContain('max-height:60vmin');
    expect(html).not.toContain('max-width:96px');
  }, 120_000);

  it('leaves the branded splash unscaled in playbox mode', async () => {
    const html = await packageWith(
      { splashMode: 'playbox', customSplashLogo: LOGO, splashLogoScale: 60 },
      join(OUTPUT_DIR, 'playbox'),
    );
    // A stored scale must not leak onto the PLBX mark's fixed size.
    expect(html).toContain('#lg{width:84px;height:84px}');
    expect(html).not.toContain('vmin');
  }, 120_000);
});
