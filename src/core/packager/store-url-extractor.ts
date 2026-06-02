import * as fs from 'fs';
import { join, extname } from 'path';

/** File extensions we treat as text/source and scan for store URLs. */
const SCANNABLE_EXTENSIONS = new Set(['.js', '.json', '.html', '.txt']);

// URL-safe chars: everything up to the first whitespace, quote ("'`), backslash,
// angle bracket (< >) or closing paren ) — those terminate the literal.
const URL_TAIL = '[^\\s"\'\\\\<>)`]*';

const GOOGLE_PLAY_RE = new RegExp(
  'https?://play\\.google\\.com/store/apps/details\\?id=' + URL_TAIL,
  'g'
);

const APPLE_RE = new RegExp(
  'https?://(?:apps|itunes)\\.apple\\.com/' + URL_TAIL,
  'g'
);

/** Recursively scan a build directory's source files for store-URL string literals
 *  (Google Play + Apple App Store) and return them as a deduped list of full URLs.
 *  Google Play URLs come first, then Apple. Returns [] if none found / dir missing. */
export function extractStoreUrls(buildDir: string): string[] {
  const googlePlay: string[] = [];
  const apple: string[] = [];
  const seen = new Set<string>();

  const collect = (matches: RegExpMatchArray | null, bucket: string[]): void => {
    if (!matches) return;
    for (const url of matches) {
      if (seen.has(url)) continue;
      seen.add(url);
      bucket.push(url);
    }
  };

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // missing/unreadable dir — skip silently
    }

    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SCANNABLE_EXTENSIONS.has(extname(entry.name).toLowerCase())) continue;

      let content: string;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue; // unreadable file — skip
      }

      collect(content.match(GOOGLE_PLAY_RE), googlePlay);
      collect(content.match(APPLE_RE), apple);
    }
  };

  walk(buildDir);

  return [...googlePlay, ...apple];
}
