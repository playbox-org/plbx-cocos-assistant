import { describe, it, expect } from 'vitest';
import {
  verifyBuildOptions,
  applyPolicy,
  buildTaskOptions,
  needsFix,
  PLBX_TASK_ID,
  BUILD_OUTPUT_NAME,
  reduceProgress,
  STALE_RESULT_GRACE_MS,
} from '../../src/core/build/build-policy';

const CORRECT = {
  platform: 'web-mobile',
  useSplashScreen: false,
  nativeCodeBundleMode: 'asmjs',
};

const byId = (checks: ReturnType<typeof verifyBuildOptions>, id: string) =>
  checks.find((c) => c.id === id)!;

describe('verifyBuildOptions', () => {
  it('passes every check on correct settings', () => {
    const checks = verifyBuildOptions(CORRECT);
    expect(checks.map((c) => c.status)).toEqual(['ok', 'ok', 'ok']);
    expect(needsFix(checks)).toBe(false);
  });

  it('flags a non web-mobile platform', () => {
    const c = byId(verifyBuildOptions({ ...CORRECT, platform: 'web-desktop' }), 'platform');
    expect(c.status).toBe('fail');
    expect(c.actual).toBe('web-desktop');
    expect(c.expected).toBe('web-mobile');
  });

  it('flags the Cocos splash screen being on', () => {
    const c = byId(verifyBuildOptions({ ...CORRECT, useSplashScreen: true }), 'splash');
    expect(c.status).toBe('fail');
    expect(c.actual).toBe('on');
  });

  // The engine default is 'both', which splits cc.js and emits real .wasm —
  // the file:// black screen this whole feature exists to prevent.
  it('flags nativeCodeBundleMode both', () => {
    const c = byId(verifyBuildOptions({ ...CORRECT, nativeCodeBundleMode: 'both' }), 'nativeCode');
    expect(c.status).toBe('fail');
    expect(c.actual).toBe('both');
  });

  // Editors older than 3.8.6 have no such option — "if it exists" in the spec.
  // Absent must read as informational, never as a failure to fix.
  it('reports a missing nativeCodeBundleMode as n/a, not a failure', () => {
    const checks = verifyBuildOptions({ platform: 'web-mobile', useSplashScreen: false });
    expect(byId(checks, 'nativeCode').status).toBe('na');
    expect(needsFix(checks)).toBe(false);
  });

  it('treats a missing platform or splash flag as a failure', () => {
    // Unlike nativeCodeBundleMode these always exist; absent means unset,
    // which builds as the engine default (web-desktop / splash on).
    const checks = verifyBuildOptions({});
    expect(byId(checks, 'platform').status).toBe('fail');
    expect(byId(checks, 'splash').status).toBe('fail');
    expect(needsFix(checks)).toBe(true);
  });
});

describe('applyPolicy', () => {
  it('corrects platform and splash', () => {
    const fixed = applyPolicy({ platform: 'web-desktop', useSplashScreen: true });
    expect(fixed.platform).toBe('web-mobile');
    expect(fixed.useSplashScreen).toBe(false);
  });

  it('corrects nativeCodeBundleMode when the editor has the option', () => {
    expect(applyPolicy({ nativeCodeBundleMode: 'both' }).nativeCodeBundleMode).toBe('asmjs');
  });

  // Writing a key the editor never had would be inventing a setting, and on an
  // older editor it lands in the profile as noise no build ever reads.
  it('does not invent nativeCodeBundleMode when the editor lacks it', () => {
    expect('nativeCodeBundleMode' in applyPolicy({ platform: 'web-mobile' })).toBe(false);
  });

  it('leaves unrelated options untouched', () => {
    const fixed = applyPolicy({ platform: 'web-desktop', md5Cache: true, buildPath: 'project://out' });
    expect(fixed.md5Cache).toBe(true);
    expect(fixed.buildPath).toBe('project://out');
  });

  it('does not mutate its input', () => {
    const input = { platform: 'web-desktop', useSplashScreen: true };
    applyPolicy(input);
    expect(input).toEqual({ platform: 'web-desktop', useSplashScreen: true });
  });
});

describe('buildTaskOptions', () => {
  it('is always policy-correct regardless of the inherited defaults', () => {
    // The extension's own build never depends on the operator pressing Fix.
    const opts = buildTaskOptions({ platform: 'web-desktop', useSplashScreen: true, nativeCodeBundleMode: 'both' });
    expect(verifyBuildOptions(opts).every((c) => c.status !== 'fail')).toBe(true);
  });

  it('builds into build/web-mobile — the directory packaging reads', () => {
    const opts = buildTaskOptions({});
    expect(opts.outputName).toBe(BUILD_OUTPUT_NAME);
    expect(opts.taskName).toBe(BUILD_OUTPUT_NAME);
  });

  it("reuses the project's existing web-mobile task when there is one", () => {
    // Otherwise the build panel grows a second row writing to the same folder.
    expect(buildTaskOptions({}, { taskId: '1769982760949' }).id).toBe('1769982760949');
  });

  it('falls back to a pinned id so repeated builds never pile up', () => {
    expect(buildTaskOptions({}).id).toBe(PLBX_TASK_ID);
  });

  // Auto-package rides the per-task option the existing onAfterBuild hook
  // reads, so our build packages through the same pipeline a Cocos-panel build
  // with the checkbox ticked does.
  it('carries the auto-package setting into the task packages block', () => {
    const on = buildTaskOptions({}, { autoPackage: true });
    expect((on.packages as any)['plbx-cocos-extension'].autoPackage).toBe(true);
    const off = buildTaskOptions({}, { autoPackage: false });
    expect((off.packages as any)['plbx-cocos-extension'].autoPackage).toBe(false);
  });

  it('defaults auto-package to off rather than inheriting a stale task value', () => {
    // The panel setting is the source of truth; a leftover true in the task
    // would package builds the operator turned packaging off for.
    const opts = buildTaskOptions({ packages: { 'plbx-cocos-extension': { autoPackage: true } } });
    expect((opts.packages as any)['plbx-cocos-extension'].autoPackage).toBe(false);
  });

  it('keeps other extensions\' task options intact', () => {
    const opts = buildTaskOptions({ packages: { 'cocos-service': { enabled: true } } }, { autoPackage: true });
    expect((opts.packages as any)['cocos-service']).toEqual({ enabled: true });
  });

  it('forces asmjs even when the inherited defaults never mentioned it', () => {
    // A task we create must be explicit: inheriting silence here means
    // inheriting the engine default 'both'.
    expect(buildTaskOptions({}).nativeCodeBundleMode).toBe('asmjs');
  });
});

describe('reduceProgress', () => {
  const IDLE = { state: 'running' as const, progress: 0, message: '', sawRunning: false };

  it('tracks progress while the task is building', () => {
    const r = reduceProgress(IDLE, { state: 'processing', progress: 0.4, message: 'bundling' }, { elapsedMs: 1000 });
    expect(r).toEqual({ state: 'running', progress: 0.4, message: 'bundling', sawRunning: true });
  });

  // The bug this rule exists for: a task keeps its previous result, so the
  // first reads after pressing Build can still show the last run's success.
  it('ignores a terminal state seen before the task ever ran', () => {
    const r = reduceProgress(IDLE, { state: 'success', progress: 1 }, { elapsedMs: 500 });
    expect(r.state).toBe('running');
  });

  it('believes a terminal state once the grace period has passed', () => {
    const r = reduceProgress(IDLE, { state: 'success', progress: 1 }, { elapsedMs: STALE_RESULT_GRACE_MS + 1 });
    expect(r.state).toBe('success');
  });

  it('believes success immediately once the task has been seen building', () => {
    const running = reduceProgress(IDLE, { state: 'processing', progress: 0.9 }, { elapsedMs: 800 });
    const done = reduceProgress(running, { state: 'success' }, { elapsedMs: 900 });
    expect(done).toMatchObject({ state: 'success', progress: 1 });
  });

  it('maps failure and cancel alike — both mean no artifact', () => {
    const running = reduceProgress(IDLE, { state: 'processing' }, { elapsedMs: 100 });
    expect(reduceProgress(running, { state: 'failure' }, { elapsedMs: 200 }).state).toBe('failure');
    expect(reduceProgress(running, { state: 'cancel' }, { elapsedMs: 200 }).state).toBe('failure');
  });

  it('keeps the previous reading when the task cannot be read', () => {
    const running = reduceProgress(IDLE, { state: 'processing', progress: 0.3 }, { elapsedMs: 100 });
    expect(reduceProgress(running, null, { elapsedMs: 200 })).toEqual(running);
    expect(reduceProgress(running, { state: 'none' }, { elapsedMs: 200 })).toEqual(running);
  });
});
