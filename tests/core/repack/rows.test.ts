/**
 * The panel's view of a repack answer: `repack.json` → rows for
 * `_renderPackageResults`, then enriched with the `list-output-builds` listing
 * so the Created column and the kit's display names come through.
 */
import { describe, it, expect } from 'vitest';
import { repackSummaryToRows, mergeOutputListing } from '../../../src/core/repack/rows';
import type { RepackSummary } from '../../../src/core/repack/client';

const summary: RepackSummary = {
  buildId: 'b_abc',
  kind: 'prod',
  expiresAt: 0,
  recorded: true,
  artifacts: [
    { network: 'applovin', files: [{ path: 'applovin/index.html', format: 'html', bytes: 12, maxSize: 5242880 }] },
    {
      network: 'liftoff',
      files: [
        { path: 'liftoff/index.html', format: 'html', bytes: 6000000, maxSize: 5242880 },
        { path: 'liftoff/index.zip', format: 'zip', bytes: 3, maxSize: 5242880 },
      ],
    },
  ],
  failures: [{ network: 'facebook', reason: 'facebook machine-checks uploads' }],
};

describe('repackSummaryToRows', () => {
  it('names the network on every row, one row per file plus one per failure', () => {
    const rows = repackSummaryToRows(summary);
    expect(rows.map((r) => r.network)).toEqual(['applovin', 'liftoff', 'liftoff', 'facebook']);
    // The renderer reads `networkName ?? network ?? id`; keep `networkId` for merges.
    for (const r of rows) expect(r.networkId).toBe(r.network);
    expect(rows[0]).toMatchObject({ format: 'html', outputSize: 12, maxSize: 5242880, withinLimit: true });
    expect(rows[1]).toMatchObject({ format: 'html', outputSize: 6000000, withinLimit: false });
    expect(rows[3]).toMatchObject({ error: 'facebook machine-checks uploads', withinLimit: false });
    expect(rows[3].format).toBeUndefined();
  });

  it('tolerates a summary with no artifacts or failures', () => {
    expect(repackSummaryToRows({ ...summary, artifacts: [], failures: [] })).toEqual([]);
    expect(repackSummaryToRows(undefined as unknown as RepackSummary)).toEqual([]);
  });
});

describe('mergeOutputListing', () => {
  const listed = [
    { networkId: 'applovin', networkName: 'AppLovin', format: 'html', outputSize: 12, maxSize: 5242880, withinLimit: true, createdAt: 1, createdAtLabel: '22 Aug 10:00', path: 'applovin/index.html' },
    { networkId: 'liftoff', networkName: 'Liftoff', format: 'html', outputSize: 6000000, maxSize: 5242880, withinLimit: false, createdAt: 1, createdAtLabel: '22 Aug 10:00', path: 'liftoff/index.html' },
    { networkId: 'unity', networkName: 'Unity', format: 'html', outputSize: 99, maxSize: 5242880, withinLimit: true, createdAt: 1, createdAtLabel: '20 Aug 09:00', path: 'unity/index.html' },
    { networkId: 'facebook', networkName: 'Facebook', format: 'zip', outputSize: 5, maxSize: 5242880, withinLimit: true, createdAt: 1, createdAtLabel: '20 Aug 09:00', path: 'facebook/index.zip' },
  ];

  it('copies the display name and created label onto matching rows by network and format', () => {
    const merged = mergeOutputListing(repackSummaryToRows(summary), listed);
    const applovin = merged.find((r) => r.networkId === 'applovin')!;
    expect(applovin).toMatchObject({ networkName: 'AppLovin', createdAtLabel: '22 Aug 10:00', path: 'applovin/index.html' });
    // The repack sizes/limits win — the listing is only for names and dates.
    expect(applovin.outputSize).toBe(12);
    const liftoffHtml = merged.find((r) => r.networkId === 'liftoff' && r.format === 'html')!;
    expect(liftoffHtml.createdAtLabel).toBe('22 Aug 10:00');
    const liftoffZip = merged.find((r) => r.networkId === 'liftoff' && r.format === 'zip')!;
    expect(liftoffZip.createdAtLabel).toBeUndefined();
  });

  it('appends builds already on disk for networks this upload did not produce', () => {
    const merged = mergeOutputListing(repackSummaryToRows(summary), listed);
    // unity: not in this upload at all → listed as an existing build.
    expect(merged.find((r) => r.networkId === 'unity')).toMatchObject({ networkName: 'Unity', createdAtLabel: '20 Aug 09:00' });
    // facebook failed this time but a stale artifact is on disk: the failure row
    // stays (it says why), and the stale artifact is still listed (it is what the
    // preview will open).
    const fb = merged.filter((r) => r.networkId === 'facebook');
    expect(fb).toHaveLength(2);
    expect(fb.some((r) => r.error)).toBe(true);
    expect(fb.some((r) => r.path === 'facebook/index.zip')).toBe(true);
  });

  it('keeps the upload rows as they are when the listing is empty or missing', () => {
    const rows = repackSummaryToRows(summary);
    expect(mergeOutputListing(rows, [])).toEqual(rows);
    expect(mergeOutputListing(rows, undefined as unknown as any[])).toEqual(rows);
  });
});
