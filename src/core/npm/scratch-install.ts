/**
 * Isolated npm install — resolve ONE package in a scratch dir, then move it into
 * the extension's node_modules. Never runs npm with the extension root as cwd.
 *
 * Why this exists: the release bundle ships the REAL package.json — devDependencies,
 * `optionalDependencies: sharp`, and a `npm rebuild sharp` postinstall (see
 * .github/workflows/release.yml, which copies it verbatim) — while its node_modules
 * is built from a throwaway prod-only manifest that never enters the zip. Running
 * `npm install <pkg>` in that root makes npm reify the FULL ideal tree from that
 * manifest: `npm install sharp --dry-run` there adds 128 packages, playwright and
 * @playwright/test among them. npm's default --save would also rewrite the ranges
 * we read. `--omit=dev --omit=optional` is not a way out — this repo already found
 * it unreliable (release.yml), and it would drop the on-demand sharp entirely.
 *
 * So: resolve in a scratch dir with a one-line manifest, then move the tree in with
 * the package's own dependencies NESTED under it. Nesting matters because packages
 * are shared: jszip is declared by the extension (preview/server.ts, and update.ts
 * requires it inside the updater itself) AND by the packaging kit. A hoisted copy
 * would eventually upgrade the root's out from under code that never declared that
 * version. Nested, each package's resolution stays private to it.
 */
import {
  readdirSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
  cpSync,
} from 'fs';
import { join, dirname } from 'path';
import { Runner, defaultRunner, npmCmd } from '../updater/update';

export interface FsOps {
  readdir(dir: string): string[];
  exists(p: string): boolean;
  mkdirp(dir: string): void;
  move(from: string, to: string): void;
  rimraf(dir: string): void;
}

export const realFsOps: FsOps = {
  readdir: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  exists: (p) => existsSync(p),
  mkdirp: (dir) => mkdirSync(dir, { recursive: true }),
  move: (from, to) => {
    mkdirSync(dirname(to), { recursive: true });
    try {
      renameSync(from, to);
    } catch {
      // Cross-device rename (scratch on another volume) — copy, then drop.
      cpSync(from, to, { recursive: true, force: true });
      rmSync(from, { recursive: true, force: true });
    }
  },
  rimraf: (dir) => rmSync(dir, { recursive: true, force: true }),
};

/**
 * Move a resolved scratch tree into `rootNodeModules`: `pkg` replaces the installed
 * copy wholesale (rimraf first, so a shrunk file list leaves no orphans), and
 * everything npm resolved FOR it goes under it — except `keepAtRoot` entries, which
 * the consumer must be able to require from the root itself.
 *
 * Dot-entries stay behind. A hidden `.package-lock.json` landing in root/node_modules
 * would become authoritative for later npm runs in the root and could prune the tree.
 */
export function placePackageTree(
  scratchNodeModules: string,
  rootNodeModules: string,
  pkg: string,
  fs: FsOps,
  keepAtRoot: (entry: string) => boolean = () => false,
): void {
  const dest = join(rootNodeModules, pkg);
  fs.rimraf(dest);
  fs.mkdirp(dirname(dest));
  fs.move(join(scratchNodeModules, pkg), dest);

  const nested = join(dest, 'node_modules');
  fs.mkdirp(nested);

  // A scoped package (@scope/name) leaves its scope dir behind after the move.
  const scope = pkg.includes('/') ? pkg.split('/')[0] : null;

  for (const entry of fs.readdir(scratchNodeModules)) {
    if (entry.startsWith('.')) continue; // .bin, .package-lock.json
    if (entry === scope) continue; // the package itself — already moved
    const to = keepAtRoot(entry) ? join(rootNodeModules, entry) : join(nested, entry);
    if (fs.exists(to)) continue; // a copy is already there — leave it alone
    fs.move(join(scratchNodeModules, entry), to);
  }
}

export interface ScratchInstallIO {
  writeManifest(dir: string, contents: string): void;
  makeRunner(cwd: string): Runner;
  fs: FsOps;
  scratchDir(root: string): string;
}

export function defaultScratchInstallIO(scratchName: string): ScratchInstallIO {
  return {
    writeManifest: (dir, contents) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), contents);
    },
    makeRunner: (cwd) => defaultRunner(cwd),
    fs: realFsOps,
    scratchDir: (root) => join(root, scratchName),
  };
}

export interface ScratchInstallOptions {
  root: string;
  pkg: string;
  /** Version or range for the manifest — must be pre-validated by the caller. */
  spec: string;
  io: ScratchInstallIO;
  /** sharp needs its install scripts to land the platform binary; the kit does not. */
  allowScripts?: boolean;
  /** Entries that must stay requireable from the root (e.g. sharp's @img/* binaries). */
  keepAtRoot?: (entry: string) => boolean;
}

export interface ScratchInstallResult {
  ok: boolean;
  output: string;
}

/** Resolve `pkg@spec` in a scratch dir and move it into root/node_modules. */
export async function scratchInstall(opts: ScratchInstallOptions): Promise<ScratchInstallResult> {
  const { root, pkg, spec, io } = opts;
  const scratch = io.scratchDir(root);
  io.fs.rimraf(scratch);
  try {
    io.writeManifest(scratch, JSON.stringify({ dependencies: { [pkg]: spec } }, null, 2));

    const args = ['install', '--no-package-lock', '--no-audit', '--no-fund'];
    if (!opts.allowScripts) args.splice(2, 0, '--ignore-scripts');

    const r = await io.makeRunner(scratch)(npmCmd(), args);
    // The move only runs on a clean npm exit — a failed install leaves node_modules alone.
    if (!r.ok) return { ok: false, output: r.output };

    placePackageTree(
      join(scratch, 'node_modules'),
      join(root, 'node_modules'),
      pkg,
      io.fs,
      opts.keepAtRoot,
    );
    return { ok: true, output: r.output };
  } finally {
    io.fs.rimraf(scratch);
  }
}
