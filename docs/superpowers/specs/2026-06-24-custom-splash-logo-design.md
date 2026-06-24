# Custom splash logo — design

Status: Approved (user, 2026-06-24). Target: next minor bump.

## Problem

Some clients want their own brand on the loading splash instead of the PLBX
pinwheel + wordmark. Today the splash logo is a hard-coded SVG
(`PLBX_LOGO_SVG` + `PLBX_WORDMARK_SVG` in `splash.ts`), with no override.

## Goal

Let the user point the Package tab at a custom image (PNG/JPG/WebP). When set,
the splash shows that image **in place of the PLBX logo + wordmark** on a plain
black backdrop — no gradients, no progress bar (the client brand stands alone) —
keeping the whole-image pulse, fade-out and first-frame hide. Panel shows a live
preview + the byte cost the image adds to each HTML build, with the base64
(+~33%) inflation already accounted for.

## Non-goals

- **Moloco V2 launcher is excluded** — strict 3 KB `LAUNCHER_MAX_BYTES`; a PNG
  won't fit. It keeps the compact CSS-text wordmark unchanged.
- No per-petal pulse for the custom image (that animation needs our SVG paths);
  custom logo uses a whole-image `scale(.9)` pulse.
- No background/colour customization (custom mode is fixed plain black) and no
  resizing controls. Logo swap only.
- ZIP-branch networks that copy the raw build dir are unaffected (no splash
  there today).

## Design

### `splash.ts` (single source of truth)

- `SplashOptions += customLogo?: { dataUrl: string }`.
- When `customLogo` present:
  - logo markup → `<img id="lg" src="${dataUrl}" alt="">` (not `PLBX_LOGO_SVG`);
  - `#lg` CSS → `max-width:96px;max-height:96px;width:auto;height:auto;object-fit:contain`
    + whole-image `pq` pulse keyframes;
  - wordmark omitted entirely (no SVG, no "Playbox" text);
  - backdrop forced to plain black `#000` (no gradients), progress bar dropped.
- `splashByteCost(opts)` already calls `buildSplash` → passing `customLogo`
  yields the exact injected byte count, **including the full base64 data URL**.
  That is how the +33% is reflected: we measure the base64 form, never raw file
  size.

### settings + types

- `ProjectSettings.splashMode: 'none' | 'playbox' | 'custom'` (source of truth,
  default `'playbox'`). `customSplashLogo: string` holds the picked file path and
  persists across mode switches.
- `toPackageConfig()` derives the existing `PackageConfig` fields:
  `showSplash = splashMode !== 'none'`; `customSplashLogo` forwarded only in
  `'custom'` mode (else `''`). Packager / runtime-loader / splash.ts unchanged.
- `getProjectSettings()` migrates legacy boolean `showSplash` → `splashMode`
  (false → none, custom path present → custom, else playbox).

### IPC (`main.ts` + `package.json` messages)

- `pickSplashLogo()` → opens `Editor.Dialog.select` (image filter), returns
  `{ canceled, path }`.
- `getSplashLogoInfo(path)` → reads file, infers mime from extension, builds a
  `data:` URL, returns `{ ok, bytes, dataUrl, error }` where `bytes` =
  `splashByteCost({ customLogo: { dataUrl } })`. `ok:false` + `error` on missing
  file / unsupported type → panel shows a warning.

### Panel (Package tab)

A **Loading splash** dropdown — None / Playbox splash / Custom logo. Playbox
shows the `≈ X.X KB` cost line. Custom reveals a logo block — `<img>` preview,
**Browse**, **Clear**, and a cost line `≈ X.X KB in build (incl. base64 +33%)`;
file missing → red warning.

### packager / runtime-loader

- `generateFullHtml` gets `splashLogoDataUrl?: string`; when `showSplash` and a
  data URL is present → `buildSplash({ customLogo: { dataUrl } })`, else
  `buildSplash({})`.
- `packageForNetworks` resolves `config.customSplashLogo` → reads the file once
  → data URL, passes it to both `generateFullHtml` call sites. Unreadable file
  → fall back to default splash (no hard fail).
- `launcher-builder.ts` (Moloco) untouched.

## Tests

`tests/core/packager/splash.test.ts`:
- `buildSplash({customLogo})` → body has `<img id="lg"` + the data URL, no
  `<svg id="lg"`, no `class="wm"`; CSS has `object-fit:contain` + `@keyframes pq`.
- custom logo keeps the progress bar by default.
- `splashByteCost({customLogo})` embeds the base64 image (≈ raw×4/3), strictly
  larger than the raw byte count and the data URL length — locks "+33% counted".
