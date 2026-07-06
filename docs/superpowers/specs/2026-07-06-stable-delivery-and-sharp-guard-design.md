# Stable extension delivery + sharp availability guard

Status: approved (design)
Date: 2026-07-06
Target version: v0.3.0

## Problem

Self-update fails often. The current updater runs three toolchain steps on the
consumer's machine — `git pull --ff-only` → `npm install` → `npm run build` —
each an independent failure point in the editor's trimmed-PATH environment:

- `git pull --ff-only`: breaks on dirty tree, detached HEAD, no upstream, git
  absent from the editor GUI PATH.
- `npm install`: needs network; pulls a **dead `playwright` dependency**
  (0 imports in `src/`, ~14 MB, postinstall can fetch browsers); rebuilds the
  native `sharp` binary (ABI/toolchain mismatch).
- `npm run build`: needs tsc present and passing; node/tsc drift.

The freshness check (`freshness-check.ts`) already abandoned git for exactly
these reasons — it is a pure version-vs-tag comparison. The updater never
followed.

Two facts shape the fix:

1. **`sharp` is the only true native dependency** (optional, per-platform,
   loaded via a child-process worker `sharp-worker.js`). `playwright` is dead
   weight. Everything else (`cheerio`, `clean-css`, `jszip`) is small pure JS.
2. **Cocos install method decides the update surface.** Per the Cocos 3.8
   manual, "Developer Import" registers the extension as a **soft link** to the
   source folder, while "Import Extension Folder" **copies** it into
   `<project>/extensions/`. Developer Import points at a git checkout — the
   developer channel. Consumers need a copy they own.

## Goals

- Remove git/npm/tsc from the consumer update path.
- Deliver code as a prebuilt artifact from GitHub Releases (already published
  per version bump).
- Never destroy a developer's working tree during update.
- Compress feature degrades gracefully when `sharp` is absent, with a one-click
  install.

## Non-goals

- Publishing to the Cocos Store (future, optional).
- Bundling `sharp`/`libvips` (avoids LGPL-3.0 redistribution obligations; keeps
  a single platform-independent release asset).
- Bundling ffmpeg (stays an external system binary invoked via `execFile`).
- Linux support (target is macOS + Windows).

## Invariants

- **`sharp` lives outside the release bundle.** Installed on demand into the
  extension's `node_modules`, survives updates.
- **Two channels, detected by presence of `.git` in the extension root:**
  - `.git` present → developer install (Developer Import symlink → checkout).
    Self-update does NOT download or overwrite; it reports "dev checkout —
    update via git".
  - `.git` absent → consumer install (packaged copy). Self-update downloads the
    prebuilt bundle and overwrites in place.

## Feature A — sharp availability guard + auto-install popup

### Behaviour

1. Compress tab shows a sharp status line (mirrors the existing ffmpeg status
   line): available (green) / missing (amber).
2. When the user triggers a compression action and sharp is unavailable, a
   popup blocks the action: "Image compression needs the sharp library
   (~15 MB). Install now?" with an **Install** button.
3. Install runs `npm install sharp` in the extension root via the existing
   `defaultRunner` (from `update.ts`), streaming progress. npm resolves the
   correct per-platform binary (`@img/sharp-darwin-*` / `@img/sharp-win32-x64`).
4. On success → re-check → proceed with compression. On failure → show the
   manual command `npm install sharp` (run in the extension folder) as fallback.

### Components

- `src/core/compression/sharp-status.ts` — `checkSharpAvailable(): Promise<boolean>`
  and `installSharp(root, runner, onProgress)`. The check spawns `sharp-worker.js`
  in a `--probe` mode (require sharp, print `ok`/`missing`, exit) — the same
  plain-Node child-process context compression actually uses, so it can't give a
  false answer from the editor's Electron ABI. `installSharp` reuses the update
  runner + progress shape.
- `main.ts` — IPC methods `checkSharp` and `installSharp` (mirrors
  `checkFfmpeg`); registered in `package.json` `contributions.messages`.
- `panels/default.ts` — sharp status line + guard popup wired into the Compress
  actions (`compressImage`/`_compressAll`); reuses the update-progress polling
  pattern for the install run.
- i18n keys in `src/core/i18n/locales.ts` (flat): `compress.sharpAvailable`,
  `compress.sharpMissing`, `compress.sharpInstallPrompt`,
  `compress.sharpInstalling`, `compress.sharpInstallFailed`,
  `compress.sharpInstallManual`.

### Guard

Compression must check availability BEFORE running and block with the popup —
never let the worker fail silently.

## Feature B — prebuilt release delivery

### CI (`.github/workflows/release.yml`, on tag push `v*`)

```
npm ci → npm run build
→ assemble bundle: dist/ (compiled TS incl. i18n) + static/ + package.json
  + sharp-worker.js
  + prod runtime node_modules (cheerio, clean-css, jszip + transitive)
→ zip → sha256
→ gh release upload <tag> plbx-cocos-extension-<tag>.zip plbx-cocos-extension-<tag>.zip.sha256
```

Excluded from the bundle: `playwright`/`@playwright/test`, `sharp`/`@img`,
devDependencies, `src/`, `tests/`, `.git`, `docs/`.

### Downloader (rewrite of `update.ts` internals; panel contract unchanged)

`startUpdate`/`getUpdateState` and the `ProgressEvent` shape stay identical so
the panel poller keeps working. New internal sequence for the consumer channel:

```
detect .git → if present: abort with "dev checkout — git pull" (no download)
resolve latest release (GitHub API, by max tag from freshness)
→ find .zip asset + .sha256
→ download to temp
→ verify sha256 (mismatch → abort, no changes)
→ extract to <root>/.plbx-staged
→ overlay-copy staged → root  (overwrite; do NOT delete node_modules/sharp)
→ cleanup staging
→ prompt restart
```

Progress steps: `detect` / `download` / `verify` / `extract` / `apply`.

### Why overlay, not clean-swap

Overlay copies bundle files over the existing tree without deleting the whole
directory, so an on-demand-installed `node_modules/sharp` survives the update.
Stale files from removed deps may linger (harmless); a full clean is deferred
until that ever bites.

### Why in-place overwrite is cross-platform safe

The bundle is 100% JS + static assets (no native). Windows locks loaded
`.node`/`.dll` files but not `.js` (Node reads JS into memory at require time
and holds no handle). So overwriting the loaded extension in place works on both
macOS and Windows. The one native module (`sharp`) is outside the bundle, so its
files are never in the update surface. Editor restart (already required) reloads
the new `dist/main.js`.

### Failure handling

- No `.zip` asset / offline / API rate-limited / sha256 mismatch → abort with a
  clear message; the extension folder is left untouched (all mutation happens
  after verify).
- Interrupted apply → next update re-stages and re-applies (idempotent overlay).

## Distribution (consumer onboarding)

Consumers install the packaged extension as a **copy**, not Developer Import:

- Download `plbx-cocos-extension-<tag>.zip` from the GitHub Release.
- Extract into `~/.CocosCreator/extensions/plbx-cocos-extension/` (global, like
  the reference `super-html` extension) or `<project>/extensions/`.
- Restart the editor. Thereafter the panel's one-click update keeps it current.

Developers keep using `git clone` + Developer Import + `npm run build`/watch;
they update via `git pull`.

Docs: add a short "Install (consumers)" section to the README and the
`cocos-extension` skill.

## Testing

- `update.test.ts` (extend): sha256 verify (match/mismatch), `.git` detection
  branch (dev abort vs consumer proceed), overlay-copy preserves
  `node_modules/sharp`, asset pick from a release payload — all via injected
  runner/fs/fetch (no real network or spawn), matching the existing DI style.
- `sharp-status.test.ts` (new): `checkSharpAvailable` true/false via injected
  probe; `installSharp` success/failure via injected runner.
- After merge: `npx vitest run` + `npm run build` green.

## Files touched

New:
- `.github/workflows/release.yml`
- `src/core/compression/sharp-status.ts`
- `tests/core/compression/sharp-status.test.ts`

Modified:
- `src/core/updater/update.ts` (git steps → download/verify/overlay + `.git` gate)
- `src/main.ts` (IPC: `checkSharp`, `installSharp`; updater wiring)
- `src/panels/default.ts` (sharp status line + guard popup; unchanged update poll)
- `package.json` (register `checkSharp`/`installSharp` messages; move
  `playwright`/`@playwright/test` to devDependencies)
- `src/core/i18n/locales.ts` (sharp popup keys)
- `tests/core/updater/update.test.ts`
- `README*` + `cocos-extension` skill (consumer install section)

## Rollout

1. Move `playwright` out of `dependencies` (immediate `npm install` de-flake).
2. Land CI workflow + downloader + `.git` gate.
3. Land sharp guard + install popup.
4. Bump to v0.3.0, tag, push, `gh release create` with the built asset attached
   (the CI attaches the zip; verify it lands on the release before announcing).
