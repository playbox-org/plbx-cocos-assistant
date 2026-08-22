/**
 * Client for the Playbox repack door (plbx-collector `src/repack/http.ts`):
 * `POST /repack` with a `plbx` archive → one zip of per-network artifacts.
 *
 * Pure transport + unpacking. No kit import, no editor global — `main.ts`
 * wires these around `packageForNetworks(['plbx'])`. Failures are results,
 * never exceptions: the panel shows a status line and moves on (no retry).
 */
import JSZip from 'jszip';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join, resolve, sep } from 'path';

export interface RepackFailure {
  network: string;
  reason: string;
  overageBytes?: number;
}

/**
 * The `repack.json` the door writes beside the artifacts.
 * KEEP IN SYNC with plbx-collector `src/repack/output.ts` (`RepackSummary`) —
 * the same shape the CLI writes and the HTTP door zips; no token on purpose.
 */
export interface RepackSummary {
  buildId: string;
  kind: 'dev' | 'prod';
  expiresAt: number;
  recorded: boolean;
  artifacts: Array<{
    network: string;
    files: Array<{ path: string; format: 'html' | 'zip'; bytes: number; maxSize: number }>;
  }>;
  failures: RepackFailure[];
}

export type RepackUploadError =
  | 'no_repack_url'
  | 'no_repack_token'
  | 'no_archive'
  | 'http_error'
  | 'network_error'
  | 'bad_response';

export interface RepackUploadOptions {
  archive: Buffer;
  repackUrl: string;
  token: string;
  networks: string[];
  kind?: 'dev' | 'prod';
  fetchFn?: typeof fetch;
}

export type RepackUploadResult =
  | { ok: true; buildId: string; zip: Buffer }
  | { ok: false; error: RepackUploadError; status?: number; detail?: string };

export const BUILD_ID_HEADER = 'X-Plbx-Build-Id';

/** One POST, one answer. Never throws, never retries. */
export async function uploadForRepack(opts: RepackUploadOptions): Promise<RepackUploadResult> {
  const repackUrl = (opts.repackUrl || '').trim();
  if (!repackUrl) return { ok: false, error: 'no_repack_url' };
  if (!opts.token) return { ok: false, error: 'no_repack_token' };
  if (!opts.archive || opts.archive.length === 0) return { ok: false, error: 'no_archive' };

  const fetchFn = opts.fetchFn ?? fetch;
  // The door reads `networks=a,b` literally, so the commas stay bare; each id
  // is encoded on its own so a stray space, `&` or `#` cannot bend the query.
  const networks = opts.networks.map((id) => encodeURIComponent(id)).join(',');
  const url = `${repackUrl.replace(/\/+$/, '')}/repack?networks=${networks}&kind=${opts.kind ?? 'prod'}`;

  let res: Response;
  try {
    res = await fetchFn(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        'Content-Type': 'application/zip',
      },
      // A Uint8Array copy: a Node Buffer is not assignable to BodyInit under
      // the current @types/node (same dance as deployer/moloco-cdn.ts).
      body: new Uint8Array(opts.archive),
    });
  } catch (e: any) {
    return { ok: false, error: 'network_error', detail: e?.message || String(e) };
  }

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 500); } catch { /* body unreadable — status is enough */ }
    return { ok: false, error: 'http_error', status: res.status, detail };
  }

  const buildId = res.headers?.get?.(BUILD_ID_HEADER) || '';
  if (!buildId) {
    return { ok: false, error: 'bad_response', status: res.status, detail: `missing ${BUILD_ID_HEADER} header` };
  }

  try {
    const zip = Buffer.from(await res.arrayBuffer());
    return { ok: true, buildId, zip };
  } catch (e: any) {
    return { ok: false, error: 'bad_response', status: res.status, detail: e?.message || String(e) };
  }
}

/**
 * True when a zip entry name would land outside `outputDir` (zip-slip):
 * absolute paths, drive letters, any `..` segment, or a resolved target that is
 * not under the root. Same rule as the collector's extractor. (JSZip's
 * `loadAsync` already collapses `../` on read, so in practice only the absolute
 * forms reach us — the `..` rule is belt and braces.)
 */
export function escapesOutputDir(entryName: string, outputDir: string): boolean {
  if (isAbsolute(entryName) || /^[A-Za-z]:[\\/]/.test(entryName)) return true;
  if (entryName.split(/[\\/]/).some((seg) => seg === '..')) return true;
  const target = resolve(outputDir, entryName);
  const root = resolve(outputDir);
  return target !== root && !target.startsWith(root + sep);
}

/**
 * Write every non-directory entry of the door's response under `outputDir` —
 * `<networkId>/<artifact>` exactly as Pack All would have laid them out, plus
 * `repack.json` beside the network dirs (deliberately: it is the record of what
 * the door produced; `listOutputBuilds` ignores a stray json). Returns the
 * parsed summary. Throws on a missing `repack.json` or an escaping entry —
 * before anything is written.
 */
export async function unpackRepackResponse(zip: Buffer, outputDir: string): Promise<RepackSummary> {
  const archive = await JSZip.loadAsync(zip);
  const entries = Object.values(archive.files).filter((f) => !f.dir);

  for (const entry of entries) {
    if (escapesOutputDir(entry.name, outputDir)) {
      throw new Error(`repack response entry escapes the output dir: ${entry.name}`);
    }
  }
  const summaryEntry = entries.find((f) => f.name === 'repack.json');
  if (!summaryEntry) throw new Error('repack response has no repack.json');

  const summaryText = await summaryEntry.async('string');
  const summary = JSON.parse(summaryText) as RepackSummary;

  for (const entry of entries) {
    const target = join(outputDir, ...entry.name.split('/'));
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, await entry.async('nodebuffer'));
  }
  return summary;
}
