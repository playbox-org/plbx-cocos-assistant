# plbx-cocos-extension

Cocos Creator 3.8+ extension that packages `web-mobile` builds into playable
ads for 25+ ad networks (HTML or ZIP per network), with compression, a local
preview validator, and deploy to the Playbox platform (plbx.ai).

The packaging engine itself is NOT in this repo — it is the shared
`@playbox-ai/playable-kit` npm package (public, `~0.3.1`). This extension is a
*consumer*: it wires the kit into the Cocos editor (panels, IPC, deploy,
compression, self-update) but the packaging/validation/preview-mock/network
rules are the kit's. See "Shared kit" below.

## Commands

- Build: `npm run build` (tsc → `dist/`), watch: `npm run watch`
- Tests: `npx vitest run` (single file: `npx vitest run tests/path/to.test.ts`)
- Install into Cocos: Extension Manager → Development Import → this folder.
  The editor caches the loaded `dist/main.js` and panel statics — after a
  rebuild, restart the editor (or Developer → Reload) to pick up changes.

## Architecture

- `src/main.ts` — all IPC methods (entry point). IPC pattern: panel calls
  `Editor.Message.request('plbx-cocos-extension', '<message>', ...)`; messages
  are registered in `package.json` `contributions.messages` and must map to a
  method in `main.ts`. All IPC data must be JSON-serializable.
- `src/panels/default.ts` + `static/template/index.html` + `static/style/` —
  dockable panel UI (Build Report / Compress / Package / Deploy tabs).
- Packaging / validation / preview-mocks / network registry / packaging types
  come from `@playbox-ai/playable-kit` — imported from the barrel
  (`import { packageForNetworks, HtmlBuilder, validateArtifact, getNetwork,
  generatePreviewUtil, ... } from '@playbox-ai/playable-kit'`) or the
  `/networks` (fs-free registry) and `/types` subpaths. There is NO local
  `src/core/packager/`, `src/shared/`, or `src/core/preview/{sdk-mocks,
  loader-health}` — those were deleted when the kit was adopted.
- `src/core/` — editor-specific business logic that stays out of the kit:
  - `preview/server.ts` — dev preview HTTP server (editor runtime; unzips
    builds with `jszip`, serves the kit's `generatePreviewUtil` mock + UI in
    `static/preview/`). The only thing left under `preview/`.
  - `build-report/` — asset scan for the panel's Build Report tab.
  - `compression/` — sharp (images) + ffmpeg (audio).
  - `deployer/` — Playbox API client + uploader.
  - `freshness/` + `updater/` — self-update (see below).
  - `settings.ts` — Cocos profile read/write.
- `src/main.ts` / `src/hooks.ts` — call the kit's `packageForNetworks` etc.
- `jszip` is a direct dep (used Node-side by `preview/server.ts` +
  `updater/update.ts`); `cheerio`/`clean-css` are transitive through the kit.
- `tests/fixtures/roadside-build/` — real Cocos web-mobile build used by tests.
  Unit tests for packaging/validation/preview-mocks live in the kit repo, NOT
  here; the extension keeps only integration tests (`tests/integration/*`
  package a real build through the kit and browser-verify it) + editor-glue
  tests (server, settings, build-report, freshness, updater).

## Shared kit (`@playbox-ai/playable-kit`)

- Public npm package (`github.com/playbox-org/playable-kit`, local clone at a
  sibling path). Owns packaging + validation + preview-mocks + network registry
  + packaging types. Ships prebuilt `dist` (ESM + CJS); the extension's `tsc`
  build just needs it resolvable — no bundler change.
- Pin `~0.3.x` (patch-only) so the extension tracks kit patches, not breaking
  minors. Bump BOTH repos together on any packaging-rule change.
- Same code by construction — the kit was extracted from this extension, so the
  packaged output is byte-identical EXCEPT the console banner (now emits the
  kit's name/origin, not the extension's — expected, not a regression).
- GOTCHA — add-export-don't-fork: if the extension needs a symbol the kit
  doesn't export, it is almost always already defined in the kit's source but
  missing from its barrel (`src/index.ts`). Add the re-export in the kit repo,
  patch-bump, publish, re-pin — do NOT reintroduce a local copy. The kit's
  deep-path tests never import the barrel, so missing re-exports are invisible
  there; `tests/public-api.test.ts` in the kit guards the public surface.
  (0.3.1 added `resolveTemplate`, `buildOutputRows`/`OutputFileStat`/
  `OutputBuildRow`, `parse{Risky,Hostile}*Marker`, `AXON_SPEC_URL` this way.)

## Releases & self-update

- Versioning: bump `package.json` version before every push; tag `vX.Y.Z`
  and push the tag — the pushed tag IS the publish step.
- Release notes: every version bump MUST ship a GitHub Release with notes —
  `gh release create vX.Y.Z --title "..." --notes-file <file> --latest`.
  Notes cover highlights (features/fixes, user-facing impact) + the commit list
  since the previous release. Do this as part of the bump, never skip it.
- CI (`.github/workflows/release.yml`): on tag `v*`, builds a prebuilt bundle
  (`dist` + `static` + `package.json` + `sharp-worker.js` + runtime-only
  `node_modules`) and attaches `plbx-cocos-extension-<tag>.zip` + `.sha256` to
  the Release. Creating the Release (`gh release create`) makes the tag →
  triggers CI → CI `--clobber`-uploads the asset. GOTCHA: the bundle's
  `node_modules` is built from a generated prod-only manifest (only
  `dependencies`), NOT `npm ci --omit=dev --omit=optional` — `--omit` proved
  unreliable and leaked playwright + sharp/@img into the bundle. `dependencies`
  is now `@playbox-ai/playable-kit` + `jszip`; the kit + its transitive deps
  (cheerio/clean-css/jszip) are all pure JS, so the bundle stays native-free.
- Update check (`src/core/freshness/freshness-check.ts`): compares local
  `package.json` version against the max semver tag from the public GitHub
  `/tags` API. Pure version comparison — intentionally no git involvement
  (a detached HEAD / missing upstream / GUI PATH without git used to break
  it). Cached 10 min in `main.ts`.
- One-click update (`src/core/updater/update.ts`): prebuilt-artifact delivery,
  polled by the panel via `startUpdate`/`getUpdateState`. Two channels by a
  `.git` check on the extension root: a Developer Import (soft link → git
  checkout, has `.git`) REFUSES self-update and points to `git pull` — never
  overwrites a working tree; a packaged copy (no `.git`) downloads the release
  zip → verifies sha256 → overlays in place (an on-demand `node_modules/sharp`
  survives — overlay, not clean-swap). Bundle is native-free JS so in-place
  overwrite is safe on macOS + Windows. Editor restart afterwards.
- Kit update channel (`src/core/kit/`): the packaging engine is an npm dep that
  rides inside the bundle, so a validator patch would otherwise need a full
  extension release. The panel checks the npm registry (cached 10 min, IPC
  `checkKitVersion`) and offers a one-click install of any newer kit INSIDE the
  declared pin (`startKitUpdate`/`getKitUpdateState`); an out-of-pin version
  (0.4.x under a `~0.3.1` pin) points at the extension self-update instead.
  Range dialect is `~`/exact only — npm's caret has a 0.x special case and a 0.x
  minor may break the API, so anything else fails closed. Developer Import
  refuses (manual `npm update`). Kit install and self-update are mutually
  exclusive — both rewrite `node_modules`.
- `sharp` ships OUTSIDE the bundle (optional, per-platform native; bundling
  libvips would take on LGPL-3.0). Compress checks `sharp-worker.js --probe`
  and offers a one-click install (IPC `checkSharp`/`installSharp`/
  `getSharpInstallState`).
- GOTCHA — never run `npm install <pkg>` with the extension root as cwd. The
  bundle ships the REAL `package.json` (devDependencies, optionalDependencies,
  postinstall) while its `node_modules` comes from a throwaway prod-only
  manifest that never enters the zip, so npm reifies the FULL ideal tree there:
  `npm install sharp --dry-run` in a shipped bundle adds 128 packages
  (playwright + browser downloads, vitest, typescript), and `--save` rewrites
  the pins we read. Both on-demand installs (sharp, kit) go through
  `src/core/npm/scratch-install.ts`: scratch dir + one-line manifest, then the
  package moved in with its deps NESTED under it. Nesting is load-bearing —
  `jszip` is declared by the extension (`preview/server.ts`, and `update.ts`
  requires it inside the updater) AND by the kit, so a hoisted copy would
  eventually upgrade the root's out from under code that never declared it.

## Key gotchas

- Lifecycle: `gameReady` is defined by network validators and called by us;
  `gameStart` is defined by us and called by the validator. Never overwrite
  validator lifecycle functions.
- Mintegral CTA is `window.install()`, not `mraid.open()`.
- Games detect the build via `window.super_html_channel` and route CTA
  through `super_html`/`plbx_html` — the packager must set that marker.
- Cocos wraps `window.fetch` in injected code contexts — use XHR for
  injected POSTs.
- i18n files (`src/core/i18n/locales.ts`) are flat; Cocos namespaces them by
  extension name.
- Moloco V2 launcher has a strict 3 KB ceiling (`LAUNCHER_MAX_BYTES`) —
  packaging aborts if exceeded; the splash uses compact mode there.

## Docs index

Packaging, validation and ad-network docs live in the KIT repo
(`playable-kit/docs/`), not here — network specs (`docs/networks/`), the
ad-network reference + prior-art research (`docs/research/`), and the specs for
packaging features (self-contained loader, splash, loader-health / risky-audio
validation, Moloco V2, plbx_html external commands). Write network rules there.

What stays here is editor-side:

- `docs/plans/` — extension design/implementation, compress + preview server.
- `docs/research/cocos-creator-extension-api.md` — Cocos extension API notes.
- `docs/superpowers/specs/` + `plans/` — editor features: build report, perf
  HUD, stable delivery + sharp guard, kit freshness.

Docs are public — no absolute local paths, client project names, or personal
data in them.
