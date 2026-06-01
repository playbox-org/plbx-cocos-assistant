import { getNetwork } from '../../shared/networks';
import { OutputFormat } from '../../shared/types';
import { formatCompactDate } from '../format/date';

/** A single build entry-point file discovered in the output directory. */
export interface OutputFileStat {
  /** Path relative to the output directory, POSIX separators, e.g. "applovin/index.html". */
  path: string;
  /** File size in bytes. */
  size: number;
  /** Creation time as epoch ms (birthtime, falling back to mtime in the IPC layer). */
  createdAt: number;
}

/**
 * A display row for an existing build, shaped to match freshly-packaged
 * PackageResults (networkId/networkName/outputSize/maxSize/withinLimit/format)
 * plus creation date fields so a single render path serves both.
 */
export interface OutputBuildRow {
  networkId: string;
  networkName: string;
  format: OutputFormat;
  outputSize: number;
  maxSize: number;
  withinLimit: boolean;
  /** Creation time as epoch ms (0 when unknown). */
  createdAt: number;
  /** Compact local date/time label, e.g. "01 Jun 14:32" (em dash when unknown). */
  createdAtLabel: string;
  /** Output-dir-relative path of the build file. */
  path: string;
}

function extToFormat(ext: string): OutputFormat {
  return ext === 'zip' ? 'zip' : 'html';
}

/** Derive a network id from an output-relative path: folder name, else filename stem. */
function networkIdFromPath(path: string): string {
  const segments = path.split('/');
  if (segments.length > 1) return segments[0];
  // Flat file: strip extension from the filename
  const dot = segments[0].lastIndexOf('.');
  return dot > 0 ? segments[0].slice(0, dot) : segments[0];
}

/**
 * Turn raw output-file stats into display rows enriched with network metadata
 * and a compact created-at label. Pure + deterministic: the Editor/IPC layer
 * does the fs walk and supplies stat objects. Rows are sorted by network name.
 */
export function buildOutputRows(stats: OutputFileStat[]): OutputBuildRow[] {
  const rows: OutputBuildRow[] = stats.map((stat) => {
    const networkId = networkIdFromPath(stat.path);
    const network = getNetwork(networkId);
    const ext = (stat.path.split('.').pop() || '').toLowerCase();
    const maxSize = network?.maxSize ?? 0;
    return {
      networkId,
      networkName: network?.name ?? networkId,
      format: extToFormat(ext),
      outputSize: stat.size,
      maxSize,
      // Unknown networks have no published limit (maxSize 0) → never "over limit".
      withinLimit: maxSize === 0 ? true : stat.size <= maxSize,
      createdAt: stat.createdAt,
      createdAtLabel: formatCompactDate(stat.createdAt),
      path: stat.path,
    };
  });

  rows.sort((a, b) => a.networkName.toLowerCase().localeCompare(b.networkName.toLowerCase()));
  return rows;
}
