# Custom splash logo — size setting + live preview

Status: approved; implemented in kit 0.3.7 + extension (unreleased)
Date: 2026-08-05

## Problem

A client shipped a wide wordmark logo as the custom loading splash and it
rendered as a postage stamp on the device. The packaged splash CSS caps every
custom logo at a fixed **square 96 px box**:

```css
/* playable-kit, src/packager/splash.ts:94, custom-logo branch */
#lg{max-width:96px;max-height:96px;width:auto;height:auto;object-fit:contain;
    animation:pq 1.8s ease infinite}
```

Two independent failures come out of that one rule:

1. **No size control.** 96 px is 96 px for every project. There is no setting,
   so a logo that needs to be bigger cannot be made bigger.
2. **Absolute px do not scale.** 96 px on a 375 pt phone is ~26 % of the screen
   width; the same 96 px on a tablet is a speck. The splash is the first frame
   of the ad, so this is the first impression on the widest device spread we
   ship to.

`object-fit:contain` inside a *square* box compounds it: a 4:1 wordmark is
constrained by width, so it occupies 96 × 24 px — a quarter of the box's area.
That is the reported case.

Separately, the two panel IPC methods that were supposed to show the operator
what they picked are **dead code**. `src/main.ts:917` and `:939` still
`require('./core/packager/splash')` and `require('./core/packager/packager')`,
paths deleted when the kit was adopted. Both calls throw, so the panel's logo
thumbnail and byte-cost hint never render. The operator picks a file through a
native dialog and gets no feedback at all — which is why the size problem was
found in production instead of in the editor.

A third instance of the same rot turned up while implementing: `fixStoreUrls`
(`main.ts:487`) required `./core/packager/store-url-extractor`, also deleted.
That one is wrapped in `try/catch` and returns `{fixed: 0, sourceFixed: 0}`, so
the panel's "Fix regional store URLs" button silently did nothing rather than
erroring. All three now import from the kit, and a test asserts no `main.ts`
handler reaches into the deleted `./core/packager/` tree again.

## Goals

- A per-project size setting for the custom splash logo that reaches the build.
- Size expressed so it scales with the device, not with a hardcoded pixel count.
- A live preview in the Package tab that is *faithful* — what the operator sees
  is what the packager emits, with no second implementation to drift.
- Repair the two broken splash IPC methods on the way through.

## Non-goals

- Resizing the **Playbox** splash (`#lg{width:84px;height:84px}`). Untouched.
- Separate portrait/landscape sizes. One value; the preview can be *viewed* in
  either orientation but does not store two numbers.
- Separate width/height caps. One scalar drives both, `object-fit:contain`
  keeps the aspect ratio.
- Custom logo on the **Moloco V2 launcher**. `launcher-builder.ts:112` calls
  `buildSplash({withProgressBar:false, svgWordmark:false})` and never passes a
  `customLogo`, so a custom logo does not reach it today. Out of scope; noted
  under Known gaps.
- Logo position, background colour, progress bar for custom mode, animation
  choice.
- Auto-fitting the size from the logo's own aspect ratio. The operator decides.

## Model

### Unit: percent of `vmin`

The size is stored as a **number, 5–100, meaning percent of the viewport's
smaller side**, and emitted as `vmin`:

```css
#lg{width:38vmin;height:auto;max-height:38vmin;object-fit:contain;…}
```

`vmin` is the right basis because a playable is a full-viewport surface in an
unknown container: `vmin` tracks the *narrow* dimension in both orientations, so
one number cannot overflow the screen in either. `vw` would blow up in
landscape; `vh` in portrait; `%` would resolve against the flex container, not
the screen.

**`width`, not `max-width`** — revised after review of kit PR #11, which shipped
the shrink-only form. A cap only ever shrinks, so an asset whose intrinsic size
sits below it keeps that size and the setting silently stops responding above
it, at a threshold that is invisible because it depends on the asset. The
complaint that started this was "make the logo bigger", so the scale is the
authority on rendered size in **both** directions.

The aspect ratio survives: `height:auto` derives the height from the width, and
`max-height` catches a tall logo — for a replaced element the constrained height
re-derives the width (CSS 2.1 §10.4), so nothing stretches.

The cost is that a logo smaller than the scale is now **enlarged and looks
soft** — a real change from both the old `96px` and from PR #11 as merged, where
such an asset rendered at its intrinsic size. It is the operator's call, so the
panel makes it visible instead of discoverable in production: it previews the
result and prints the asset's own pixel size next to the slider
(`formatLogoDimensions`, in `core/splash/logo-dimensions.ts` — deliberately free
of kit imports, since the panel runs in the editor's renderer and must not load
the packaging engine to format one string).

**Default 26.** On the 375 pt reference viewport, `26vmin` = 97.5 px ≈ the
current 96 px. Projects that never touch the setting keep essentially today's
appearance, so the change is not a silent restyle of every existing project.

Clamped to `[5, 100]` at the kit boundary. Below 5 the logo is invisible; above
100 it exceeds the narrow dimension and `object-fit` starts letterboxing inside
an off-screen box. A non-finite or absent value falls back to 26 — never
`NaNvmin`, which would drop the whole declaration and silently restore the
browser default (intrinsic image size, i.e. potentially full-bleed).

### Where the value lives

| Layer | Name | Note |
|---|---|---|
| project settings | `ProjectSettings.splashLogoScale: number` | Cocos profile, per project |
| kit input | `PackageConfig.splashLogoScale?: number` | optional; absent → 26 |
| kit internals | `SplashOptions.logoScale?: number` | clamped here, once |
| emitted CSS | `max-width:{n}vmin;max-height:{n}vmin` | custom-logo branch only |

Only one clamp, at the kit boundary, so the panel and the packager cannot
disagree about what an out-of-range number means.

The value is stored unconditionally but only mapped into `PackageConfig` when
`splashMode === 'custom'`, matching how `customSplashLogo` is already gated in
`toPackageConfig` (`settings.ts:77`). A stored size therefore survives flipping
the mode to `none` and back, exactly like the stored logo path.

### Preview: the kit's own CSS in an iframe

The panel does **not** reimplement the splash. The kit exports `buildSplash`,
main.ts calls it with the real logo data URL and the real scale, and the panel
drops the returned `styleCss` + `bodyHtml` into an `<iframe srcdoc>` sized to a
phone aspect ratio.

```
srcdoc = '<style>html,body{margin:0;height:100%;background:#000}'
       + styleCss + '</style>' + bodyHtml
```

Fidelity comes for free: `vmin` inside an iframe resolves against the *iframe's*
viewport, so a 160 × 346 frame renders `26vmin` as 41.6 px — the same fraction
of the narrow side that a 375 × 812 phone renders as 97.5 px. The proportion the
operator judges is the proportion the device shows. And because it is literally
the packager's CSS string, a future kit change to the splash shows up in the
preview with no extension change.

The iframe is `sandbox`-ed with no allowed capabilities. The `srcdoc` embeds a
`data:` image the operator chose from their own disk, but the splash CSS also
carries `@keyframes` and the kit's `hideJs` is *not* included — the preview has
nothing to execute. `sandbox=""` (empty allow-list) keeps the panel document
safe from anything a hand-edited settings file could smuggle into the path.

An orientation toggle (portrait / landscape) only swaps the frame's width and
height. It is a viewing control, not a stored setting; it defaults to the
project's `orientation` setting, falling back to portrait for `auto`.

### Byte cost

The extension's copy of `splashByteCost` died with `src/core/packager/`, but the
function survives in the kit at `splash.ts:180` — it is simply missing from the
barrel, the exact add-export-don't-fork shape described in `CLAUDE.md`. Export
it; do not reimplement it in the extension. It already counts the honest
maximum (style + body + hideJs + `FIRST_FRAME_HOOK_JS`), which a naive
extension-side `.length` sum would undercount by ~700 B.

The cost is dominated by the base64 data URL and is **independent of the
scale** — changing the size changes two digits in the CSS. The panel therefore
recomputes cost on logo change, not on every slider tick.

## Kit change → `@playbox-ai/playable-kit` 0.3.7

0.3.6 is already published and the sibling clone sits exactly on it, so this
work targets **0.3.7**. Patch-level: additive optional field, no behaviour
change when omitted.

1. `src/packager/splash.ts`
   - `SplashOptions.logoScale?: number` (alongside the existing
     `customLogo?: {dataUrl}` at `:56`).
   - Clamp helper: finite → `min(100, max(5, n))`, else 26.
   - Custom-logo branch (`:92-96`) emits `max-width:{n}vmin;max-height:{n}vmin`
     in place of the two `96px` literals. Everything else there is unchanged.
2. `src/packager/types.ts` — `PackageConfig.splashLogoScale?: number`, doc
   comment naming the unit, the default, and the range.
3. `src/packager/runtime-loader.ts` — `splashLogoScale?: number` on the
   `generateFullHtml` params (next to `splashLogoDataUrl` at `:934`), passed
   into `buildSplash` at `:1050`.
4. `src/packager/packager.ts` — thread `options.config.splashLogoScale` into
   `generateFullHtml` at **both** call sites — `:461` (base64) and `:553` (the
   base122 sibling), each already passing `splashLogoDataUrl`. Missing the
   second would make the two encodings render differently; that is the one
   non-obvious edit in the kit.
5. `src/index.ts` — re-export `buildSplash`, `SplashOptions`, `SplashParts` and
   `splashByteCost`; the barrel currently exports only
   `resolveSplashLogoDataUrl` from that module (`:8`). Per add-export-don't-fork
   all four already exist in kit source and are merely absent from the barrel.
6. `tests/public-api.test.ts` — add the four names to the guarded surface.
7. Kit unit tests:
   - omitted `logoScale` → CSS contains `26vmin`, and no `96px`;
   - `logoScale: 55` → `55vmin`;
   - `0`, `-3`, `1e9`, `NaN`, `undefined` → clamped/defaulted, and the emitted
     CSS never contains the substring `NaN`;
   - Playbox branch (no `customLogo`) still emits `width:84px;height:84px`
     regardless of `logoScale` — guards the non-goal;
   - `packageForNetworks` with `assetEncodings: ['base64','base122']` and a
     scale → both HTML outputs carry the same `vmin` value.
8. Publish 0.3.7. Extension re-pins `~0.3.7` (the current `~0.3.5` pin would
   already resolve it, but the pin is bumped so the release bundle is explicit).

## Extension change → v0.5.7

### `src/core/settings.ts`

- `ProjectSettings.splashLogoScale: number`, `DEFAULT_SETTINGS` → `26`.
- `toPackageConfig`: `splashLogoScale: s.splashMode === 'custom' ? s.splashLogoScale : undefined`.
- Migration: settings saved before this version have no `splashLogoScale`. The
  existing `{...DEFAULT_SETTINGS, ...saved}` spread already supplies 26 for an
  absent key. A *present but junk* value (hand-edited file) is the kit's clamp
  problem, not a second guard here.

### `src/main.ts`

- `getSplashInfo` — replace the dead `require` with the kit's `splashByteCost`;
  same return shape as before.
- `getSplashLogoInfo(path, scale?)` — replace both dead `require`s with kit
  imports (`resolveSplashLogoDataUrl`, `splashByteCost`). Keep the existing
  `{ok, dataUrl, bytes}` shape so the current panel path keeps working.
- **New IPC `getSplashPreview({logoPath, scale})`** → `{ok, srcdoc, bytes}`.
  Resolves the data URL, calls `buildSplash({customLogo:{dataUrl}, logoScale})`,
  assembles the `srcdoc` string. Returns `{ok:false, error:'unreadable'}` on a
  bad path, mirroring `getSplashLogoInfo`.
  All three stay JSON-serializable — `srcdoc` is a plain string.
- Register `get-splash-preview` → `getSplashPreview` in `package.json`
  `contributions.messages`, next to the existing three splash messages.

### `static/template/index.html`

Inside the existing `#pkg-custom-logo` block, after `#pkg-logo-hint`:

- a size row — `<input type="range" id="pkg-logo-scale" min="5" max="100" step="1">`
  plus a numeric `<input type="number" id="pkg-logo-scale-num">` and a `%`
  suffix, the two mirroring each other;
- a preview row — `<div class="pkg-splash-frame"><iframe id="pkg-splash-preview" sandbox></iframe></div>`
  and a portrait/landscape toggle.

The block already hides wholesale outside `custom` mode
(`default.ts:1679`), so the new controls inherit that with no extra wiring.

### `src/panels/default.ts`

- `$` map: `pkgLogoScale`, `pkgLogoScaleNum`, `pkgSplashPreview`,
  `pkgSplashFrame`, `pkgPreviewOrient`.
- Extend `refreshCustomLogo(path)` to also drive the preview, and add
  `refreshSplashPreview(path, scale)` which requests `get-splash-preview` and
  assigns `iframe.srcdoc`.
- Slider/number `input` → update the twin control and re-render the preview
  immediately (local, cheap); `save-settings` **debounced ~250 ms** so dragging
  the slider does not write the Cocos profile on every pixel.
- `applySplashMode` seeds the controls from `settings.splashLogoScale`.
- Empty path → no preview, unchanged from today's behaviour.
- Orientation toggle → swap the frame's dimensions, no settings write.

### `static/style/`

`.pkg-splash-frame` — fixed-size rounded black frame with a subtle border, the
iframe filling it, `border:0`. Portrait 160 × 346, landscape 346 × 160 (both
≈ 9 : 19.5). Absolute sizes are correct here: it is a scale *model*, and the
`vmin` proportion is what carries over, not the pixel count.

### `src/core/i18n/locales.ts`

New keys in all three locales (en / ru / zh), flat, no nesting — Cocos
namespaces by extension name:

| key | en |
|---|---|
| `settings.logoScale` | Logo size |
| `settings.logoScaleHint` | % of the screen's shorter side |
| `settings.splashPreview` | Preview |
| `settings.previewPortrait` | Portrait |
| `settings.previewLandscape` | Landscape |

## Testing

Unit tests for splash CSS generation belong to the **kit** (listed above). The
extension keeps editor-glue and integration tests:

- `settings.ts` — default is 26; absent key on saved settings migrates to 26;
  `toPackageConfig` passes the scale in `custom` mode and omits it in
  `playbox` / `none`.
- `getSplashPreview` — a real PNG fixture yields `ok:true`, a `srcdoc`
  containing both `<style>` and `id="s"`, and the requested `vmin` value; a
  nonexistent path yields `ok:false`; the returned object survives
  `JSON.parse(JSON.stringify(...))`.
- Regression for the dead requires: `getSplashInfo` and `getSplashLogoInfo`
  resolve instead of throwing. This is the test that would have caught the
  current breakage.
- Integration (`tests/integration/`) — package `tests/fixtures/roadside-build/`
  with a custom logo and `splashLogoScale: 60`, assert the emitted HTML
  contains `60vmin` and no `96px` in the splash rule.

## Delivery

Both repos move together, kit first — the extension cannot build against an
unpublished field:

1. kit: implement, `npm run typecheck && npm test`, bump 0.3.7, tag, publish.
2. extension: re-pin `~0.3.7`, `npm install`, implement, `npx vitest run`.
3. Manual check in the editor: pick a wide wordmark, drag the slider, confirm
   the preview tracks it and a real packaged HTML matches the preview.
4. Bump extension to 0.5.7, tag `v0.5.7`, `gh release create` with notes.

While 0.3.7 is unpublished the extension can be developed against the local
clone (`npm link` or a `file:` override) and reverted to the range pin before
the extension release — a `file:` pin must never reach a tagged commit, since
the release bundle resolves dependencies from the registry.

## Known gaps

- **Moloco V2 launcher ignores custom logos entirely** (pre-existing,
  `launcher-builder.ts:112`). The launcher renders the Playbox splash regardless
  of `splashMode`. The 3 KB `LAUNCHER_MAX_BYTES` ceiling is the reason a base64
  logo cannot simply be dropped in. Separate spec.
- The preview shows the splash **statically**: no pulse animation timing
  judgement, no hide transition, no first-frame handoff.
- The preview frame is one aspect ratio (≈ 9 : 19.5). A logo tuned at the
  extremes (a tall 20 : 9 foldable, a 4 : 3 tablet) is not previewed, though
  `vmin` means it cannot overflow there.

## Blocked on

Two credentials, both user actions, neither blocking the code:

- `npm whoami` → `ENEEDAUTH`. Needed to publish kit 0.3.7 (step 1 of Delivery).
- `gh auth` not configured. Needed for `gh release create` on the extension tag
  (step 4) — the release-notes rule in `CLAUDE.md`.

Implementation and tests in both repos can proceed against the local kit clone
before either credential exists.
