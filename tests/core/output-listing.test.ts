import { describe, it, expect } from 'vitest';
import { buildOutputRows, OutputFileStat } from '../../src/core/packager/output-listing';

// 2026-06-01 14:32 local
const TS = new Date(2026, 5, 1, 14, 32, 0).getTime();

describe('buildOutputRows', () => {
  it('maps a standard "{networkId}/index.{ext}" file to a network row', () => {
    const stats: OutputFileStat[] = [
      { path: 'applovin/index.html', size: 1234, createdAt: TS },
    ];
    const rows = buildOutputRows(stats);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      networkId: 'applovin',
      networkName: 'AppLovin',
      format: 'html',
      outputSize: 1234,
      maxSize: 5 * 1024 * 1024,
      withinLimit: true,
      createdAt: TS,
      createdAtLabel: '01 Jun 14:32',
      path: 'applovin/index.html',
    });
  });

  it('maps a flat "{networkId}.{ext}" file to a network row', () => {
    const rows = buildOutputRows([{ path: 'facebook.zip', size: 10, createdAt: TS }]);
    expect(rows[0].networkId).toBe('facebook');
    expect(rows[0].networkName).toBe('Facebook/Meta');
    expect(rows[0].format).toBe('zip');
  });

  it('infers format from file extension, not the network default', () => {
    // facebook defaults to html but here the file is a .zip (dualFormat)
    const rows = buildOutputRows([{ path: 'facebook/index.zip', size: 10, createdAt: TS }]);
    expect(rows[0].format).toBe('zip');
  });

  it('flags files over the network size limit', () => {
    const big = 6 * 1024 * 1024; // > applovin 5MB
    const rows = buildOutputRows([{ path: 'applovin/index.html', size: big, createdAt: TS }]);
    expect(rows[0].withinLimit).toBe(false);
  });

  it('handles unknown networks gracefully (no registry entry)', () => {
    const rows = buildOutputRows([{ path: 'somethingelse/index.html', size: 10, createdAt: TS }]);
    expect(rows[0].networkId).toBe('somethingelse');
    expect(rows[0].networkName).toBe('somethingelse');
    expect(rows[0].maxSize).toBe(0);
    // No known limit → don't flag as over-limit
    expect(rows[0].withinLimit).toBe(true);
  });

  it('produces a compact created-at label and falls back to em dash when missing', () => {
    const rows = buildOutputRows([
      { path: 'unity/index.html', size: 10, createdAt: TS },
      { path: 'google/index.zip', size: 10, createdAt: 0 },
    ]);
    const unity = rows.find((r) => r.networkId === 'unity')!;
    const google = rows.find((r) => r.networkId === 'google')!;
    expect(unity.createdAtLabel).toBe('01 Jun 14:32');
    expect(google.createdAtLabel).toBe('—');
  });

  it('sorts rows by networkName (case-insensitive) for stable display', () => {
    const rows = buildOutputRows([
      { path: 'unity/index.html', size: 10, createdAt: TS },
      { path: 'applovin/index.html', size: 10, createdAt: TS },
      { path: 'google/index.zip', size: 10, createdAt: TS },
    ]);
    expect(rows.map((r) => r.networkId)).toEqual(['applovin', 'google', 'unity']);
  });

  it('ignores nested asset files, keeping only the per-network entry point', () => {
    const stats: OutputFileStat[] = [
      { path: 'google/index.zip', size: 100, createdAt: TS },
      { path: 'mintegral/index.zip', size: 200, createdAt: TS },
    ];
    const rows = buildOutputRows(stats);
    expect(rows.map((r) => r.networkId).sort()).toEqual(['google', 'mintegral']);
  });
});
