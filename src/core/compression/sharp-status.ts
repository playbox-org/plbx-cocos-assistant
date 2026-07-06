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

import type { Runner } from '../updater/update';

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

/** Run `npm install sharp` in the extension folder via the injected runner. */
export async function installSharp(run: Runner): Promise<InstallSharpResult> {
  const r = await run('npm', ['install', 'sharp']);
  return {
    ok: r.ok,
    output: r.output,
    message: r.ok
      ? 'sharp installed — image compression is ready.'
      : 'sharp install failed. Run "npm install sharp" in the extension folder, then reopen Compress.',
  };
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
