/**
 * Kit freshness — is a newer @playbox-ai/playable-kit published, and may we install it?
 *
 * The packaging engine ships inside the extension bundle as an npm dependency
 * pinned `~0.3.x`. Validator rules change often (a network tightens a check, the
 * kit ships a patch), so a kit patch must be able to reach users without an
 * extension release. This module is the pure half: given the installed version,
 * the declared range and what npm publishes, it decides whether to offer an
 * install.
 *
 * The range dialect is deliberately tiny — `~` and exact. npm's caret has a 0.x
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
  /** Version currently in node_modules; '' if unreadable. */
  installed: string;
  /** Declared range from the extension's package.json; '' if unreadable. */
  range: string;
  /** Version to install — set only for `update-available`. */
  target: string;
  /** Highest published stable version, in range or not; '' if unknown. */
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

/** Stable semver only — a prerelease (0.4.0-rc.1) is never a candidate. */
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
  if (r.kind === 'exact') return v[0] === r.major && v[1] === r.minor && v[2] === r.patch;
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
  const base = {
    installed: input.installed || '',
    range: input.range || '',
    target: '',
    latest: '',
  };

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
  // Nothing published inside the range → installed is the best there is.
  const best = pickBestInRange(stable, base.range) ?? base.installed;

  if (compareSemver(best, base.installed) > 0) {
    return { ...base, state: 'update-available', target: best, latest };
  }
  if (compareSemver(base.installed, best) > 0) {
    // Registry lag, an unpublish, or a hand-hacked node_modules. Never downgrade.
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
