/**
 * One-click self-update for the dev-imported extension.
 *
 * Runs the same sequence a developer would type by hand —
 *   git pull --ff-only → npm install → npm run build
 * — stopping at the first failure. The editor still must be restarted
 * afterwards to reload the rebuilt `dist/main.js` (Cocos caches the loaded
 * module), so success only *asks* for a restart; it cannot force one.
 *
 * `runUpdate` takes the command runner via DI so the stop-on-failure
 * sequencing is unit-testable without spawning git/npm.
 */

export interface UpdateStep {
  name: string;
  cmd: string;
  args: string[];
}

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

/** `--ff-only` so a diverged/conflicting checkout fails cleanly instead of half-merging. */
export const UPDATE_STEPS: UpdateStep[] = [
  { name: 'pull', cmd: 'git', args: ['pull', '--ff-only'] },
  { name: 'install', cmd: 'npm', args: ['install'] },
  { name: 'build', cmd: 'npm', args: ['run', 'build'] },
];

export type Runner = (cmd: string, args: string[]) => Promise<{ ok: boolean; output: string }>;

export interface ProgressEvent {
  step: string;
  /** 'start' = step began, 'done' = step succeeded, 'fail' = step failed (sequence aborts). */
  phase: 'start' | 'done' | 'fail';
  /** 1-based position of this step. */
  index: number;
  /** Total step count. */
  total: number;
}

export interface RunUpdateOpts {
  steps?: UpdateStep[];
  onProgress?: (e: ProgressEvent) => void;
}

/** Run the update steps in order; stop and report at the first failure. */
export async function runUpdate(run: Runner, opts: RunUpdateOpts = {}): Promise<UpdateResult> {
  const steps = opts.steps ?? UPDATE_STEPS;
  const emit = opts.onProgress ?? (() => {});
  const total = steps.length;
  const results: UpdateStepResult[] = [];

  for (let i = 0; i < steps.length; i++) {
    const s = steps[i];
    const index = i + 1;
    emit({ step: s.name, phase: 'start', index, total });

    const r = await run(s.cmd, s.args);
    results.push({ name: s.name, ok: r.ok, output: r.output });

    if (!r.ok) {
      emit({ step: s.name, phase: 'fail', index, total });
      return {
        ok: false,
        steps: results,
        message: `Update failed at "${s.name}". See output, fix, and retry.`,
      };
    }
    emit({ step: s.name, phase: 'done', index, total });
  }

  return {
    ok: true,
    steps: results,
    message: 'Update complete. Restart Cocos Editor to load the rebuilt extension.',
  };
}

// ── Real runner (not injected) ──────────────────────────────────────────────

import { execFile } from 'child_process';

/**
 * GUI apps (the Cocos Editor) launch with a trimmed PATH that often omits
 * Homebrew/node dirs, so `git`/`npm` may be invisible even though they work in
 * a terminal. Prepend the usual suspects so the spawn can find them.
 */
function augmentedEnv(): NodeJS.ProcessEnv {
  const extra = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
  const current = (process.env.PATH || '').split(':');
  const path = [...new Set([...current, ...extra])].filter(Boolean).join(':');
  return { ...process.env, PATH: path };
}

/** execFile-based runner. mac/Linux focused (npm is a shell binary on PATH). */
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

/** Convenience: run the full update against a real checkout at `repoRoot`. */
export async function runExtensionUpdate(
  repoRoot: string,
  onProgress?: (e: ProgressEvent) => void,
): Promise<UpdateResult> {
  return runUpdate(defaultRunner(repoRoot), { onProgress });
}
