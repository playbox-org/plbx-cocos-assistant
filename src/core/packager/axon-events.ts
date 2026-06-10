import * as fs from 'fs';
import { join, extname } from 'path';

/**
 * AppLovin "Axon" playable-analytics event conformance.
 *
 * Spec: https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration
 *
 * The playable fires analytics through the SDK-provided global:
 *   if (typeof window.ALPlayableAnalytics != 'undefined') {
 *     window.ALPlayableAnalytics.trackEvent('DISPLAYED');
 *   }
 *
 * Rules we can statically/dynamically check:
 *   - Only the predefined event names below are accepted ("AppLovin does not
 *     track custom events") — any other literal is a typo or an unsupported
 *     custom event.
 *   - DISPLAYED is the only mandatory event.
 *   - LOADING and LOADED are a pair: fire both, or neither.
 *   - If CHALLENGE_STARTED is used, at least one of CHALLENGE_SOLVED /
 *     CHALLENGE_FAILED / CHALLENGE_RETRY must be used.
 *   - The creative must NOT define ALPlayableAnalytics itself — the SDK does.
 *
 * These events are authored by the game developer; the packager never injects
 * them. So the package-time gate is advisory (warn-only) — see packager.ts.
 */

/** AppLovin Axon playable-analytics event spec documentation. */
export const AXON_SPEC_URL =
  'https://support.axon.ai/en/growth/promoting-your-apps/creatives/playable-analytics-integration';

/** Canonical Axon playable-analytics event names (spec, in lifecycle order). */
export const AXON_EVENTS = [
  'LOADING',
  'LOADED',
  'DISPLAYED',
  'CHALLENGE_STARTED',
  'CHALLENGE_FAILED',
  'CHALLENGE_RETRY',
  'CHALLENGE_PASS_25',
  'CHALLENGE_PASS_50',
  'CHALLENGE_PASS_75',
  'CHALLENGE_SOLVED',
  'CTA_CLICKED',
  'ENDCARD_SHOWN',
] as const;

export type AxonEvent = (typeof AXON_EVENTS)[number];

const AXON_EVENT_SET: ReadonlySet<string> = new Set(AXON_EVENTS);

/** Any one of these satisfies the CHALLENGE_STARTED → completion requirement. */
const CHALLENGE_COMPLETION_EVENTS = ['CHALLENGE_SOLVED', 'CHALLENGE_FAILED', 'CHALLENGE_RETRY'] as const;

/** File extensions we treat as text/source and scan for trackEvent() calls. */
const SCANNABLE_EXTENSIONS = new Set(['.js', '.json', '.html', '.txt']);

// trackEvent('NAME') / "NAME" / `NAME` — capture the literal verbatim (including
// non-spec names) so validateAxonEvents() can flag typos and custom events.
const TRACK_EVENT_RE = /trackEvent\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;

// Assignment to ALPlayableAnalytics (defining it). The negative lookahead skips
// the comparison operators in defensive guards: `ALPlayableAnalytics != x`,
// `=== x`, `== x` — only a real `ALPlayableAnalytics = ...` assignment matches.
const REDEFINE_RE = /ALPlayableAnalytics\s*=(?![=])/;

export interface AxonUsage {
  /** Distinct trackEvent() event-name literals found, in first-seen order. */
  events: string[];
  /**
   * Whether the source assigns/redefines window.ALPlayableAnalytics (spec
   * forbids it). Optional: omitted for runtime usage (preview), where it can't
   * be determined — validateAxonEvents() then skips the redefinition check.
   */
  redefinesAnalytics?: boolean;
}

export interface AxonCheck {
  id: string;
  label: string;
  ok: boolean;
  /** 'error' = near-certain bug (typo/custom name); 'warn' = spec recommendation. */
  level: 'error' | 'warn';
  /** Human-readable explanation, present when !ok. */
  detail?: string;
}

/**
 * Recursively scan a build directory's source files for Axon analytics usage:
 * the distinct trackEvent() event-name literals and whether the source
 * (re)defines ALPlayableAnalytics. Returns empty usage for a missing/unreadable
 * directory (never throws). Mirrors store-url-extractor's source-scan approach —
 * the literals live in the game's plaintext JS, not the base64-zipped payload.
 */
export function extractAxonUsage(buildDir: string): AxonUsage {
  const events: string[] = [];
  const seen = new Set<string>();
  let redefinesAnalytics = false;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // missing/unreadable dir — skip silently
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SCANNABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;

      let content: string;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue; // unreadable file — skip
      }

      let m: RegExpExecArray | null;
      TRACK_EVENT_RE.lastIndex = 0;
      while ((m = TRACK_EVENT_RE.exec(content)) !== null) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        events.push(name);
      }

      if (!redefinesAnalytics && REDEFINE_RE.test(content)) {
        redefinesAnalytics = true;
      }
    }
  };

  walk(buildDir);

  return { events, redefinesAnalytics };
}

/**
 * Validate a set of Axon events against the spec. Pure — used by both the
 * package-time gate (static source scan) and the preview panel (runtime fired
 * events). Conditional rules only emit a check when their trigger event is
 * present, so the checklist stays free of irrelevant "n/a — pass" noise.
 */
export function validateAxonEvents(usage: AxonUsage): AxonCheck[] {
  const checks: AxonCheck[] = [];
  const { events, redefinesAnalytics } = usage;
  const set = new Set(events);

  if (events.length === 0) {
    // Axon is optional — a game that never calls trackEvent gets no advisory
    // noise. Only the SDK-object redefinition is still worth flagging (it
    // breaks AppLovin's own injection even without our events).
    if (redefinesAnalytics) checks.push(redefinitionCheck(redefinesAnalytics));
    return checks;
  }

  checks.push({
    id: 'displayed',
    label: 'DISPLAYED event present',
    ok: set.has('DISPLAYED'),
    level: 'warn',
    detail: 'DISPLAYED is the only mandatory Axon event — fire it when the creative is ready for interaction.',
  });

  const unknown = events.filter((e) => !AXON_EVENT_SET.has(e));
  checks.push({
    id: 'no_unknown',
    label: 'All events are valid spec names',
    ok: unknown.length === 0,
    level: 'error',
    detail: `AppLovin does not accept custom event names: ${unknown.join(', ')}`,
  });

  if (set.has('LOADING') || set.has('LOADED')) {
    checks.push({
      id: 'loaded_requires_loading',
      label: 'LOADING and LOADED both present',
      ok: set.has('LOADING') && set.has('LOADED'),
      level: 'warn',
      detail: 'LOADING and LOADED are a pair — fire both (LOADING → LOADED → DISPLAYED) or neither.',
    });
  }

  if (set.has('CHALLENGE_STARTED')) {
    const hasCompletion = CHALLENGE_COMPLETION_EVENTS.some((e) => set.has(e));
    checks.push({
      id: 'challenge_completion',
      label: 'Challenge has a completion event',
      ok: hasCompletion,
      level: 'warn',
      detail:
        'With CHALLENGE_STARTED you must fire at least one of CHALLENGE_SOLVED / CHALLENGE_FAILED / CHALLENGE_RETRY.',
    });
  }

  if (redefinesAnalytics !== undefined) {
    checks.push(redefinitionCheck(redefinesAnalytics));
  }

  return checks;
}

// Events that must fire exactly once (spec: "Deduped: Yes"). The lifecycle
// one-shots plus CHALLENGE_STARTED (sent only on the user's first click) and
// CTA_CLICKED. Excluded: the other CHALLENGE_* events, which legitimately repeat
// across retries.
const DEDUP_ONCE_EVENTS = ['LOADING', 'LOADED', 'DISPLAYED', 'ENDCARD_SHOWN', 'CHALLENGE_STARTED', 'CTA_CLICKED'];

// AppLovin forbids dispatching CHALLENGE_* events simultaneously: any two must be
// at least this far apart (client requirement). CHALLENGE_* must mark distinct
// gameplay moments; CTA_CLICKED may interleave between them.
const MIN_CHALLENGE_INTERVAL_MS = 50;

const isChallengeEvent = (name: string): boolean => name.indexOf('CHALLENGE_') === 0;

// Pairwise lifecycle-order invariants: [a, b] means a's first fire must not come
// after b's first fire. Checked only for events that actually fired, against
// first-occurrence index — robust to retry loops that re-fire later events.
const ORDER_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['LOADING', 'LOADED'],
  ['LOADING', 'DISPLAYED'],
  ['LOADED', 'DISPLAYED'],
  ['DISPLAYED', 'CHALLENGE_STARTED'],
  ['CHALLENGE_STARTED', 'CHALLENGE_PASS_25'],
  ['CHALLENGE_STARTED', 'CHALLENGE_PASS_50'],
  ['CHALLENGE_STARTED', 'CHALLENGE_PASS_75'],
  ['CHALLENGE_STARTED', 'CHALLENGE_SOLVED'],
  ['CHALLENGE_STARTED', 'CHALLENGE_FAILED'],
  ['CHALLENGE_STARTED', 'CHALLENGE_RETRY'],
  ['CHALLENGE_PASS_25', 'CHALLENGE_PASS_50'],
  ['CHALLENGE_PASS_50', 'CHALLENGE_PASS_75'],
  ['DISPLAYED', 'ENDCARD_SHOWN'],
  ['DISPLAYED', 'CTA_CLICKED'],
  // The challenge must resolve before the end card is shown.
  ['CHALLENGE_SOLVED', 'ENDCARD_SHOWN'],
];

/**
 * Validate a runtime fire SEQUENCE (ordered, with repeats) against the spec.
 * Superset of validateAxonEvents — adds the checks that only a live run can make
 * (lifecycle order, no duplicate one-shot fires) plus an aggregate roll-up. Used
 * The package-time gate uses validateAxonEvents (a static scan can't know order
 * or fire counts). This is the unit-tested reference for the runtime rules; the
 * preview panel (static/preview/preview.js, computeAxonChecks) mirrors it in
 * browser JS — keep the two in sync.
 *
 * @param sequence ordered event names (with repeats) as they fired
 * @param timestamps optional ms timestamps aligned to `sequence`; when present,
 *   enables the CHALLENGE_* spacing check (≥50ms apart)
 */
export function validateAxonSequence(sequence: string[], timestamps?: number[]): AxonCheck[] {
  if (sequence.length === 0) {
    // Runtime semantics differ from the static scan: in the preview, an empty
    // sequence means "nothing fired YET" — keep the pending check visible.
    return [
      {
        id: 'events_present',
        label: 'Axon analytics integrated',
        ok: false,
        level: 'warn',
        detail:
          'No ALPlayableAnalytics.trackEvent() calls observed — DISPLAYED is required by the AppLovin spec.',
      },
    ];
  }

  // Distinct events in first-seen order → reuse the set-based checks (presence,
  // unknown names, LOADED-with-LOADING, challenge completion). Redefinition is a
  // static-only concern, so it's omitted at runtime.
  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const e of sequence) {
    if (!seen.has(e)) {
      seen.add(e);
      distinct.push(e);
    }
  }
  const checks = validateAxonEvents({ events: distinct });

  // Lifecycle order (pairwise, first-occurrence).
  const firstIdx: Record<string, number> = {};
  sequence.forEach((e, i) => {
    if (firstIdx[e] === undefined) firstIdx[e] = i;
  });
  const orderViolations = ORDER_PAIRS.filter(
    ([a, b]) => firstIdx[a] !== undefined && firstIdx[b] !== undefined && firstIdx[a] > firstIdx[b],
  ).map(([a, b]) => `${a} should precede ${b}`);
  checks.push({
    id: 'order',
    label: 'Events fired in lifecycle order',
    ok: orderViolations.length === 0,
    level: 'warn',
    detail: `out of order — ${orderViolations.join(', ')}`,
  });

  // Dedup: one-shot lifecycle events should fire exactly once.
  const counts: Record<string, number> = {};
  sequence.forEach((e) => {
    counts[e] = (counts[e] || 0) + 1;
  });
  const dups = DEDUP_ONCE_EVENTS.filter((e) => counts[e] > 1);
  checks.push({
    id: 'dedup',
    label: 'Fire-once events fired once',
    ok: dups.length === 0,
    level: 'warn',
    detail: `fired more than once — ${dups.map((e) => `${e}×${counts[e]}`).join(', ')}`,
  });

  // CHALLENGE_* spacing — consecutive challenge fires must be ≥50ms apart
  // (AppLovin forbids simultaneous dispatch). Needs timestamps; skipped without.
  if (timestamps && timestamps.length === sequence.length) {
    const challengeFires = sequence
      .map((name, i) => ({ name, ts: timestamps[i] }))
      .filter((f) => isChallengeEvent(f.name));
    const tooClose: string[] = [];
    for (let i = 1; i < challengeFires.length; i++) {
      const dt = challengeFires[i].ts - challengeFires[i - 1].ts;
      if (dt < MIN_CHALLENGE_INTERVAL_MS) {
        tooClose.push(`${challengeFires[i - 1].name}→${challengeFires[i].name} ${Math.round(dt)}ms`);
      }
    }
    if (challengeFires.length >= 2) {
      checks.push({
        id: 'challenge_spacing',
        label: `CHALLENGE_* events ≥${MIN_CHALLENGE_INTERVAL_MS}ms apart`,
        ok: tooClose.length === 0,
        level: 'warn',
        detail: `fired too close (AppLovin forbids simultaneous CHALLENGE_*) — ${tooClose.join(', ')}`,
      });
    }
  }

  // Aggregate roll-up, surfaced first as the headline verdict.
  const failures = checks.filter((c) => !c.ok);
  checks.unshift({
    id: 'all_conformant',
    label: failures.length === 0 ? 'All events conform to spec' : `${failures.length} spec issue(s)`,
    ok: failures.length === 0,
    level: failures.some((c) => c.level === 'error') ? 'error' : 'warn',
    detail: failures.map((c) => c.label).join('; '),
  });

  return checks;
}

function redefinitionCheck(redefines: boolean): AxonCheck {
  return {
    id: 'no_redefinition',
    label: 'Does not redefine ALPlayableAnalytics',
    ok: !redefines,
    level: 'warn',
    detail: 'Do not define window.ALPlayableAnalytics — the AppLovin SDK provides it automatically.',
  };
}
