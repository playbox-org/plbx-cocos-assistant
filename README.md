# Playbox — Cocos Creator Extension

[![Cocos Creator](https://img.shields.io/badge/Cocos_Creator-3.8%2B-blue)](https://www.cocos.com/en/creator)
[![Networks](https://img.shields.io/badge/ad_networks-30%2B-green)](#supported-networks)
[![License](https://img.shields.io/github/license/playbox-org/plbx-cocos-assistant)](https://github.com/playbox-org/plbx-cocos-assistant/blob/master/LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)]()

**Playable development tools for Cocos Creator — packaging, validation, and asset compression for 30+ ad networks.**

**[README на русском](README_RU.md)** | **[中文 README](README_ZH.md)**

![Playbox Extension](assets/screenshot.jpg)

## Features

### 1. Ad Network Packaging — [30+ networks](#supported-networks)

Package your web-mobile build into a self-contained HTML or ZIP playable for each ad network in one click.

- **Select networks** — choose only the networks you need per project
- **Auto-generate adapter script** — generates `plbx_html_playable.ts` with network-specific CTA and lifecycle logic
- **Auto-detect build** — automatically picks up the latest Cocos Creator web-mobile build
- **Auto-package** — optionally re-package every time Cocos Creator finishes a build
- **Custom output naming** — template-based paths with `{networkId}`, `{ext}`, and custom variables
- **Cloud deploy** — upload packaged creatives directly to [Playbox Cloud](https://plbx.ai) for sharing and review

### 2. Build Validation

Test your packaged playable in a built-in browser preview with per-network SDK mocks and a validation checklist — without leaving Cocos Creator.

- **Network callback tracking** — monitors lifecycle events (gameReady, gameStart, gameEnd, gameClose) per network with pass/fail status
- **Axon Events tracking** (AppLovin) — extracts `trackEvent()` calls from your source and verifies they fire during preview
- **Device emulation** — iPhone, Pixel, Galaxy, iPad frames with orientation toggle
- **SDK mocks** — MRAID, DAPI, and network-specific CTA methods auto-injected
- **How-to-fix hints** — when a check fails, shows specific instructions and links to official validators

<video src="https://github.com/user-attachments/assets/7334bd5c-f90e-4b1b-b4cc-7bbdaaad8204" autoplay loop muted playsinline></video>

### 3. Build Report

Scan your project assets and see exactly what made it into the build — and what didn't.

- **Size breakdown** — Engine (cc.js), Plugins, Assets, Scripts, Other
- **Per-asset status** — confirmed in build, predicted, or unused
- **Packed HTML sizes** — see final size per network after packaging

### 4. Asset Compression

Compress images (WebP / JPEG / PNG / AVIF) and audio (MP3 / OGG) with live preview and quality controls before packaging.

<video src="https://github.com/user-attachments/assets/ab57c518-0f64-4809-a315-eb81109aa58a" autoplay loop muted playsinline></video>

## Supported Networks

The packager picks the right output format and SDK adapter per network automatically.

- **HTML** — AppLovin, Unity Ads, ironSource, AdColony, Tapjoy, Appreciate, Chartboost, Liftoff, Smadex, Rubeex, Facebook / Meta, Moloco, Nefta, inMobi, NewsBreak
- **ZIP** — Google Ads, Pangle, TikTok, Vungle, MyTarget, Mintegral, Adikteev, Bigabid, Snapchat, Bigo Ads, GDT (Tencent), Kwai, Yandex
- **Launcher API** — Moloco V2.0 (`launcher.html` + `payload.js`)

## How to Use

### 1. Build in Cocos Creator

Build your project as **web-mobile** in Cocos Creator. The extension will detect the build automatically.

### 2. Add the adapter script

In the Package tab, click **Generate plbx_html.ts**. This creates `assets/Scripts/plbx_html/plbx_html_playable.ts` — a thin bridge exposing network-agnostic methods to your game code:

```typescript
import plbx from './plbx_html/plbx_html_playable';

plbx.game_ready();  // scene loaded, game ready
plbx.tap();         // every user tap
plbx.download();    // CTA — redirect to store
plbx.game_end();    // gameplay ended
if (plbx.is_muted()) { /* don't start audio */ }

// register a command external callers / Playbox Preview can trigger:
plbx.expose('show_endcard', () => this.showEndcard(), 'Show endcard');
```

Call these in your game — the packager injects the correct network-specific implementation at build time.

> **AppLovin — Axon analytics (optional).** AppLovin expects [Axon playable-analytics events](https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration) via `ALPlayableAnalytics.trackEvent(...)`. Click **Generate AppLovin events** in the Package tab to scaffold the helper next to `plbx_html`, then fire the events from your gameplay (`DISPLAYED` is mandatory). The built-in validator extracts your `trackEvent()` calls and checks they fire — in order and deduped — during Preview.

### 3. Package

Select networks and click **Package**. The packager:

1. Takes your web-mobile build
2. Injects `window.plbx_html` — network-specific CTA and lifecycle routing, generated per network
3. Produces self-contained HTML or ZIP output files

Your game code stays network-agnostic — the packager handles all routing.

> **super-html compatibility.** For convenience, the packager also exposes
> `window.super_html` as an alias of `plbx_html`. If you previously used super-html
> in your project, your existing `super_html.*` calls keep working in plbx builds
> unchanged — no rewriting needed. New projects can just use `plbx_html`.

### 4. Validate

Open the **Package** tab, select a network, and click **Preview**. The built-in validator loads your playable in an iframe and checks:

- File size within network limit
- Game loads without errors
- CTA triggers correctly
- Lifecycle events fire in the right order
- No external network requests

## Installation

### For users (recommended)

Download the prebuilt bundle — no git, no `npm`, no build step.

1. Grab `plbx-cocos-extension-vX.Y.Z.zip` from the [latest Release](https://github.com/playbox-org/plbx-cocos-assistant/releases/latest).
2. Extract it into your Cocos global extensions folder:
   - **macOS:** `~/.CocosCreator/extensions/plbx-cocos-extension/`
   - **Windows:** `%USERPROFILE%\.CocosCreator\extensions\plbx-cocos-extension\`

   (or into `<your-project>/extensions/` for a single project)
3. Restart Cocos Creator. Open the panel via **Panel → Playbox**.

From then on the panel's **one-click update** keeps it current: it downloads the
latest release and swaps it in place — you just restart the editor.

### For extension developers

```bash
git clone https://github.com/playbox-org/plbx-cocos-assistant.git plbx-cocos-extension
cd plbx-cocos-extension
npm install
npm run build
```

In Cocos Creator: **Extension Manager → Developer Import** → select this folder.
This is a soft link to your checkout, so self-update is disabled here — update
with `git pull` (then `npm install` / `npm run build` if dependencies changed).

### Requirements

- Cocos Creator **3.8.0+**
- Node.js **18+** *(developer install only; the user bundle is prebuilt)*
- FFmpeg *(optional — required for audio compression)*

## Troubleshooting

**Image compression asks to install `sharp`**

`sharp` is an optional, per-platform native library, so it ships *outside* the
bundle. The first time you compress an image the panel offers a one-click
**Install sharp** — accept it and compression is ready.

If the automatic install fails, run this inside the extension folder, then
reopen the Compress tab:

```bash
npm install sharp
```

## Development

```bash
npm run build        # compile TypeScript
npm run watch        # watch mode
npm run test         # run tests (vitest)
npm run test:watch   # watch mode
```

To load the extension from source in Cocos Creator: open **Extension Manager**, click **Developer Import**, and select the extension folder.

## License

[Apache License 2.0](LICENSE)
