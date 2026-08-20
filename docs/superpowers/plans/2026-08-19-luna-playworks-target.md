# Luna / Unity Playworks target — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Package a Cocos web-mobile build into a Luna/Unity Playworks upload archive (`source.html` + `luna.json` + `playground.json`), wire Luna's boot/CTA/lifecycle/analytics API, and validate every Luna event — standard, lifecycle and custom — in the local preview.

**Architecture:** `luna` becomes a normal entry in the kit's `NETWORKS` registry with a `LunaAdapter`. Two small extension points are added to the kit (a literal inner-HTML filename, and an adapter hook for extra zip files). Analytics validation mirrors the existing Axon model: one pure validator in the kit used by both the package-time gate and the preview UI, fed at runtime by a new Luna SDK mock. The extension only gains preview plumbing — no new packaging logic.

**Tech Stack:** TypeScript, vitest, cheerio (kit HtmlBuilder), jszip, plain browser JS for `static/preview/`.

**Spec:** `../playable-kit/docs/networks/luna-playworks.md`

## Global Constraints

- Kit repo: `../playable-kit` (sibling of the extension). Extension pins `@playbox-ai/playable-kit` `~0.3.x`; kit ships **0.3.8** for this work, extension **0.5.9**.
- Kit tests: `cd ../playable-kit && npx vitest run`. Extension tests: `npx vitest run`.
- Add-export-don't-fork: a symbol the extension needs must be re-exported from the kit barrel `src/index.ts` and listed in `tests/public-api.test.ts`.
- Luna archive = exactly three root files: `source.html`, `luna.json`, `playground.json`.
- Luna caps: **256 events/session**, **32 per unique name**.
- Concrete custom events (`playtime_N`, level funnels) are OUT OF SCOPE — only the channel and its validation are built here.
- No version bump, no commit, no tag until the user confirms the build works in the editor.

---

### Task 1: `NetworkConfig.htmlFileName` — literal inner-HTML name

**Files:**
- Modify: `../playable-kit/src/types.ts` (NetworkConfig, after `htmlMatchesZipName`)
- Modify: `../playable-kit/src/packager/packager.ts:490` (wrap branch), `:617` (plain-zip branch)
- Test: `../playable-kit/tests/packager/html-file-name.test.ts`

**Interfaces:**
- Produces: `NetworkConfig.htmlFileName?: string`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolveInnerHtmlName } from '../../src/packager/packager'

describe('resolveInnerHtmlName', () => {
  it('defaults to index.html', () => {
    expect(resolveInnerHtmlName({ htmlFileName: undefined } as any, 'out/web.zip', {})).toEqual({
      innerHtmlName: 'index.html', outputPath: 'out/web.zip',
    })
  })
  it('honours a literal htmlFileName and never renames the zip', () => {
    expect(resolveInnerHtmlName({ htmlFileName: 'source.html' } as any, 'out/web.zip', {})).toEqual({
      innerHtmlName: 'source.html', outputPath: 'out/web.zip',
    })
  })
  it('htmlFileName wins over htmlMatchesZipName', () => {
    const cfg = { htmlFileName: 'source.html', htmlMatchesZipName: true } as any
    expect(resolveInnerHtmlName(cfg, 'out/RISE_01.zip', {}).innerHtmlName).toBe('source.html')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd ../playable-kit && npx vitest run tests/packager/html-file-name.test.ts`
Expected: FAIL — `resolveInnerHtmlName is not a function`

- [ ] **Step 3: Add the field and extract the helper**

In `src/types.ts`, after the `htmlMatchesZipName` docblock:

```ts
  /** Literal name for the HTML inside the ZIP (e.g. Luna requires 'source.html').
   *  Wins over htmlMatchesZipName and, unlike it, never renames the outer .zip. */
  htmlFileName?: string
```

In `packager.ts`, lift the existing naming block (currently inlined at :490) into an exported pure helper and call it from BOTH zip branches:

```ts
export function resolveInnerHtmlName(
  network: NetworkConfig,
  outputPath: string,
  templateVariables: Record<string, string> | undefined,
  buildDir?: string,
): { innerHtmlName: string; outputPath: string } {
  if (network.htmlFileName) return { innerHtmlName: network.htmlFileName, outputPath }
  if (!network.htmlMatchesZipName) return { innerHtmlName: 'index.html', outputPath }
  // ... existing zipBase derivation + sanitizeFileBase logic, verbatim ...
}
```

The plain-zip branch (`writeFileSync(join(tempDir, 'index.html'), zipBranchHtml)`) becomes:

```ts
const { innerHtmlName: plainName } = resolveInnerHtmlName(network, outputPath, options.templateVariables, options.buildDir)
writeFileSync(join(tempDir, plainName), zipBranchHtml)
```

- [ ] **Step 4: Run tests**

Run: `cd ../playable-kit && npx vitest run tests/packager`
Expected: PASS, including the existing Mintegral zip-naming tests (regression net for the extraction).

---

### Task 2: `getZipExtraFiles` adapter hook

**Files:**
- Modify: `../playable-kit/src/packager/network-adapters/base.ts` (interface + BaseAdapter)
- Modify: `../playable-kit/src/packager/packager.ts` (both zip branches, right after the `config.json` push)
- Test: `../playable-kit/tests/packager/zip-extra-files.test.ts`

**Interfaces:**
- Produces: `NetworkAdapter.getZipExtraFiles(config: PackageConfig): Array<{ zipPath: string; content: string }>`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { BaseAdapter } from '../../src/packager/network-adapters/base'

describe('getZipExtraFiles', () => {
  it('defaults to an empty list', () => {
    const a = new BaseAdapter('x', { id: 'x', name: 'X', format: 'zip', maxSize: 1, mraid: false, inlineAssets: true })
    expect(a.getZipExtraFiles({ orientation: 'auto' })).toEqual([])
  })
})
```

- [ ] **Step 2: Run it**

Run: `cd ../playable-kit && npx vitest run tests/packager/zip-extra-files.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`base.ts` — add to the `NetworkAdapter` interface and to `BaseAdapter`:

```ts
  /** Extra files to place in the ZIP alongside the HTML. Default none.
   *  getZipConfig covers the hard-coded config.json; this covers everything
   *  else (e.g. Luna's luna.json + playground.json). */
  getZipExtraFiles(config: PackageConfig): Array<{ zipPath: string; content: string }>
```

```ts
  getZipExtraFiles(_config: PackageConfig): Array<{ zipPath: string; content: string }> {
    return []
  }
```

`packager.ts` — in BOTH zip branches, after the existing `zipConfig` push:

```ts
          extraFiles.push(...adapter.getZipExtraFiles(options.config))
```

- [ ] **Step 4: Run `npx vitest run tests/packager`** → PASS.

---

### Task 3: Resolve store URLs into PackageConfig before adapters run

**Files:**
- Modify: `../playable-kit/src/packager/packager.ts` (right after `headStoreUrls` is computed, before the per-network loop)
- Test: `../playable-kit/tests/packager/store-url-resolution.test.ts`

**Interfaces:**
- Produces: `resolveStoreUrls(urls: string[]): { ios?: string; android?: string }`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { resolveStoreUrls } from '../../src/packager/packager'

describe('resolveStoreUrls', () => {
  it('splits by host', () => {
    expect(resolveStoreUrls([
      'https://play.google.com/store/apps/details?id=com.x',
      'https://apps.apple.com/us/app/x/id123',
    ])).toEqual({
      android: 'https://play.google.com/store/apps/details?id=com.x',
      ios: 'https://apps.apple.com/us/app/x/id123',
    })
  })
  it('handles itunes.apple.com and a missing side', () => {
    expect(resolveStoreUrls(['https://itunes.apple.com/app/id1'])).toEqual({ ios: 'https://itunes.apple.com/app/id1' })
  })
  it('returns nothing for unrelated urls', () => {
    expect(resolveStoreUrls(['https://example.com'])).toEqual({})
  })
})
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement**

```ts
/** Split a flat store-URL list into the iOS/Android pair adapters expect. */
export function resolveStoreUrls(urls: string[]): { ios?: string; android?: string } {
  const out: { ios?: string; android?: string } = {}
  for (const u of urls) {
    if (!out.android && /play\.google\.com/i.test(u)) out.android = u
    if (!out.ios && /(apps|itunes)\.apple\.com/i.test(u)) out.ios = u
  }
  return out
}
```

Then, immediately after `headStoreUrls` is built:

```ts
  // Adapters (Luna's luna.json, plbx_html.appstore_url in BaseAdapter.transform)
  // read config.storeUrl*, but the editor never sets them — the real URLs live in
  // the game source. Fill only what is empty so a programmatic caller still wins.
  const resolvedStore = resolveStoreUrls(headStoreUrls)
  if (!options.config.storeUrlAndroid && resolvedStore.android) options.config.storeUrlAndroid = resolvedStore.android
  if (!options.config.storeUrlIos && resolvedStore.ios) options.config.storeUrlIos = resolvedStore.ios
```

- [ ] **Step 4: Run `cd ../playable-kit && npx vitest run`** → PASS (watch for adapter snapshot tests that assert an empty store block).

---

### Task 4: `lunaBridge()` + `LunaAdapter`

**Files:**
- Modify: `../playable-kit/src/packager/network-adapters/base.ts` (add `lunaBridge`, exported, next to `mraidBridge`)
- Create: `../playable-kit/src/packager/network-adapters/luna.ts`
- Modify: `../playable-kit/src/packager/network-adapters/index.ts` (CUSTOM_ADAPTERS)
- Test: `../playable-kit/tests/packager/luna-adapter.test.ts`

**Interfaces:**
- Consumes: `getZipExtraFiles` (Task 2), `resolveStoreUrls` result in `config.storeUrl*` (Task 3)
- Produces: `export function lunaBridge(): string`, `export class LunaAdapter extends BaseAdapter`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { LunaAdapter } from '../../src/packager/network-adapters/luna'
import { HtmlBuilder } from '../../src/packager/html-builder'
import { getNetwork } from '../../src/networks'

const cfg = { orientation: 'portrait' as const, storeUrlAndroid: 'https://play.google.com/store/apps/details?id=com.x', storeUrlIos: 'https://apps.apple.com/app/id1' }
const adapter = () => new LunaAdapter('luna', getNetwork('luna')!)

describe('LunaAdapter', () => {
  it('gates boot on startGame and self-starts without a Luna host', () => {
    const b = new HtmlBuilder('<html><head></head><body></body></html>')
    adapter().transform(b, cfg)
    const html = b.toHtml()
    expect(html).toContain('window.__plbx_pre_boot = function')
    expect(html).toContain('window.startGame = function')
    expect(html).toContain('if (!window.Luna)')
  })

  it('routes every CTA path through InstallFullGame', () => {
    const b = new HtmlBuilder('<html><head></head><body></body></html>')
    adapter().transform(b, cfg)
    const html = b.toHtml()
    expect(html).toContain('Luna.Unity.Playable.InstallFullGame()')
    expect(html).toContain('window.install = function')
    expect(html).toContain('Luna.Unity.LifeCycle.GameEnded()')
  })

  it('honours container lifecycle events', () => {
    const b = new HtmlBuilder('<html><head></head><body></body></html>')
    adapter().transform(b, cfg)
    const html = b.toHtml()
    for (const e of ['luna:pause', 'luna:resume', 'luna:mute', 'luna:unmute']) expect(html).toContain(e)
  })

  it('never injects mraid', () => {
    const b = new HtmlBuilder('<html><head></head><body></body></html>')
    adapter().transform(b, cfg)
    expect(b.toHtml()).not.toContain('mraid.js')
  })

  it('emits luna.json + playground.json with mapped store urls and orientation', () => {
    const files = adapter().getZipExtraFiles(cfg)
    expect(files.map((f) => f.zipPath).sort()).toEqual(['luna.json', 'playground.json'])
    const luna = JSON.parse(files.find((f) => f.zipPath === 'luna.json')!.content)
    expect(luna.unity.packages.default.androidLink).toBe(cfg.storeUrlAndroid)
    expect(luna.unity.packages.default.iosLink).toBe(cfg.storeUrlIos)
    expect(luna.unity.packages.default.orientation).toBe('portrait')
    expect(luna.unity.packages.tiktok.orientation).toBe(1)
    const pg = JSON.parse(files.find((f) => f.zipPath === 'playground.json')!.content)
    expect(pg).toEqual({ title: expect.any(String), icon: null, fields: {} })
  })

  it('queues analytics until window.pi exists', () => {
    const b = new HtmlBuilder('<html><head></head><body></body></html>')
    adapter().transform(b, cfg)
    const html = b.toHtml()
    expect(html).toContain('log_event')
    expect(html).toContain('logCustomEvent')
  })
})
```

- [ ] **Step 2: Run it** → FAIL (module missing).

- [ ] **Step 3: Implement the bridge in `base.ts`**

```ts
/**
 * Luna / Unity Playworks bridge.
 *
 * Luna owns the boot ("all startup logic inside startGame()", which Luna calls),
 * the CTA (InstallFullGame — Luna's standard Ad Click event fires from it and
 * nowhere else) and the container lifecycle (luna:* window events). We provide
 * the analytics CHANNEL only — concrete custom events belong to the game.
 */
export function lunaBridge(): string {
  return `
window.plbx_html = window.plbx_html || {};

// --- Boot gate: Luna calls startGame(). No Luna host (local dev) → self-start.
window.__plbx_pre_boot = function (go) {
  var started = false;
  window.startGame = function () { if (started) return; started = true; go(); };
  if (!window.Luna) window.startGame();
};

// --- CTA: every dispatcher path must reach Luna, or Ad Click never fires.
function _plbx_luna_install() {
  try { Luna.Unity.Playable.InstallFullGame(); } catch (e) { console.error('[plbx] luna cta:', e); }
}
window.plbx_html.download = _plbx_luna_install;
window.install = _plbx_luna_install;

// --- Game end (Luna requires it for Mintegral/Vungle exports).
window.plbx_html.game_end = function () {
  try { Luna.Unity.LifeCycle.GameEnded(); } catch (e) { console.error('[plbx] luna game_end:', e); }
};

// --- Analytics channel. Concrete events are the game's business; this only
// guarantees they are not silently dropped before Luna's SDK exists.
var _plbx_luna_q = [];
function _plbx_luna_send(name, value) {
  try { window.pi.logCustomEvent(name, value); } catch (e) { console.error('[plbx] luna event:', e); }
}
window.plbx_html.log_event = function (name, value) {
  var v = (typeof value === 'number' && isFinite(value)) ? (value | 0) : 1;
  if (window.pi && typeof window.pi.logCustomEvent === 'function') { _plbx_luna_send(name, v); return; }
  if (_plbx_luna_q.length < 32) _plbx_luna_q.push([name, v]);
};
(function _plbx_luna_flush() {
  if (window.pi && typeof window.pi.logCustomEvent === 'function') {
    while (_plbx_luna_q.length) { var e = _plbx_luna_q.shift(); _plbx_luna_send(e[0], e[1]); }
    return;
  }
  setTimeout(_plbx_luna_flush, 100);
})();

// --- Container lifecycle.
function _plbx_luna_audio(muted) {
  try {
    if (window.cc && window.cc.audioEngine) {
      muted ? window.cc.audioEngine.pauseAll() : window.cc.audioEngine.resumeAll();
    }
    var m = document.querySelectorAll('audio, video');
    for (var i = 0; i < m.length; i++) m[i].muted = muted;
  } catch (e) {}
}
window.addEventListener('luna:pause', function () { try { window.cc && cc.game && cc.game.pause(); } catch (e) {} });
window.addEventListener('luna:resume', function () { try { window.cc && cc.game && cc.game.resume(); } catch (e) {} });
window.addEventListener('luna:mute', function () { _plbx_luna_audio(true); });
window.addEventListener('luna:unmute', function () { _plbx_luna_audio(false); });
`
}
```

- [ ] **Step 4: Implement `luna.ts`**

```ts
import { NetworkConfig, PackageConfig } from '../../types'
import { BaseAdapter, lunaBridge } from './base'

/** Luna's own orientation vocabulary (luna.json `default.orientation`). */
const ORIENTATION: Record<string, string> = {
  auto: 'unspecified', portrait: 'portrait', landscape: 'landscape',
}
/** TikTok package block inside luna.json — same map the TikTok adapter uses. */
const TIKTOK_ORIENTATION: Record<string, number> = { auto: 0, portrait: 1, landscape: 2 }

/**
 * Luna / Unity Playworks adapter.
 * - Bridge: startGame boot gate, InstallFullGame CTA, GameEnded, luna:* lifecycle,
 *   plbx_html.log_event analytics channel (see lunaBridge).
 * - Emits Luna's two manifests next to source.html; the HTML filename itself comes
 *   from NetworkConfig.htmlFileName.
 */
export class LunaAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig)
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return lunaBridge()
  }

  getZipExtraFiles(config: PackageConfig): Array<{ zipPath: string; content: string }> {
    const appName = config.appName || 'Playable'
    const luna = {
      unity: {
        packages: {
          default: {
            applicationName: appName,
            iosLink: config.storeUrlIos || '',
            androidLink: config.storeUrlAndroid || '',
            orientation: ORIENTATION[config.orientation] || 'unspecified',
            supportedLanguages: ['en'],
          },
          ironsource: {
            appID: '', assetID: '', applicationGenre: '',
            versionName: '', apiType: 0, playableMode: 0, packageType: 0,
          },
          facebook: { assetID: '', packageType: 0 },
          tiktok: { orientation: TIKTOK_ORIENTATION[config.orientation] ?? 0 },
        },
      },
    }
    // fields stays empty — Playground fields are per-project authoring, not
    // something a packager can invent. icon: null is accepted by Luna.
    const playground = { title: appName, icon: null, fields: {} }
    return [
      { zipPath: 'luna.json', content: JSON.stringify(luna, null, 2) },
      { zipPath: 'playground.json', content: JSON.stringify(playground, null, 2) },
    ]
  }
}
```

`config.appName` does not exist yet — add it to `PackageConfig` in `src/packager/types.ts`:

```ts
  /** Display name for targets that need it in a manifest (Luna's applicationName). */
  appName?: string
```

and pass it from `packager.ts` where `templateVariables` are available:

```ts
  if (!options.config.appName) {
    options.config.appName =
      options.templateVariables?.assetTitle ||
      options.templateVariables?.projectName ||
      deriveProjectNameFromBuildDir(options.buildDir) ||
      'Playable'
  }
```

- [ ] **Step 5: Register the adapter**

`network-adapters/index.ts`:

```ts
import { LunaAdapter } from './luna'
// ... inside CUSTOM_ADAPTERS:
  luna: LunaAdapter,
```

- [ ] **Step 6: Run `cd ../playable-kit && npx vitest run tests/packager`** → PASS.

---

### Task 5: Registry entry

**Files:**
- Modify: `../playable-kit/src/networks.ts`
- Test: `../playable-kit/tests/networks.test.ts`

- [ ] **Step 1: Write the failing test** (append to `networks.test.ts`)

```ts
  it('luna is a single-file zip whose inner HTML is source.html', () => {
    const n = getNetwork('luna')!
    expect(n.format).toBe('zip')
    expect(n.singleFileZip).toBe(true)
    expect(n.inlineAssets).toBe(true)
    expect(n.mraid).toBe(false)
    expect(n.htmlFileName).toBe('source.html')
    expect(n.maxSize).toBe(5 * 1024 * 1024)
  })
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Add the entry**

```ts
  luna: {
    id: 'luna',
    name: 'Luna (Unity Playworks)',
    format: 'zip',
    // Luna publishes no upload ceiling and does NOT compress after upload, so the
    // artifact must already clear the strictest downstream network cap.
    maxSize: 5 * 1024 * 1024,
    mraid: false,
    inlineAssets: true,
    singleFileZip: true,
    htmlFileName: 'source.html',
    zipStructure: '',
  },
```

- [ ] **Step 4: Run `cd ../playable-kit && npx vitest run tests/networks.test.ts`** → PASS.

---

### Task 6: Luna analytics validator

**Files:**
- Create: `../playable-kit/src/validation/luna-events.ts`
- Modify: `../playable-kit/src/index.ts` (barrel), `../playable-kit/tests/public-api.test.ts`
- Test: `../playable-kit/tests/validation/luna-events.test.ts`

**Interfaces:**
- Produces:
  - `LUNA_STANDARD_EVENTS: readonly string[]`
  - `LUNA_EVENT_CAPS: { perSession: 256; perName: 32 }`
  - `LUNA_SPEC_URL: string`
  - `interface LunaEventUsage { events: Array<{ name: string; count: number; valueOk?: boolean; beforeStart?: boolean }>; dynamicNames?: number; redefinesSdk?: boolean; ctaViaInstall?: boolean }`
  - `type LunaCheck = AxonCheck`
  - `extractLunaUsage(buildDir: string): LunaEventUsage`
  - `validateLunaEvents(usage: LunaEventUsage): LunaCheck[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest'
import { validateLunaEvents, LUNA_EVENT_CAPS } from '../../src/validation/luna-events'

const byId = (checks: any[], id: string) => checks.find((c) => c.id === id)

describe('validateLunaEvents', () => {
  it('is silent for a project with no custom events', () => {
    expect(validateLunaEvents({ events: [] })).toEqual([])
  })

  it('flags a name over the 32-per-name cap', () => {
    const checks = validateLunaEvents({ events: [{ name: 'tap', count: LUNA_EVENT_CAPS.perName + 1 }] })
    expect(byId(checks, 'caps_per_name').ok).toBe(false)
    expect(byId(checks, 'caps_per_name').level).toBe('error')
  })

  it('flags the 256-per-session cap across names', () => {
    const events = Array.from({ length: 9 }, (_, i) => ({ name: 'e' + i, count: 30 }))
    expect(byId(validateLunaEvents({ events }), 'caps_session').ok).toBe(false)
  })

  it('warns about events fired before startGame', () => {
    const checks = validateLunaEvents({ events: [{ name: 'a', count: 1, beforeStart: true }] })
    expect(byId(checks, 'events_before_start')).toMatchObject({ ok: false, level: 'warn' })
  })

  it('rejects empty and whitespace names', () => {
    expect(byId(validateLunaEvents({ events: [{ name: 'play time', count: 1 }] }), 'name_valid').ok).toBe(false)
  })

  it('warns when a string-named event carries no integer value', () => {
    expect(byId(validateLunaEvents({ events: [{ name: 'a', count: 1, valueOk: false }] }), 'value_int').ok).toBe(false)
  })

  it('fails a CTA that bypassed InstallFullGame', () => {
    const checks = validateLunaEvents({ events: [{ name: 'a', count: 1 }], ctaViaInstall: false })
    expect(byId(checks, 'cta_via_install')).toMatchObject({ ok: false, level: 'error' })
  })

  it('fails a creative that redefines the Luna SDK globals', () => {
    expect(byId(validateLunaEvents({ events: [], redefinesSdk: true }), 'no_sdk_redefine').ok).toBe(false)
  })

  it('reports runtime-built names as info, not failure', () => {
    const c = byId(validateLunaEvents({ events: [{ name: 'a', count: 1 }], dynamicNames: 2 }), 'dynamic_names')
    expect(c.level).toBe('info')
  })
})
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement `luna-events.ts`**

Mirror `axon-events.ts` structure exactly: module docblock citing the spec URL, exported constants, `extractLunaUsage(buildDir)` walking the build with the same `SCANNABLE_EXTENSIONS` + try/catch-and-skip discipline, then the pure `validateLunaEvents`. Regexes:

```ts
// pi.logCustomEvent('NAME'[, value]) — literal names only; a template literal or
// a concatenation lands in dynamicNames instead.
const LOG_EVENT_LITERAL_RE = /logCustomEvent\s*\(\s*['"]([^'"]+)['"]\s*(?:,\s*([^)]*))?\)/g
const LOG_EVENT_DYNAMIC_RE = /logCustomEvent\s*\(\s*(?!['"])/g
// Assignment to the SDK globals (defining them). Negative lookahead skips the
// comparison operators in defensive guards.
const REDEFINE_RE = /\b(?:window\.)?(?:pi|Luna)\s*=(?![=])/
```

`validateLunaEvents` emits `no_sdk_redefine` even for empty usage (it breaks
Luna's own injection regardless), and returns `[]` otherwise when there are no
events — same "no advisory noise" rule as Axon. `cta_via_install` is emitted
only when `ctaViaInstall !== undefined` (runtime-only signal).

- [ ] **Step 4: Run `cd ../playable-kit && npx vitest run tests/validation/luna-events.test.ts`** → PASS.

- [ ] **Step 5: Re-export from the barrel**

`src/index.ts`:

```ts
export {
  LUNA_STANDARD_EVENTS, LUNA_EVENT_CAPS, LUNA_SPEC_URL,
  extractLunaUsage, validateLunaEvents,
} from './validation/luna-events'
export type { LunaEventUsage, LunaCheck } from './validation/luna-events'
```

Add the same names to the expected-surface list in `tests/public-api.test.ts`.

- [ ] **Step 6: Run `cd ../playable-kit && npx vitest run`** → PASS.

---

### Task 7: Preview mock + network checks

**Files:**
- Modify: `../playable-kit/src/preview/sdk-mocks.ts` (`expectedCtaMethod` MAP + a `networkId === 'luna'` block)
- Modify: `../playable-kit/src/checks/network-checks.ts` (`CTA_LABELS.luna`, lifecycle sets)
- Test: `../playable-kit/tests/preview/sdk-mocks.test.ts`, `../playable-kit/tests/network-checks.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// sdk-mocks.test.ts
it('luna mock installs the SDK globals and reports events', () => {
  const code = generatePreviewUtil({ networkId: 'luna', mraid: false, maxSize: 5e6 })
  expect(code).toContain('window.Luna')
  expect(code).toContain('InstallFullGame')
  expect(code).toContain('GameEnded')
  expect(code).toContain('window.pi')
  expect(code).toContain('logCustomEvent')
  expect(code).toContain("report('luna_event'")
  expect(code).toContain("d.type !== 'plbx:luna'")
  expect(code).toContain('window.startGame')
})

// network-checks.test.ts
it('luna checks cover the boot gate, CTA and events', () => {
  const ids = getNetworkChecks('luna').map((c) => c.id)
  expect(ids).toContain('start_game')
  expect(ids).toContain('cta')
  expect(ids).toContain('luna_events')
})
```

- [ ] **Step 2: Run them** → FAIL.

- [ ] **Step 3: Implement the mock block**

Add `luna: 'luna_install'` to `expectedCtaMethod`'s MAP. Then a `if (networkId === 'luna')` block that:

```js
  // ---- Luna / Unity Playworks mock ----
  var _lunaCounts = {}, _lunaTotal = 0, _lunaStarted = false;

  function _lunaEvent(name, value, kind) {
    _lunaCounts[name] = (_lunaCounts[name] || 0) + 1;
    _lunaTotal++;
    report('luna_event', {
      name: name, value: value, kind: kind,
      count: _lunaCounts[name], total: _lunaTotal,
      beforeStart: !_lunaStarted,
      valueOk: (kind !== 'custom') || (typeof value === 'number' && isFinite(value)),
    });
  }

  window.pi = window.pi || { logCustomEvent: function (name, value) { _lunaEvent(name, value, 'custom'); } };

  window.Luna = window.Luna || {
    Unity: {
      Playable: { InstallFullGame: function () {
        report('cta', { url: (window.plbx_html || {}).google_play_url || '', method: 'luna_install' });
        _lunaEvent('adClick', 1, 'standard');
      } },
      LifeCycle: { GameEnded: function () { report('game_end', { source: 'luna' }); } },
      Playground: { get: function (section, key, def) { return def; } },
    },
  };

  // Standard events are injected by Luna at export time — simulate them so the
  // panel can validate their PRECONDITIONS locally (impression = first frame,
  // engagement = first input, click = InstallFullGame).
  _lunaEvent('adLoading', 1, 'standard');
  window.addEventListener('load', function () {
    _lunaEvent('adReady', 1, 'standard');
    _lunaEvent('adStarting', 1, 'standard');
    // Luna's host calls startGame(); the creative must NOT self-start here.
    setTimeout(function () {
      if (typeof window.startGame === 'function') { _lunaStarted = true; report('luna_lifecycle', { name: 'startGame' }); window.startGame(); }
      else report('error', { message: 'luna: startGame() was never defined' });
    }, 50);
  });
  ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t) {
    window.addEventListener(t, function once() {
      ['pointerdown', 'touchstart', 'mousedown'].forEach(function (t2) { window.removeEventListener(t2, once, true); });
      _lunaEvent('adEngagement', 1, 'standard');
    }, true);
  });

  // Manual-trigger protocol (mirrors plbx:molocov2).
  window.addEventListener('message', function (e) {
    var d = e && e.data;
    if (!d || typeof d !== 'object' || d.type !== 'plbx:luna') return;
    var evt = { build: 'luna:build', pause: 'luna:pause', resume: 'luna:resume', mute: 'luna:mute', unmute: 'luna:unmute' }[d.action];
    try {
      if (evt) { window.dispatchEvent(new Event(evt)); report('luna_lifecycle', { name: evt }); return; }
      if (d.action === 'start-game' && typeof window.startGame === 'function') { _lunaStarted = true; window.startGame(); report('luna_lifecycle', { name: 'startGame' }); return; }
      if (d.action === 'game-end' && window.plbx_html && window.plbx_html.game_end) { window.plbx_html.game_end(); return; }
      if (d.action === 'cta' && window.plbx_html && window.plbx_html.download) { window.plbx_html.download(); return; }
    } catch (err) { report('error', { message: 'luna trigger ' + d.action + ': ' + (err && err.message) }); }
  });
```

The first-frame `adImpression` reuses the existing first-frame signal the splash
hook already reports — emit `_lunaEvent('adImpression', 1, 'standard')` from the
same place the mock observes the first rendered frame.

`network-checks.ts`: `CTA_LABELS.luna = 'CTA (Luna.Unity.Playable.InstallFullGame)'`,
plus two `luna`-only check defs (`start_game` — "startGame() gate honoured",
`luna_events` — "Analytics events within Luna caps"). Luna is NOT added to
FULL_LIFECYCLE / PARTIAL_LIFECYCLE / GAME_END_REQUIRED — its lifecycle is its own.

- [ ] **Step 4: Run `cd ../playable-kit && npx vitest run`** → PASS.

---

### Task 8: Ship the kit, re-pin the extension

- [ ] **Step 1:** `cd ../playable-kit && npm run build && npx vitest run` → all green.
- [ ] **Step 2:** bump kit `package.json` to `0.3.8`, publish (`npm publish`), tag + push.
- [ ] **Step 3:** in the extension, `npm i @playbox-ai/playable-kit@~0.3.8` and confirm `package-lock.json` moved.
- [ ] **Step 4:** `npm run build && npx vitest run` in the extension → green.

---

### Task 9: Preview server — Luna payload + `source.html` resolution

**Files:**
- Modify: `src/core/preview/server.ts` (`extractHtmlFromZip` preference chain; `/api/networks` payload)
- Test: `tests/core/preview-zip-html.test.ts`, `tests/core/preview/server.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// preview-zip-html.test.ts
it('resolves source.html from a Luna archive that also holds the manifests', async () => {
  const zip = new JSZip()
  zip.file('source.html', '<html><body>luna</body></html>')
  zip.file('luna.json', '{}')
  zip.file('playground.json', '{}')
  const p = join(tmp, 'luna.zip')
  writeFileSync(p, await zip.generateAsync({ type: 'nodebuffer' }))
  expect(await extractHtmlFromZip(p)).toContain('luna')
})
```

- [ ] **Step 2: Run it** → FAIL (falls through to the first root-level `.html`, which is order-dependent).

- [ ] **Step 3: Implement**

```ts
  const htmlFile =
    zip.file('index.html') ||
    zip.file('source.html') ||          // Luna: the archive's mandatory entry name
    zip.file(`${zipBase}.html`) ||
    zip.file(/^[^/]+\.html$/i)[0] ||
    zip.file(/\.html$/i)[0]
```

In the `/api/networks` handler, next to the existing `axonEvents` line:

```ts
                // Luna standard events — the client renders them as the expected
                // set and checks runtime-fired events (incl. custom) against caps.
                lunaEvents: id === 'luna' ? LUNA_STANDARD_EVENTS : null,
                lunaCaps: id === 'luna' ? LUNA_EVENT_CAPS : null,
```

- [ ] **Step 4: Run `npx vitest run tests/core`** → PASS.

---

### Task 10: Preview UI — Luna Events panel

**Files:**
- Modify: `static/preview/index.html` (new `#luna-section` in the right sidebar, after `#molocov2-section`)
- Modify: `static/preview/preview.js` (state, `case 'luna_event'`, `case 'luna_lifecycle'`, `computeLunaChecks()`, `renderLunaEvents()`, trigger dock)
- Modify: `static/preview/preview.css` (reuse `.axon-event` / `.axon-verdict` vocabulary)
- Test: `tests/core/preview/server.test.ts` (structural assertion, following the existing precedent that fetches `/static/preview/*`)

- [ ] **Step 1: Write the failing test**

```ts
it('serves the Luna events panel markup and its client logic', async () => {
  const html = await get('/static/preview/index.html')
  expect(html).toContain('id="luna-section"')
  expect(html).toContain('id="luna-events"')
  expect(html).toContain('id="luna-verdicts"')
  const js = await get('/static/preview/preview.js')
  expect(js).toContain("case 'luna_event'")
  expect(js).toContain('computeLunaChecks')
  expect(js).toContain("type: 'plbx:luna'")
})
```

- [ ] **Step 2: Run it** → FAIL.

- [ ] **Step 3: Implement the panel**

- State, next to the Axon block (`preview.js:78`):

```js
  var lunaEvents = {};     // { name: { count, kind, beforeStart, valueOk } }
  var lunaOrder = [];      // first-seen order
  var lunaTotal = 0;
  var lunaCtaViaInstall = null;  // null = no CTA yet
  var isLunaNetwork = false;
```

- Reset inside `loadNetwork` next to the Axon reset; `isLunaNetwork = (id === 'luna')`.
- `case 'luna_event'` accumulates and calls `renderLunaEvents()`; `case 'luna_lifecycle'` logs to `#console`.
- The existing `case 'cta'` handler sets `lunaCtaViaInstall = (data.method === 'luna_install')`.
- `computeLunaChecks()` mirrors `validateLunaEvents` — carry the comment:
  `// Mirrors validateLunaEvents() in playable-kit/src/validation/luna-events.ts (the unit-tested authority) — KEEP IN SYNC.`
- `renderLunaEvents()` renders three groups (standard / lifecycle / custom) with
  `name ×count`, marking any name at ≥ 32 as failed and the session total at ≥ 256
  as failed, then the verdict rows from `computeLunaChecks()`.
- Trigger dock buttons post `{ type: 'plbx:luna', action }` into the iframe for
  `build | start-game | pause | resume | mute | unmute | game-end | cta`.

- [ ] **Step 4: Run `npx vitest run tests/core/preview`** → PASS.

- [ ] **Step 5: Manual verification** — package the roadside fixture for `luna`, open the preview, confirm: splash → mock calls `startGame()` → game boots; the panel lists `adLoading/adReady/adStarting/adImpression`, then `adEngagement` on first tap; the CTA button reports `luna_install`; `plbx_html.log_event('test_1')` from the console appears as a custom event with count 1.

---

### Task 11: i18n + docs

**Files:**
- Modify: `src/core/i18n/locales.ts` (flat dotted keys, EN + RU)
- Modify: `CLAUDE.md` docs index if a new doc path is added

- [ ] **Step 1:** add the panel/preview strings used by Task 10 (`preview.luna.title`, `preview.luna.standard`, `preview.luna.custom`, `preview.luna.lifecycle`, `preview.luna.caps`), EN and RU, following the existing flat-key convention.
- [ ] **Step 2:** `npx vitest run` (a locale-parity test exists — both languages must carry every key).

---

### Task 12: Release

- [ ] **Step 1:** user confirms the Luna archive works in their Playworks account (upload → Preview Link → "Show Events: On" shows custom events → `urls.txt` session lands in Insights).
- [ ] **Step 2:** bump the extension to `0.5.9`, commit, tag `v0.5.9`, push the tag.
- [ ] **Step 3:** `gh release create v0.5.9 --title "..." --notes-file <file> --latest` with highlights + the commit list since the previous release.

## Self-review notes

- Spec §2 archive contract → Tasks 1, 2, 4, 5. §3 runtime contract → Task 4. §5 store URLs → Task 3. §6 checks → Task 6. §7 mock + UI → Tasks 7, 9, 10. §8 out-of-scope items have no tasks by design.
- `PackageConfig.appName` is introduced in Task 4 and consumed only there.
- `getZipExtraFiles` is defined in Task 2 and first used in Task 4.
- `LUNA_STANDARD_EVENTS` / `LUNA_EVENT_CAPS` are defined in Task 6, exported in the same task, and consumed in Tasks 9 and 10.
