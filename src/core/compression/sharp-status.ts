/**
 * Sharp availability guard.
 *
 * `sharp` is an optional, per-platform native dependency shipped OUTSIDE the
 * prebuilt release bundle (bundling libvips would take on LGPL-3.0 obligations
 * and force a per-OS asset). So a packaged install starts without it; the
 * Compress feature detects that and offers a one-click `npm install sharp`.
 *
 * The check runs `sharp-worker.js --probe` — the same plain-Node child-process
 * context compression actually uses (image-compressor.ts spawns the worker to
 * dodge Cocos's Electron ABI). Probing there, not via `require('sharp')` in the
 * editor, is the only way to get a truthful answer.
 *
 * Pure logic (`checkSharpAvailable`, `installSharp`) takes its IO via DI so it
 * is unit-testable without spawning node/npm. Real IO sides live at the bottom.
 */

import { readFileSync as defaultReadFile } from 'fs';
import { join as joinPath } from 'path';
import {
  ScratchInstallIO,
  defaultScratchInstallIO,
  scratchInstall,
} from '../npm/scratch-install';

const defaultReadPkg = (p: string) => defaultReadFile(p, 'utf8');

/** IO bundle for the on-demand sharp install (scratch dir kept apart from the kit's). */
export function defaultSharpInstallIO(): ScratchInstallIO {
  return defaultScratchInstallIO('.plbx-sharp-staged');
}

/** Resolves the probe worker's stdout ('ok' | 'missing'); rejects if it cannot spawn. */
export type Prober = () => Promise<string>;

/** True only when the probe confirms sharp loads in the worker context. */
export async function checkSharpAvailable(probe: Prober): Promise<boolean> {
  try {
    return (await probe()).trim() === 'ok';
  } catch {
    return false;
  }
}

export interface InstallSharpResult {
  ok: boolean;
  output: string;
  message: string;
}

/** Fallback when the extension's package.json cannot be read. */
const SHARP_FALLBACK_SPEC = '^0.33.5';

/** The spec to install — whatever the extension declares in optionalDependencies. */
export function readSharpSpec(root: string, readPkg: (p: string) => string = defaultReadPkg): string {
  try {
    const pkg = JSON.parse(readPkg(joinPath(root, 'package.json')));
    return pkg?.optionalDependencies?.sharp || pkg?.dependencies?.sharp || SHARP_FALLBACK_SPEC;
  } catch {
    return SHARP_FALLBACK_SPEC;
  }
}

/**
 * Install sharp into the extension folder — via an isolated scratch resolve, NOT
 * `npm install sharp` in the extension root.
 *
 * The bundle ships the extension's real package.json (devDependencies and all), so
 * npm in that root reifies the whole ideal tree: `npm install sharp --dry-run` there
 * adds 128 packages including playwright and @playwright/test, and pulls browser
 * downloads through their postinstall. Scratch-resolving sharp and moving just that
 * subtree in keeps a user's install to what they asked for.
 *
 * Scripts stay ENABLED here (unlike the kit install): sharp's platform binary comes
 * from its own optional @img/* packages and their install step.
 */
export async function installSharp(root: string, io: ScratchInstallIO): Promise<InstallSharpResult> {
  try {
    const r = await scratchInstall({
      root,
      pkg: 'sharp',
      spec: readSharpSpec(root),
      io,
      allowScripts: true,
    });
    return {
      ok: r.ok,
      output: r.output,
      message: r.ok
        ? 'sharp installed — image compression is ready.'
        : 'sharp install failed. Run "npm install sharp" in the extension folder, then reopen Compress.',
    };
  } catch (e: any) {
    return {
      ok: false,
      output: '',
      message: 'sharp install failed: ' + (e?.message || String(e)),
    };
  }
}

// ── Real (non-injected) IO ──────────────────────────────────────────────────

import { spawn } from 'child_process';
import { join } from 'path';

/**
 * Spawn `node sharp-worker.js --probe`. Mirrors image-compressor's plain
 * `spawn('node', ...)` so the probe shares compression's exact runtime context.
 */
export function defaultProber(repoRoot: string): Prober {
  return () =>
    new Promise((resolve, reject) => {
      const child = spawn('node', [join(repoRoot, 'sharp-worker.js'), '--probe'], {
        cwd: repoRoot,
      });
      let out = '';
      child.stdout.on('data', (d: Buffer) => (out += d.toString()));
      child.on('error', reject);
      child.on('close', () => resolve(out));
    });
}
