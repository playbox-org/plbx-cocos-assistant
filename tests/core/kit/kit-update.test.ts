import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  KIT_PKG,
  installKit,
  readInstalledKitVersion,
  readDeclaredRange,
  type KitInstallIO,
} from '../../../src/core/kit/kit-update';

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'plbx-kit-'));
}

describe('installKit', () => {
  function fakeIo(calls: any[], over: Partial<KitInstallIO> = {}): KitInstallIO {
    return {
      isDevImport: () => false,
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
      scratchDir: (root) => join(root, '.plbx-kit-staged'),
      ...over,
    };
  }

  it('installs the requested version through an isolated scratch resolve', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3', fakeIo(calls));

    expect(r.ok).toBe(true);
    expect(r.message).toContain('0.3.3');

    const manifest = calls.find((c) => c.manifest).manifest;
    expect(JSON.parse(manifest.contents)).toEqual({
      dependencies: { '@playbox-ai/playable-kit': '0.3.3' },
    });
    expect(calls.find((c) => c.run).run.cwd).toBe(join('/ext', '.plbx-kit-staged'));
  });

  it('refuses a Developer Import — never mutates a working tree', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3', fakeIo(calls, { isDevImport: () => true }));

    expect(r.ok).toBe(false);
    expect(r.message).toContain('npm update @playbox-ai/playable-kit');
    expect(calls.find((c) => c.run)).toBeUndefined();
  });

  it('rejects a non-semver version before spawning anything', async () => {
    const calls: any[] = [];
    const r = await installKit('/ext', '0.3.3 && rm -rf /', fakeIo(calls));

    expect(r.ok).toBe(false);
    expect(calls.find((c) => c.run)).toBeUndefined();
  });

  it('reports a manual fallback when npm fails', async () => {
    const calls: any[] = [];
    const io = fakeIo(calls, {
      makeRunner: () => async () => ({ ok: false, output: 'npm ERR! network' }),
    });

    const r = await installKit('/ext', '0.3.3', io);

    expect(r.ok).toBe(false);
    expect(r.message).toContain('npm install @playbox-ai/playable-kit@0.3.3');
    expect(calls.find((c) => c.move)).toBeUndefined();
  });
});

describe('reading the local sides', () => {
  it('reads the installed version from the file, not require()', () => {
    // The kit's `exports` map does not expose ./package.json — require() throws
    // ERR_PACKAGE_PATH_NOT_EXPORTED, so this must go through the filesystem.
    const root = tmp();
    mkdirSync(join(root, 'node_modules', KIT_PKG), { recursive: true });
    writeFileSync(
      join(root, 'node_modules', KIT_PKG, 'package.json'),
      JSON.stringify({ version: '0.3.2' }),
    );

    expect(readInstalledKitVersion(root)).toBe('0.3.2');
    rmSync(root, { recursive: true, force: true });
  });

  it('reads the declared range and degrades to empty strings when absent', () => {
    const root = tmp();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ dependencies: { [KIT_PKG]: '~0.3.1' } }),
    );

    expect(readDeclaredRange(root)).toBe('~0.3.1');
    expect(readInstalledKitVersion(root)).toBe('');
    rmSync(root, { recursive: true, force: true });
  });
});
