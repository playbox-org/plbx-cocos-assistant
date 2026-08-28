# Build button + build-settings verification — design

Date: 2026-08-28
Status: approved, implementing

## Problem

Packaging a playable needs a Cocos build made with three specific settings.
Today the operator sets them by hand every time, in a panel that lives outside
this extension:

- platform `web-mobile`
- Cocos splash screen off (`useSplashScreen: false`)
- Bundle Mode Of Native Code = `asm.js` (`nativeCodeBundleMode: 'asmjs'`), where
  the editor offers it

The third one has already shipped a bug to a client. `nativeCodeBundleMode`
lives in `<project>/profiles/v2/packages/builder.json`, and `profiles/` is not
versioned — on a fresh machine the project silently falls back to the engine
default `both`, which splits `cc.js` and emits real `.wasm`. That combination
renders a black screen when the packaged creative is opened over `file://`
(see the kit's `_deFile` fix, extension v0.5.4). Nothing in the editor warns
about it, and our own preview validator is structurally blind to it because it
serves over http.

So the settings are both easy to get wrong and expensive when wrong.

## Scope

In the Package tab, a **Build** button — separate from Pack All, a separate
process — opening a modal that:

1. verifies the three settings and shows per-item status,
2. offers **Fix** when any item is wrong,
3. runs the build with a progress bar.

Feature cropping is explicitly out of scope for this iteration.

## What the extension talks to

The Cocos `builder` package's IPC. Only `open` and `query-worker-ready` are
documented as public, but the whole map is declared in
`builtin/builder/@types/protected/message.d.ts` inside `app.asar`:

| Message | Signature | Use |
|---|---|---|
| `add-task` | `(options: Optional<IBuildTaskOption>, shouldWait?: boolean) => TaskAddResult \| BuildExitCode` | creates AND runs a build task — this is the build trigger |
| `query-task` | `(id: string) => IBuildTaskItemJSON` | read a task's stored options |
| `query-tasks-info` | `({type: 'build'}) => {list, queue, free}` | is the builder idle |
| `open` | `(panel: 'default' \| 'build-bundle') => void` | fallback: hand over to the Cocos panel |

Progress is READ, not pushed. `builder:task-changed` looks like the obvious
source and is a trap: it fires hundreds of times per build with every argument
`undefined` — a "something changed, go ask" tick, not the task. Verified in the
editor; subscribing to it left the progress bar at zero for a whole build. So
the panel's 500 ms poll asks `query-task(id)` instead (falling back to a scan of
`query-tasks-info`'s list and queue), reading `state` — `waiting | processing |
success | failure | cancel | none` — and `progress` (0..1).

A task keeps its previous result forever, so a `query-task` right after
`add-task` can still report the LAST run's `success`. `reduceProgress` therefore
ignores a terminal state until the task has been seen `processing`, or ten
seconds have passed — otherwise the modal would flash "done" a moment after the
button was pressed.

`add-task` accepts an explicit `id`, so the extension pins one — no duplicate
tasks accumulate across builds.

## What Verify actually reads

`common` in `profiles/v2/packages/builder.json`, via
`Editor.Profile.getProject('builder', 'common.<key>', 'local')`.

That is the block a newly created build task inherits, so it is what governs
every build the operator starts by hand in the Cocos panel — which is the
failure this feature exists to prevent. The extension's own build does not
depend on it: `add-task` is always handed a fully-specified options object, so
a Playbox build is correct whether or not the operator ever presses Fix.

Note the trap this avoids: `common` and an individual task's stored options
drift apart. On a real project (`Mintergal_C1_v2`) `common.nativeCodeBundleMode`
was `asmjs` while a saved task carried `both`. A verifier is therefore honest
only about the scope it names, and this one names project build defaults.

`nativeCodeBundleMode` is absent on editors older than 3.8.6. Absent reads as
status `na` — informational, never red, never "fixed" into existence.

## Components

- `src/core/build/build-policy.ts` — pure, no `Editor`. `verifyBuildOptions()`
  → `BuildCheck[]`, `applyPolicy()` → patched options, `needsFix()`. Unit
  tested exactly like `src/core/build-dir.ts`.
- `src/core/build/build-task.ts` — the only place that touches `builder` IPC:
  reads effective options, writes fixes to the profile, starts the build,
  reads the running task's state.
- `src/main.ts` — four IPC methods: `verify-build-settings`,
  `fix-build-settings`, `start-build`, `get-build-progress`. The panel polls the
  last one, matching the existing `getDeployProgress` / `getUpdateState` /
  `getSharpInstallState` pattern. `start-build` is fired without awaiting it —
  awaiting a call whose duration is the build's would freeze the bar by
  construction.
- Panel: a `build-overlay` modal built on the existing `settings-overlay` /
  `preview-overlay` markup and CSS.

## Build output

The task outputs as `web-mobile`, i.e. into `build/web-mobile` — the directory
the Package tab already packages from. Building anywhere else would leave the
operator repointing Build Directory by hand, or packaging the previous build
out of a sibling folder.

Because a project usually already has a `web-mobile` task, the extension reuses
it: `query-tasks-info` finds the task whose output name matches and `add-task`
is handed that id, so the Cocos build panel keeps one row. Two tasks under one
output name would overwrite each other's output silently. A project with no
such task yet gets our own pinned id instead.

On success the existing `onAfterBuild` hook records `lastBuildDest`;
because the operator started this build from our panel, the Build Directory
field adopts it directly instead of raising the mismatch warning that
`resolveBuildDir` shows for third-party builds.

## Auto-package

Packaging after a build already exists — `onAfterBuild` in `src/hooks.ts` runs
it when the build task carries `packages['plbx-cocos-extension'].autoPackage`.
That option is the checkbox in the *Cocos* build panel, so the Package tab's own
"Auto-package after build" setting governed nothing about builds.

`buildTaskOptions` therefore injects the panel setting into that block, and the
hook falls back to the panel setting when a task carries no option at all. One
packaging pipeline, reachable from both buttons, instead of a second one in the
panel that could drift from the hook's.

Because the builder awaits the hook, a task reporting `success` has already
finished packaging — so the modal can say "built and packaged" truthfully, and
pull the results (stored by `onAutoPackageDone`) into the existing results
table.

## Pack All availability

Pack All is disabled unless `<buildDir>/src/settings.json` exists — the same
marker `detectBuildDir` uses to recognise a Cocos build. Existence of the
directory is not enough: an emptied `build/` or a typo that happens to match a
real folder would otherwise fail deep inside the kit with a missing-file error
instead of saying "there is no build here" up front. Re-checked when the field
changes, when settings load, and after a build.

## Failure handling

`add-task` returning `BUSY`/`BUILD_BUSY` means another build is running — the
modal says so and leaves the button enabled to retry. Any other failure, and
the IPC call throwing at all, falls back to the same recovery: the settings
have already been written to the profile, so the modal tells the operator to
press Build in the Cocos panel and opens it via `builder` → `open`. Verify and
Fix keep working in that state because they go through the profile, not
through the undocumented task API.

## Testing

Unit tests cover `build-policy` across every combination, including a missing
`nativeCodeBundleMode`, and the Build Directory adoption flag. The IPC layer is
not unit tested — there is no editor in CI, which is already the case for every
other `Editor.*` call in this repo.
