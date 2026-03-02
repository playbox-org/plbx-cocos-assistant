# PLBX Cocos Extension Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Cocos Creator 3.8 extension for playable ad workflow — build report, asset compression, multi-network packaging, and Playbox Platform deployment.

**Architecture:** Monolithic dockable panel with 4 tabs (Report/Compress/Package/Deploy). Core logic in `src/core/` modules independent of Cocos Editor API (testable). Panel communicates with core via Cocos message IPC. Network adapters pattern for 22+ ad networks.

**Tech Stack:** TypeScript, Cocos Creator 3.8 Extension API, sharp, cheerio, jszip, pngquant-bin, optipng-bin, vitest

**References:**
- `docs/research/cocos-creator-extension-api.md` — Cocos extension API
- `docs/research/ad-networks-reference.md` — all ad network specs
- `docs/research/reference-repos-analysis.md` — reusable patterns from existing repos
- `docs/plans/2026-03-02-plbx-cocos-extension-design.md` — design document

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `src/main.ts`
- Create: `src/panels/default.ts`
- Create: `static/template/index.html`
- Create: `static/style/index.css`
- Create: `i18n/en.js`
- Create: `i18n/zh.js`

**Step 1: Initialize npm project and install dependencies**

```bash
cd /Users/pavelsamoylenko/Documents/GitHub/Playbox/plbx-cocos-extension
npm init -y
```

Then overwrite `package.json` with Cocos extension manifest:

```json
{
  "package_version": 2,
  "version": "0.1.0",
  "name": "plbx-cocos-extension",
  "title": "i18n:plbx-cocos-extension.title",
  "description": "i18n:plbx-cocos-extension.description",
  "author": "Playbox",
  "editor": ">=3.8.0",
  "main": "./dist/main.js",
  "panels": {
    "default": {
      "title": "i18n:plbx-cocos-extension.panels.default.title",
      "type": "dockable",
      "main": "./dist/panels/default",
      "flags": { "resizable": true, "save": true },
      "size": { "min-width": 900, "min-height": 600, "width": 1200, "height": 800 }
    }
  },
  "contributions": {
    "menu": [
      {
        "path": "i18n:menu.panel/Playbox",
        "label": "i18n:plbx-cocos-extension.open-panel",
        "message": "open-panel"
      }
    ],
    "messages": {
      "open-panel": { "methods": ["openPanel"] },
      "on-build-finished": { "methods": ["onBuildFinished"] },
      "scene:ready": { "methods": ["onSceneReady"] }
    },
    "builder": "./dist/builder"
  },
  "scripts": {
    "build": "tsc",
    "watch": "tsc -w",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "@cocos/creator-types": "3.8.7",
    "typescript": "^5.5.0",
    "vitest": "^2.0.0"
  },
  "dependencies": {
    "sharp": "^0.33.0",
    "cheerio": "^1.0.0",
    "jszip": "^3.10.0",
    "clean-css": "^5.3.0",
    "pngquant-bin": "^9.0.0",
    "optipng-bin": "^11.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020", "DOM"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "types": ["@cocos/creator-types/editor"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/core/**'],
    },
  },
});
```

**Step 4: Create .gitignore**

```
node_modules/
dist/
*.js.map
.DS_Store
```

**Step 5: Create minimal src/main.ts**

```typescript
export const load = function () {
  console.log('plbx-cocos-extension loaded');
};

export const unload = function () {
  console.log('plbx-cocos-extension unloaded');
};

export const methods: Record<string, (...args: any[]) => any> = {
  openPanel() {
    Editor.Panel.open('plbx-cocos-extension');
  },

  onBuildFinished() {
    Editor.Panel.open('plbx-cocos-extension');
    Editor.Message.send('plbx-cocos-extension', 'refresh-report');
  },

  onSceneReady() {
    // placeholder
  },
};
```

**Step 6: Create minimal src/panels/default.ts**

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

module.exports = Editor.Panel.define({
  template: readFileSync(join(__dirname, '../../static/template/index.html'), 'utf-8'),
  style: readFileSync(join(__dirname, '../../static/style/index.css'), 'utf-8'),

  $: {
    tabs: '.tabs',
    tabContent: '.tab-content',
  },

  methods: {},

  ready() {
    console.log('PLBX panel ready');
  },

  close() {},
});
```

**Step 7: Create static/template/index.html with tab skeleton**

Basic HTML with 4 tabs: Build Report, Compress, Package, Deploy. Use Cocos `ui-*` web components where available, plain HTML otherwise.

**Step 8: Create i18n files**

`i18n/en.js`:
```javascript
module.exports = {
  title: 'Playbox',
  description: 'Playbox Cocos Extension — build reports, compression, packaging, deploy',
  'open-panel': 'Open Playbox',
  panels: { default: { title: 'Playbox' } },
};
```

`i18n/zh.js`:
```javascript
module.exports = {
  title: 'Playbox',
  description: 'Playbox Cocos Extension — отчёты билда, компрессия, упаковка, деплой',
  'open-panel': 'Открыть Playbox',
  panels: { default: { title: 'Playbox' } },
};
```

**Step 9: Install dependencies and verify build**

```bash
npm install
npx tsc --noEmit
```

Expected: no errors.

**Step 10: Commit**

```bash
git init
git add -A
git commit -m "feat: scaffold plbx-cocos-extension project"
```

---

## Task 2: Shared Types & Network Registry

**Files:**
- Create: `src/shared/types.ts`
- Create: `src/shared/networks.ts`
- Test: `tests/core/shared/networks.test.ts`

**Step 1: Write the failing test**

```typescript
// tests/core/shared/networks.test.ts
import { describe, it, expect } from 'vitest';
import { NETWORKS, getNetwork, getNetworksByFormat } from '../../../src/shared/networks';

describe('NETWORKS registry', () => {
  it('should contain at least 20 networks', () => {
    expect(Object.keys(NETWORKS).length).toBeGreaterThanOrEqual(20);
  });

  it('should return network by id', () => {
    const applovin = getNetwork('applovin');
    expect(applovin).toBeDefined();
    expect(applovin!.name).toBe('AppLovin');
    expect(applovin!.format).toBe('html');
    expect(applovin!.mraid).toBe(true);
  });

  it('should filter networks by format', () => {
    const zipNetworks = getNetworksByFormat('zip');
    expect(zipNetworks.length).toBeGreaterThan(5);
    zipNetworks.forEach(n => expect(n.format).toBe('zip'));
  });

  it('should have valid maxSize for all networks', () => {
    Object.values(NETWORKS).forEach(network => {
      expect(network.maxSize).toBeGreaterThan(0);
      expect(network.maxSize).toBeLessThanOrEqual(10 * 1024 * 1024);
    });
  });

  it('google network should require zip with exitapi', () => {
    const google = getNetwork('google');
    expect(google!.format).toBe('zip');
    expect(google!.mraid).toBe(false);
    expect(google!.sdkUrl).toContain('exitapi');
  });

  it('mintegral should have custom zip structure', () => {
    const mintegral = getNetwork('mintegral');
    expect(mintegral!.format).toBe('zip');
    expect(mintegral!.jsBundle).toBe('creative.js');
  });

  it('tiktok should require config.json in zip', () => {
    const tiktok = getNetwork('tiktok');
    expect(tiktok!.format).toBe('zip');
    expect(tiktok!.zipConfig).toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
npx vitest run tests/core/shared/networks.test.ts
```

Expected: FAIL — modules don't exist.

**Step 3: Create src/shared/types.ts**

```typescript
export type OutputFormat = 'html' | 'zip';
export type Orientation = 'portrait' | 'landscape' | 'auto';

export interface NetworkConfig {
  id: string;
  name: string;
  format: OutputFormat;
  maxSize: number;           // bytes
  mraid: boolean;
  sdkUrl?: string;           // external SDK script URL to inject
  sdkInline?: string;        // inline JS to inject
  jsBundle?: string;         // custom JS filename in ZIP (e.g. 'creative.js')
  zipConfig?: Record<string, any>; // config.json content for ZIP
  zipStructure?: string;     // custom path inside ZIP (e.g. 'mintegral/')
  metaTags?: Record<string, string>; // meta tags to inject
  inlineAssets: boolean;     // whether to inline all assets into HTML
}

export interface PackageConfig {
  storeUrlIos: string;
  storeUrlAndroid: string;
  orientation: Orientation;
  customInjectHead?: string;
  customInjectBody?: string;
}

export interface AssetReportItem {
  uuid: string;
  name: string;
  path: string;
  type: string;
  sourceSize: number;
  buildSize: number;
  extension: string;
  thumbnailPath?: string;
}

export interface BuildReport {
  timestamp: number;
  projectName: string;
  totalSourceSize: number;
  totalBuildSize: number;
  assets: AssetReportItem[];
}

export interface CompressionResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  format: string;
  quality: number;
  savings: number;         // percentage
}

export interface PackageResult {
  networkId: string;
  networkName: string;
  outputPath: string;
  outputSize: number;
  maxSize: number;
  withinLimit: boolean;
  format: OutputFormat;
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  projectName: string;
  timestamp: number;
}
```

**Step 4: Create src/shared/networks.ts**

Populate with all 22+ networks from `docs/research/ad-networks-reference.md`. Each network follows the `NetworkConfig` interface with correct format, maxSize, mraid flag, SDK URLs, special ZIP requirements.

Reference: copy network data from the ad-networks-reference doc into typed objects.

**Step 5: Run tests**

```bash
npx vitest run tests/core/shared/networks.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add src/shared/ tests/core/shared/
git commit -m "feat: add shared types and ad network registry (22+ networks)"
```

---

## Task 3: Build Report — Size Estimator

**Files:**
- Create: `src/core/build-report/size-estimator.ts`
- Test: `tests/core/build-report/size-estimator.test.ts`
- Create: `tests/fixtures/` — small test assets

**Step 1: Write failing tests**

```typescript
// tests/core/build-report/size-estimator.test.ts
import { describe, it, expect } from 'vitest';
import { estimateBuildSize, estimateCompressedSize } from '../../../src/core/build-report/size-estimator';

describe('estimateBuildSize', () => {
  it('should estimate PNG texture size (usually larger in build due to atlas)', () => {
    const result = estimateBuildSize({
      type: 'cc.Texture2D',
      sourceSize: 50000,
      extension: '.png',
    });
    expect(result).toBeGreaterThan(0);
    expect(typeof result).toBe('number');
  });

  it('should estimate audio size', () => {
    const result = estimateBuildSize({
      type: 'cc.AudioClip',
      sourceSize: 200000,
      extension: '.mp3',
    });
    expect(result).toBeGreaterThan(0);
  });

  it('should pass through script size roughly', () => {
    const result = estimateBuildSize({
      type: 'cc.Script',
      sourceSize: 5000,
      extension: '.ts',
    });
    // Scripts get bundled/minified — estimate should be smaller
    expect(result).toBeLessThanOrEqual(5000);
  });
});

describe('estimateCompressedSize', () => {
  it('should estimate gzip size as ~30-70% of original', () => {
    const result = estimateCompressedSize(100000);
    expect(result).toBeLessThan(100000);
    expect(result).toBeGreaterThan(10000);
  });
});
```

**Step 2: Run test — verify FAIL**

```bash
npx vitest run tests/core/build-report/size-estimator.test.ts
```

**Step 3: Implement size-estimator.ts**

Heuristic-based size estimation per asset type. Uses known compression ratios for PNG, JPEG, audio formats. Returns estimated byte count.

**Step 4: Run tests — verify PASS**

**Step 5: Commit**

```bash
git add src/core/build-report/ tests/core/build-report/ tests/fixtures/
git commit -m "feat: add build size estimator with heuristics"
```

---

## Task 4: Build Report — Scanner (with Editor API mock)

**Files:**
- Create: `src/core/build-report/scanner.ts`
- Create: `src/core/build-report/types.ts`
- Test: `tests/core/build-report/scanner.test.ts`
- Create: `tests/mocks/editor.ts` — mock for Editor.Message.request

**Step 1: Write failing tests**

Test the scanner with mocked `Editor.Message.request('asset-db', 'query-assets', ...)` responses. Verify it produces correct `AssetReportItem[]` from mocked asset-db data.

**Step 2: Run — verify FAIL**

**Step 3: Implement scanner.ts**

```typescript
// src/core/build-report/scanner.ts
import { AssetReportItem, BuildReport } from '../../shared/types';
import { estimateBuildSize } from './size-estimator';

// This function works with injected queryFn to be testable without Editor API
export async function scanAssets(
  queryFn: (type?: string) => Promise<AssetInfo[]>,
  projectName: string,
): Promise<BuildReport> {
  const types = ['cc.Texture2D', 'cc.AudioClip', 'cc.Prefab', 'cc.AnimationClip'];
  const allAssets: AssetReportItem[] = [];

  for (const type of types) {
    const assets = await queryFn(type);
    for (const asset of assets) {
      // ... map to AssetReportItem using size-estimator
    }
  }

  return {
    timestamp: Date.now(),
    projectName,
    totalSourceSize: allAssets.reduce((sum, a) => sum + a.sourceSize, 0),
    totalBuildSize: allAssets.reduce((sum, a) => sum + a.buildSize, 0),
    assets: allAssets,
  };
}
```

Pattern: inject `queryFn` dependency so we can test without real Editor API.

**Step 4: Run tests — verify PASS**

**Step 5: Commit**

```bash
git add src/core/build-report/ tests/core/build-report/ tests/mocks/
git commit -m "feat: add build report scanner with dependency injection"
```

---

## Task 5: Image Compressor

**Files:**
- Create: `src/core/compression/image-compressor.ts`
- Create: `src/core/compression/presets.ts`
- Create: `src/core/compression/types.ts`
- Test: `tests/core/compression/image-compressor.test.ts`
- Create: `tests/fixtures/test-image.png` — small 100x100 red square PNG

**Step 1: Create test fixture**

Generate a minimal PNG programmatically in test setup using sharp.

**Step 2: Write failing tests**

```typescript
import { describe, it, expect, beforeAll } from 'vitest';
import { compressImage, getImageMetadata } from '../../../src/core/compression/image-compressor';
import sharp from 'sharp';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';

const FIXTURES = join(__dirname, '../../fixtures');
const TEST_PNG = join(FIXTURES, 'test-image.png');

beforeAll(async () => {
  if (!existsSync(FIXTURES)) mkdirSync(FIXTURES, { recursive: true });
  await sharp({ create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toFile(TEST_PNG);
});

describe('compressImage', () => {
  it('should compress PNG to WebP', async () => {
    const result = await compressImage(TEST_PNG, { format: 'webp', quality: 80 });
    expect(result.outputSize).toBeLessThan(result.inputSize);
    expect(result.format).toBe('webp');
  });

  it('should compress PNG to AVIF', async () => {
    const result = await compressImage(TEST_PNG, { format: 'avif', quality: 50 });
    expect(result.outputSize).toBeLessThan(result.inputSize);
    expect(result.format).toBe('avif');
  });

  it('should compress PNG to JPEG', async () => {
    const result = await compressImage(TEST_PNG, { format: 'jpeg', quality: 70 });
    expect(result.format).toBe('jpeg');
  });

  it('should optimize PNG losslessly', async () => {
    const result = await compressImage(TEST_PNG, { format: 'png', quality: 100 });
    expect(result.format).toBe('png');
  });

  it('should return savings percentage', async () => {
    const result = await compressImage(TEST_PNG, { format: 'webp', quality: 50 });
    expect(result.savings).toBeGreaterThanOrEqual(0);
    expect(result.savings).toBeLessThanOrEqual(100);
  });
});

describe('getImageMetadata', () => {
  it('should return width, height, format', async () => {
    const meta = await getImageMetadata(TEST_PNG);
    expect(meta.width).toBe(100);
    expect(meta.height).toBe(100);
    expect(meta.format).toBe('png');
  });
});
```

**Step 3: Run — verify FAIL**

**Step 4: Implement image-compressor.ts and presets.ts**

Use `sharp` for all conversions. Output to temp directory. Return `CompressionResult`.

Presets in `presets.ts`:
```typescript
export const PRESETS = {
  WEB_OPTIMIZED: { quality: 75 },
  MAX_QUALITY: { quality: 95 },
  FAST: { quality: 60 },
  HIGH_COMPRESSION: { quality: 40 },
};
```

**Step 5: Run tests — verify PASS**

**Step 6: Commit**

```bash
git add src/core/compression/ tests/core/compression/ tests/fixtures/
git commit -m "feat: add image compressor with sharp (WebP/AVIF/PNG/JPEG)"
```

---

## Task 6: Audio Compressor

**Files:**
- Create: `src/core/compression/audio-compressor.ts`
- Test: `tests/core/compression/audio-compressor.test.ts`

**Step 1: Write failing tests**

Test ffmpeg-based audio compression. Check that ffmpeg is available, skip tests if not. Test MP3 and OGG output with configurable bitrate.

**Step 2: Implement using child_process spawn for ffmpeg**

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/compression/audio-compressor.ts tests/core/compression/audio-compressor.test.ts
git commit -m "feat: add audio compressor with ffmpeg (MP3/OGG)"
```

---

## Task 7: Packager — HTML Builder

**Files:**
- Create: `src/core/packager/html-builder.ts`
- Test: `tests/core/packager/html-builder.test.ts`
- Create: `tests/fixtures/sample-build/index.html` — minimal Cocos-like build output

**Step 1: Create test fixture**

A minimal HTML file mimicking Cocos web-mobile build output with `<script>` tags, CSS, image references.

**Step 2: Write failing tests**

```typescript
describe('HtmlBuilder', () => {
  it('should parse Cocos build HTML', () => {
    const builder = new HtmlBuilder(sampleHtml);
    expect(builder.getScripts().length).toBeGreaterThan(0);
  });

  it('should inject script tag into head', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectHeadScript('mraid.js');
    const html = builder.toHtml();
    expect(html).toContain('<script src="mraid.js"></script>');
  });

  it('should inject meta tag', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectMeta('ad-size', '320x480');
    const html = builder.toHtml();
    expect(html).toContain('name="ad-size"');
  });

  it('should inject inline script into body', () => {
    const builder = new HtmlBuilder(sampleHtml);
    builder.injectBodyScript('window.gameReady = true;');
    const html = builder.toHtml();
    expect(html).toContain('window.gameReady = true;');
  });

  it('should minify CSS', () => {
    const builder = new HtmlBuilder(htmlWithCss);
    builder.minifyCss();
    const html = builder.toHtml();
    // minified CSS should be shorter
    expect(html.length).toBeLessThan(htmlWithCss.length);
  });
});
```

**Step 3: Implement using cheerio + clean-css**

**Step 4: Run tests — verify PASS**

**Step 5: Commit**

```bash
git add src/core/packager/html-builder.ts tests/core/packager/html-builder.test.ts tests/fixtures/sample-build/
git commit -m "feat: add HTML builder with cheerio (inject, minify, parse)"
```

---

## Task 8: Packager — Asset Inliner

**Files:**
- Create: `src/core/packager/asset-inliner.ts`
- Test: `tests/core/packager/asset-inliner.test.ts`

**Step 1: Write failing tests**

Test inlining local files as base64 data URIs, and the `window.__zip` pattern (pack directory into ZIP, embed as base64 string).

**Step 2: Implement with jszip + fs**

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/packager/asset-inliner.ts tests/core/packager/
git commit -m "feat: add asset inliner (base64 data URI + window.__zip)"
```

---

## Task 9: Packager — Network Adapters (Core)

**Files:**
- Create: `src/core/packager/network-adapters/base.ts`
- Create: `src/core/packager/network-adapters/mraid.ts`
- Create: `src/core/packager/network-adapters/google.ts`
- Create: `src/core/packager/network-adapters/facebook.ts`
- Create: `src/core/packager/network-adapters/mintegral.ts`
- Create: `src/core/packager/network-adapters/tiktok.ts`
- Create: `src/core/packager/network-adapters/index.ts`
- Test: `tests/core/packager/network-adapters.test.ts`

**Step 1: Write failing tests**

```typescript
describe('NetworkAdapter', () => {
  const sampleHtml = '<html><head></head><body><script src="main.js"></script></body></html>';

  it('mraid adapter should inject mraid.js', () => {
    const adapter = getAdapter('applovin');
    const builder = new HtmlBuilder(sampleHtml);
    adapter.transform(builder, defaultConfig);
    expect(builder.toHtml()).toContain('mraid.js');
  });

  it('google adapter should inject ExitAPI and meta tags', () => {
    const adapter = getAdapter('google');
    const builder = new HtmlBuilder(sampleHtml);
    adapter.transform(builder, { ...defaultConfig, orientation: 'portrait' });
    const html = builder.toHtml();
    expect(html).toContain('exitapi.js');
    expect(html).toContain('ad-size');
  });

  it('mintegral adapter should rename JS bundle to creative.js', () => {
    const adapter = getAdapter('mintegral');
    const builder = new HtmlBuilder(sampleHtml);
    adapter.transform(builder, defaultConfig);
    expect(adapter.getJsBundleName()).toBe('creative.js');
  });

  it('tiktok adapter should produce config.json', () => {
    const adapter = getAdapter('tiktok');
    const config = adapter.getZipConfig!({ orientation: 'portrait' });
    expect(config).toEqual({ playable_orientation: 1 });
  });

  it('facebook adapter should inject FbPlayableAd', () => {
    const adapter = getAdapter('facebook');
    const builder = new HtmlBuilder(sampleHtml);
    adapter.transform(builder, defaultConfig);
    expect(builder.toHtml()).toContain('FbPlayableAd');
  });

  it('all adapters should be retrievable', () => {
    const allIds = Object.keys(NETWORKS);
    allIds.forEach(id => {
      expect(() => getAdapter(id)).not.toThrow();
    });
  });
});
```

**Step 2: Run — verify FAIL**

**Step 3: Implement base adapter + specific adapters**

Base adapter handles common MRAID injection. Specific adapters override `transform()` for network-specific needs. Factory function `getAdapter(networkId)` returns correct adapter.

**Step 4: Run tests — verify PASS**

**Step 5: Commit**

```bash
git add src/core/packager/network-adapters/ tests/core/packager/network-adapters.test.ts
git commit -m "feat: add network adapters for 22+ ad networks"
```

---

## Task 10: Packager — ZIP Builder

**Files:**
- Create: `src/core/packager/zip-builder.ts`
- Test: `tests/core/packager/zip-builder.test.ts`

**Step 1: Write failing tests**

Test creating ZIPs with correct structure per network (flat, nested for Mintegral, with config.json for TikTok/Snapchat).

**Step 2: Implement with jszip**

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/packager/zip-builder.ts tests/core/packager/zip-builder.test.ts
git commit -m "feat: add ZIP builder with per-network structures"
```

---

## Task 11: Packager — Orchestrator

**Files:**
- Create: `src/core/packager/packager.ts`
- Create: `src/core/packager/types.ts`
- Test: `tests/core/packager/packager.test.ts`

**Step 1: Write failing tests**

Integration test: given a mock build output directory, package for multiple networks simultaneously. Verify output paths, sizes, format correctness.

**Step 2: Implement orchestrator**

Coordinates: read build output -> HtmlBuilder -> for each network: apply adapter -> inline or zip -> validate size -> write output.

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/packager/packager.ts src/core/packager/types.ts tests/core/packager/packager.test.ts
git commit -m "feat: add packager orchestrator (multi-network build)"
```

---

## Task 12: Deployer — API Client

**Files:**
- Create: `src/core/deployer/api-client.ts`
- Create: `src/core/deployer/types.ts`
- Test: `tests/core/deployer/api-client.test.ts`

**Step 1: Write failing tests**

Mock fetch/http to test API client methods: `authenticate()`, `createDeployment()`, `completeDeployment()`, `listProjects()`. Verify request shapes and response parsing.

**Step 2: Implement — port from plbx-cli API client**

Reference: `/Users/pavelsamoylenko/Documents/GitHub/Playbox/playbox-platform/packages/plbx-cli/src/lib/api.ts`

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/deployer/ tests/core/deployer/
git commit -m "feat: add Playbox Platform API client"
```

---

## Task 13: Deployer — Uploader

**Files:**
- Create: `src/core/deployer/uploader.ts`
- Test: `tests/core/deployer/uploader.test.ts`

**Step 1: Write failing tests**

Test S3 pre-signed URL upload flow with mocked HTTP. Test progress reporting, error handling.

**Step 2: Implement**

**Step 3: Run tests — verify PASS**

**Step 4: Commit**

```bash
git add src/core/deployer/uploader.ts tests/core/deployer/uploader.test.ts
git commit -m "feat: add S3 pre-signed URL uploader"
```

---

## Task 14: Builder Hooks

**Files:**
- Create: `src/builder.ts`
- Create: `src/hooks.ts`

**Step 1: Create builder.ts**

Register extension in Cocos build pipeline with `web-mobile` platform hook.

```typescript
export const configs = {
  'web-mobile': {
    hooks: './hooks',
    options: {
      autoReport: {
        default: true,
        render: { ui: 'ui-checkbox' },
        label: 'Auto Build Report',
      },
    },
  },
};
```

**Step 2: Create hooks.ts**

```typescript
export async function onAfterBuild(options: any, result: any): Promise<void> {
  const autoReport = options.packages?.['plbx-cocos-extension']?.autoReport;
  if (autoReport) {
    Editor.Message.send('plbx-cocos-extension', 'on-build-finished');
  }
}
```

**Step 3: Commit**

```bash
git add src/builder.ts src/hooks.ts
git commit -m "feat: add Cocos build hooks (auto report after build)"
```

---

## Task 15: Panel UI — Build Report Tab

**Files:**
- Modify: `static/template/index.html`
- Modify: `static/style/index.css`
- Modify: `src/panels/default.ts`

**Step 1: Implement Build Report tab UI**

- Asset tree view grouped by type
- Columns: preview thumbnail, name, type, source size, build size
- Sort controls (size desc, name, type)
- Filter controls (type dropdown, size threshold)
- Total size indicator
- "Analyze" button
- Wire up to scanner via IPC messages

**Step 2: Verify in Cocos Editor**

Build the extension (`npm run build`), install in Cocos project, open panel, click Analyze.

**Step 3: Commit**

```bash
git add static/ src/panels/
git commit -m "feat: add Build Report tab UI"
```

---

## Task 16: Panel UI — Compress Tab

**Files:**
- Modify: `static/template/index.html`
- Modify: `static/style/index.css`
- Modify: `src/panels/default.ts`

**Step 1: Implement Compress tab UI**

- Asset list (filtered to images/audio)
- Side-by-side preview (original vs compressed)
- Format selector dropdown
- Quality slider (0-100)
- Preset buttons
- Per-asset "Apply" and batch "Apply All"
- Size delta display

**Step 2: Verify in Cocos Editor**

**Step 3: Commit**

```bash
git add static/ src/panels/
git commit -m "feat: add Compress tab UI with live preview"
```

---

## Task 17: Panel UI — Package Tab

**Files:**
- Modify: `static/template/index.html`
- Modify: `static/style/index.css`
- Modify: `src/panels/default.ts`

**Step 1: Implement Package tab UI**

- Network checkbox grid (grouped by category)
- Config section: store URLs, orientation selector
- "Build" button with progress bar
- Output list: network name, file, size, pass/fail badge
- Download / open folder buttons

**Step 2: Verify in Cocos Editor**

**Step 3: Commit**

```bash
git add static/ src/panels/
git commit -m "feat: add Package tab UI with network selection"
```

---

## Task 18: Panel UI — Deploy Tab

**Files:**
- Modify: `static/template/index.html`
- Modify: `static/style/index.css`
- Modify: `src/panels/default.ts`

**Step 1: Implement Deploy tab UI**

- API key input + login status indicator
- Project selector dropdown
- Deployment name input
- "Deploy" button
- Result: URL display with copy button
- Recent deployments list

**Step 2: Verify in Cocos Editor**

**Step 3: Commit**

```bash
git add static/ src/panels/
git commit -m "feat: add Deploy tab UI with Playbox Platform integration"
```

---

## Task 19: Integration Wiring

**Files:**
- Modify: `src/main.ts` — add all message handlers
- Modify: `src/panels/default.ts` — wire UI to core modules via messages

**Step 1: Wire Build Report**

Panel "Analyze" button -> message `scan-assets` -> main.ts calls scanner -> response back to panel.

**Step 2: Wire Compression**

Panel "Compress" action -> message `compress-asset` with params -> main.ts calls image/audio compressor -> returns result with preview path.

**Step 3: Wire Packaging**

Panel "Build" button -> message `package-build` with selected networks + config -> main.ts calls packager orchestrator -> streams progress -> final results.

**Step 4: Wire Deploy**

Panel "Deploy" button -> message `deploy` with config -> main.ts calls deployer -> returns URL.

**Step 5: Verify end-to-end in Cocos Editor**

**Step 6: Commit**

```bash
git add src/
git commit -m "feat: wire panel UI to core modules via IPC messages"
```

---

## Task 20: Final Integration Test & Polish

**Step 1: Run full test suite**

```bash
npm test
```

All tests must pass.

**Step 2: Manual E2E test in Cocos Creator**

1. Install extension in a Cocos 3.8 project
2. Open panel via menu
3. Click "Analyze" in Build Report tab
4. Compress a test image in Compress tab
5. Build for 3 networks in Package tab
6. Verify output files

**Step 3: Fix any issues found**

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: plbx-cocos-extension v0.1.0 — complete initial implementation"
```
