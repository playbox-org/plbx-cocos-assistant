import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import { join } from 'path';
import { extractStoreUrls } from '../../../src/core/packager/store-url-extractor';

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
