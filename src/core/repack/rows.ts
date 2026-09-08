/**
 * The panel's rows for a repack answer. Pure: no kit, no editor.
 *
 * `_renderPackageResults` reads the network cell as `networkName ?? network ?? id`
 * (Pack All rows carry the kit's `networkName`, existing-build rows carry
 * `network`), so every row here names the network under `network` as well as
 * `networkId`. The listing merge then borrows the kit's display name and the
 * file's created-at label from `list-output-builds`, which is the same walk
 * the panel does on open.
 */
import type { RepackSummary } from './client';

export interface RepackRow {
  networkId: string;
  network: string;
  networkName?: string;
  format?: 'html' | 'zip';
  outputSize?: number;
  maxSize?: number;
  withinLimit: boolean;
  error?: string;
  createdAt?: number;
  createdAtLabel?: string;
  path?: string;
}

/** One row per produced file, then one row per failed network. */
export function repackSummaryToRows(summary: RepackSummary | undefined | null): RepackRow[] {
  const rows: RepackRow[] = [];
  for (const a of summary?.artifacts ?? []) {
    for (const f of a.files ?? []) {
      rows.push({
        networkId: a.network,
        network: a.network,
        format: f.format,
        outputSize: f.bytes,
        maxSize: f.maxSize,
        withinLimit: f.bytes <= f.maxSize,
      });
    }
  }
  for (const failure of summary?.failures ?? []) {
    rows.push({ networkId: failure.network, network: failure.network, error: failure.reason, withinLimit: false });
  }
  return rows;
}

/**
 * Enrich upload rows with what `list-output-builds` sees on disk after the
 * unpack. A listed row matching an upload row by network and format lends its
 * `networkName`, `createdAt`, `createdAtLabel` and `path` (sizes and limits stay
 * the door's — the listing only re-derives them). Listed rows for networks this
 * upload produced nothing for are appended as existing builds: a network that
 * failed this time but has a stale artifact on disk keeps its failure row (the
 * reason) and gains the listed row (what the preview will open).
 */
export function mergeOutputListing(rows: RepackRow[], listed: any[] | undefined | null): RepackRow[] {
  if (!Array.isArray(listed) || listed.length === 0) return rows;
  const produced = new Set(rows.filter((r) => !r.error).map((r) => r.networkId));
  const out: RepackRow[] = rows.map((r) => {
    if (r.error) return r;
    const match = listed.find((l) => l?.networkId === r.networkId && l?.format === r.format);
    if (!match) return r;
    return {
      ...r,
      networkName: match.networkName ?? r.networkName,
      createdAt: match.createdAt ?? r.createdAt,
      createdAtLabel: match.createdAtLabel ?? r.createdAtLabel,
      path: match.path ?? r.path,
    };
  });
  for (const l of listed) {
    if (!l?.networkId || produced.has(l.networkId)) continue;
    out.push({ ...l, network: l.network ?? l.networkId });
  }
  return out;
}
