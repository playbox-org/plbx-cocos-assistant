import { describe, it, expect } from 'vitest';
import { join } from 'path';
import { scanBuildDirectory } from '../../../src/core/build-report/build-scanner';

const FIXTURE_BUILD = join(__dirname, '../../fixtures/roadside-build/web-mobile');

describe('scanBuildDirectory', () => {
  it('should return null for non-existent directory', async () => {
    const result = await scanBuildDirectory('/nonexistent/path');
    expect(result).toBeNull();
  });

  it('should scan the fixture build directory successfully', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    expect(result).not.toBeNull();
    expect(result!.buildDir).toBe(FIXTURE_BUILD);
    expect(result!.buildTimestamp).toBeGreaterThan(0);
  });

  it('should find native assets and map them by UUID', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    expect(result!.assetMap.size).toBeGreaterThan(0);

    // Known UUID from fixture: 0db0b555-969b-44fd-8b15-52f98db892ac (a .png file)
    const pngAsset = result!.assetMap.get('0db0b555-969b-44fd-8b15-52f98db892ac');
    expect(pngAsset).toBeDefined();
    expect(pngAsset!.actualSize).toBeGreaterThan(0);
    expect(pngAsset!.buildPaths.length).toBeGreaterThan(0);
  });

  it('should group sub-asset fragments by base UUID', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    // UUID 590beb63-46ba-4749-b258-454caa4dbe46 has multiple @fragment files
    const meshAsset = result!.assetMap.get('590beb63-46ba-4749-b258-454caa4dbe46');
    expect(meshAsset).toBeDefined();
    expect(meshAsset!.buildPaths.length).toBeGreaterThan(1);
    // actualSize should be sum of all fragments
  });

  it('should detect font assets stored as UUID directories', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    // c559e99c-fba0-41a0-b733-6d5f5bb3878c is a directory containing firasans-black-webfont.ttf
    const fontAsset = result!.assetMap.get('c559e99c-fba0-41a0-b733-6d5f5bb3878c');
    expect(fontAsset).toBeDefined();
    expect(fontAsset!.actualSize).toBeGreaterThan(0);
  });

  it('should calculate totalBuildSize as sum of asset files + pack files', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    expect(result!.totalBuildSize).toBeGreaterThan(0);

    // totalBuildSize = ALL files in build dir (engine + scripts + assets)
    // assetFilesSize = only native/ + import/ files
    expect(result!.assetFilesSize).toBeGreaterThan(0);
    expect(result!.totalBuildSize).toBeGreaterThanOrEqual(result!.assetFilesSize);

    // assetFilesSize = sum of all individual asset sizes + pack file sizes
    let assetSum = 0;
    for (const [, data] of result!.assetMap) {
      assetSum += data.actualSize;
    }
    // Verify pack files are counted separately and included in assetFilesSize
    expect(result!.packFileSize).toBeGreaterThan(0);
    expect(result!.assetFilesSize).toBe(assetSum + result!.packFileSize);
  });

  it('should track pack file sizes separately', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    // 0d50e9a82.json is a pack file
    expect(result!.packFileSize).toBeGreaterThan(0);
  });

  it('should populate bundledUuids from config.json', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    expect(result!.bundledUuids.size).toBeGreaterThan(0);
    // Should contain hex UUIDs, not compressed ones
    for (const uuid of result!.bundledUuids) {
      expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    }
  });

  it('should categorize files correctly', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    const cats = result!.categories;

    // Engine: cc.js only
    expect(cats.engine).toBeGreaterThan(0);
    // Fixture has cocos-js/cc.js (~2.6 MB)
    expect(cats.engine).toBeGreaterThan(1_000_000);

    // Assets: from first scan loop (ASSET_FILE_RE), should be > 0
    expect(cats.assets).toBeGreaterThan(0);

    // All categories sum to totalBuildSize
    const sum = cats.engine + cats.plugins + cats.assets + cats.scripts + cats.other;
    expect(sum).toBe(result!.totalBuildSize);
  });

  it('should scan sibling plbx-html directory for packed HTMLs', async () => {
    const result = await scanBuildDirectory(FIXTURE_BUILD);
    expect(result!.packedHtmls).toBeDefined();
    expect(result!.packedHtmls.length).toBe(3);

    // Should be sorted by size descending
    const sizes = result!.packedHtmls.map(h => h.size);
    expect(sizes[0]).toBeGreaterThanOrEqual(sizes[1]);
    expect(sizes[1]).toBeGreaterThanOrEqual(sizes[2]);

    // facebook should be the largest (400 KB fixture)
    expect(result!.packedHtmls[0].network).toBe('facebook');

    // All should have a positive size
    for (const h of result!.packedHtmls) {
      expect(h.size).toBeGreaterThan(0);
      expect(h.network).toBeTruthy();
    }
  });

  it('should return empty packedHtmls when no plbx-html sibling exists', async () => {
    // Create a minimal valid build dir in a temp location with no plbx-html sibling
    const { mkdtempSync, mkdirSync, writeFileSync } = await import('fs');
    const { tmpdir } = await import('os');
    const tmp = mkdtempSync(join(tmpdir(), 'test-build-'));
    try {
      mkdirSync(join(tmp, 'src'), { recursive: true });
      writeFileSync(join(tmp, 'src', 'settings.json'), JSON.stringify({ assets: { projectBundles: [] } }));
      const result = await scanBuildDirectory(tmp);
      expect(result).not.toBeNull();
      expect(result!.packedHtmls).toEqual([]);
    } finally {
      const { rmSync } = await import('fs');
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
