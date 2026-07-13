import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  checkSharpAvailable,
  installSharp,
  readSharpSpec,
} from '../../../src/core/compression/sharp-status';
import type { ScratchInstallIO } from '../../../src/core/npm/scratch-install';

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

describe('readSharpSpec', () => {
  it('takes the spec the extension declares', () => {
    const root = mkdtempSync(join(tmpdir(), 'plbx-sharp-'));
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ optionalDependencies: { sharp: '^0.33.5' } }),
    );

    expect(readSharpSpec(root)).toBe('^0.33.5');
    rmSync(root, { recursive: true, force: true });
  });

  it('falls back when package.json is unreadable', () => {
    expect(readSharpSpec('/definitely/not/here')).toBe('^0.33.5');
  });
});

describe('installSharp', () => {
  function fakeIo(calls: any[], over: Partial<ScratchInstallIO> = {}): ScratchInstallIO {
    return {
      writeManifest: (dir, contents) => calls.push({ manifest: { dir, contents } }),
      makeRunner: (cwd) => async (cmd, args) => {
        calls.push({ run: { cmd, args, cwd } });
        return { ok: true, output: 'added 1 package' };
      },
      fs: {
        readdir: () => [],
        exists: () => false,
        mkdirp: () => {},
        move: (from, to) => calls.push({ move: [from, to] }),
        rimraf: () => {},
      },
      scratchDir: (root) => join(root, '.plbx-sharp-staged'),
      ...over,
    };
  }

  // Regression: this used to run `npm install sharp` in the extension root, where the
  // bundle ships the real package.json — a dry-run there adds 128 packages, playwright
  // and @playwright/test among them, into a user's install.
  it('resolves sharp in a scratch dir, never in the extension root', async () => {
    const calls: any[] = [];
    const res = await installSharp('/ext', fakeIo(calls));

    expect(res.ok).toBe(true);
    expect(res.message).toMatch(/ready/i);

    const run = calls.find((c) => c.run).run;
    expect(run.cwd).toBe(join('/ext', '.plbx-sharp-staged'));
    expect(calls.some((c) => c.run && c.run.cwd === '/ext')).toBe(false);

    const manifest = calls.find((c) => c.manifest).manifest;
    expect(Object.keys(JSON.parse(manifest.contents).dependencies)).toEqual(['sharp']);
  });

  it('keeps install scripts on — sharp needs them for its platform binary', async () => {
    const calls: any[] = [];
    await installSharp('/ext', fakeIo(calls));

    expect(calls.find((c) => c.run).run.args).not.toContain('--ignore-scripts');
  });

  it('reports a manual-install fallback on failure', async () => {
    const calls: any[] = [];
    const io = fakeIo(calls, {
      makeRunner: () => async () => ({ ok: false, output: 'npm ERR! network' }),
    });

    const res = await installSharp('/ext', io);

    expect(res.ok).toBe(false);
    expect(res.message).toContain('npm install sharp');
  });
});
