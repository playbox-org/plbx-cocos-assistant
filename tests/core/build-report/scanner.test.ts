import { describe, it, expect, vi, beforeAll } from 'vitest';
import { scanAssets, AssetInfo } from '../../../src/core/build-report/scanner';
import { scanAssetsHybrid } from '../../../src/core/build-report/scanner';
import type { QueryDependenciesFn } from '../../../src/core/build-report/dependency-resolver';
import { join } from 'path';
import { writeFileSync, mkdirSync, existsSync } from 'fs';

const FIXTURES = join(__dirname, '../../fixtures');
const FAKE_TEXTURE = join(FIXTURES, 'fake-texture.png');
const FAKE_AUDIO = join(FIXTURES, 'fake-audio.mp3');
const FAKE_SCRIPT = join(FIXTURES, 'fake-script.ts');

beforeAll(() => {
  if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
  // Create fake files with known sizes
  writeFileSync(FAKE_TEXTURE, Buffer.alloc(50000)); // 50KB
  writeFileSync(FAKE_AUDIO, Buffer.alloc(200000));  // 200KB
  writeFileSync(FAKE_SCRIPT, Buffer.alloc(5000));    // 5KB
});

function createMockQueryFn(assets: AssetInfo[]): (type?: string) => Promise<AssetInfo[]> {
  return async (type?: string) => {
    if (type) return assets.filter(a => a.type === type);
    return assets;
  };
}

const mockAssets: AssetInfo[] = [
  {
    name: 'player.png',
    path: 'assets/textures/player.png',
    url: 'db://assets/textures/player.png',
    uuid: 'uuid-texture-1',
    type: 'cc.Texture2D',
    file: FAKE_TEXTURE,
    isDirectory: false,
    importer: 'texture',
  },
  {
    name: 'bgm.mp3',
    path: 'assets/audio/bgm.mp3',
    url: 'db://assets/audio/bgm.mp3',
    uuid: 'uuid-audio-1',
    type: 'cc.AudioClip',
    file: FAKE_AUDIO,
    isDirectory: false,
    importer: 'audio-clip',
  },
  {
    name: 'textures',
    path: 'assets/textures',
    url: 'db://assets/textures',
    uuid: 'uuid-dir-1',
    type: 'cc.Texture2D',
    file: '/nonexistent',
    isDirectory: true,
    importer: '',
  },
];

describe('scanAssets', () => {
  it('should scan assets and produce a BuildReport', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test-project');

    expect(report.projectName).toBe('test-project');
    expect(report.timestamp).toBeGreaterThan(0);
    expect(report.assets.length).toBe(2); // directory filtered out
  });

  it('should skip directories', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');
    const dirs = report.assets.filter(a => a.name === 'textures');
    expect(dirs).toHaveLength(0);
  });

  it('should calculate source sizes from disk', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');

    const texture = report.assets.find(a => a.name === 'player.png');
    expect(texture).toBeDefined();
    expect(texture!.sourceSize).toBe(50000);
  });

  it('should estimate build sizes', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');

    report.assets.forEach(a => {
      expect(a.buildSize).toBeGreaterThan(0);
    });
  });

  it('should sort by sourceSize descending', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');

    for (let i = 1; i < report.assets.length; i++) {
      expect(report.assets[i - 1].sourceSize).toBeGreaterThanOrEqual(report.assets[i].sourceSize);
    }
  });

  it('should calculate totals', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');

    expect(report.totalSourceSize).toBe(
      report.assets.reduce((sum, a) => sum + a.sourceSize, 0),
    );
    expect(report.totalBuildSize).toBe(
      report.assets.reduce((sum, a) => sum + a.buildSize, 0),
    );
  });

  it('should handle empty results', async () => {
    const queryFn = createMockQueryFn([]);
    const report = await scanAssets(queryFn, 'empty-project');

    expect(report.assets).toHaveLength(0);
    expect(report.totalSourceSize).toBe(0);
  });

  it('should extract file extension correctly', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const report = await scanAssets(queryFn, 'test');

    const texture = report.assets.find(a => a.name === 'player.png');
    expect(texture!.extension).toBe('.png');

    const audio = report.assets.find(a => a.name === 'bgm.mp3');
    expect(audio!.extension).toBe('.mp3');
  });
});

describe('scanAssetsHybrid', () => {
  const mockQueryDeps: QueryDependenciesFn = vi.fn(async (uuid: string) => {
    if (uuid === 'scene-uuid') return ['uuid-texture-1'];
    return [];
  });

  it('should mark all assets as unused when no build and no scenes', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const noopDeps: QueryDependenciesFn = vi.fn().mockResolvedValue([]);

    const report = await scanAssetsHybrid(queryFn, noopDeps, 'test');
    expect(report.buildDirExists).toBe(false);

    for (const asset of report.assets) {
      expect(asset.buildStatus).toBe('unused');
    }
  });

  it('should mark scene-referenced assets as predicted', async () => {
    const queryFn = createMockQueryFn(mockAssets);

    const report = await scanAssetsHybrid(
      queryFn, mockQueryDeps, 'test',
      undefined,
      ['scene-uuid'],
    );

    const texture = report.assets.find(a => a.uuid === 'uuid-texture-1');
    expect(texture!.buildStatus).toBe('predicted');

    const audio = report.assets.find(a => a.uuid === 'uuid-audio-1');
    expect(audio!.buildStatus).toBe('unused');
  });

  it('should compute totalBuildSize only from non-unused assets', async () => {
    const queryFn = createMockQueryFn(mockAssets);

    const report = await scanAssetsHybrid(
      queryFn, mockQueryDeps, 'test',
      undefined,
      ['scene-uuid'],
    );

    const predictedAssets = report.assets.filter(a => a.buildStatus !== 'unused');
    const expectedTotal = predictedAssets.reduce((sum, a) => sum + a.buildSize, 0);
    expect(report.totalBuildSize).toBe(expectedTotal);
  });

  it('should use real build data when build dir exists', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const buildFixture = join(__dirname, '../../fixtures/roadside-build/web-mobile');

    const noopDeps: QueryDependenciesFn = vi.fn().mockResolvedValue([]);
    const report = await scanAssetsHybrid(queryFn, noopDeps, 'test', buildFixture);

    expect(report.buildDirExists).toBe(true);
    expect(report.buildTimestamp).toBeGreaterThan(0);
  });

  it('should set totalActualBuildSize when build data available', async () => {
    const queryFn = createMockQueryFn(mockAssets);
    const buildFixture = join(__dirname, '../../fixtures/roadside-build/web-mobile');
    const noopDeps: QueryDependenciesFn = vi.fn().mockResolvedValue([]);

    const report = await scanAssetsHybrid(queryFn, noopDeps, 'test', buildFixture);

    if (report.assets.some(a => a.buildStatus === 'confirmed')) {
      expect(report.totalActualBuildSize).toBeGreaterThan(0);
    }
  });
});
