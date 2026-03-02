import { describe, it, expect, vi } from 'vitest';
import { join } from 'path';
import { statSync } from 'fs';
import { scanAssetsHybrid } from '../../../src/core/build-report/scanner';
import type { QueryDependenciesFn } from '../../../src/core/build-report/dependency-resolver';

const FIXTURE_BUILD = join(__dirname, '../../fixtures/roadside-build/web-mobile');

// Real file that exists on disk (required by scanAssets → statSync)
const REAL_PNG = join(
  FIXTURE_BUILD,
  'assets/main/native/0d/0db0b555-969b-44fd-8b15-52f98db892ac.png',
);

describe('hybrid integration with real fixture', () => {
  const projectAssets = [
    {
      uuid: '0db0b555-969b-44fd-8b15-52f98db892ac', // matches fixture native file
      name: 'some-texture.png',
      path: 'assets/textures/some-texture.png',
      file: REAL_PNG,
      type: 'cc.Texture2D',
      url: 'db://assets/textures/some-texture.png',
      isDirectory: false,
      importer: 'texture',
    },
    {
      uuid: 'ffffffff-ffff-ffff-ffff-ffffffffffff', // NOT in build
      name: 'unused-asset.png',
      path: 'assets/textures/unused-asset.png',
      // Point to a real file so statSync doesn't throw and skip the asset
      file: REAL_PNG,
      type: 'cc.Texture2D',
      url: 'db://assets/textures/unused-asset.png',
      isDirectory: false,
      importer: 'texture',
    },
  ];

  const mockQueryFn = async (type?: string) => {
    if (type) return projectAssets.filter(a => a.type === type);
    return projectAssets;
  };

  const noopDeps: QueryDependenciesFn = vi.fn().mockResolvedValue([]);

  it('should confirm assets found in build dir and leave others unused', async () => {
    const report = await scanAssetsHybrid(mockQueryFn, noopDeps, 'test', FIXTURE_BUILD);

    expect(report.buildDirExists).toBe(true);

    const confirmed = report.assets.find(a => a.uuid === '0db0b555-969b-44fd-8b15-52f98db892ac');
    expect(confirmed).toBeDefined();
    expect(confirmed!.buildStatus).toBe('confirmed');
    expect(confirmed!.actualBuildSize).toBeGreaterThan(0);

    // Verify actual byte value matches real file on disk
    const realSize = statSync(REAL_PNG).size;
    expect(confirmed!.actualBuildSize).toBe(realSize);

    const unused = report.assets.find(a => a.uuid === 'ffffffff-ffff-ffff-ffff-ffffffffffff');
    expect(unused).toBeDefined();
    expect(unused!.buildStatus).toBe('unused');
    expect(unused!.actualBuildSize).toBeUndefined();
  });

  it('should exclude unused assets from totals', async () => {
    const report = await scanAssetsHybrid(mockQueryFn, noopDeps, 'test', FIXTURE_BUILD);

    // totalBuildSize should only include confirmed/predicted assets
    const unusedAsset = report.assets.find(a => a.buildStatus === 'unused');
    if (unusedAsset) {
      const allBuild = report.assets.reduce((s, a) => s + a.buildSize, 0);
      expect(report.totalBuildSize).toBeLessThan(allBuild);
    }
  });
});
