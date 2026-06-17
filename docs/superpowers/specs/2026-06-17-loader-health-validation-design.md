# Loader-Health Validation — Design Spec

## Problem

A packaged AppLovin build (`carousel_of_seasons_classic_applovin.html`, packager
**v0.2.11**) passed BOTH the local preview validator AND AppLovin's mobile
Playable Preview, yet served **0 clicks / 0 installs / 0.00% CTR across all 8
live creatives** with healthy impressions. Root cause was not the CTA — it was
the **boot pipeline**: the game never became interactive in the live container
(grey screen), so no tap was possible. Impressions still logged because the ad
container rendered.

Two boot-pipeline defects in that build, both fixed in later packager versions:

1. **Fragile defer-boot gate** (fixed v0.2.12, `3cd9a62`). The v0.2.11
   `__plbx_pre_boot` gate waited only on `mraid.isViewable()` plus a lone
   `viewableChange` listener — **no bounded poll, no render-surface fallback**.
   In live, AppLovin fires the first `viewableChange(true)` during the
   base64-ZIP unpack window, before the gate attaches its listener → the pulse
   is lost → `boot()` never fires → grey screen forever.
2. **Virtual-scheme suffix collision** (fixed v0.2.18, `9ab5eb9`). The v0.2.11
   `_isVirtualScheme` regex (`/^(chunks|virtual|blob|data|about):/`) does not
   recognize a `./`-prefixed probe, so `./chunks:///_virtual/index.js`
   suffix-matches the real boot `index.js` → wrong module → grey screen.

**Why the validator missed it.** The injected mraid mock is happy-path: on
`ready` it immediately `_fire('viewableChange', true)` (`sdk-mocks.ts:343`).
The mock never reproduces a lost pulse, a never-viewable surface, or a late
pulse — exactly the conditions that break the fragile gate. The validator's
manual "Viewable" button further masks the bug: a human clicking it at a
convenient time is the opposite of the hostile live timing.

## Goal

Make the preview validator catch boot-pipeline fragility — both the specific
known defects (cheaply, statically) and the **class** of "game never boots
under hostile mraid timing" (behaviorally, future-proof). Both classes
**hard-fail** the verdict.

## Solution

Two complementary layers, both blocking (hard fail):

- **Static loader-health fingerprint** — scan the built HTML for capability
  signatures of the fixed loader. Catches every stale / known-bad build now
  (including the 8 live creatives), deterministically.
- **Runtime adversarial boot harness** — self-driving sweep that boots the
  build under hostile mraid timing modes and asserts the game reaches
  `game_ready`. Catches the bug class behaviorally, regardless of code shape or
  packager version, including future regressions.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  static/preview/preview.js  (Validate window UI)             │
│   • renders static loader-health checks (fail rows)          │
│   • SELF-DRIVING runtime sweep: for each mraidMode →          │
│       reload iframe ?mraidMode=X → await game_ready ≤ 12s     │
│       → pass/fail row  (+ GameCanvas non-zero size check)     │
└───────────────┬──────────────────────────────────────────────┘
                │ HTTP (?mraidMode=) + postMessage beacons
┌───────────────▼──────────────────────────────────────────────┐
│  src/core/preview/server.ts                                  │
│   • ?mraidMode= query → selects injected mock variant        │
│   • scanLoaderHealth(html,{mraid}) → checks[] in Validate     │
│     payload, severity = fail                                  │
└───────┬───────────────────────────────┬──────────────────────┘
        │                               │
┌───────▼─────────────────┐   ┌─────────▼──────────────────────┐
│ preview/loader-health.ts │   │ preview/sdk-mocks.ts           │
│ (NEW, pure)              │   │ (mraid mock parameterized by   │
│ scanLoaderHealth(...)    │   │  mraidMode; default = happy)   │
└──────────────────────────┘   └────────────────────────────────┘
```

## Components

### 1. `src/core/preview/loader-health.ts` (NEW, pure / unit-testable)

```ts
export type LoaderCheck = {
  id: string;
  pass: boolean;
  severity: 'fail';
  detail: string;
};

export function scanLoaderHealth(
  html: string,
  opts: { mraid: boolean },
): LoaderCheck[];
```

Reads the already-extracted built HTML (caller handles zip-aware extraction,
reusing the same path as the regional scan at `server.ts:159-179`). Checks:

- **`gate_robust`** — only when `opts.mraid` is true. The `__plbx_pre_boot`
  body must contain BOTH a bounded poll signature (`poll(` with a `setTimeout`
  / `200`) AND a render-surface fallback signature (`innerWidth` AND
  `visibilityState`). Missing either → fail. Rationale: capability signature,
  not version string — robust against unrelated loader edits. Skipped entirely
  for non-mraid networks (Facebook/Google/etc. have no gate).
- **`virtual_scheme_guarded`** — the `_isVirtualScheme` definition must include
  the `(\.\/)?` (optional `./`) guard. Missing → fail.
- **`loader_version`** — parse the packager version from the console banner
  (`v0.2.NN`); fail when absent or below `MIN_SAFE_LOADER_VERSION` (`0.2.18`).
  The floor is the **boot-safety** version — where the last boot-pipeline fix
  landed (gate v0.2.12, virtual-scheme v0.2.18) — NOT the latest release, so a
  correct v0.2.18–v0.2.20 build passes all three checks (no false block). Later
  releases (base122 etc.) are perf, not boot-safety, so they do not raise the
  floor. Single exported constant so the floor moves in one place.

Each check returns a human-readable `detail` (what was/wasn't found) so the UI
explains the failure and points at "repackage with current extension."

### 2. `src/core/preview/sdk-mocks.ts` (MODIFY)

Parameterize the mraid mock generator by `mraidMode`. Default `'happy'`
preserves today's behavior (`_fire('viewableChange', true)` on ready). Hostile
modes each target one robust-gate mechanism:

| mode            | mock behavior                                                                 | old gate | new gate |
|-----------------|-------------------------------------------------------------------------------|----------|----------|
| `happy` (def.)  | viewable true immediately on ready                                            | boots    | boots    |
| `neverViewable` | `isViewable()`→false forever, `viewableChange` never true; render-surface live | hangs    | boots (render-surface fallback) |
| `lostPulse`     | a `viewableChange(true)` pulse fires while a real build's gate listener is not yet attached (lost); `isViewable()` stays false | hangs (pulse lost, no re-check) | boots (render-surface fallback / poll) |

`lateViewable` was considered and dropped: a late `viewableChange(true)` fired
AFTER the gate attaches its listener is *caught* by both the old and new gate,
so it does not discriminate. The discriminating condition is "isViewable()
never returns true / the pulse is lost" — covered by the two modes above.

Note on the in-iframe harness: the offscreen harness iframe is a real, visible,
nonzero render surface, so the robust gate boots via its **render-surface
fallback** for both hostile modes. That is sufficient for the validator's
question ("does it boot when viewable is hostile?"): old gate hangs → fail, new
gate boots → pass. (The poll path specifically matters only for a true 0×0
hidden preload, which an iframe cannot reproduce.)

Modes are data-driven (a switch on `mraidMode`); the moloco-v2 special-casing
already present stays untouched. Unknown mode → `happy`.

### 3. `src/core/preview/server.ts` (MODIFY)

- Read `?mraidMode=` from the preview request; pass it to the mock generator
  (validate/whitelist against the known set; unknown → `happy`).
- Call `scanLoaderHealth()` on the built HTML and include its checks in the
  Validate-window payload as blocking (severity `fail`) rows, alongside the
  existing regional/launcher checks.

### 4. `static/preview/preview.js` (MODIFY)

- Render the static loader-health checks (fail styling).
- **Self-driving runtime sweep**: iterate the hostile modes; for each, reload
  the preview iframe with `?mraidMode=X`, wait for the `game_ready` beacon with
  a **12s timeout** (the gate's poll budget is 50×200ms = 10s; +2s margin). No
  beacon → FAIL row ("grey screen under <mode>"). On `game_ready`, also assert
  `#GameCanvas` has non-zero width/height (catches 0×0 boot). Aggregate into the
  blocking verdict.

## Data Flow

- **Static**: server extracts HTML (zip-aware) → `scanLoaderHealth` → checks[]
  → preview UI fail rows.
- **Runtime**: preview.js drives iframe reloads with `?mraidMode=X` → server
  injects the matching mock → build boots or hangs → `game_ready` beacon or
  timeout → per-mode pass/fail → aggregate verdict.

## Error Handling

- Runtime timeout per scenario is the only "hang" signal: 12s with no
  `game_ready` = fail. The sweep continues to the next mode after a fail
  (collect all, don't stop at first).
- Static parse: an mraid build with NO `__plbx_pre_boot` at all → `gate_robust`
  fail (covers builds older than the gate's introduction). Missing version
  banner → `loader_version` fail (hard-fail mode is intentional: force a
  repackage). Non-mraid networks skip `gate_robust` only — the other two checks
  still apply.
- Unknown `mraidMode` query value → fall back to `happy` (never crash the
  preview).

## Testing

`tests/core/preview/loader-health.test.ts` (new):

- **Static, real fixtures**: lightweight HTML fixtures extracted from the real
  builds — the actual `__plbx_pre_boot` gate block, `_isVirtualScheme` function,
  and version banner, but WITHOUT the multi-MB base64 ZIP payload (the scan only
  reads those loader blocks, so the fixtures stay a few KB). The v0.2.11 fixture
  → `gate_robust`, `virtual_scheme_guarded`, `loader_version` all **fail**; the
  v0.2.21 fixture → all **pass**. Committed under `tests/fixtures/loader-health/`.
- **Per-check isolation**: hand-crafted minimal HTML snippets toggling each
  signature independently (robust gate present but virtual-scheme buggy, etc.)
  to prove the checks are orthogonal.
- **Non-mraid skip**: a non-mraid network input does not emit `gate_robust`.

Runtime-harness assertions (mode→boot expectation) are covered by a tiny
synthetic HTML that registers a broken vs robust `__plbx_pre_boot` and emits
`game_ready`, asserting the sweep flags the broken one. (Full in-browser
iframe driving is validated manually in the preview window; the synthetic test
locks the harness's pass/fail logic.)

## Out of Scope (YAGNI)

- Package-time mirror of these checks (could surface in the Build Report later;
  not required to close this incident).
- OOM / low-RAM validation — only reproducible on real low-end Android; not
  statically or mock-detectable.
- base122 weight reduction — separate lever, already shipped.

## Affected Files

- `src/core/preview/loader-health.ts` — NEW
- `src/core/preview/sdk-mocks.ts` — parameterize by `mraidMode`
- `src/core/preview/server.ts` — `?mraidMode=` wiring + emit loader-health checks
- `static/preview/preview.js` — static check rows + self-driving runtime sweep
- `tests/core/preview/loader-health.test.ts` — NEW
- `tests/fixtures/loader-health/` — NEW (v0.2.11 fail + v0.2.21 pass fixtures)
