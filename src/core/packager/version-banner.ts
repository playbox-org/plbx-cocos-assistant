/**
 * Startup console banner injected into packaged playable ad builds.
 *
 * When the playable runs, the browser console shows which packager + version
 * produced it (similar to how `@smoud/playable-sdk v1.0.24` appears in console).
 */

/** Public package name shown in the banner. */
export const PACKAGER_NAME = '@playbox-org/plbx-cocos-assistant';

/** GitHub origin link logged on its own line (clickable in devtools). */
export const PACKAGER_ORIGIN = 'https://github.com/playbox-org/plbx-cocos-assistant';

/**
 * Normalize a version string to a single `v` prefix.
 * - `0.2.3`  -> `v0.2.3`
 * - `v0.2.3` -> `v0.2.3`
 */
function normalizeVersion(version: string): string {
  const trimmed = String(version).trim();
  const bare = trimmed.replace(/^v+/i, '');
  return `v${bare}`;
}

/**
 * Build a single-line JS string (one or more `console.log` statements) that
 * logs a styled startup banner with the packager name, origin link, and a
 * single `v`-prefixed version.
 *
 * - If `version` already starts with `v`, no extra `v` is added.
 * - The returned string is safe to embed inside an inline `<script>` (it never
 *   contains a literal `</script>` sequence).
 */
export function buildVersionBanner(version: string): string {
  const v = normalizeVersion(version);

  // JSON.stringify gives us safely-escaped, quoted JS string literals.
  const name = JSON.stringify(PACKAGER_NAME);
  const ver = JSON.stringify(v);
  const origin = JSON.stringify(PACKAGER_ORIGIN);

  // Two pills: a dark one for the name, an accent one for the version.
  const nameStyle = JSON.stringify(
    'background:#1b1f24;color:#fff;padding:2px 8px;border-radius:4px 0 0 4px;font-weight:600;',
  );
  const verStyle = JSON.stringify(
    'background:#4f46e5;color:#fff;padding:2px 8px;border-radius:0 4px 4px 0;font-weight:600;',
  );
  const reset = JSON.stringify('');

  const badge =
    `console.log('%c' + ${name} + '%c ' + ${ver} + '%c', ${nameStyle}, ${verStyle}, ${reset});`;
  const link = `console.log(${origin});`;

  // Guard against accidentally breaking out of an inline <script> tag.
  return `${badge}${link}`.replace(/<\/script/gi, '<\\/script');
}
