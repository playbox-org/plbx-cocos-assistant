/**
 * Self-update for the extension — prebuilt-artifact delivery.
 *
 * The old model ran git/npm/tsc on the consumer's machine (git pull → npm
 * install → npm run build): three toolchain steps, each an independent failure
 * point in the editor's trimmed-PATH environment. This model removes all three.
 *
 * Two install channels, told apart by a `.git` folder in the extension root:
 *
 *  - **Developer Import** (soft link → git checkout): `.git` present. Self-update
 *    is DISABLED here — downloading and overwriting would clobber the developer's
 *    working tree. We return a message telling them to `git pull`.
 *
 *  - **Packaged copy** (Import Extension Folder / a folder in the Cocos global
 *    extensions dir): no `.git`. Self-update downloads the prebuilt release zip,
 *    verifies its sha256, and overlays it in place. The bundle is 100% JS +
 *    static assets (the one native dep, `sharp`, ships outside it), so an
 *    in-place overwrite is safe on both macOS and Windows (Node holds no handle
 *    on required `.js` files). Overlay — not clean-swap — so an on-demand
 *    `node_modules/sharp` survives the update.
 *
 * Pure helpers (`pickReleaseAssets`, `sha256Hex`, `parseSha256File`) and the
 * orchestrator (`runExtensionUpdate`, IO injected via `UpdateIO`) are unit-tested
 * without real network or filesystem. Real IO lives in `defaultUpdateIO`.
 */

import { REPO_SLUG } from '../freshness/freshness-check';

// ── Shared types (progress + result contract the panel polls) ───────────────

export interface UpdateStepResult {
  name: string;
  ok: boolean;
  output: string;
}

export interface UpdateResult {
  ok: boolean;
  steps: UpdateStepResult[];
  message: string;
}

export interface ProgressEvent {
  step: string;
  /** 'start' = step began, 'done' = step succeeded, 'fail' = step failed (sequence aborts). */
  phase: 'start' | 'done' | 'fail';
  /** 1-based position of this step. */
  index: number;
  /** Total step count. */
  total: number;
}

export type Runner = (cmd: string, args: string[]) => Promise<{ ok: boolean; output: string }>;

// ── Release helpers (pure) ──────────────────────────────────────────────────

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface ReleaseInfo {
  tag: string;
  assets: ReleaseAsset[];
}

/** Pick the update zip and its optional `.sha256` sibling from a release's assets. */
export function pickReleaseAssets(
  assets: ReleaseAsset[],
): { zip: ReleaseAsset; sha: ReleaseAsset | null } | null {
  const zip = assets.find((a) => a.name.toLowerCase().endsWith('.zip'));
  if (!zip) return null;
  const sha = assets.find((a) => a.name === zip.name + '.sha256') ?? null;
  return { zip, sha };
}

import { createHash } from 'crypto';

export function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/** Parse a `sha256sum`-style file ("<hex>  filename") down to the lowercase hex. */
export function parseSha256File(content: string): string {
  return (content.trim().split(/\s+/)[0] || '').toLowerCase();
}

// ── Orchestrator (IO injected) ──────────────────────────────────────────────

export interface UpdateIO {
  isGitCheckout: (root: string) => boolean;
  fetchLatestRelease: () => Promise<ReleaseInfo | null>;
  download: (url: string) => Promise<Buffer>;
  extractZip: (buf: Buffer, destDir: string) => Promise<void>;
  /** Copy every entry of `fromDir` over `toDir`, overwriting but never deleting. */
  applyOverlay: (fromDir: string, toDir: string) => void;
  /** Where a bundle's real root sits inside the staging dir (handles a wrapper folder). */
  resolveBundleRoot: (stagingDir: string) => string;
  stagingDir: (root: string) => string;
  rimraf: (dir: string) => void;
}

const STEP_TOTAL = 5;

function fail(step: string, message: string): UpdateResult {
  return { ok: false, steps: [{ name: step, ok: false, output: message }], message };
}

function errMsg(e: any): string {
  return e?.message || String(e);
}

/**
 * Run the self-update. On a git checkout it refuses (returns a git-pull hint);
 * on a packaged copy it downloads → verifies → extracts → overlays in place.
 * All mutation happens only after a passing checksum, so any earlier failure
 * leaves the extension folder untouched.
 */
export async function runExtensionUpdate(
  root: string,
  onProgress?: (e: ProgressEvent) => void,
  io: UpdateIO = defaultUpdateIO(),
): Promise<UpdateResult> {
  const emit = onProgress ?? (() => {});
  const step = (name: string, phase: ProgressEvent['phase'], index: number) =>
    emit({ step: name, phase, index, total: STEP_TOTAL });

  // 1. detect channel
  step('detect', 'start', 1);
  if (io.isGitCheckout(root)) {
    step('detect', 'fail', 1);
    return fail(
      'detect',
      'Developer checkout — self-update is disabled here. Update with: git pull ' +
        '(then npm install / npm run build if dependencies changed).',
    );
  }
  step('detect', 'done', 1);

  // 2. resolve + download
  step('download', 'start', 2);
  const rel = await io.fetchLatestRelease();
  const picked = rel ? pickReleaseAssets(rel.assets) : null;
  if (!rel || !picked) {
    step('download', 'fail', 2);
    return fail('download', 'No published release asset found (offline, rate-limited, or no build attached).');
  }
  let zipBuf: Buffer;
  let shaContent: string | null = null;
  try {
    zipBuf = await io.download(picked.zip.url);
    if (picked.sha) shaContent = (await io.download(picked.sha.url)).toString('utf8');
  } catch (e) {
    step('download', 'fail', 2);
    return fail('download', 'Download failed: ' + errMsg(e));
  }
  step('download', 'done', 2);

  // 3. verify checksum (mutation gate)
  step('verify', 'start', 3);
  if (shaContent) {
    const expected = parseSha256File(shaContent);
    const actual = sha256Hex(zipBuf);
    if (expected && expected !== actual) {
      step('verify', 'fail', 3);
      return fail('verify', 'Checksum mismatch — download corrupted; no changes made.');
    }
  }
  step('verify', 'done', 3);

  // 4. extract to staging
  step('extract', 'start', 4);
  const staging = io.stagingDir(root);
  try {
    io.rimraf(staging);
    await io.extractZip(zipBuf, staging);
  } catch (e) {
    step('extract', 'fail', 4);
    io.rimraf(staging);
    return fail('extract', 'Extract failed: ' + errMsg(e));
  }
  step('extract', 'done', 4);

  // 5. overlay onto the live folder
  step('apply', 'start', 5);
  try {
    io.applyOverlay(io.resolveBundleRoot(staging), root);
    io.rimraf(staging);
  } catch (e) {
    step('apply', 'fail', 5);
    return fail('apply', 'Apply failed: ' + errMsg(e));
  }
  step('apply', 'done', 5);

  return {
    ok: true,
    steps: [
      { name: 'detect', ok: true, output: 'packaged copy' },
      { name: 'download', ok: true, output: picked.zip.name },
      { name: 'verify', ok: true, output: shaContent ? 'sha256 ok' : 'no checksum' },
      { name: 'extract', ok: true, output: '' },
      { name: 'apply', ok: true, output: '' },
    ],
    message: `Updated to ${rel.tag}. Restart Cocos Editor to load the new version.`,
  };
}

// ── Real IO ─────────────────────────────────────────────────────────────────

import { execFile } from 'child_process';
import { existsSync, readdirSync, cpSync, rmSync, mkdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { get as httpsGet } from 'https';

/**
 * GUI apps (the Cocos Editor) launch with a trimmed PATH that often omits
 * Homebrew/node dirs, so `npm`/`node` may be invisible even though they work in
 * a terminal. Prepend the usual suspects so the spawn can find them.
 */
function augmentedEnv(): NodeJS.ProcessEnv {
  const extra = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
  const current = (process.env.PATH || '').split(':');
  const path = [...new Set([...current, ...extra])].filter(Boolean).join(':');
  return { ...process.env, PATH: path };
}

/** execFile-based command runner (used by the on-demand `npm install sharp`). */
export function defaultRunner(repoRoot: string): Runner {
  return (cmd, args) =>
    new Promise((resolve) => {
      execFile(
        cmd,
        args,
        { cwd: repoRoot, env: augmentedEnv(), maxBuffer: 16 * 1024 * 1024, timeout: 300000, windowsHide: true },
        (err, stdout, stderr) => {
          const output = (stdout?.toString() || '') + (stderr?.toString() || '');
          resolve({ ok: !err, output: output.trim() });
        },
      );
    });
}

/** Follow up to 5 redirects and buffer the body (GitHub asset URLs 302 to a CDN). */
function httpDownload(url: string, redirects = 5): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(
      url,
      { headers: { 'User-Agent': 'plbx-cocos-extension', Accept: 'application/octet-stream' }, timeout: 60000 },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirects <= 0) return reject(new Error('too many redirects'));
          return resolve(httpDownload(res.headers.location, redirects - 1));
        }
        if (status !== 200) {
          res.resume();
          return reject(new Error('HTTP ' + status));
        }
        const chunks: Buffer[] = [];
        res.on('data', (d) => chunks.push(d));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
  });
}

function fetchLatestReleaseReal(slug: string = REPO_SLUG): Promise<ReleaseInfo | null> {
  return new Promise((resolve) => {
    const req = httpsGet(
      {
        host: 'api.github.com',
        path: `/repos/${slug}/releases/latest`,
        headers: { 'User-Agent': 'plbx-cocos-extension', Accept: 'application/vnd.github+json' },
        timeout: 8000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const assets: ReleaseAsset[] = Array.isArray(j.assets)
              ? j.assets.map((a: any) => ({ name: String(a?.name ?? ''), url: String(a?.browser_download_url ?? '') }))
              : [];
            resolve({ tag: String(j.tag_name ?? ''), assets });
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/** Unzip a buffer into destDir using jszip (already a runtime dependency). */
async function extractZipReal(buf: Buffer, destDir: string): Promise<void> {
  const JSZip = require('jszip');
  const zip = await JSZip.loadAsync(buf);
  mkdirSync(destDir, { recursive: true });
  const entries = Object.values(zip.files) as any[];
  for (const entry of entries) {
    const outPath = join(destDir, entry.name);
    if (entry.dir) {
      mkdirSync(outPath, { recursive: true });
      continue;
    }
    mkdirSync(dirname(outPath), { recursive: true });
    const content = await entry.async('nodebuffer');
    writeFileSync(outPath, content);
  }
}

/**
 * If the bundle wraps its files in a single top-level folder, descend into it;
 * otherwise the staging dir is the bundle root. Keyed on where package.json is.
 */
function resolveBundleRootReal(stagingDir: string): string {
  if (existsSync(join(stagingDir, 'package.json'))) return stagingDir;
  const entries = existsSync(stagingDir) ? readdirSync(stagingDir, { withFileTypes: true }) : [];
  const dirs = entries.filter((e) => e.isDirectory());
  if (dirs.length === 1 && existsSync(join(stagingDir, dirs[0].name, 'package.json'))) {
    return join(stagingDir, dirs[0].name);
  }
  return stagingDir;
}

export function defaultUpdateIO(): UpdateIO {
  return {
    isGitCheckout: (root) => existsSync(join(root, '.git')),
    fetchLatestRelease: () => fetchLatestReleaseReal(),
    download: (url) => httpDownload(url),
    extractZip: (buf, dest) => extractZipReal(buf, dest),
    // cpSync recursive+force merges the tree: overwrites matching files, leaves
    // unrelated target files (e.g. node_modules/sharp) in place. That IS overlay.
    applyOverlay: (from, to) => cpSync(from, to, { recursive: true, force: true }),
    resolveBundleRoot: (staging) => resolveBundleRootReal(staging),
    stagingDir: (root) => join(root, '.plbx-staged'),
    rimraf: (dir) => rmSync(dir, { recursive: true, force: true }),
  };
}
