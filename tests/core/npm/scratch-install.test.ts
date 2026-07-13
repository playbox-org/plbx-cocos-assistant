import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  placePackageTree,
  scratchInstall,
  realFsOps,
  type ScratchInstallIO,
} from '../../../src/core/npm/scratch-install';

const KIT = '@playbox-ai/playable-kit';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'plbx-scratch-'));
}

// The install must never mutate what it does not own. jszip is the trap: the
// extension declares it directly (preview/server.ts, and update.ts requires it
// INSIDE the updater) and the packaging kit declares it too. Both are ^3.10.0
// today, but a hoisted copy would eventually drop a future jszip 4 on the root's 3
// — upgrading a package the extension never declared, underneath its own updater.
describe('placePackageTree', () => {
  it('nests the package deps under it and leaves the root copies alone', () => {
    const root = tmp();
    const rootNm = join(root, 'node_modules');
    const scratchNm = join(root, '.scratch', 'node_modules');

    // What a user has: their own jszip 3, an on-demand sharp, and an older kit.
    mkdirSync(join(rootNm, 'jszip'), { recursive: true });
    writeFileSync(join(rootNm, 'jszip', 'package.json'), '{"version":"3.10.1"}');
    mkdirSync(join(rootNm, 'sharp'), { recursive: true });
    mkdirSync(join(rootNm, KIT, 'dist'), { recursive: true });
    writeFileSync(join(rootNm, KIT, 'dist', 'gone.js'), 'dropped in the new version');

    // What npm resolved in the scratch dir: the kit + a NEWER jszip for it, plus the
    // dot-entries npm always leaves behind.
    mkdirSync(join(scratchNm, KIT), { recursive: true });
    writeFileSync(join(scratchNm, KIT, 'package.json'), '{"version":"0.3.3"}');
    mkdirSync(join(scratchNm, 'jszip'), { recursive: true });
    writeFileSync(join(scratchNm, 'jszip', 'package.json'), '{"version":"4.0.0"}');
    mkdirSync(join(scratchNm, '.bin'), { recursive: true });
    writeFileSync(join(scratchNm, '.package-lock.json'), '{}');

    placePackageTree(scratchNm, rootNm, KIT, realFsOps);

    // Package replaced wholesale — no orphan file from the old version.
    expect(JSON.parse(readFileSync(join(rootNm, KIT, 'package.json'), 'utf8')).version).toBe('0.3.3');
    expect(existsSync(join(rootNm, KIT, 'dist', 'gone.js'))).toBe(false);

    // Its jszip lands under it; the ROOT jszip is untouched.
    const nested = join(rootNm, KIT, 'node_modules', 'jszip', 'package.json');
    expect(JSON.parse(readFileSync(nested, 'utf8')).version).toBe('4.0.0');
    expect(JSON.parse(readFileSync(join(rootNm, 'jszip', 'package.json'), 'utf8')).version).toBe('3.10.1');

    // Dot-entries never leave the scratch tree; the on-demand sharp survives.
    expect(existsSync(join(rootNm, '.bin'))).toBe(false);
    expect(existsSync(join(rootNm, '.package-lock.json'))).toBe(false);
    expect(existsSync(join(rootNm, 'sharp'))).toBe(true);

    rmSync(root, { recursive: true, force: true });
  });

  it('honours keepAtRoot for entries the consumer requires from the root', () => {
    const root = tmp();
    const rootNm = join(root, 'node_modules');
    const scratchNm = join(root, '.scratch', 'node_modules');

    mkdirSync(join(scratchNm, 'sharp'), { recursive: true });
    mkdirSync(join(scratchNm, 'color'), { recursive: true });
    mkdirSync(join(scratchNm, 'keep-me'), { recursive: true });

    placePackageTree(scratchNm, rootNm, 'sharp', realFsOps, (e) => e === 'keep-me');

    expect(existsSync(join(rootNm, 'keep-me'))).toBe(true);
    expect(existsSync(join(rootNm, 'sharp', 'node_modules', 'color'))).toBe(true);
    expect(existsSync(join(rootNm, 'color'))).toBe(false);

    rmSync(root, { recursive: true, force: true });
  });
});

describe('scratchInstall', () => {
  function fakeIo(calls: any[], over: Partial<ScratchInstallIO> = {}): ScratchInstallIO {
    return {
      writeManifest: (dir, contents) => calls.push({ manifest: { dir, contents } }),
      makeRunner: (cwd) => async (cmd, args) => {
        calls.push({ run: { cmd, args, cwd } });
        return { ok: true, output: 'added 12 packages' };
      },
      fs: {
        readdir: () => [],
        exists: () => false,
        mkdirp: (d) => calls.push({ mkdirp: d }),
        move: (from, to) => calls.push({ move: [from, to] }),
        rimraf: (d) => calls.push({ rimraf: d }),
      },
      scratchDir: (root) => join(root, '.staged'),
      ...over,
    };
  }

  it('resolves in the scratch dir with a one-line manifest and the safe flags', async () => {
    const calls: any[] = [];
    const r = await scratchInstall({ root: '/ext', pkg: 'pkg-a', spec: '1.2.3', io: fakeIo(calls) });

    expect(r.ok).toBe(true);

    const manifest = calls.find((c) => c.manifest).manifest;
    expect(manifest.dir).toBe(join('/ext', '.staged'));
    expect(JSON.parse(manifest.contents)).toEqual({ dependencies: { 'pkg-a': '1.2.3' } });

    const run = calls.find((c) => c.run).run;
    expect(run.cwd).toBe(join('/ext', '.staged'));
    expect(run.args).toEqual([
      'install',
      '--no-package-lock',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);

    // npm is NEVER run in the extension root — that would reify the bundle's full
    // manifest (playwright, vitest, typescript) and --save would rewrite our pins.
    expect(calls.some((c) => c.run && c.run.cwd === '/ext')).toBe(false);
    expect(calls.some((c) => c.manifest && c.manifest.dir === '/ext')).toBe(false);
  });

  it('keeps install scripts when the package needs them (sharp binaries)', async () => {
    const calls: any[] = [];
    await scratchInstall({
      root: '/ext',
      pkg: 'sharp',
      spec: '^0.33.5',
      io: fakeIo(calls),
      allowScripts: true,
    });

    expect(calls.find((c) => c.run).run.args).not.toContain('--ignore-scripts');
  });

  it('leaves node_modules untouched when npm fails', async () => {
    const calls: any[] = [];
    const io = fakeIo(calls, {
      makeRunner: () => async () => ({ ok: false, output: 'ENOTFOUND registry.npmjs.org' }),
    });

    const r = await scratchInstall({ root: '/ext', pkg: 'pkg-a', spec: '1.2.3', io });

    expect(r.ok).toBe(false);
    expect(calls.find((c) => c.move)).toBeUndefined();
  });

  it('always cleans the scratch dir, success or failure', async () => {
    const calls: any[] = [];
    await scratchInstall({ root: '/ext', pkg: 'pkg-a', spec: '1.2.3', io: fakeIo(calls) });
    expect(calls.filter((c) => c.rimraf === join('/ext', '.staged')).length).toBeGreaterThanOrEqual(2);
  });
});
