# Kit freshness — check npm for a newer `@playbox-ai/playable-kit` and offer to install it

Status: revised after review (blocker + 3 major folded in), awaiting user approval
Date: 2026-07-13

## Problem

Since v0.4.0 the packaging engine is not in this repo — it is the
`@playbox-ai/playable-kit` npm package, pinned `~0.3.1` and shipped *inside*
the extension's release bundle (`node_modules/@playbox-ai/playable-kit`).

Packaging rules change often: an ad network tightens a validator and the kit
ships a patch (0.3.2 forbade the `mraid.js` literal on non-MRAID networks
after Moloco rejected a live creative). Today that patch reaches a user only
through a *new extension release*. We want a second, cheaper channel: the
extension notices a newer kit on npm and offers a one-click install, with no
extension release in between.

## Non-goals

Auto-installing without asking. Rolling a kit version back. A version picker in
the UI. An on-disk cache of the verdict. A separate panel tab. Managing kit
versions per project.

## Model

Three versions are compared:

| Side | Source |
|---|---|
| installed | `node_modules/@playbox-ai/playable-kit/package.json` → `version` |
| declared range | `dependencies['@playbox-ai/playable-kit']` in the extension's `package.json` (`~0.3.1`) |
| published | `https://registry.npmjs.org/@playbox-ai/playable-kit` → `versions` |

Read the installed version by reading the file, NOT `require(...)`: the kit's
`exports` map does not expose `./package.json`, so `require` throws
`ERR_PACKAGE_PATH_NOT_EXPORTED`.

The verdict is a pure function of those three, with five states:

- **fresh** — installed is the newest version inside the declared range.
- **update-available** — strictly `compareSemver(bestInRange, installed) > 0`.
  Only then is the one-click install offered. Never propose a downgrade.
- **extension-update-required** — inside the range we are already at the newest,
  but npm has a version outside it (e.g. 0.4.x). No kit install is offered; the
  banner points at the existing extension self-update instead.
- **ahead** — installed is newer than anything in range, or sits outside the range
  entirely (an unpublished version, a registry lag, a hand-hacked `node_modules`).
  Silent, exactly like `freshness-check`'s `ahead` (`freshness-check.ts:96`).
- **unknown** — offline, rate-limited, any side unreadable, or a declared range we
  do not understand. Stay silent; never block work on a failed check.

Range dialect: `~x.y.z` and an exact version, nothing else. Anything else →
`unknown` (fail closed). We deliberately do NOT implement `^`: npm's caret has a
`0.x` special case (`^0.3.1` means `<0.4.0`, not `<1.0.0`), a naive
"same major" reading would offer 0.9.x as compatible and crash the editor — and
the dialect is dead code anyway, since the pin is `~0.3.1` and every extension
release overwrites `package.json`.

Prereleases (`0.4.0-rc.1`) are ignored. `SEMVER_RE` in `freshness-check` already
drops them; this spec makes it a required test rather than a side effect.

If no published version falls inside the range at all (0.3.x unpublished, the
registry carries only 0.4.x), `pickBestInRange` is empty and "installed is the
newest in range" is undefined — treat installed as the best, then take the normal
fork (`fresh`, or `extension-update-required` when a newer out-of-range version
exists).

### Why range-bounded and not "always absolute latest"

The extension calls kit symbols directly (`main.ts`, `hooks.ts`). Under semver a
`0.x` minor bump is allowed to break the API, so installing an out-of-range kit
could leave a user with an extension that crashes at runtime and no way back.
Staying inside the declared range makes API compatibility a guarantee rather than
a hope, and it still delivers exactly the case we care about — validator patches,
which land as patch releases.

## Components

**`src/core/kit/kit-freshness.ts`** — pure, no IO:
`parseRange` (`~x.y.z` and exact only — see the dialect note above), `satisfies`,
`pickBestInRange`, `classifyKit`, `formatKitBanner`. Reuses `compareSemver` from
`freshness/freshness-check.ts` — do not fork it.

**`src/core/kit/kit-update.ts`** — the IO sides: `fetchKitVersions()` and
`installKit()`. No new npm dependency: the range dialect is ours and a dozen
lines of comparison beat taking on `semver`.

`fetchKitVersions()` — https GET `registry.npmjs.org/@playbox-ai/playable-kit`
with `Accept: application/vnd.npm.install-v1+json` (the abbreviated document; the
full one grows with every publish). Timeout; resolve `null` on any
non-200/parse/network failure.

### How the install actually runs (do NOT shell `npm install` in the root)

The obvious `npm install @playbox-ai/playable-kit@X` in the extension root is
wrong and would wreck a user's install. The bundle ships the *real*
`package.json` — `release.yml:40` copies it verbatim, devDependencies,
`optionalDependencies: sharp` and the `npm rebuild sharp` postinstall included —
while `node_modules` is built from a throwaway prod-only manifest that never
enters the zip (`release.yml:42-48`). There is no lockfile in the bundle. So a
plain `npm install` in that root would reify the *full* ideal tree from that
manifest: playwright (whose postinstall downloads browsers), typescript, vitest.
`--omit=dev --omit=optional` is not the escape hatch — this repo already
documents it as unreliable (`release.yml:42-45`), and `--omit=optional` would
additionally drop the on-demand `sharp` that the self-updater's overlay so
carefully preserves (`update.ts:19-20`). And npm's default `--save` would rewrite
the declared range to `^0.3.3` — mutating the very input our classifier reads.

Instead, `installKit` builds the tree in a scratch dir and lands it **nested under
the kit**, never hoisted into the root:

1. Validate the target version against `/^\d+\.\d+\.\d+$/` (it reaches a command
   line; nothing unvalidated goes there).
2. Write a scratch dir (`root/.plbx-kit-staged`) with a minimal manifest —
   `{"dependencies":{"@playbox-ai/playable-kit":"<X>"}}`.
3. `npm install --no-package-lock --ignore-scripts --no-audit --no-fund`, run with
   the Runner bound to the scratch dir (`defaultRunner(scratch)` — cwd lives in
   the closure, `update.ts:228`). The kit's transitive deps (cheerio, clean-css,
   jszip) come along.
4. `rimraf(root/node_modules/@playbox-ai/playable-kit)`, then move
   `scratch/node_modules/@playbox-ai/playable-kit` into its place, and move every
   remaining non-dot entry of `scratch/node_modules` into
   `root/node_modules/@playbox-ai/playable-kit/node_modules/`. Node resolves those
   nested copies first, so the kit gets exactly the dependency tree npm computed
   for it — and the root's own packages are not touched in either direction.
5. `rimraf(scratch)`.

**Why nested and not a hoisted overlay into `root/node_modules`.** `jszip` is a
shared dependency: the extension declares it directly (`preview/server.ts:4`, and
`update.ts:312` — the *self-updater itself* requires it) and the kit declares it
too. Both are `^3.10.0` today, so a hoisted copy would be harmless — but that is
a coincidence, not an invariant. The kit may raise its floor to `^4` in a patch
release, and a hoisted overlay would then silently drop jszip 4.x on top of the
root's 3.x, upgrading a package the extension never declared, underneath its own
updater. A merge-copy also leaves orphaned files whenever the new version of a
shared package removes some. Nesting sidesteps both: the kit's resolution is
private to the kit. The cost is a duplicate copy of jszip on disk — a fine trade
for not mutating dependencies we don't own.

Dot entries (`.bin`, `.package-lock.json`) are NOT moved. A hidden lockfile landing
in `root/node_modules` would become authoritative for any later npm run in the root
— including the one-click `npm install sharp` — and could prune the tree.

The root `package.json` is never touched. The root's `jszip` and an on-demand
`sharp` are never touched.

### Windows: fix the runner, don't build on a broken one

`defaultRunner` (`update.ts:228`) is `execFile('npm', …)`. On Windows npm is
`npm.cmd`, which `execFile` cannot spawn without a shell (and Node blocks
spawning `.cmd` shell-less since CVE-2024-27980). Worse, `augmentedEnv`
(`update.ts:220-225`) splits `PATH` on `':'` — on Windows that shreds `C:\…`
into garbage. So the existing one-click `npm install sharp` is already broken on
Windows; nobody has hit it yet.

This feature depends on running npm, so it fixes the runner rather than inheriting
the bug: `npm.cmd` + `shell: true` on win32, and `augmentedEnv` becomes a no-op
off macOS/Linux (the `:`-joined PATH shim exists for the macOS GUI PATH problem
and has no business on Windows). `installSharp` gets fixed for free — it shares
the runner.

**IPC (`src/main.ts`)** — `checkKitVersion` (verdict, cached 10 min like
freshness), `startKitUpdate`, `getKitUpdateState`. Start-and-poll, mirroring the
sharp install and the extension updater; `npm install` is far too slow for one
blocking IPC round-trip. Register all three in `package.json`
`contributions.messages`.

**Panel (`src/panels/default.ts`)** — reuse the Settings bar that already carries
the extension-update banner. Text: `Packaging kit 0.3.3 available (installed
0.3.2)`, plus an Update button. On success the button becomes "Reload the editor"
and calls the existing `promptRestart`. i18n strings go in
`src/core/i18n/locales.ts` (flat — Cocos namespaces them by extension name).

**Banner precedence.** There is exactly one bar and one button, already a small
`'update' | 'restart'` state machine (`default.ts:384-427`). The kit banner is
suppressed only when the extension banner is actually shown — i.e. the extension
is `behind`. It is NOT suppressed for `ahead`/`unknown`: `ahead` is the normal dev
state right after a local bump (`freshness-check.ts:100-103`), and a developer
still needs to see that a newer kit exists.

**Restart.** The kit is `require()`d in the editor process, so the old copy sits
in the require cache until reload — hence the restart prompt. Note `hooks.ts`
imports the kit in the *builder* process too: a build started after the install
but before the reload would run the new kit while the panel still holds the old
one. Harmless (the flow prompts for a restart immediately), but worth knowing
when reading a mixed-version log.

## Install channels

Told apart by a `.git` folder in the extension root — the same test the
self-updater already uses:

- **Packaged copy** (no `.git`): run the install.
- **Developer Import** (`.git` present): installing is REFUSED. It would mutate a
  developer's working tree and desync `package-lock.json`. The banner shows the
  available version and the manual command (`npm update @playbox-ai/playable-kit`).

## Failure modes

- Registry unreachable / rate-limited → `unknown`, silent, work continues.
- `npm install` fails → surface its output plus the manual command, exactly as the
  sharp install does. The scratch dir is removed either way; a failed install
  leaves `node_modules` untouched, because the overlay only runs after npm exits 0.
- **Concurrent** extension update and kit install: both mutate `node_modules`.
  Cross-guard — each start refuses while the other is running, the same one-line
  re-entrancy check the existing jobs use (`main.ts:56, 91`).
- **Sequential** self-update after a kit install: the overlay restores the
  bundle's kit, reverting the hot patch. Deliberately NOT handled — the next
  check re-offers the newer kit. No on-disk state, nothing to get out of sync.
- After a successful install, drop the cached verdict (`_kitCache = null`), the
  way a successful extension update drops `_freshnessCache` (`main.ts:70`) —
  otherwise the "0.3.3 available" banner lingers for up to 10 minutes after 0.3.3
  is installed.

## Tests

Pure logic, no network (deps injected, as in `freshness-check`):

- `satisfies` / `pickBestInRange` — `~0.3.1` accepts 0.3.9, rejects 0.4.0 and 0.3.0;
  prereleases (`0.4.0-rc.1`, `0.3.9-beta`) never selected.
- Unsupported range dialect (`^0.3.1`, `>=0.3.1`, `*`) → `unknown`, no offer.
- `classifyKit` — all five states, including `extension-update-required` (only
  newer version is out of range) and `ahead` (installed newer than best-in-range,
  and installed outside the range) → never proposes a downgrade.
- `classifyKit` — empty in-range set (registry has only out-of-range versions) does
  not crash and does not offer an install.
- `installKit` with a fake `Runner`/IO — asserts the generated scratch manifest and
  the exact flags (`--no-package-lock --ignore-scripts --no-audit --no-fund`), that
  the root `package.json` is never written, that the move runs only on exit 0, and
  the ok/fail messages. A non-semver version is rejected before any spawn.
- `installKit` tree placement — the kit's deps land under
  `node_modules/@playbox-ai/playable-kit/node_modules/`, the root's own `jszip` is
  byte-identical afterwards, and no `.bin` / `.package-lock.json` is moved into
  `root/node_modules`. This is the test that would have caught the hoisted-overlay
  bug, so it is not optional.
- Dev-import guard — with `.git` present no command is spawned at all.
- Runner platform matrix — win32 resolves `npm.cmd` with a shell and leaves `PATH`
  intact; darwin keeps the augmented-PATH behaviour.
