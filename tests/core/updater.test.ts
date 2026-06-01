import { describe, it, expect } from 'vitest';
import { runUpdate, UPDATE_STEPS } from '../../src/core/updater/update';

describe('UPDATE_STEPS', () => {
  it('is the canonical pull → install → build sequence', () => {
    expect(UPDATE_STEPS.map((s) => s.name)).toEqual(['pull', 'install', 'build']);
  });
});

describe('runUpdate', () => {
  it('runs every step in order and succeeds', async () => {
    const ran: string[] = [];
    const res = await runUpdate(async (cmd, args) => {
      ran.push([cmd, ...args].join(' '));
      return { ok: true, output: '' };
    });
    expect(res.ok).toBe(true);
    expect(res.steps.map((s) => s.name)).toEqual(['pull', 'install', 'build']);
    expect(ran).toEqual(['git pull --ff-only', 'npm install', 'npm run build']);
    expect(res.message).toMatch(/restart/i);
  });

  it('stops at the first failing step and does not run later steps', async () => {
    const ran: string[] = [];
    const res = await runUpdate(async (cmd, args) => {
      ran.push(args.join(' '));
      // npm install fails
      if (cmd === 'npm' && args[0] === 'install') {
        return { ok: false, output: 'npm ERR! network' };
      }
      return { ok: true, output: '' };
    });
    expect(res.ok).toBe(false);
    // pull + install attempted, build NOT reached
    expect(res.steps.map((s) => s.name)).toEqual(['pull', 'install']);
    expect(ran).not.toContain('run build');
    expect(res.message).toContain('install');
  });

  it('surfaces the failing step output for diagnosis', async () => {
    const res = await runUpdate(async (cmd) => {
      if (cmd === 'git') return { ok: false, output: 'fatal: not possible to fast-forward' };
      return { ok: true, output: '' };
    });
    expect(res.ok).toBe(false);
    expect(res.steps[0]).toMatchObject({ name: 'pull', ok: false });
    expect(res.steps[0].output).toContain('fast-forward');
  });

  it('emits start + done progress for each step, with index/total', async () => {
    const events: string[] = [];
    await runUpdate(async () => ({ ok: true, output: '' }), {
      onProgress: (e) => events.push(`${e.step}:${e.phase}:${e.index}/${e.total}`),
    });
    expect(events).toEqual([
      'pull:start:1/3',
      'pull:done:1/3',
      'install:start:2/3',
      'install:done:2/3',
      'build:start:3/3',
      'build:done:3/3',
    ]);
  });

  it('emits a fail phase for the failing step and no further events', async () => {
    const events: string[] = [];
    await runUpdate(
      async (cmd, args) => (cmd === 'npm' && args[0] === 'install' ? { ok: false, output: 'boom' } : { ok: true, output: '' }),
      { onProgress: (e) => events.push(`${e.step}:${e.phase}`) },
    );
    expect(events).toEqual(['pull:start', 'pull:done', 'install:start', 'install:fail']);
  });
});
