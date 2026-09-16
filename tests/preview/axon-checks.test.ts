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
