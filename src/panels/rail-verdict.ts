/**
 * Verdict for one row of the Package tab's results rail.
 *
 * Pure on purpose. The rail is fed by two producers with different shapes and
 * this has now gone wrong three times:
 *   - `PackageResult` (a fresh pack) carries `outputPath` and `warnings`;
 *   - `OutputBuildRow` (the scan of the output directory) carries `path`,
 *     `createdAtLabel` and no `outputPath` at all.
 * A predicate written against one shape silently mislabels every row of the
 * other — most recently `!row.outputPath`, which marked every artifact already
 * on disk as a failed pack.
 */

export interface RailRow {
  networkId?: string;
  id?: string;
  /** Fresh pack: absolute path. */
  outputPath?: string;
  /** Directory scan: path relative to the output dir. */
  path?: string;
  error?: string;
  outputSize?: number;
  size?: number;
  maxSize?: number;
  limit?: number;
  withinLimit?: boolean;
  warnings?: string[];
}

export interface RailCheck {
  status?: string;
  label?: string;
  details?: string | null;
}

export interface RailValidation {
  overall?: string;
  checks?: RailCheck[];
}

export type RailKind = 'pass' | 'warn' | 'fail' | '';

export interface RailVerdict {
  kind: RailKind;
  /** One line per thing that is wrong; empty when nothing is. */
  reasons: string[];
  sizeBytes: number;
  limitBytes: number;
  overLimit: boolean;
}

const MB = 1024 * 1024;
const mb = (n: number) => `${(n / MB).toFixed(2)} MB`;

/** Did the packager actually produce a file for this row? */
export function hasArtifact(row: RailRow): boolean {
  return !!(row.outputPath || row.path);
}

export function railVerdict(row: RailRow, validation?: RailValidation): RailVerdict {
  const sizeBytes = row.outputSize ?? row.size ?? 0;
  const limitBytes = row.maxSize ?? row.limit ?? 0;
  // A falsy limit means "no published ceiling for this network", never "0 bytes".
  const overLimit = row.withinLimit === false || (!!limitBytes && sizeBytes > limitBytes);
  const missing = !hasArtifact(row);
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
  const checks = Array.isArray(validation?.checks) ? validation!.checks! : [];

  const reasons: string[] = [];
  if (row.error) reasons.push(String(row.error));
  if (missing) reasons.push('not packaged');
  if (overLimit) {
    reasons.push(limitBytes ? `size ${mb(sizeBytes)} of ${mb(limitBytes)}` : 'over the network limit');
  }
  for (const c of checks) {
    if (c.status !== 'failed' && c.status !== 'warning') continue;
    const mark = c.status === 'failed' ? '✗' : '!';
    reasons.push(`${mark} ${c.label ?? ''}${c.details ? ' — ' + c.details : ''}`.trim());
  }
  for (const w of warnings) reasons.push(`! ${w}`);

  const failed = missing || !!row.error || overLimit || validation?.overall === 'failed';
  const warned = validation?.overall === 'warning' || warnings.length > 0;

  // No verdict at all until the checks answer: an honest dash beats a badge we
  // cannot vouch for. A row that is plainly broken says so without waiting.
  const kind: RailKind = failed ? 'fail' : warned ? 'warn' : validation ? 'pass' : '';

  return { kind, reasons, sizeBytes, limitBytes, overLimit };
}
