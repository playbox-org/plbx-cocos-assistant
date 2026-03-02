import { describe, it, expect } from 'vitest';
import type { AssetReportItem, BuildReport } from '../../src/shared/types';

describe('AssetReportItem type', () => {
  it('should support buildStatus field', () => {
    const item: AssetReportItem = {
      uuid: 'test-uuid',
      name: 'test.png',
      path: 'assets/test.png',
      file: '/tmp/test.png',
      type: 'cc.Texture2D',
      sourceSize: 1000,
      buildSize: 950,
      extension: '.png',
      buildStatus: 'confirmed',
      actualBuildSize: 800,
    };
    expect(item.buildStatus).toBe('confirmed');
    expect(item.actualBuildSize).toBe(800);
  });

  it('should allow buildStatus unused without actualBuildSize', () => {
    const item: AssetReportItem = {
      uuid: 'test-uuid',
      name: 'test.png',
      path: 'assets/test.png',
      file: '/tmp/test.png',
      type: 'cc.Texture2D',
      sourceSize: 1000,
      buildSize: 950,
      extension: '.png',
      buildStatus: 'unused',
    };
    expect(item.actualBuildSize).toBeUndefined();
  });
});

describe('BuildReport type', () => {
  it('should support new fields', () => {
    const report: BuildReport = {
      timestamp: Date.now(),
      projectName: 'test',
      totalSourceSize: 1000,
      totalBuildSize: 950,
      totalActualBuildSize: 800,
      buildDirExists: true,
      buildTimestamp: Date.now(),
      assets: [],
    };
    expect(report.buildDirExists).toBe(true);
    expect(report.totalActualBuildSize).toBe(800);
  });
});
