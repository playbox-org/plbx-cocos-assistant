/**
 * The three build settings a Playbox playable requires, as pure functions.
 *
 * Packaging assumes a `web-mobile` build with the Cocos splash off and native
 * code bundled as asm.js. The third one is not cosmetic: `nativeCodeBundleMode`
 * defaults to `both`, which splits `cc.js` and emits a real `.wasm`, and that
 * combination renders a black screen when the packaged creative is opened over
 * `file://`. It lives in `profiles/`, which is not versioned — so a fresh
 * checkout silently reverts to the default and nothing in the editor says so.
 *
 * No `Editor` here on purpose: the rules are testable without an editor, and
 * everything that touches Cocos lives in `build-task.ts`.
 */

/**
 * Output name, and therefore the build directory: `build/web-mobile`.
 *
 * Same folder the Package tab packages from — a build under any other name
 * would leave the operator picking a directory by hand, or worse, packaging the
 * previous build while a fresh one sat in a sibling folder.
 */
export const BUILD_OUTPUT_NAME = 'web-mobile';

/** Fallback task id, used only when the project has no web-mobile task yet. */
export const PLBX_TASK_ID = 'plbx-web-mobile';

export type CheckStatus = 'ok' | 'fail' | 'na';

export interface BuildCheck {
  id: 'platform' | 'splash' | 'nativeCode';
  /** i18n key for the row label. */
  labelKey: string;
  /** Human-readable current value, for display only. */
  actual: string;
  expected: string;
  status: CheckStatus;
}

/** The subset of `IBuildTaskOption` this policy cares about. */
export interface BuildOptions {
  platform?: string;
  useSplashScreen?: boolean;
  nativeCodeBundleMode?: string;
  [key: string]: unknown;
}

export function verifyBuildOptions(options: BuildOptions): BuildCheck[] {
  const platform = options.platform;
  const splash = options.useSplashScreen;
  const native = options.nativeCodeBundleMode;

  return [
    {
      id: 'platform',
      labelKey: 'build.checkPlatform',
      // Unset is a failure, not "n/a": a build with no platform recorded takes
      // the engine default (web-desktop), which packaging cannot consume.
      actual: platform ?? '—',
      expected: 'web-mobile',
      status: platform === 'web-mobile' ? 'ok' : 'fail',
    },
    {
      id: 'splash',
      labelKey: 'build.checkSplash',
      actual: splash === undefined ? '—' : splash ? 'on' : 'off',
      expected: 'off',
      status: splash === false ? 'ok' : 'fail',
    },
    {
      id: 'nativeCode',
      labelKey: 'build.checkNativeCode',
      actual: native ?? '—',
      expected: 'asmjs',
      // Editors before 3.8.6 have no such option. Absent means the question
      // does not apply, not that the project is misconfigured.
      status: native === undefined ? 'na' : native === 'asmjs' ? 'ok' : 'fail',
    },
  ];
}

export function needsFix(checks: BuildCheck[]): boolean {
  return checks.some((c) => c.status === 'fail');
}

export type BuildRunState = 'idle' | 'running' | 'success' | 'failure' | 'busy';

export interface ProgressState {
  state: BuildRunState;
  /** 0..1, as the builder reports it. */
  progress: number;
  message: string;
  /** True once the task has been seen actually building. */
  sawRunning: boolean;
}

/**
 * How long a task may report a terminal state before we believe it.
 *
 * A build task keeps its last result forever, so the first reads after we ask
 * for a build can still show the PREVIOUS run's `success`. Believing that would
 * flash "done" a moment after the button was pressed. Ten seconds is far longer
 * than the gap between `add-task` returning and the task flipping to
 * `processing`, and far shorter than any real build.
 */
export const STALE_RESULT_GRACE_MS = 10_000;

/**
 * Fold one observation of the build task into panel-facing progress.
 *
 * Pure so the stale-result rule above is testable — the editor is not.
 */
export function reduceProgress(
  prev: ProgressState,
  task: { state?: string; progress?: number; message?: string } | null | undefined,
  ctx: { elapsedMs: number },
): ProgressState {
  if (!task) return prev;

  if (task.state === 'processing' || task.state === 'waiting') {
    return {
      state: 'running',
      progress: typeof task.progress === 'number' ? task.progress : prev.progress,
      message: task.message || prev.message,
      sawRunning: true,
    };
  }

  const terminal = task.state === 'success' || task.state === 'failure' || task.state === 'cancel';
  if (!terminal) return prev;

  // Not yet seen building: this is last run's result until proven otherwise.
  if (!prev.sawRunning && ctx.elapsedMs < STALE_RESULT_GRACE_MS) return prev;

  return {
    state: task.state === 'success' ? 'success' : 'failure',
    progress: task.state === 'success' ? 1 : prev.progress,
    message: task.message || prev.message,
    sawRunning: prev.sawRunning,
  };
}

/**
 * Correct the policy keys, leaving everything else alone.
 *
 * `nativeCodeBundleMode` is written only when the options already carry it —
 * adding it on an older editor would write a key no build reads.
 */
export function applyPolicy(options: BuildOptions): BuildOptions {
  const fixed: BuildOptions = { ...options, platform: 'web-mobile', useSplashScreen: false };
  if (options.nativeCodeBundleMode !== undefined) fixed.nativeCodeBundleMode = 'asmjs';
  return fixed;
}

/**
 * Full options for the extension's own build task, from whatever defaults the
 * project carries.
 *
 * Unlike `applyPolicy` this always sets `nativeCodeBundleMode`: a task we
 * create is explicit about it, because inheriting silence means inheriting the
 * engine default `both`. An editor that does not know the key ignores it.
 *
 * This is why a Playbox build is correct whether or not the operator ever
 * presses Fix — Fix exists to repair the defaults their *manual* builds inherit.
 *
 * `taskId` is the project's existing web-mobile task when it has one, so the
 * build panel keeps one row instead of growing a duplicate that writes to the
 * same directory.
 *
 * `autoPackage` rides along in `packages` — the same per-task option declared
 * in `src/builder.ts` and read by `onAfterBuild`. Setting it here means a build
 * started from our button packages itself through the exact pipeline a build
 * started from the Cocos panel uses, rather than a second one that could drift.
 */
export function buildTaskOptions(
  defaults: BuildOptions,
  opts: { taskId?: string; autoPackage?: boolean } = {},
): BuildOptions {
  const packages = (defaults.packages as Record<string, any>) || {};
  return {
    ...defaults,
    ...applyPolicy(defaults),
    nativeCodeBundleMode: 'asmjs',
    id: opts.taskId ?? PLBX_TASK_ID,
    taskName: BUILD_OUTPUT_NAME,
    outputName: BUILD_OUTPUT_NAME,
    packages: {
      ...packages,
      'plbx-cocos-extension': {
        ...(packages['plbx-cocos-extension'] || {}),
        autoPackage: opts.autoPackage === true,
      },
    },
  };
}
