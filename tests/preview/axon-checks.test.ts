import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

// Behavioural guard for computeAxonChecks — the browser mirror of the kit's
// validateAxonSequence. preview.js is a static asset, not a module, so evaluate
// just its AXON block in a sandbox with the fired sequence injected.
const previewJs = readFileSync(join(__dirname, '../../static/preview/preview.js'), 'utf8');
const start = previewJs.indexOf('// ========== AXON EVENTS ==========');
const end = previewJs.indexOf('function axonCheckStatus');
const axonBlock = previewJs.slice(start, end);

type Check = { id: string; ok?: boolean; level?: string; detail?: string };

function run(sequence: string[]): Check[] {
  const timestamps = sequence.map((_, i) => i * 100);
  return runInNewContext(`${axonBlock}; computeAxonChecks();`, {
    axonSequence: sequence,
    axonTimestamps: timestamps,
  });
}

const byId = (checks: Check[], id: string) => checks.find((c) => c.id === id);

describe('computeAxonChecks — CHALLENGE_STARTED dependency', () => {
  it('fails (error) when CHALLENGE_* fires and CHALLENGE_STARTED never does', () => {
    const checks = run(['DISPLAYED', 'CHALLENGE_PASS_50', 'CHALLENGE_SOLVED']);
    const check = byId(checks, 'challenge_requires_started');
    expect(check?.ok).toBe(false);
    expect(check?.level).toBe('error');
    expect(check?.detail).toContain('without CHALLENGE_STARTED');
    expect(byId(checks, 'all_conformant')?.level).toBe('error');
  });

  it('fails (error) when CHALLENGE_* fires before CHALLENGE_STARTED', () => {
    const checks = run(['DISPLAYED', 'CHALLENGE_SOLVED', 'CHALLENGE_STARTED']);
    expect(byId(checks, 'challenge_requires_started')?.ok).toBe(false);
    expect(byId(checks, 'order')?.ok).toBe(true);
  });

  it('warns when CHALLENGE_RETRY fires without CHALLENGE_FAILED', () => {
    const checks = run(['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_RETRY']);
    expect(byId(checks, 'retry_requires_failed')?.ok).toBe(false);
  });

  it('passes a spec-correct challenge flow', () => {
    const checks = run([
      'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_PASS_25', 'CHALLENGE_FAILED',
      'CHALLENGE_RETRY', 'CHALLENGE_SOLVED', 'ENDCARD_SHOWN', 'CTA_CLICKED',
    ]);
    expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
  });
});

describe('computeAxonChecks — dedup', () => {
  it('lets CTA_CLICKED and ENDCARD_SHOWN repeat', () => {
    const checks = run([
      'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_SOLVED', 'ENDCARD_SHOWN', 'CTA_CLICKED',
      'CTA_CLICKED', 'ENDCARD_SHOWN', 'CTA_CLICKED',
    ]);
    expect(byId(checks, 'dedup')?.ok).toBe(true);
    expect(checks.filter((c) => !c.ok).map((c) => c.id)).toEqual([]);
  });

  it('still flags a repeated fire-once event', () => {
    const checks = run(['DISPLAYED', 'DISPLAYED', 'CTA_CLICKED']);
    const check = byId(checks, 'dedup');
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('DISPLAYED×2');
  });
});

describe('computeAxonChecks — order with a fail end card', () => {
  it('passes a fail end card before a retry when SOLVED precedes the last ENDCARD_SHOWN', () => {
    const checks = run([
      'DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_FAILED', 'ENDCARD_SHOWN',
      'CHALLENGE_RETRY', 'CHALLENGE_SOLVED', 'ENDCARD_SHOWN',
    ]);
    expect(byId(checks, 'order')?.ok).toBe(true);
    expect(byId(checks, 'dedup')?.ok).toBe(true);
    expect(byId(checks, 'all_conformant')?.ok).toBe(true);
  });

  it('still fails order when the only ENDCARD_SHOWN comes before SOLVED', () => {
    const checks = run(['DISPLAYED', 'CHALLENGE_STARTED', 'ENDCARD_SHOWN', 'CHALLENGE_SOLVED']);
    const check = byId(checks, 'order');
    expect(check?.ok).toBe(false);
    expect(check?.detail).toContain('CHALLENGE_SOLVED should precede ENDCARD_SHOWN');
  });

  it('passes order when SOLVED fires and no ENDCARD_SHOWN does', () => {
    const checks = run(['DISPLAYED', 'CHALLENGE_STARTED', 'CHALLENGE_SOLVED']);
    expect(byId(checks, 'order')?.ok).toBe(true);
  });
});
