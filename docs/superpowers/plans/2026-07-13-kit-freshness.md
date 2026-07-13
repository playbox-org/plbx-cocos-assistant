# Kit Freshness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The extension notices a newer `@playbox-ai/playable-kit` on npm inside its declared pin and installs it on one click, so a packaging/validator patch reaches users without an extension release.

**Architecture:** Pure version logic (`kit-freshness.ts`) + IO (`kit-update.ts`) + three IPC methods + a banner in the existing panel bar. The install never runs npm in the extension root: it resolves the kit in a scratch dir and lands the tree *nested under the kit*, leaving the root's own `package.json`, `jszip` and on-demand `sharp` untouched.

**Tech Stack:** TypeScript, Node (child_process/https/fs), vitest. No new npm dependency.

Spec: `docs/superpowers/specs/2026-07-13-kit-freshness-design.md`

## Global Constraints

- Range dialect: `~x.y.z` and exact only. Anything else → `unknown` (fail closed). Never implement `^` (npm's caret has a `0.x` special case; a naive reading offers 0.9.x as compatible and crashes the editor).
- Never propose a downgrade: `update-available` requires strictly `compareSemver(best, installed) > 0`.
- Never write the root `package.json`. Never run `npm install` with the root as cwd.
- Never hoist the kit's dependencies into `root/node_modules` — they go under `root/node_modules/@playbox-ai/playable-kit/node_modules/`.
- Never move dot-entries (`.bin`, `.package-lock.json`) out of the scratch tree.
- Reuse, do not fork: `compareSemver` (`freshness-check.ts`), `Runner`/`defaultRunner` (`update.ts:228`).
- Every failure degrades to silence (`unknown`), never blocks packaging.
- Prereleases (`0.4.0-rc.1`) are never selected.

---

### Task 1: Pure version logic

**Files:**
- Create: `src/core/kit/kit-freshness.ts`
- Test: `tests/core/kit/kit-freshness.test.ts`

**Interfaces:**
- Consumes: `compareSemver(a: string, b: string): number` from `../freshness/freshness-check`.
- Produces:
  - `type KitState = 'fresh' | 'update-available' | 'extension-update-required' | 'ahead' | 'unknown'`
  - `interface KitVerdict { state: KitState; installed: string; range: string; target: string; latest: string; reason?: string }`
  - `parseRange(range: string): { major: number; minor: number; patch: number; kind: 'tilde' | 'exact' } | null`
  - `satisfies(version: string, range: string): boolean`
  - `pickBestInRange(versions: string[], range: string): string | null`
  - `classifyKit(input: { installed: string; range: string; published: string[] | null }): KitVerdict`
  - `formatKitBanner(v: KitVerdict): string` — `''` when there is nothing to say.

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import {
  parseRange, satisfies, pickBestInRange, classifyKit, formatKitBanner,
} from '../../../src/core/kit/kit-freshness';

describe('parseRange', () => {
  it('understands ~ and exact', () => {
    expect(parseRange('~0.3.1')).toEqual({ major: 0, minor: 3, patch: 1, kind: 'tilde' });
    expect(parseRange('0.3.1')).toEqual({ major: 0, minor: 3, patch: 1, kind: 'exact' });
  });

  it('rejects every other dialect — fail closed', () => {
    for (const r of ['^0.3.1', '>=0.3.1', '*', '0.3.x', '', 'latest']) {
      expect(parseRange(r), r).toBeNull();
    }
  });
});

describe('satisfies / pickBestInRange', () => {
  it('~0.3.1 accepts the patch line from 0.3.1 up', () => {
    expect(satisfies('0.3.1', '~0.3.1')).toBe(true);
    expect(satisfies('0.3.9', '~0.3.1')).toBe(true);
    expect(satisfies('0.3.0', '~0.3.1')).toBe(false);
    expect(satisfies('0.4.0', '~0.3.1')).toBe(false);
  });

  it('picks the highest in range and ignores prereleases', () => {
    const versions = ['0.3.1', '0.3.2', '0.3.9-beta', '0.4.0'];
    expect(pickBestInRange(versions, '~0.3.1')).toBe('0.3.2');
  });

  it('returns null when nothing is in range', () => {
    expect(pickBestInRange(['0.4.0', '0.5.0'], '~0.3.1')).toBeNull();
  });
});

describe('classifyKit', () => {
  const range = '~0.3.1';

  it('fresh when installed is the newest in range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.1', '0.3.2'] });
    expect(v.state).toBe('fresh');
    expect(v.target).toBe('');
  });

  it('update-available when a newer patch exists in range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.2', '0.3.3'] });
    expect(v.state).toBe('update-available');
    expect(v.target).toBe('0.3.3');
  });

  it('extension-update-required when the only newer version is out of range', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.3.2', '0.4.0'] });
    expect(v.state).toBe('extension-update-required');
    expect(v.target).toBe('');
    expect(v.latest).toBe('0.4.0');
  });

  it('ahead — never proposes a downgrade', () => {
    const v = classifyKit({ installed: '0.3.5', range, published: ['0.3.1', '0.3.3'] });
    expect(v.state).toBe('ahead');
    expect(v.target).toBe('');
  });

  it('ahead when installed sits outside the range entirely', () => {
    const v = classifyKit({ installed: '0.4.0', range, published: ['0.3.3', '0.4.0'] });
    expect(v.state).toBe('ahead');
  });

  it('empty in-range set does not crash and offers nothing', () => {
    const v = classifyKit({ installed: '0.3.2', range, published: ['0.4.0'] });
    expect(v.state).toBe('extension-update-required');
    expect(v.target).toBe('');
  });

  it('unknown on unreadable installed / unsupported range / no registry', () => {
    expect(classifyKit({ installed: '', range, published: ['0.3.3'] }).state).toBe('unknown');
    expect(classifyKit({ installed: '0.3.2', range: '^0.3.1', published: ['0.3.3'] }).state).toBe('unknown');
    expect(classifyKit({ installed: '0.3.2', range, published: null }).state).toBe('unknown');
  });
});

describe('formatKitBanner', () => {
  it('speaks only when there is something to offer', () => {
    const upd = classifyKit({ installed: '0.3.2', range: '~0.3.1', published: ['0.3.3'] });
    expect(formatKitBanner(upd)).toContain('0.3.3');
    const fresh = classifyKit({ installed: '0.3.2', range: '~0.3.1', published: ['0.3.2'] });
    expect(formatKitBanner(fresh)).toBe('');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/kit/kit-freshness.test.ts`
Expected: FAIL — cannot resolve `src/core/kit/kit-freshness`.

- [ ] **Step 3: Implement**

```ts
/**
 * Kit freshness — is a newer @playbox-ai/playable-kit published, and may we install it?
 *
 * The packaging engine ships inside the extension bundle as an npm dependency
 * pinned `~0.3.x`. Validator rules change often, so a kit patch must be able to
 * reach users without an extension release. This module is the pure half: given
 * the installed version, the declared range and what npm publishes, it decides
 * whether to offer an install.
 *
 * Range dialect is deliberately tiny — `~` and exact. npm's caret has a 0.x
 * special case (`^0.3.1` means `<0.4.0`, NOT `<1.0.0`); a naive "same major"
 * reading would offer 0.9.x as compatible and crash the editor, since a 0.x minor
 * is allowed to break the API. Anything we don't understand fails closed.
 */
import { compareSemver } from '../freshness/freshness-check';

export type KitState =
  | 'fresh'
  | 'update-available'
  | 'extension-update-required'
  | 'ahead'
  | 'unknown';

export interface KitVerdict {
  state: KitState;
  /** Version currently in node_modules, '' if unreadable. */
  installed: string;
  /** Declared range from the extension's package.json, '' if unreadable. */
  range: string;
  /** Version to install — set only for `update-available`. */
  target: string;
  /** Highest published stable version, in range or not. '' if unknown. */
  latest: string;
  reason?: string;
}

export interface ParsedRange {
  major: number;
  minor: number;
  patch: number;
  kind: 'tilde' | 'exact';
}

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/** Stable semver only — a prerelease (0.4.0-rc.1) is not a candidate. */
function parseVersion(v: string): [number, number, number] | null {
  const m = (v || '').trim().match(VERSION_RE);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

export function parseRange(range: string): ParsedRange | null {
  const raw = (range || '').trim();
  const kind: 'tilde' | 'exact' = raw.startsWith('~') ? 'tilde' : 'exact';
  const p = parseVersion(kind === 'tilde' ? raw.slice(1) : raw);
  if (!p) return null;
  return { major: p[0], minor: p[1], patch: p[2], kind };
}

/** `~0.3.1` → >=0.3.1 <0.4.0. Exact → that version only. */
export function satisfies(version: string, range: string): boolean {
  const r = parseRange(range);
  const v = parseVersion(version);
  if (!r || !v) return false;
  if (r.kind === 'exact') return compareSemver(version, `${r.major}.${r.minor}.${r.patch}`) === 0;
  if (v[0] !== r.major || v[1] !== r.minor) return false;
  return v[2] >= r.patch;
}

export function pickBestInRange(versions: string[], range: string): string | null {
  let best: string | null = null;
  for (const v of versions) {
    if (!satisfies(v, range)) continue;
    if (best === null || compareSemver(v, best) > 0) best = v;
  }
  return best;
}

function pickLatest(versions: string[]): string {
  let best = '';
  for (const v of versions) {
    if (!parseVersion(v)) continue;
    if (!best || compareSemver(v, best) > 0) best = v;
  }
  return best;
}

export interface ClassifyKitInput {
  installed: string;
  range: string;
  /** Published versions from the registry; null when it could not be reached. */
  published: string[] | null;
}

export function classifyKit(input: ClassifyKitInput): KitVerdict {
  const base = { installed: input.installed || '', range: input.range || '', target: '', latest: '' };

  if (!parseVersion(base.installed)) {
    return { ...base, state: 'unknown', reason: 'installed kit version unreadable' };
  }
  if (!parseRange(base.range)) {
    return { ...base, state: 'unknown', reason: `unsupported dependency range "${base.range}"` };
  }
  if (!input.published) {
    return { ...base, state: 'unknown', reason: 'npm registry unreachable' };
  }

  const stable = input.published.filter((v) => parseVersion(v));
  const latest = pickLatest(stable);
  // No published version inside the range → treat installed as the best there is.
  const best = pickBestInRange(stable, base.range) ?? base.installed;

  if (compareSemver(best, base.installed) > 0) {
    return { ...base, state: 'update-available', target: best, latest };
  }
  if (compareSemver(base.installed, best) > 0) {
    return { ...base, state: 'ahead', latest };
  }
  if (latest && compareSemver(latest, base.installed) > 0) {
    return { ...base, state: 'extension-update-required', latest };
  }
  return { ...base, state: 'fresh', latest };
}

/** Banner text; '' when the user has nothing to act on. */
export function formatKitBanner(v: KitVerdict): string {
  if (v.state === 'update-available') {
    return `Packaging kit ${v.target} is available (installed ${v.installed}).`;
  }
  if (v.state === 'extension-update-required') {
    return `Packaging kit ${v.latest} needs a newer extension — update the extension to get it.`;
  }
  return '';
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/core/kit/kit-freshness.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/kit/kit-freshness.ts tests/core/kit/kit-freshness.test.ts
git commit -m "feat(kit): pure freshness logic for the packaging kit"
```

---

### Task 2: Make the npm runner work on Windows

The existing `defaultRunner` cannot run npm on Windows (`execFile('npm')` won't find `npm.cmd`, and `augmentedEnv` splits `PATH` on `':'`, shredding `C:\…`). The one-click `npm install sharp` is already broken there; this feature depends on the same runner, so fix it here rather than build on it.

**Files:**
- Modify: `src/core/updater/update.ts:220-241`
- Test: `tests/core/updater/runner-platform.test.ts`

**Interfaces:**
- Produces: `npmCmd(platform?: NodeJS.Platform): string`, `augmentedEnv(platform?: NodeJS.Platform, env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv` — both exported for the test.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { npmCmd, augmentedEnv } from '../../../src/core/updater/update';

describe('npm runner is platform-aware', () => {
  it('resolves npm.cmd on Windows, npm elsewhere', () => {
    expect(npmCmd('win32')).toBe('npm.cmd');
    expect(npmCmd('darwin')).toBe('npm');
    expect(npmCmd('linux')).toBe('npm');
  });

  it('leaves Windows PATH untouched — splitting it on ":" would shred C:\\…', () => {
    const env = { PATH: 'C:\\Program Files\\nodejs;C:\\Windows\\system32' };
    expect(augmentedEnv('win32', env).PATH).toBe(env.PATH);
  });

  it('still repairs the macOS GUI PATH', () => {
    const out = augmentedEnv('darwin', { PATH: '/usr/bin' }).PATH || '';
    expect(out.split(':')).toContain('/opt/homebrew/bin');
    expect(out.split(':')).toContain('/usr/bin');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/updater/runner-platform.test.ts`
Expected: FAIL — `npmCmd` is not exported.

- [ ] **Step 3: Implement**

Replace `augmentedEnv` and `defaultRunner` in `src/core/updater/update.ts`:

```ts
/**
 * Cocos launched from the macOS GUI inherits a trimmed PATH without the usual
 * node/npm locations, so we widen it. Windows is left alone on purpose: its PATH
 * separator is ';', and splitting on ':' would shred every "C:\..." entry.
 */
export function augmentedEnv(
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  if (platform === 'win32') return { ...env };
  const extra = ['/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'];
  const current = (env.PATH || '').split(':');
  const path = [...new Set([...current, ...extra])].filter(Boolean).join(':');
  return { ...env, PATH: path };
}

/** On Windows npm is a .cmd shim — execFile cannot spawn it without a shell. */
export function npmCmd(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

/** execFile-based command runner (the on-demand `npm install sharp` + kit install). */
export function defaultRunner(repoRoot: string): Runner {
  return (cmd, args) =>
    new Promise((resolve) => {
      execFile(
        cmd,
        args,
        {
          cwd: repoRoot,
          env: augmentedEnv(),
          maxBuffer: 16 * 1024 * 1024,
          timeout: 300000,
          windowsHide: true,
          // Node refuses to spawn a .cmd without a shell (CVE-2024-27980). Every
          // argument we pass is a literal or a /^\d+\.\d+\.\d+$/-validated version.
          shell: process.platform === 'win32',
        },
        (err, stdout, stderr) => {
          const output = (stdout?.toString() || '') + (stderr?.toString() || '');
          resolve({ ok: !err, output: output.trim() });
        },
      );
    });
}
```

Then update the two existing npm call sites to go through `npmCmd()`:
- `src/core/compression/sharp-status.ts` → `run(npmCmd(), ['install', 'sharp'])` (import `npmCmd` from `../updater/update`).

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/core/updater tests/core/compression`
Expected: PASS (existing sharp tests assert the command string — update them to `npmCmd()` if they hardcode `'npm'`).

- [ ] **Step 5: Commit**

```bash
git add src/core/updater/update.ts src/core/compression/sharp-status.ts tests/core/updater/runner-platform.test.ts
git commit -m "fix(updater): platform-aware npm runner — npm.cmd + intact PATH on Windows"
```

---

### Task 3: Kit install IO — scratch resolve, nested placement

**Files:**
- Create: `src/core/kit/kit-update.ts`
- Test: `tests/core/kit/kit-update.test.ts`

**Interfaces:**
- Consumes: `Runner`, `defaultRunner`, `npmCmd` from `../updater/update`; `KitVerdict` from `./kit-freshness`.
- Produces:
  - `KIT_PKG = '@playbox-ai/playable-kit'`
  - `readInstalledKitVersion(root: string): string`
  - `readDeclaredRange(root: string): string`
  - `fetchKitVersions(): Promise<string[] | null>`
  - `interface FsOps { readdir(dir: string): string[]; exists(p: string): boolean; mkdirp(dir: string): void; move(from: string, to: string): void; rimraf(dir: string): void }`
  - `placeKitTree(scratchNodeModules: string, rootNodeModules: string, fs: FsOps): void`
  - `interface KitInstallIO { isDevImport(): boolean; writeManifest(dir: string, contents: string): void; makeRunner(cwd: string): Runner; fs: FsOps; scratchDir(root: string): string }`
  - `installKit(root: string, version: string, io: KitInstallIO): Promise<{ ok: boolean; output: string; message: string }>`
  - `defaultKitInstallIO(): KitInstallIO`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { placeKitTree, installKit, KIT_PKG } from '../../../src/core/kit/kit-update';
import { realFsOps } from '../../../src/core/kit/kit-update';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'plbx-kit-'));
}

describe('placeKitTree', () => {
  it('nests the kit deps under the kit and never touches the root copies', () => {
    const root = tmp();
    const rootNm = join(root, 'node_modules');
    const scratchNm = join(root, '.scratch', 'node_modules');

    // Root already has its own jszip 3 + an on-demand sharp + an old kit.
    mkdirSync(join(rootNm, 'jszip'), { recursive: true });
    writeFileSync(join(rootNm, 'jszip', 'package.json'), '{"version":"3.10.1"}');
    mkdirSync(join(rootNm, 'sharp'), { recursive: true });
    mkdirSync(join(rootNm, KIT_PKG, 'dist'), { recursive: true });
    writeFileSync(join(rootNm, KIT_PKG, 'dist', 'gone.js'), 'old file');

    // Scratch: npm resolved the kit + a NEWER jszip for it, plus dot-entries.
    mkdirSync(join(scratchNm, KIT_PKG), { recursive: true });
    writeFileSync(join(scratchNm, KIT_PKG, 'package.json'), '{"version":"0.3.3"}');
    mkdirSync(join(scratchNm, 'jszip'), { recursive: true });
    writeFileSync(join(scratchNm, 'jszip', 'package.json'), '{"version":"4.0.0"}');
    mkdirSync(join(scratchNm, '.bin'), { recursive: true });
    writeFileSync(join(scratchNm, '.package-lock.json'), '{}');

    placeKitTree(scratchNm, rootNm, realFsOps);

    // Kit replaced wholesale — no orphan from the old version.
    expect(JSON.parse(readFileSync(join(rootNm, KIT_PKG, 'package.json'), 'utf8')).version).toBe('0.3.3');
    expect(existsSync(join(rootNm, KIT_PKG, 'dist', 'gone.js'))).toBe(false);

    // The kit's jszip is nested under it; the ROOT jszip is untouched.
    const nested = join(rootNm, KIT_PKG, 'node_modules', 'jszip', 'package.json');
    expect(JSON.parse(readFileSync(nested, 'utf8')).version).toBe('4.0.0');
    expect(JSON.parse(readFileSync(join(rootNm, 'jszip', 'package.json'), 'utf8')).version).toBe('3.10.1');

    // Dot-entries never leave the scratch tree; sharp survives.
    expect(existsSync(join(rootNm, '.bin'))).toBe(false);
    expect(existsSync(join(rootNm, '.package-lock.json'))).toBe(false);
    expect(existsSync(join(rootNm, 'sharp'))).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });
});

describe('installKit', () => {
  const okIo = (calls: any[], devImport = false) => ({
    isDevImport: () => devImport,
    writeManifest: (dir: string, contents: string) => calls.push({ manifest: { dir, contents } }),
    makeRunner: (cwd: string) => async (cmd: string, args: string[]) => {
      calls.push({ run: { cmd, args, cwd } });
      return { ok: true, output: 'added 12 packages' };
    },
    fs: {
      readdir: () => [],
      exists: () => true,
      mkdirp: (d: string) => calls.push({ mkdirp: d }),
      move: (from: string, to: string) => calls.push({ move: [from, to] }),
      rimraf: (d: string) => calls.push({ rimraf: d }),
    },
    scratchDir: (root: string) => join(root, '.plbx-kit-staged'),
  });

  it('resolves in a scratch dir with a minimal manifest and the safe flags', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3', okIo(calls) as any);

    expect(r.ok).toBe(true);
    const manifest = calls.find((c) => c.manifest);
    expect(manifest.manifest.dir).toBe(join('/ext', '.plbx-kit-staged'));
    expect(JSON.parse(manifest.manifest.contents)).toEqual({
      dependencies: { '@playbox-ai/playable-kit': '0.3.3' },
    });

    const run = calls.find((c) => c.run).run;
    expect(run.cwd).toBe(join('/ext', '.plbx-kit-staged'));
    expect(run.args).toEqual([
      'install', '--no-package-lock', '--ignore-scripts', '--no-audit', '--no-fund',
    ]);
  });

  it('refuses a Developer Import — never mutates a working tree', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3', okIo(calls, true) as any);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('npm update @playbox-ai/playable-kit');
    expect(calls.find((c) => c.run)).toBeUndefined();
  });

  it('rejects a non-semver version before spawning anything', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3 && rm -rf /', okIo(calls) as any);
    expect(r.ok).toBe(false);
    expect(calls.find((c) => c.run)).toBeUndefined();
  });

  it('does not touch node_modules when npm fails', async () => {
    const calls: any[] = [];
    const io: any = okIo(calls);
    io.makeRunner = () => async () => ({ ok: false, output: 'ENOTFOUND registry.npmjs.org' });
    const r = await installKit('/ext', '0.3.3', io);
    expect(r.ok).toBe(false);
    expect(calls.find((c) => c.move)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/core/kit/kit-update.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Kit install — resolve a newer @playbox-ai/playable-kit and land it in the
 * extension's node_modules WITHOUT running npm in the extension root.
 *
 * Why not just `npm install @playbox-ai/playable-kit@X` there: the release bundle
 * ships the real package.json (devDependencies, optionalDependencies: sharp, and a
 * `npm rebuild sharp` postinstall — see .github/workflows/release.yml), while its
 * node_modules is built from a throwaway prod-only manifest that never enters the
 * zip, and there is no lockfile. A plain install in that root would reify the FULL
 * ideal tree — playwright (whose postinstall downloads browsers), typescript,
 * vitest — and npm's default --save would rewrite the very pin we read.
 *
 * So: resolve the kit in a scratch dir, then move its tree in NESTED under the kit
 * itself. jszip is a shared dependency (preview/server.ts, and update.ts requires
 * it inside the updater); a hoisted overlay would eventually upgrade the root's
 * copy out from under code that never declared that version. Nesting keeps the
 * kit's resolution private to the kit.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync, cpSync } from 'fs';
import { get as httpsGet } from 'https';
import { join, dirname } from 'path';
import { Runner, defaultRunner, npmCmd } from '../updater/update';

export const KIT_PKG = '@playbox-ai/playable-kit';

const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** Installed version — read the file: the kit's `exports` map does not expose
 *  ./package.json, so require() throws ERR_PACKAGE_PATH_NOT_EXPORTED. */
export function readInstalledKitVersion(root: string): string {
  try {
    const p = join(root, 'node_modules', KIT_PKG, 'package.json');
    return JSON.parse(readFileSync(p, 'utf8')).version || '';
  } catch {
    return '';
  }
}

/** Declared range from the extension's own package.json (the bundle ships it). */
export function readDeclaredRange(root: string): string {
  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    return pkg?.dependencies?.[KIT_PKG] || '';
  } catch {
    return '';
  }
}

/** Published versions from npm. Abbreviated metadata — the full document grows
 *  with every publish. Resolves null on any failure so the check degrades to
 *  `unknown` rather than throwing. */
export function fetchKitVersions(): Promise<string[] | null> {
  return new Promise((resolve) => {
    const req = httpsGet(
      {
        host: 'registry.npmjs.org',
        path: '/' + KIT_PKG.replace('/', '%2f'),
        headers: {
          'User-Agent': 'plbx-cocos-extension',
          Accept: 'application/vnd.npm.install-v1+json',
        },
        timeout: 6000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          resolve(null);
          return;
        }
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => {
          try {
            const j = JSON.parse(body);
            const versions = j?.versions ? Object.keys(j.versions) : null;
            resolve(Array.isArray(versions) ? versions : null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

export interface FsOps {
  readdir(dir: string): string[];
  exists(p: string): boolean;
  mkdirp(dir: string): void;
  move(from: string, to: string): void;
  rimraf(dir: string): void;
}

export const realFsOps: FsOps = {
  readdir: (dir) => (existsSync(dir) ? readdirSync(dir) : []),
  exists: (p) => existsSync(p),
  mkdirp: (dir) => mkdirSync(dir, { recursive: true }),
  move: (from, to) => {
    mkdirSync(dirname(to), { recursive: true });
    try {
      renameSync(from, to);
    } catch {
      // Cross-device (scratch on another volume) — fall back to copy + drop.
      cpSync(from, to, { recursive: true, force: true });
      rmSync(from, { recursive: true, force: true });
    }
  },
  rimraf: (dir) => rmSync(dir, { recursive: true, force: true }),
};

/**
 * Move the scratch tree into place: the kit replaces the installed one wholesale
 * (rimraf first — a shrunk file list must not leave orphans), and everything else
 * npm resolved for it goes UNDER the kit, not into the root. Dot-entries (.bin, a
 * hidden .package-lock.json) stay behind: a hidden lockfile in root/node_modules
 * would become authoritative for any later npm run in the root — including the
 * one-click `npm install sharp` — and could prune the tree.
 */
export function placeKitTree(scratchNodeModules: string, rootNodeModules: string, fs: FsOps): void {
  const destKit = join(rootNodeModules, KIT_PKG);
  fs.rimraf(destKit);
  fs.mkdirp(dirname(destKit));
  fs.move(join(scratchNodeModules, KIT_PKG), destKit);

  const nested = join(destKit, 'node_modules');
  fs.mkdirp(nested);

  for (const entry of fs.readdir(scratchNodeModules)) {
    if (entry.startsWith('.')) continue; // .bin, .package-lock.json
    if (entry === '@playbox-ai') continue; // the kit itself, already moved
    const to = join(nested, entry);
    if (fs.exists(to)) continue; // npm nested a conflicting copy under the kit — keep it
    fs.move(join(scratchNodeModules, entry), to);
  }
}

export interface KitInstallIO {
  /** A Developer Import (git checkout) — self-update refuses there and so do we. */
  isDevImport(): boolean;
  writeManifest(dir: string, contents: string): void;
  makeRunner(cwd: string): Runner;
  fs: FsOps;
  scratchDir(root: string): string;
}

export function defaultKitInstallIO(): KitInstallIO {
  return {
    isDevImport: () => existsSync(join(process.cwd(), '.git')),
    writeManifest: (dir, contents) => {
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'package.json'), contents);
    },
    makeRunner: (cwd) => defaultRunner(cwd),
    fs: realFsOps,
    scratchDir: (root) => join(root, '.plbx-kit-staged'),
  };
}

export interface KitInstallResult {
  ok: boolean;
  output: string;
  message: string;
}

export async function installKit(
  root: string,
  version: string,
  io: KitInstallIO,
): Promise<KitInstallResult> {
  if (!VERSION_RE.test(version)) {
    return { ok: false, output: '', message: `Refusing to install a non-semver version "${version}".` };
  }
  if (io.isDevImport()) {
    return {
      ok: false,
      output: '',
      message:
        'This is a Developer Import — updating the kit here would rewrite your working tree. ' +
        'Run "npm update @playbox-ai/playable-kit" in the extension folder instead.',
    };
  }

  const scratch = io.scratchDir(root);
  io.fs.rimraf(scratch);
  try {
    io.writeManifest(scratch, JSON.stringify({ dependencies: { [KIT_PKG]: version } }, null, 2));

    const run = io.makeRunner(scratch);
    const r = await run(npmCmd(), [
      'install',
      '--no-package-lock',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);
    if (!r.ok) {
      return {
        ok: false,
        output: r.output,
        message: `Kit install failed. Check your network, or run "npm install ${KIT_PKG}@${version}" manually.`,
      };
    }

    placeKitTree(join(scratch, 'node_modules'), join(root, 'node_modules'), io.fs);
    return {
      ok: true,
      output: r.output,
      message: `Packaging kit ${version} installed — reload the editor to use it.`,
    };
  } catch (e: any) {
    return { ok: false, output: '', message: 'Kit install failed: ' + (e?.message || String(e)) };
  } finally {
    io.fs.rimraf(scratch);
  }
}
```

Note `defaultKitInstallIO().isDevImport` must test the extension root, not `process.cwd()` — take the root as a parameter: `defaultKitInstallIO(root)` with `isDevImport: () => existsSync(join(root, '.git'))`.

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/core/kit/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/core/kit/kit-update.ts tests/core/kit/kit-update.test.ts
git commit -m "feat(kit): scratch-resolved install, nested under the kit"
```

---

### Task 4: IPC — check, start, poll

**Files:**
- Modify: `src/main.ts` (job state next to `_updateState`/`_sharpInstallState`; methods next to `checkFreshness`)
- Modify: `package.json` (`contributions.messages`)
- Test: `tests/core/kit/kit-ipc.test.ts` (guards only — the IPC surface itself is glue)

**Interfaces:**
- Consumes: `classifyKit`, `formatKitBanner` (Task 1); `readInstalledKitVersion`, `readDeclaredRange`, `fetchKitVersions`, `installKit`, `defaultKitInstallIO` (Task 3).
- Produces IPC: `checkKitVersion(force?: boolean) → { verdict: KitVerdict; banner: string; canInstall: boolean }`, `startKitUpdate() → { running: boolean }`, `getKitUpdateState() → { running: boolean; result: KitInstallResult | null }`.

- [ ] **Step 1: Add the state + methods to `src/main.ts`**

```ts
// ── Packaging-kit freshness ────────────────────────────────────────────────
// The kit is an npm dependency that ships inside the bundle, so a validator patch
// can reach users without an extension release. Cached like the extension check —
// the npm registry has no business being polled on every panel open.
const KIT_TTL_MS = 10 * 60 * 1000;
let _kitCache: { at: number; payload: any } | null = null;

let _kitInstallState: { running: boolean; result: any | null } = { running: false, result: null };

async function getKitFreshness(force: boolean) {
  if (!force && _kitCache && Date.now() - _kitCache.at < KIT_TTL_MS) return _kitCache.payload;
  const verdict = classifyKit({
    installed: readInstalledKitVersion(REPO_ROOT),
    range: readDeclaredRange(REPO_ROOT),
    published: await fetchKitVersions(),
  });
  const payload = {
    verdict,
    banner: formatKitBanner(verdict),
    canInstall: verdict.state === 'update-available' && !existsSync(join(REPO_ROOT, '.git')),
  };
  _kitCache = { at: Date.now(), payload };
  return payload;
}

function startKitInstall(): { running: boolean; refused?: string } {
  // Both jobs write node_modules — never let them overlap.
  if (_kitInstallState.running) return { running: true };
  if (_updateState.running) return { running: false, refused: 'An extension update is already running.' };

  _kitInstallState = { running: true, result: null };
  void getKitFreshness(false)
    .then((p) => {
      if (p.verdict.state !== 'update-available') {
        return { ok: false, output: '', message: 'No kit update available.' };
      }
      return installKit(REPO_ROOT, p.verdict.target, defaultKitInstallIO(REPO_ROOT));
    })
    .then((result) => {
      _kitInstallState = { running: false, result };
      if (result.ok) _kitCache = null; // otherwise the banner lingers for 10 minutes
      console.log('[plbx] kit install:', result.message);
    })
    .catch((e) => {
      _kitInstallState = {
        running: false,
        result: { ok: false, output: '', message: 'Kit install crashed: ' + (e?.message || String(e)) },
      };
    });
  return { running: true };
}
```

Guard the extension updater against the reverse overlap — in `startExtensionUpdate()`, right after the existing re-entrancy check:

```ts
  if (_kitInstallState.running) return { running: false } as any;
```

Methods (next to `checkFreshness`):

```ts
  /** Is a newer packaging kit published inside our pin? Cached 10 min; `force` re-checks. */
  async checkKitVersion(force?: boolean) {
    try {
      return await getKitFreshness(force === true);
    } catch (e: any) {
      return {
        verdict: { state: 'unknown', installed: '', range: '', target: '', latest: '', reason: e?.message || String(e) },
        banner: '',
        canInstall: false,
      };
    }
  },

  /** Kick off the kit install; returns immediately. Poll getKitUpdateState. */
  startKitUpdate() {
    return startKitInstall();
  },

  getKitUpdateState() {
    return _kitInstallState;
  },
```

- [ ] **Step 2: Register the three messages in `package.json` `contributions.messages`**

```json
      "checkKitVersion": { "methods": ["checkKitVersion"] },
      "startKitUpdate": { "methods": ["startKitUpdate"] },
      "getKitUpdateState": { "methods": ["getKitUpdateState"] },
```

- [ ] **Step 3: Build and run the suite**

Run: `npm run build && npx vitest run`
Expected: tsc clean, all tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts package.json
git commit -m "feat(kit): IPC — checkKitVersion, startKitUpdate, getKitUpdateState"
```

---

### Task 5: Panel banner

**Files:**
- Modify: `src/panels/default.ts` (`_initFreshness`, ~line 346-436)
- Modify: `src/core/i18n/locales.ts` (en/ru/zh)

- [ ] **Step 1: Extend the button state machine**

The bar and button are shared with the extension updater. Precedence: if the extension itself is `behind`, that banner wins and the kit banner is suppressed — the newer bundle carries a newer kit anyway. Otherwise (`fresh`/`ahead`/`unknown`) the kit banner may show.

In `_initFreshness`, after the existing `checkFreshness` call:

```ts
      Editor.Message.request('plbx-cocos-extension', 'checkFreshness')
        .then((res: any) => {
          const action = res?.action;
          if (action?.notify) {
            setBar(action.message, action.severity);
            return; // extension update wins the bar
          }
          return Editor.Message.request('plbx-cocos-extension', 'checkKitVersion').then((kit: any) => {
            if (!kit?.banner) return;
            if (!kit.canInstall) {
              // Developer Import, or an out-of-range kit: message only, no button.
              setBar(kit.banner, 'info');
              if (btn) btn.hidden = true;
              return;
            }
            setBar(kit.banner, 'info');
            if (btn) {
              btn.hidden = false;
              mode = 'kit';
              btn.textContent = translate(this._lang || 'en', 'settings.updateKit');
            }
          });
        })
        .catch(() => {});
```

`mode` becomes `'update' | 'kit' | 'restart'`; the click handler gains:

```ts
        btn.addEventListener('click', () => {
          if (mode === 'restart') promptRestart();
          else if (mode === 'kit') startKitUpdate();
          else startUpdate();
        });
```

and `startKitUpdate` mirrors `startUpdate` — disable the button, poll `getKitUpdateState` every second, and on success flip to restart:

```ts
        const startKitUpdate = () => {
          btn.disabled = true;
          btn.textContent = translate(this._lang || 'en', 'settings.updating');
          setBar(translate(this._lang || 'en', 'settings.updatingKit'), 'warn');
          Editor.Message.request('plbx-cocos-extension', 'startKitUpdate').catch(() => {});
          const poll = setInterval(async () => {
            let state: any;
            try {
              state = await Editor.Message.request('plbx-cocos-extension', 'getKitUpdateState');
            } catch {
              return;
            }
            if (!state || state.running) return;
            clearInterval(poll);
            const result = state.result || { ok: false, message: 'No result.' };
            btn.disabled = false;
            setBar((result.ok ? '✓ ' : '✗ ') + result.message, result.ok ? 'info' : 'warn');
            if (result.ok) {
              mode = 'restart';
              btn.textContent = translate(this._lang || 'en', 'settings.restartEditor');
              promptRestart();
            } else {
              btn.textContent = translate(this._lang || 'en', 'settings.retry');
            }
          }, 1000);
        };
```

- [ ] **Step 2: Add the i18n keys** (flat — Cocos namespaces them by extension name)

```ts
    'settings.updateKit': 'Update packaging kit',
    'settings.updatingKit': 'Installing packaging kit…',
```
ru: `'Обновить движок паковки'` / `'Установка движка паковки…'`
zh: `'更新打包内核'` / `'正在安装打包内核…'`

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: tsc clean.

- [ ] **Step 4: Commit**

```bash
git add src/panels/default.ts src/core/i18n/locales.ts
git commit -m "feat(kit): panel banner + one-click kit update"
```

---

### Task 6: Verify against a real install, then release

- [ ] **Step 1: Prove the install on a packaged copy, not just in tests**

Simulate what a user has: copy the v0.4.0 release bundle to a temp dir (it has no `.git`, so it is a packaged copy), downgrade its kit to 0.3.1, run the install path against it, and check the tree.

```bash
S=/tmp/plbx-kit-verify && rm -rf $S && mkdir -p $S
gh release download v0.4.0 -p "*.zip" -D $S && unzip -q $S/*.zip -d $S/ext
node -e "
  const { installKit, defaultKitInstallIO, readInstalledKitVersion } = require('./dist/core/kit/kit-update');
  const root = '$S/ext';
  installKit(root, '0.3.2', defaultKitInstallIO(root)).then(r => {
    console.log(r.message);
    console.log('installed:', readInstalledKitVersion(root));
  });
"
```

Expected: `installed: 0.3.2`; `ext/node_modules/@playbox-ai/playable-kit/node_modules/` holds the kit's deps; `ext/node_modules/jszip` unchanged; no `playwright` anywhere; `ext/package.json` byte-identical to before.

- [ ] **Step 2: Manual check in the editor** — open the panel with a stale kit; the banner offers the update; click it; confirm the restart prompt; after reload the banner is gone.

- [ ] **Step 3: Update CLAUDE.md** — the "Releases & self-update" section gains the kit channel (check → offer → scratch-resolve → nested install; Developer Import refuses).

- [ ] **Step 4: Bump, tag, release** — per the repo rule: bump `package.json`, `gh release create vX.Y.Z --notes-file …` (highlights + commits since the last release).

---

## Self-Review

- Spec coverage: five verdict states (T1), range dialect + prereleases + empty in-range set (T1), scratch-manifest install + nested placement + dot-entries (T3), Windows runner (T2), cache invalidation + cross-guards (T4), banner precedence + restart prompt (T5), real-install verification (T6). No gaps.
- Names are consistent across tasks: `classifyKit`/`formatKitBanner`/`installKit`/`placeKitTree`/`defaultKitInstallIO(root)`/`npmCmd`.
- `defaultKitInstallIO` takes `root` (the draft in Task 3 body notes the fix explicitly).
