import { describe, it, expect } from 'vitest';
import { checkSharpAvailable, installSharp } from '../../../src/core/compression/sharp-status';

describe('checkSharpAvailable', () => {
  it('is true when the probe reports "ok"', async () => {
    expect(await checkSharpAvailable(async () => 'ok')).toBe(true);
  });

  it('trims probe output before comparing', async () => {
    expect(await checkSharpAvailable(async () => 'ok\n')).toBe(true);
  });

  it('is false when the probe reports "missing"', async () => {
    expect(await checkSharpAvailable(async () => 'missing')).toBe(false);
  });

  it('is false when the probe throws (worker cannot spawn)', async () => {
    expect(
      await checkSharpAvailable(async () => {
        throw new Error('spawn node ENOENT');
      }),
    ).toBe(false);
  });
});

describe('installSharp', () => {
  it('runs `npm install sharp` and reports success', async () => {
    const ran: string[] = [];
    const res = await installSharp(async (cmd, args) => {
      ran.push([cmd, ...args].join(' '));
      return { ok: true, output: 'added 1 package' };
    });
    expect(ran).toEqual(['npm install sharp']);
    expect(res.ok).toBe(true);
    expect(res.output).toContain('added');
    expect(res.message).toMatch(/ready/i);
  });

  it('reports a manual-install fallback on failure', async () => {
    const res = await installSharp(async () => ({ ok: false, output: 'npm ERR! network' }));
    expect(res.ok).toBe(false);
    expect(res.message).toContain('npm install sharp');
  });
});
