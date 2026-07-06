import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  runExtensionUpdate,
  pickReleaseAssets,
  sha256Hex,
  parseSha256File,
  defaultUpdateIO,
  type UpdateIO,
  type ReleaseAsset,
} from '../../src/core/updater/update';

// ── Pure helpers ─────────────────────────────────────────────────────────────

describe('pickReleaseAssets', () => {
  const assets: ReleaseAsset[] = [
    { name: 'plbx-cocos-extension-v0.3.0.zip', url: 'z' },
    { name: 'plbx-cocos-extension-v0.3.0.zip.sha256', url: 's' },
    { name: 'Source code (zip)', url: 'src' },
  ];

  it('picks the zip and its .sha256 sibling', () => {
    const p = pickReleaseAssets(assets);
    expect(p?.zip.name).toBe('plbx-cocos-extension-v0.3.0.zip');
    expect(p?.sha?.name).toBe('plbx-cocos-extension-v0.3.0.zip.sha256');
  });

  it('returns a null sha when no checksum sibling exists', () => {
    const p = pickReleaseAssets([{ name: 'build.zip', url: 'z' }]);
    expect(p?.zip.name).toBe('build.zip');
    expect(p?.sha).toBeNull();
  });

  it('returns null when there is no zip', () => {
    expect(pickReleaseAssets([{ name: 'notes.txt', url: 'n' }])).toBeNull();
  });
});

describe('parseSha256File', () => {
  it('extracts the lowercase hex from a sha256sum line', () => {
    expect(parseSha256File('ABCDEF01  bundle.zip\n')).toBe('abcdef01');
  });
});

// ── Orchestrator (IO injected) ───────────────────────────────────────────────

function fakeIO(overrides: Partial<UpdateIO> = {}): { io: UpdateIO; calls: string[] } {
  const calls: string[] = [];
  const zip = Buffer.from('bundle-bytes');
  const io: UpdateIO = {
    isGitCheckout: () => false,
    fetchLatestRelease: async () => ({
      tag: 'v0.3.0',
      assets: [
        { name: 'b.zip', url: 'b.zip' },
        { name: 'b.zip.sha256', url: 'b.zip.sha256' },
      ],
    }),
    download: async (url) => {
      calls.push('download:' + url);
      return url.endsWith('.sha256') ? Buffer.from(sha256Hex(zip) + '  b.zip') : zip;
    },
    extractZip: async (_buf, dest) => {
      calls.push('extract:' + dest);
    },
    applyOverlay: (from, to) => {
      calls.push('overlay:' + from + '->' + to);
    },
    resolveBundleRoot: (s) => s,
    stagingDir: (root) => join(root, '.plbx-staged'),
    rimraf: (d) => {
      calls.push('rimraf:' + d);
    },
    ...overrides,
  };
  return { io, calls };
}

describe('runExtensionUpdate', () => {
  it('refuses on a git checkout and touches nothing', async () => {
    const { io, calls } = fakeIO({ isGitCheckout: () => true });
    const res = await runExtensionUpdate('/ext', undefined, io);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/git pull/i);
    expect(calls).toEqual([]); // no download, no overlay
  });

  it('downloads, verifies, extracts and overlays on a packaged copy', async () => {
    const { io, calls } = fakeIO();
    const res = await runExtensionUpdate('/ext', undefined, io);
    expect(res.ok).toBe(true);
    expect(res.message).toContain('v0.3.0');
    expect(calls.some((c) => c.startsWith('overlay:'))).toBe(true);
    expect(calls.some((c) => c.startsWith('extract:'))).toBe(true);
  });

  it('aborts on checksum mismatch without applying', async () => {
    const { io, calls } = fakeIO({
      download: async (url) => (url.endsWith('.sha256') ? Buffer.from('deadbeef  b.zip') : Buffer.from('bundle-bytes')),
    });
    const res = await runExtensionUpdate('/ext', undefined, io);
    expect(res.ok).toBe(false);
    expect(res.steps[0].name).toBe('verify');
    expect(res.message).toMatch(/mismatch/i);
    expect(calls.some((c) => c.startsWith('overlay:'))).toBe(false);
  });

  it('reports when no release asset is available', async () => {
    const { io } = fakeIO({ fetchLatestRelease: async () => null });
    const res = await runExtensionUpdate('/ext', undefined, io);
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no published release/i);
  });

  it('emits progress from detect through apply', async () => {
    const events: string[] = [];
    const { io } = fakeIO();
    await runExtensionUpdate('/ext', (e) => events.push(`${e.step}:${e.phase}`), io);
    expect(events).toContain('detect:done');
    expect(events).toContain('verify:done');
    expect(events).toContain('apply:done');
  });
});

// ── Real IO (temp filesystem) ────────────────────────────────────────────────

describe('defaultUpdateIO', () => {
  it('detects a git checkout by its .git folder', () => {
    const io = defaultUpdateIO();
    const base = mkdtempSync(join(tmpdir(), 'plbx-git-'));
    expect(io.isGitCheckout(base)).toBe(false);
    mkdirSync(join(base, '.git'));
    expect(io.isGitCheckout(base)).toBe(true);
  });

  it('overlay overwrites bundle files, adds new ones, and preserves on-demand sharp', () => {
    const io = defaultUpdateIO();
    const base = mkdtempSync(join(tmpdir(), 'plbx-ov-'));
    const from = join(base, 'staged');
    const to = join(base, 'live');

    mkdirSync(join(from, 'dist'), { recursive: true });
    writeFileSync(join(from, 'dist', 'main.js'), 'NEW');
    mkdirSync(join(from, 'node_modules', 'cheerio'), { recursive: true });
    writeFileSync(join(from, 'node_modules', 'cheerio', 'index.js'), 'cheerio');

    mkdirSync(join(to, 'dist'), { recursive: true });
    writeFileSync(join(to, 'dist', 'main.js'), 'OLD');
    mkdirSync(join(to, 'node_modules', 'sharp'), { recursive: true });
    writeFileSync(join(to, 'node_modules', 'sharp', 'index.js'), 'sharp');

    io.applyOverlay(from, to);

    expect(readFileSync(join(to, 'dist', 'main.js'), 'utf8')).toBe('NEW'); // overwritten
    expect(existsSync(join(to, 'node_modules', 'cheerio', 'index.js'))).toBe(true); // added
    expect(readFileSync(join(to, 'node_modules', 'sharp', 'index.js'), 'utf8')).toBe('sharp'); // survived
  });
});
