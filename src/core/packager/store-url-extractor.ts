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

/**
 * Detect regional / localization parameters in a store URL. Ad networks expect a
 * region-agnostic store link so the creative serves globally; a country/language
 * lock can mis-route or reject installs. Returns the offending tokens (empty if
 * the URL is clean).
 *
 *   Google Play:  ?gl=US (country), ?hl=en (language)
 *   App Store:    apps.apple.com/<cc>/app/... (country path), ?l= / ?country=
 */
export function detectRegionalParams(url: string): string[] {
  const found: string[] = [];

  // Google Play localization query params.
  const gp = url.match(/[?&](?:gl|hl)=[^&#]*/gi);
  if (gp) found.push(...gp.map((s) => s.replace(/^[?&]/, '')));

  // Apple App Store country-code path segment (apps/itunes.apple.com/<cc>/...).
  const cc = url.match(/(?:apps|itunes)\.apple\.com\/([a-z]{2})\//i);
  if (cc) found.push(`/${cc[1]}/ (country path)`);

  // Apple language / country query params.
  const aq = url.match(/[?&](?:l|country)=[^&#]*/gi);
  if (aq) found.push(...aq.map((s) => s.replace(/^[?&]/, '')));

  return found;
}

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

/**
 * Strip regional / localization tokens from a store URL — the inverse of
 * detectRegionalParams. Removes:
 *   Google Play:  ?gl= / ?hl= query params
 *   App Store:    /<cc>/ country path segment, ?l= / ?country= query params
 * Returns the URL unchanged when it is already region-agnostic.
 */
export function stripRegionalParams(url: string): string {
  let out = url;

  // Apple country-code path segment: apps.apple.com/us/app/... → apps.apple.com/app/...
  out = out.replace(/((?:apps|itunes)\.apple\.com)\/[a-z]{2}\//i, '$1/');

  // Regional query params (Google Play gl/hl, Apple l/country). Keep the other
  // params intact; promote the first survivor to '?' if the leading param was removed.
  out = out.replace(/[?&](?:gl|hl|l|country)=[^&#]*/gi, '');
  if (!out.includes('?') && out.includes('&')) out = out.replace('&', '?');
  // Trailing '?' when every param was regional.
  out = out.replace(/\?$/, '');

  return out;
}

/**
 * Rewrite every regional store URL inside the build's scannable source files
 * (same walk + URL grammar as extractStoreUrls). Used by the panel's "Fix"
 * button next to the regional warning. Returns the number of distinct
 * URL occurrences rewritten across all files.
 */
export function fixRegionalStoreUrls(
  buildDir: string,
  opts?: { extraExtensions?: string[] },
): { fixed: number } {
  let fixed = 0;
  const scannable = new Set(SCANNABLE_EXTENSIONS);
  for (const ext of opts?.extraExtensions ?? []) scannable.add(ext.toLowerCase());

  const rewrite = (content: string): string =>
    content.replace(new RegExp(`${GOOGLE_PLAY_RE.source}|${APPLE_RE.source}`, 'g'), (url) => {
      const stripped = stripRegionalParams(url);
      if (stripped !== url) fixed++;
      return stripped;
    });

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!scannable.has(extname(entry.name).toLowerCase())) continue;

      let content: string;
      try {
        content = fs.readFileSync(full, 'utf8');
      } catch {
        continue;
      }
      const before = fixed;
      const next = rewrite(content);
      if (fixed > before) {
        fs.writeFileSync(full, next, 'utf8');
      }
    }
  };

  walk(buildDir);
  return { fixed };
}
