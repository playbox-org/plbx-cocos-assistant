import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import {
  extractAxonUsage,
  validateAxonEvents,
  validateAxonSequence,
  AXON_EVENTS,
} from '../../../src/core/packager/axon-events';

let tmpDir: string;

function mkTmp(): string {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'plbx-axon-'));
  return tmpDir;
}

function write(dir: string, name: string, content: string): void {
  const full = join(dir, name);
  fs.mkdirSync(join(full, '..'), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
}

afterEach(() => {
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe('extractAxonUsage', () => {
  it('extracts a single trackEvent literal from a .js file', () => {
    const dir = mkTmp();
    write(dir, 'main.js', "window.ALPlayableAnalytics.trackEvent('DISPLAYED');");
    expect(extractAxonUsage(dir).events).toEqual(['DISPLAYED']);
  });

  it('captures double, single and backtick quoted event names', () => {
    const dir = mkTmp();
    write(
      dir,
      'a.js',
      'x.trackEvent("LOADING"); y.trackEvent(\'LOADED\'); z.trackEvent(`DISPLAYED`);',
    );
    expect(extractAxonUsage(dir).events).toEqual(['LOADING', 'LOADED', 'DISPLAYED']);
  });

  it('dedupes and preserves first-seen order', () => {
    const dir = mkTmp();
    write(dir, 'a.js', "trackEvent('DISPLAYED'); trackEvent('CTA_CLICKED');");
    write(dir, 'b.js', "trackEvent('DISPLAYED');");
    expect(extractAxonUsage(dir).events).toEqual(['DISPLAYED', 'CTA_CLICKED']);
  });

  it('captures non-spec (custom/typo) event names so they can be flagged', () => {
    const dir = mkTmp();
    write(dir, 'a.js', "trackEvent('CHALLANGE_SOLVED'); trackEvent('myCustomEvent');");
    expect(extractAxonUsage(dir).events).toEqual(['CHALLANGE_SOLVED', 'myCustomEvent']);
  });

  it('ignores non-source files such as .png', () => {
    const dir = mkTmp();
    write(dir, 'sprite.png', "trackEvent('DISPLAYED')");
    expect(extractAxonUsage(dir).events).toEqual([]);
  });

  it('recurses into nested subdirectories', () => {
    const dir = mkTmp();
    write(dir, 'deep/nested/inner.js', "trackEvent('DISPLAYED');");
    expect(extractAxonUsage(dir).events).toEqual(['DISPLAYED']);
  });

  it('flags redefinesAnalytics when source assigns window.ALPlayableAnalytics', () => {
    const dir = mkTmp();
    write(dir, 'a.js', 'window.ALPlayableAnalytics = { trackEvent: function(){} };');
    expect(extractAxonUsage(dir).redefinesAnalytics).toBe(true);
  });

  it('does not flag redefinition for a defensive existence check', () => {
    const dir = mkTmp();
    write(
      dir,
      'a.js',
      "if (typeof window.ALPlayableAnalytics != 'undefined') { window.ALPlayableAnalytics.trackEvent('DISPLAYED'); }",
    );
    const usage = extractAxonUsage(dir);
    expect(usage.redefinesAnalytics).toBe(false);
    expect(usage.events).toEqual(['DISPLAYED']);
  });

  it('returns empty usage and does not throw for a missing directory', () => {
    const missing = join(os.tmpdir(), 'plbx-axon-missing-x');
    expect(() => extractAxonUsage(missing)).not.toThrow();
    expect(extractAxonUsage(missing)).toEqual({ events: [], redefinesAnalytics: false });
  });
});

describe('validateAxonEvents', () => {
  const failed = (checks: ReturnType<typeof validateAxonEvents>) => checks.filter((c) => !c.ok).map((c) => c.id);

  it('passes cleanly for a minimal spec-correct integration (DISPLAYED only)', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED'], redefinesAnalytics: false });
    expect(failed(checks)).toEqual([]);
  });

  it('stays silent when the game does not use Axon at all (no nagging)', () => {
    // Axon is optional — a creative that never calls trackEvent should not get
    // an advisory warning on every package run.
    const checks = validateAxonEvents({ events: [], redefinesAnalytics: false });
    expect(checks).toEqual([]);
  });

  it('still surfaces the redefinition problem even with zero events', () => {
    const checks = validateAxonEvents({ events: [], redefinesAnalytics: true });
    expect(failed(checks)).toContain('no_redefinition');
  });

  it('errors on an unknown/typo event name', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED', 'CHALLANGE_SOLVED'], redefinesAnalytics: false });
    const unknown = checks.find((c) => c.id === 'no_unknown');
    expect(unknown?.ok).toBe(false);
    expect(unknown?.level).toBe('error');
    expect(unknown?.detail).toContain('CHALLANGE_SOLVED');
  });

  it('warns when DISPLAYED is missing among fired events', () => {
    const checks = validateAxonEvents({ events: ['LOADING', 'LOADED'], redefinesAnalytics: false });
    const displayed = checks.find((c) => c.id === 'displayed');
    expect(displayed?.ok).toBe(false);
    expect(displayed?.level).toBe('warn');
  });

  it('warns when LOADING is fired without LOADED', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED', 'LOADING'], redefinesAnalytics: false });
    expect(failed(checks)).toContain('loaded_requires_loading');
  });

  it('warns when LOADED is fired without LOADING (pair is symmetric)', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED', 'LOADED'], redefinesAnalytics: false });
    expect(failed(checks)).toContain('loaded_requires_loading');
  });

  it('passes the LOADING/LOADED pair rule when both are present', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED', 'LOADING', 'LOADED'], redefinesAnalytics: false });
    const pair = checks.find((c) => c.id === 'loaded_requires_loading');
    expect(pair?.ok).toBe(true);
  });

  it('does not raise the LOADING/LOADED pair rule when neither is present', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED'], redefinesAnalytics: false });
    expect(checks.find((c) => c.id === 'loaded_requires_loading')).toBeUndefined();
  });

  it('warns when CHALLENGE_STARTED has no completion event', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED', 'CHALLENGE_STARTED'], redefinesAnalytics: false });
    expect(failed(checks)).toContain('challenge_completion');
  });

  it('accepts CHALLENGE_STARTED with any one completion event', () => {
    const checks = validateAxonEvents({
      events: ['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_RETRY'],
      redefinesAnalytics: false,
    });
    expect(failed(checks)).toEqual([]);
  });

  it('warns when ALPlayableAnalytics is redefined', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED'], redefinesAnalytics: true });
    expect(failed(checks)).toContain('no_redefinition');
  });

  it('omits the redefinition check when redefinesAnalytics is unknown (runtime)', () => {
    const checks = validateAxonEvents({ events: ['DISPLAYED'] });
    expect(checks.find((c) => c.id === 'no_redefinition')).toBeUndefined();
  });

  it('exposes the canonical 12-event spec list', () => {
    expect(AXON_EVENTS).toHaveLength(12);
    expect(AXON_EVENTS).toContain('DISPLAYED');
    expect(AXON_EVENTS).toContain('CHALLENGE_PASS_75');
  });
});

describe('validateAxonSequence', () => {
  const byId = (checks: ReturnType<typeof validateAxonSequence>, id: string) => checks.find((c) => c.id === id);
  const failed = (checks: ReturnType<typeof validateAxonSequence>) => checks.filter((c) => !c.ok).map((c) => c.id);

  it('returns only events_present for an empty sequence (nothing fired yet)', () => {
    const checks = validateAxonSequence([]);
    expect(checks.map((c) => c.id)).toEqual(['events_present']);
  });

  it('reports full conformance for a spec-ordered, deduped run', () => {
    const checks = validateAxonSequence(['LOADING', 'LOADED', 'DISPLAYED', 'CTA_CLICKED']);
    expect(byId(checks, 'all_conformant')?.ok).toBe(true);
    expect(byId(checks, 'order')?.ok).toBe(true);
    expect(byId(checks, 'dedup')?.ok).toBe(true);
  });

  it('puts the aggregate verdict first', () => {
    const checks = validateAxonSequence(['DISPLAYED']);
    expect(checks[0].id).toBe('all_conformant');
  });

  it('fails order when LOADED fires before LOADING', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'LOADED', 'LOADING']);
    expect(byId(checks, 'order')?.ok).toBe(false);
    expect(byId(checks, 'all_conformant')?.ok).toBe(false);
  });

  it('fails order when a challenge completion fires before CHALLENGE_STARTED', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CHALLENGE_SOLVED', 'CHALLENGE_STARTED']);
    expect(byId(checks, 'order')?.ok).toBe(false);
    expect(byId(checks, 'order')?.detail).toContain('CHALLENGE_STARTED');
  });

  it('fails order when ENDCARD_SHOWN fires before CHALLENGE_SOLVED', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CHALLENGE_STARTED', 'ENDCARD_SHOWN', 'CHALLENGE_SOLVED']);
    expect(byId(checks, 'order')?.ok).toBe(false);
    expect(byId(checks, 'order')?.detail).toContain('ENDCARD_SHOWN');
  });

  it('accepts CHALLENGE_SOLVED firing before ENDCARD_SHOWN', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_SOLVED', 'ENDCARD_SHOWN']);
    expect(byId(checks, 'order')?.ok).toBe(true);
  });

  it('flags duplicate one-shot lifecycle events', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'DISPLAYED']);
    expect(byId(checks, 'dedup')?.ok).toBe(false);
    expect(byId(checks, 'dedup')?.detail).toContain('DISPLAYED');
  });

  it('flags CTA_CLICKED firing more than once (spec deduped)', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CTA_CLICKED', 'CTA_CLICKED']);
    expect(byId(checks, 'dedup')?.ok).toBe(false);
    expect(byId(checks, 'dedup')?.detail).toContain('CTA_CLICKED');
  });

  it('flags CHALLENGE_STARTED firing more than once (first click only)', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_STARTED', 'CHALLENGE_SOLVED']);
    expect(byId(checks, 'dedup')?.ok).toBe(false);
    expect(byId(checks, 'dedup')?.detail).toContain('CHALLENGE_STARTED');
  });

  it('flags CHALLENGE_* events fired less than 50ms apart', () => {
    const seq = ['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25'];
    const ts = [0, 100, 130]; // 30ms between the two challenge events
    const checks = validateAxonSequence(seq, ts);
    expect(byId(checks, 'challenge_spacing')?.ok).toBe(false);
    expect(byId(checks, 'all_conformant')?.ok).toBe(false);
  });

  it('accepts CHALLENGE_* events at least 50ms apart', () => {
    const seq = ['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25', 'CHALLENGE_SOLVED'];
    const ts = [0, 100, 160, 220];
    const checks = validateAxonSequence(seq, ts);
    expect(byId(checks, 'challenge_spacing')?.ok).toBe(true);
    expect(byId(checks, 'all_conformant')?.ok).toBe(true);
  });

  it('ignores CTA_CLICKED interleaved between adequately spaced CHALLENGE_* events', () => {
    const seq = ['DISPLAYED', 'CHALLENGE_STARTED', 'CTA_CLICKED', 'CHALLENGE_SOLVED'];
    const ts = [0, 100, 120, 160]; // challenge events 100→160 = 60ms apart
    const checks = validateAxonSequence(seq, ts);
    expect(byId(checks, 'challenge_spacing')?.ok).toBe(true);
  });

  it('skips the spacing check when timestamps are absent', () => {
    const checks = validateAxonSequence(['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25']);
    expect(byId(checks, 'challenge_spacing')).toBeUndefined();
  });

  it('allows challenge events to repeat across retries (no dedup violation)', () => {
    const checks = validateAxonSequence([
      'DISPLAYED',
      'CHALLENGE_STARTED',
      'CHALLENGE_RETRY',
      'CHALLENGE_RETRY',
      'CHALLENGE_SOLVED',
    ]);
    expect(byId(checks, 'dedup')?.ok).toBe(true);
    expect(byId(checks, 'all_conformant')?.ok).toBe(true);
  });

  it('carries set-based checks (required + unknown) into the runtime verdict', () => {
    const missingDisplayed = validateAxonSequence(['LOADING', 'LOADED']);
    expect(failed(missingDisplayed)).toContain('displayed');

    const unknown = validateAxonSequence(['DISPLAYED', 'FOO']);
    expect(byId(unknown, 'no_unknown')?.ok).toBe(false);
    expect(byId(unknown, 'all_conformant')?.level).toBe('error');
  });
});
