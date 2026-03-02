# Reference Repositories Analysis

## 1. `playable-template` — Production HTML5 Playable Ads Template

**Path:** `/Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/playable-template`

**Purpose:** Fully production-ready HTML5 playable ad framework based on Pixi.js, supporting 27+ ad networks. Output is a single self-contained HTML file with all assets inlined as base64.

**Stack:** Pixi.js v8, Howler.js, Vite + `vite-plugin-singlefile`, TypeScript

### Key Patterns

1. **Single HTML output** — Vite configured with `assetsInlineLimit: 100000000` + `viteSingleFile` plugin
2. **Two-variant build (MRAID / non-MRAID)** — `VITE_USE_MRAID` env variable controls which CTA API is compiled in
3. **`scripts/build-networks.js`** — Master build orchestrator. Builds two base HTMLs, then packages for each of 27 ad networks:
   - Output format: `html` or `zip`
   - Per-network `maxSize` limits (2–10 MB)
   - Special ZIP structures (e.g., Mintegral needs `mintegral/mintegral.html`)
   - TikTok requires `config.json` alongside `index.html` in ZIP
4. **`PlayableAdapter`** — Universal cross-platform CTA abstraction:
   - MRAID 2.0/3.0
   - `FbPlayableAd.onCTAClick()` (Meta, Moloco)
   - `ExitApi.exit()` (Google Ads)
   - `openAppStore()` (TikTok/Pangle)
   - `window.super_html.download()` (Cocos Creator super_html)
   - `window.open()` fallback

### Key Files (reusable)
- `/scripts/build-networks.js` — NETWORKS config object (27 networks, formats, maxSizes, ctaMethods)
- `/src/utils/PlayableAdapter.ts` — ad platform abstraction
- `/vite.config.ts` — single-file inlining config

---

## 2. `super-html` — Deobfuscated Cocos Creator Extension

**Path:** `/Users/pavelsamoylenko/Documents/GitHub/Playbox/Playables/super-html`

**Purpose:** Deobfuscated reference copy of the commercial "super-html" Cocos Creator Store extension (v5.1.0). Packages Cocos Creator web builds into single HTML files for playable ad networks.

**Stack:** cheerio, clean-css, jszip, uglify-js, Cocos Creator 2.x extension format

### Key Workflow
1. Read Cocos Creator web build output directory
2. Parse HTML + extract all JS/CSS/assets
3. Minify CSS (clean-css), obfuscate JS (uglify-js)
4. Pack game assets into ZIP archive (jszip), encode as base64
5. Inject `window.__zip = "<base64>"` into final HTML
6. Insert ad network JS SDK hooks
7. Output single self-contained HTML (or ZIP)

### `window.super_html` API
```typescript
window.super_html = {
  download: () => void,      // CTA / open store
  game_end: () => void,      // signal game completion
  is_audio: () => boolean,   // check if audio allowed
  set_google_play_url: (url) => void,
  set_app_store_url: (url) => void,
}
```

### Key Files
- `/package.json` — Cocos extension manifest (2.x format)
- `/DEVELOPMENT_PLAN.md` — architectural plan
- `/deobfuscated/` — reverse-engineered source

---

## 3. `plbx-cli` — Playbox Platform CLI Tool

**Path:** `/Users/pavelsamoylenko/Documents/GitHub/Playbox/playbox-platform/packages/plbx-cli`

**Purpose:** CLI tool for deploying playable ads to Playbox Platform. Authentication, project/deployment lifecycle, asset utility commands.

**Stack:** Commander.js, `@clack/prompts`, sharp, puppeteer (optional), `@playbox-platform/shared`

### Commands
| Command | Description |
|---|---|
| `login` / `logout` / `whoami` | Auth management (Bearer token or browser OAuth) |
| `init` | Creates `.plbx.json` config |
| `deploy` | Uploads to Playbox Platform (S3 pre-signed URLs) |
| `extract [source]` | Extract assets from HTML or URL |
| `compress <path>` | Compress PNG files (pngquant/optipng presets) |
| `convert [path]` | Convert images between formats |

### Deploy Flow
1. Authenticate via API key
2. Read `.plbx.json` config
3. Glob collect files
4. `api.createDeployment()` -> pre-signed S3 URLs
5. Upload files via PUT
6. `api.completeDeployment()` -> share URL

### API Client
REST calls to `https://app.plbx.ai/api/cli/*`
Endpoints: `/deployments`, `/deployments/{id}/complete`, `/projects`, `/whoami`

---

## 4. `toolkit` — Shared Asset Processing Library

**Path:** `/Users/pavelsamoylenko/Documents/GitHub/Playbox/playbox-platform/packages/shared/toolkit`

**Purpose:** Reusable TypeScript library for playable ad asset processing.

### Extraction Module
| Class | Role |
|---|---|
| `HtmlParser` | Parses HTML, finds `window.__zip`, `window.__res`, data URIs |
| `Base64Decoder` | Decodes base64 strings to Buffer |
| `ZipExtractor` | Extracts files from ZIP buffer |
| `DataUriExtractor` | Extracts `data:image/...;base64,...` assets |
| `UrlExtractor` | Puppeteer-based network interception |
| `SpineDetector` | Detects Spine animation files |

### Compression Module
| Class | Engine |
|---|---|
| `PngQuantProcessor` | pngquant-bin (lossy) |
| `OptiPngProcessor` | optipng-bin (lossless) |

Presets: `WEB_OPTIMIZED`, `MAX_QUALITY`, `FAST`, `HIGH_COMPRESSION`

### Conversion Module
Based on `sharp`. Supports: PNG, JPEG (mozjpeg), WebP, AVIF, GIF, TIFF.

Methods: `toJpeg()`, `toPng()`, `toWebP()`, `toAvif()`, `resize()`, `optimize()`

Presets: `WEB`, `THUMBNAIL`, `MOBILE`, `SOCIAL`

---

## Cross-Project Patterns Summary

| Concern | Pattern | Source |
|---|---|---|
| Single-file HTML output | `vite-plugin-singlefile` + `assetsInlineLimit` | playable-template |
| Asset embedding | `window.__zip = "<base64>"` ZIP injection | super-html, toolkit |
| Ad network CTA abstraction | `PlayableAdapter` class | playable-template |
| Network configs | `NETWORKS` object: format, maxSize, zipStructure, ctaMethod | playable-template |
| PNG compression | `pngquant` (lossy) + `optipng` (lossless) | toolkit |
| Image conversion | `sharp` — PNG/JPEG/WebP/AVIF | toolkit |
| HTML manipulation | `cheerio` — parsing, injection | super-html |
| JS minification | `uglify-js` / `esbuild` | both |
| Playbox API deployment | Pre-signed S3 URLs, Bearer auth | plbx-cli |
| Asset extraction | `HtmlParser` + `ZipExtractor` | toolkit |
