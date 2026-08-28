/**
 * The only place that talks to the Cocos `builder` package.
 *
 * Of the builder's IPC surface only `open` and `query-worker-ready` are
 * documented as public; the rest is declared in
 * `builtin/builder/@types/protected/message.d.ts` inside the editor's
 * `app.asar`:
 *
 *   add-task(options, shouldWait?) => TaskAddResult | BuildExitCode
 *   query-task(id)                 => IBuildTaskItemJSON
 *   query-tasks-info({type})       => { list, queue, free }
 *   open('default')                => void
 *
 * `add-task` both creates and runs the task — there is no separate "build"
 * message. Progress is READ, not pushed: the `builder:task-changed` broadcast
 * fires hundreds of times per build with every argument undefined, so it is a
 * "something changed" tick and nothing more.
 *
 * Because that surface is undocumented, every call here degrades instead of
 * throwing at the panel: the settings are written to the project profile first,
 * so if the task API refuses, the operator can still press Build in the Cocos
 * panel and get a correct build.
 */

declare const Editor: any;

import {
  applyPolicy,
  buildTaskOptions,
  verifyBuildOptions,
  needsFix,
  reduceProgress,
  BUILD_OUTPUT_NAME,
  PLBX_TASK_ID,
  type BuildCheck,
  type BuildOptions,
  type BuildRunState,
  type ProgressState,
} from './build-policy';
import { getProjectSettings } from '../settings';

/** Keys this feature owns in the builder's project profile. */
const POLICY_KEYS = ['platform', 'useSplashScreen', 'nativeCodeBundleMode'] as const;

/** `add-task` result codes, from the editor's `TaskAddResult` / `BuildExitCode`. */
const TASK_ADD_BUSY = 0;
const TASK_ADD_SUCCESS = 1;
const TASK_ADD_PARAM_ERROR = 2;
const EXIT_BUILD_FAILED = 34;
const EXIT_BUILD_SUCCESS = 36;
const EXIT_BUILD_BUSY = 37;

export interface BuildProgress {
  state: BuildRunState;
  /** 0..1, as the builder reports it. */
  progress: number;
  message: string;
  /** True once the task API refused and the Cocos panel took over. */
  fallback: boolean;
}

let progress: ProgressState = { state: 'idle', progress: 0, message: '', sawRunning: false };
let fallback = false;
/** When the current build was requested — the stale-result rule needs it. */
let startedAt = 0;

/** Set when we start a build, cleared when the finished build is claimed. */
let startedByUs = false;

/** Id of the task we last handed to the builder — the one progress is about. */
let currentTaskId = PLBX_TASK_ID;

/**
 * Read the build's progress, asking the builder itself while one is running.
 *
 * The `builder:task-changed` broadcast looked like the obvious source, but it
 * carries NO payload — it fires hundreds of times per build with every argument
 * undefined. It is a "something changed, go ask" tick, not the task. So the
 * panel's existing 500 ms poll asks directly instead, and the broadcast is not
 * subscribed to at all.
 */
export async function getBuildProgress(): Promise<BuildProgress> {
  if (progress.state === 'running') {
    progress = reduceProgress(progress, await queryTask(currentTaskId), {
      elapsedMs: Date.now() - startedAt,
    });
  }
  const { state, progress: value, message } = progress;
  return { state, progress: value, message, fallback };
}

/** The build task as the builder currently sees it, or null if unreadable. */
async function queryTask(id: string): Promise<any | null> {
  try {
    const task = await Editor.Message.request('builder', 'query-task', id);
    if (task) return task;
  } catch { /* fall through to the list */ }
  try {
    const info = await Editor.Message.request('builder', 'query-tasks-info', { type: 'build' });
    const all = [...(info?.list ?? []), ...Object.values(info?.queue ?? {})];
    return all.find((t: any) => String(t?.id) === id) ?? null;
  } catch (e: any) {
    console.warn('[plbx] cannot read build task:', e?.message ?? e);
    return null;
  }
}

/**
 * Whether the build that just finished is the one this panel started — asked
 * once, by `onBuildFinished`, and answered once.
 *
 * A build the operator started from our Build button is a build they chose, so
 * its output directory is adopted outright. `resolveBuildDir` deliberately does
 * not adopt for a hand-edited field, because a third-party build may be a
 * deliberately older one; ours never is.
 */
export function claimOwnBuild(): boolean {
  const ours = startedByUs;
  startedByUs = false;
  return ours;
}

/**
 * The build defaults a newly created task inherits — `common` in
 * `<project>/profiles/v2/packages/builder.json`.
 *
 * This, not an individual task's stored options, is what governs the builds the
 * operator starts by hand, which is the failure this feature prevents. The two
 * do drift apart (seen in the wild: `common` on asmjs, a saved task on both),
 * so the distinction is worth keeping straight.
 */
export async function readBuildDefaults(): Promise<BuildOptions> {
  try {
    return (await Editor.Profile.getProject('builder', 'common', 'local')) || {};
  } catch (e: any) {
    console.warn('[plbx] cannot read build defaults:', e?.message ?? e);
    return {};
  }
}

export async function verifyBuildSettings(): Promise<{ checks: BuildCheck[]; needsFix: boolean }> {
  const checks = verifyBuildOptions(await readBuildDefaults());
  return { checks, needsFix: needsFix(checks) };
}

/** Write the policy into the project's build defaults, then re-verify. */
export async function fixBuildSettings(): Promise<{ checks: BuildCheck[]; needsFix: boolean }> {
  const current = await readBuildDefaults();
  const fixed = applyPolicy(current);
  for (const key of POLICY_KEYS) {
    if (fixed[key] === current[key]) continue;
    await Editor.Profile.setProject('builder', `common.${key}`, fixed[key], 'local');
  }
  return verifyBuildSettings();
}

/**
 * The build task that already writes to `build/web-mobile`, if the project has
 * one.
 *
 * Reusing it keeps the Cocos build panel at one row: a second task under the
 * same output name would write to the same directory, and the two would
 * silently overwrite each other. Falls back to our own pinned id when the
 * project has never had a web-mobile task.
 */
async function resolveTaskId(): Promise<string> {
  try {
    const info = await Editor.Message.request('builder', 'query-tasks-info', { type: 'build' });
    const match = (info?.list ?? []).find(
      (t: any) =>
        t?.options?.outputName === BUILD_OUTPUT_NAME || t?.options?.taskName === BUILD_OUTPUT_NAME,
    );
    if (match?.id) return String(match.id);
  } catch (e: any) {
    console.warn('[plbx] cannot list build tasks:', e?.message ?? e);
  }
  return PLBX_TASK_ID;
}

/**
 * Start the Playbox build. Returns as soon as the builder accepts the task —
 * the panel polls `getBuildProgress` from there.
 */
export async function startBuild(): Promise<BuildProgress> {
  if (progress.state === 'running') return getBuildProgress();

  currentTaskId = await resolveTaskId();
  // "Auto-package after build" is a panel setting, but packaging itself runs in
  // the build hook, which only sees per-task options. Carrying it across here
  // is what makes the checkbox apply to builds started from our button too.
  const { autoPackage } = await getProjectSettings();
  const options = buildTaskOptions(await readBuildDefaults(), { taskId: currentTaskId, autoPackage });
  progress = { state: 'running', progress: 0, message: '', sawRunning: false };
  fallback = false;
  startedAt = Date.now();
  startedByUs = true;

  try {
    const code = await Editor.Message.request('builder', 'add-task', options);
    console.log(`[plbx] build task ${currentTaskId} accepted (${code}), autoPackage=${autoPackage}`);
    // Without `shouldWait` the builder answers with a TaskAddResult; some paths
    // answer with a BuildExitCode instead. Both are plain numbers, and their
    // ranges do not overlap.
    if (code === TASK_ADD_BUSY || code === EXIT_BUILD_BUSY) {
      progress = { state: 'busy', progress: 0, message: '', sawRunning: false };
    } else if (code === TASK_ADD_PARAM_ERROR || code === EXIT_BUILD_FAILED) {
      await handOverToCocosPanel(`add-task returned ${code}`);
    } else if (code === EXIT_BUILD_SUCCESS) {
      progress = { state: 'success', progress: 1, message: '', sawRunning: true };
    } else if (code !== TASK_ADD_SUCCESS && code !== undefined) {
      await handOverToCocosPanel(`add-task returned ${code}`);
    }
  } catch (e: any) {
    await handOverToCocosPanel(e?.message ?? String(e));
  }

  return getBuildProgress();
}

/**
 * The task API refused. The settings are already correct in the profile, so a
 * build the operator starts themselves will be correct too — open the Cocos
 * build panel and say so.
 */
async function handOverToCocosPanel(reason: string): Promise<void> {
  console.warn('[plbx] build task API unavailable, handing over to the Cocos panel:', reason);
  progress = { state: 'failure', progress: 0, message: reason, sawRunning: false };
  fallback = true;
  try {
    await Editor.Message.request('builder', 'open', 'default');
  } catch (e: any) {
    console.warn('[plbx] cannot open the build panel:', e?.message ?? e);
  }
}
