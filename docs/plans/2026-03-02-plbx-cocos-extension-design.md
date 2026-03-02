# PLBX Cocos Extension — Design Document

**Date:** 2026-03-02
**Cocos Creator:** 3.8.x
**Approach:** TDD (test-driven development)

## Purpose

Cocos Creator extension for playable ad development workflow: build analysis, asset compression with live preview, multi-network packaging, and Playbox Platform deployment.

## Additional Requirements (2026-03-02, mid-implementation)

### Dual-format networks
Some networks (nefta, facebook, moloco) accept both `.zip` and `.html`. For these networks, build BOTH variants automatically.

### Persistent project settings
Save per-project settings using Cocos `Editor.Profile.setProject()`:
- Selected ad networks for packaging
- Custom project name (defaults to root folder name)
- Custom deployment name
- Default deploy network (default: `ironsource`)
- Store URLs, orientation

### Global PLBX token
Save PLBX API token globally (not per-project) using `Editor.Profile.setConfig()` with `'local'` scope — persists across all projects for the user.

### Deploy flow
- Allow selecting which network build to deploy (dropdown of available builds)
- Default deploy target: `ironsource` (ironsource2025 format)
- Project name for deploy: defaults to Cocos project root folder name, customizable
- Deployment name: customizable per deploy

## Architecture

### Extension Structure

```
plbx-cocos-extension/
├── package.json              # Cocos extension manifest (package_version: 2)
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── main.ts               # Extension entry: load/unload, message handlers
│   ├── builder.ts            # Builder config registration
│   ├── hooks.ts              # onBeforeBuild / onAfterBuild hooks
│   ├── panels/
│   │   └── default.ts        # Main dockable panel (tabbed UI)
│   ├── core/
│   │   ├── build-report/
│   │   │   ├── scanner.ts        # Scan project assets via asset-db
│   │   │   ├── size-estimator.ts # Estimate build sizes per asset
│   │   │   └── types.ts
│   │   ├── compression/
│   │   │   ├── image-compressor.ts   # sharp-based (WebP/AVIF/PNG/JPEG)
│   │   │   ├── audio-compressor.ts   # ffmpeg-based (OGG/MP3)
│   │   │   ├── presets.ts            # Compression presets
│   │   │   └── types.ts
│   │   ├── packager/
│   │   │   ├── html-builder.ts       # cheerio HTML manipulation
│   │   │   ├── asset-inliner.ts      # Base64 inlining / ZIP embedding
│   │   │   ├── network-adapters/     # Per-network adapter modules
│   │   │   │   ├── base.ts
│   │   │   │   ├── mraid.ts
│   │   │   │   ├── google.ts
│   │   │   │   ├── facebook.ts
│   │   │   │   ├── mintegral.ts
│   │   │   │   ├── tiktok.ts
│   │   │   │   └── ...
│   │   │   ├── zip-builder.ts        # JSZip packaging
│   │   │   └── types.ts
│   │   └── deployer/
│   │       ├── api-client.ts         # Playbox Platform REST client
│   │       ├── uploader.ts           # S3 pre-signed URL uploader
│   │       └── types.ts
│   └── shared/
│       ├── networks.ts       # Ad network registry (27+ networks)
│       └── types.ts
├── static/
│   ├── template/
│   │   └── index.html        # Panel HTML (tabbed layout)
│   └── style/
│       └── index.css
├── i18n/
│   ├── en.js
│   └── zh.js
├── tests/
│   ├── core/
│   │   ├── build-report/
│   │   │   ├── scanner.test.ts
│   │   │   └── size-estimator.test.ts
│   │   ├── compression/
│   │   │   ├── image-compressor.test.ts
│   │   │   └── audio-compressor.test.ts
│   │   ├── packager/
│   │   │   ├── html-builder.test.ts
│   │   │   ├── asset-inliner.test.ts
│   │   │   ├── network-adapters.test.ts
│   │   │   └── zip-builder.test.ts
│   │   └── deployer/
│   │       ├── api-client.test.ts
│   │       └── uploader.test.ts
│   └── fixtures/              # Test assets (small PNGs, HTMLs, etc.)
└── docs/
```

## UI Design — Single Dockable Panel with 4 Tabs

### Tab 1: Build Report
- Tree view of project assets grouped by type (Textures, Audio, Models, Scripts, Other)
- Per-asset info: name, type, source size, estimated build size, preview thumbnail
- Sort by: size (desc), name, type
- Filter by: type, size threshold
- Total size indicator with per-network limit warnings
- Auto-generation after Cocos build via `onAfterBuild` hook
- Manual "Analyze" button for on-demand scanning

### Tab 2: Compress
- Asset list from Build Report (filterable to images/audio only)
- Per-asset: original preview | compressed preview (side-by-side)
- Controls: format selector (PNG/WebP/AVIF/JPEG for images; MP3/OGG for audio), quality slider (0-100), resize options
- Presets: Web Optimized, Max Quality, Fast, High Compression
- "Apply" per-asset or batch "Apply All"
- Live size delta display (before/after)

### Tab 3: Package
- Checkbox grid of ad networks (grouped: MRAID, ZIP, Single HTML)
- Per-network config: store URLs (iOS/Android), orientation, custom inject scripts
- "Build" button -> processes Cocos web-mobile output into per-network packages
- Progress indicator per network
- Output: file list with sizes, pass/fail per network size limit
- Download/open folder buttons

### Tab 4: Deploy
- Playbox Platform auth (API key input, login status)
- Project selector (from platform API)
- Deployment config: name, entry point
- "Deploy" button -> upload to Playbox Platform
- Deployment URL output with copy button
- History of recent deployments

## Technical Decisions

### Compression Stack
- **Images:** `sharp` (WebP, AVIF, PNG, JPEG with mozjpeg)
- **PNG optimization:** `pngquant-bin` (lossy), `optipng-bin` (lossless)
- **Audio:** `ffmpeg` via child_process (MP3, OGG bitrate control)
- Reuse patterns from `@playbox-platform/shared/toolkit`

### Packaging Pipeline
1. Read Cocos web-mobile build output (`result.dest` from `onAfterBuild`)
2. Parse `index.html` with `cheerio`
3. For each selected network:
   a. Clone base HTML
   b. Apply network adapter (inject SDK scripts, meta tags, CTA code)
   c. If single-HTML network: inline all assets as base64/data URIs
   d. If ZIP network: bundle assets via JSZip with correct structure
   e. Validate output size against network limit
   f. Write output to `build/playables/{network}/`

### Network Adapter Pattern
```typescript
interface NetworkAdapter {
  readonly name: string;
  readonly format: 'html' | 'zip';
  readonly maxSize: number;
  readonly mraid: boolean;
  transform(html: cheerio.CheerioAPI, config: PackageConfig): void;
  getZipStructure?(): ZipStructure;
}
```

### Playbox Platform Integration
- Port API client from `plbx-cli/src/lib/api.ts`
- Bearer token authentication
- Pre-signed S3 URL upload flow
- Project CRUD via REST API

### Build Report Data Flow
```
asset-db API -> scanner.ts -> AssetReport[] -> size-estimator.ts -> BuildReport
                                                                        |
onAfterBuild hook -> reads result.dest -> actual build sizes ---------> merge
```

## TDD Approach

Tests written FIRST for each module:
1. **Packager network adapters** — highest priority, 22+ networks with edge cases
2. **Size estimator** — must be accurate for useful reports
3. **HTML builder** — cheerio manipulation correctness
4. **Compression** — format conversion, quality settings
5. **API client** — request/response contracts

## Dependencies

```json
{
  "sharp": "^0.33.0",
  "cheerio": "^1.0.0",
  "jszip": "^3.10.0",
  "clean-css": "^5.3.0",
  "pngquant-bin": "^9.0.0",
  "optipng-bin": "^11.0.0",
  "vitest": "^2.0.0",
  "@cocos/creator-types": "3.8.7",
  "typescript": "^5.5.0"
}
```
