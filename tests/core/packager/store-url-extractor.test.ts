import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import {
  extractStoreUrls,
  detectRegionalParams,
  stripRegionalParams,
  fixRegionalStoreUrls,
} from '../../../src/core/packager/store-url-extractor';

let tmpDir: string;

function mkTmp(): string {
  tmpDir = fs.mkdtempSync(join(os.tmpdir(), 'plbx-extract-'));
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

describe('extractStoreUrls', () => {
  it('extracts a Google Play URL embedded inside a .js file', () => {
    const dir = mkTmp();
    write(
      dir,
      'main.js',
      'foo.set_google_play_url("https://play.google.com/store/apps/details?id=com.x.y");'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://play.google.com/store/apps/details?id=com.x.y',
    ]);
  });

  it('extracts an Apple App Store URL from a .js file', () => {
    const dir = mkTmp();
    write(
      dir,
      'app.js',
      'foo.set_apple_url("https://apps.apple.com/ge/app/match-masters/id1138264921");'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://apps.apple.com/ge/app/match-masters/id1138264921',
    ]);
  });

  it('returns Google Play URL before Apple when both present', () => {
    const dir = mkTmp();
    write(
      dir,
      'a.js',
      'set_apple_url("https://apps.apple.com/ge/app/match-masters/id1138264921");'
    );
    write(
      dir,
      'b.js',
      'set_google_play_url("https://play.google.com/store/apps/details?id=com.funtomic.matchmasters");'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://play.google.com/store/apps/details?id=com.funtomic.matchmasters',
      'https://apps.apple.com/ge/app/match-masters/id1138264921',
    ]);
  });

  it('recurses into nested subdirectories', () => {
    const dir = mkTmp();
    write(
      dir,
      'deep/nested/inner.js',
      'x = "https://play.google.com/store/apps/details?id=com.nested.game";'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://play.google.com/store/apps/details?id=com.nested.game',
    ]);
  });

  it('deduplicates when the same URL appears twice', () => {
    const dir = mkTmp();
    write(
      dir,
      'one.js',
      'a = "https://play.google.com/store/apps/details?id=com.dup.app";'
    );
    write(
      dir,
      'two.js',
      'b = "https://play.google.com/store/apps/details?id=com.dup.app";'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://play.google.com/store/apps/details?id=com.dup.app',
    ]);
  });

  it('ignores non-source files such as .png', () => {
    const dir = mkTmp();
    // A .png file whose text bytes contain the URL must be skipped (ext filter).
    write(
      dir,
      'sprite.png',
      'https://play.google.com/store/apps/details?id=com.image.embed'
    );
    expect(extractStoreUrls(dir)).toEqual([]);
  });

  it('returns [] for a directory containing no store URLs', () => {
    const dir = mkTmp();
    write(dir, 'plain.js', 'console.log("no urls here");');
    write(dir, 'data.json', '{"key":"value"}');
    expect(extractStoreUrls(dir)).toEqual([]);
  });

  it('returns [] and does not throw for a non-existent directory', () => {
    const missing = join(os.tmpdir(), 'plbx-does-not-exist-' + Date.now());
    expect(() => extractStoreUrls(missing)).not.toThrow();
    expect(extractStoreUrls(missing)).toEqual([]);
  });

  it('does not capture trailing quote or paren', () => {
    const dir = mkTmp();
    write(
      dir,
      'trim.js',
      'open("https://play.google.com/store/apps/details?id=com.x");'
    );
    expect(extractStoreUrls(dir)).toEqual([
      'https://play.google.com/store/apps/details?id=com.x',
    ]);
  });
});

describe('detectRegionalParams', () => {
  it('flags Google Play gl/hl localization params', () => {
    expect(
      detectRegionalParams('https://play.google.com/store/apps/details?id=com.x&gl=US&hl=en'),
    ).toEqual(['gl=US', 'hl=en']);
  });

  it('returns [] for a clean Google Play URL', () => {
    expect(detectRegionalParams('https://play.google.com/store/apps/details?id=com.x')).toEqual([]);
  });

  it('flags the Apple App Store country-code path segment', () => {
    const r = detectRegionalParams('https://apps.apple.com/us/app/foo/id123');
    expect(r.join(' ')).toContain('us');
  });

  it('flags the country-code path for itunes.apple.com too', () => {
    const r = detectRegionalParams('https://itunes.apple.com/ge/app/foo/id123');
    expect(r.join(' ')).toContain('ge');
  });

  it('flags Apple l/country query params', () => {
    const r = detectRegionalParams('https://apps.apple.com/app/foo/id123?l=en&country=us');
    expect(r).toContain('l=en');
    expect(r).toContain('country=us');
  });

  it('returns [] for an Apple URL without a country path or params', () => {
    expect(detectRegionalParams('https://apps.apple.com/app/foo/id123')).toEqual([]);
  });
});

describe('stripRegionalParams', () => {
  it('strips Apple country-code path segment', () => {
    expect(stripRegionalParams('https://apps.apple.com/us/app/foo/id123')).toBe(
      'https://apps.apple.com/app/foo/id123',
    );
  });

  it('strips itunes.apple.com country path too', () => {
    expect(stripRegionalParams('https://itunes.apple.com/ge/app/foo/id123')).toBe(
      'https://itunes.apple.com/app/foo/id123',
    );
  });

  it('strips Google Play gl/hl params, keeps id', () => {
    expect(
      stripRegionalParams('https://play.google.com/store/apps/details?id=com.x&gl=US&hl=en'),
    ).toBe('https://play.google.com/store/apps/details?id=com.x');
  });

  it('strips Apple l/country query params', () => {
    expect(stripRegionalParams('https://apps.apple.com/app/foo/id123?l=en&country=us')).toBe(
      'https://apps.apple.com/app/foo/id123',
    );
  });

  it('strips leading regional param but keeps following non-regional param', () => {
    expect(
      stripRegionalParams('https://play.google.com/store/apps/details?gl=US&id=com.x'),
    ).toBe('https://play.google.com/store/apps/details?id=com.x');
  });

  it('returns clean URLs unchanged', () => {
    const clean = 'https://apps.apple.com/app/foo/id123';
    expect(stripRegionalParams(clean)).toBe(clean);
    const gp = 'https://play.google.com/store/apps/details?id=com.x';
    expect(stripRegionalParams(gp)).toBe(gp);
  });

  it('strips combined country path + query params in one pass', () => {
    expect(stripRegionalParams('https://apps.apple.com/us/app/foo/id123?l=en')).toBe(
      'https://apps.apple.com/app/foo/id123',
    );
  });
});

describe('fixRegionalStoreUrls', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(join(os.tmpdir(), 'plbx-fix-urls-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rewrites regional store URLs inside scannable build files', () => {
    const js = join(dir, 'game.js');
    fs.writeFileSync(
      js,
      'plbx.set_app_store_url("https://apps.apple.com/us/app/foo/id123");' +
        'plbx.set_google_play_url("https://play.google.com/store/apps/details?id=com.x&gl=US");',
    );
    const res = fixRegionalStoreUrls(dir);
    expect(res.fixed).toBe(2);
    const out = fs.readFileSync(js, 'utf8');
    expect(out).toContain('https://apps.apple.com/app/foo/id123');
    expect(out).toContain('https://play.google.com/store/apps/details?id=com.x');
    expect(out).not.toContain('/us/');
    expect(out).not.toContain('gl=US');
  });

  it('returns fixed=0 and leaves files untouched when URLs are clean', () => {
    const js = join(dir, 'game.js');
    const src = 'plbx.set_app_store_url("https://apps.apple.com/app/foo/id123");';
    fs.writeFileSync(js, src);
    const res = fixRegionalStoreUrls(dir);
    expect(res.fixed).toBe(0);
    expect(fs.readFileSync(js, 'utf8')).toBe(src);
  });

  it('rewrites all occurrences across multiple files', () => {
    fs.writeFileSync(join(dir, 'a.js'), 'x("https://apps.apple.com/us/app/foo/id123")');
    fs.mkdirSync(join(dir, 'sub'));
    fs.writeFileSync(join(dir, 'sub', 'b.json'), '{"u":"https://apps.apple.com/us/app/foo/id123"}');
    const res = fixRegionalStoreUrls(dir);
    expect(res.fixed).toBe(2);
    expect(fs.readFileSync(join(dir, 'a.js'), 'utf8')).not.toContain('/us/');
    expect(fs.readFileSync(join(dir, 'sub', 'b.json'), 'utf8')).not.toContain('/us/');
  });
});

describe('fixRegionalStoreUrls — project sources (.ts)', () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(join(os.tmpdir(), 'plbx-fix-src-'));
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('rewrites .ts files when extension list includes .ts', () => {
    const ts = join(dir, 'plbx_html_playable.ts');
    fs.writeFileSync(
      ts,
      'plbx_html_playable.set_app_store_url("https://apps.apple.com/us/app/foo/id123");',
    );
    const res = fixRegionalStoreUrls(dir, { extraExtensions: ['.ts'] });
    expect(res.fixed).toBe(1);
    expect(fs.readFileSync(ts, 'utf8')).toContain('https://apps.apple.com/app/foo/id123');
  });

  it('does not touch .ts files by default', () => {
    const ts = join(dir, 'a.ts');
    const src = 'x("https://apps.apple.com/us/app/foo/id123")';
    fs.writeFileSync(ts, src);
    const res = fixRegionalStoreUrls(dir);
    expect(res.fixed).toBe(0);
    expect(fs.readFileSync(ts, 'utf8')).toBe(src);
  });
});
