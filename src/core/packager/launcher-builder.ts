/**
 * Moloco V2.0 launcher.html generator.
 *
 * Spec (Moloco Playable Ad Integration v2.0, Feb 2026):
 * - Metadata comment header with ASSET_PROVIDER / ASSET_TITLE / ASSET_REVISION / ASSET_VERSION
 * - <script src="mraid.js"> reference
 * - window.MOLOCO_MACROS object with macro placeholders Moloco DSP fills server-side
 * - <script src="$PAYLOAD_URL"> pulling in the IIFE payload (URL injected post-upload)
 * - %{IMP_BEACON} placeholder Moloco substitutes with the impression beacon
 *
 * Strict size ceiling: 3 KB. Default config emits < 2 KB so longer asset titles
 * leave headroom.
 */

export interface LauncherBuildOptions {
  assetProvider: string;
  assetTitle: string;
  assetRevision: string;
  assetVersion: string;
  /** URL the launcher loads the payload IIFE from. Use '#PAYLOAD_URL#' for placeholder. */
  payloadUrl: string;
  includeSplash: boolean;
  /** Optional inline SVG markup for the splash element (used when includeSplash=true) */
  splashSvg?: string;
}

const PAYLOAD_URL_PLACEHOLDER = '#PAYLOAD_URL#';

/**
 * Canonical Moloco V2.0 macro spec (Partner Guide §2.2.2).
 *
 * SINGLE SOURCE OF TRUTH: buildLauncher() generates the MOLOCO_MACROS object
 * from this list, and validateLauncher() verifies a built launcher against it.
 * The placeholder TOKENS are Moloco-defined — the DSP only expands these exact
 * strings at bid time. Emitting our own tokens (the v0.2.4 bug) means the DSP
 * never substitutes them and the launcher ships literal "#...#" → dead beacons
 * + dead CTA. Keys are our use-case names; values are fixed by Moloco.
 */
export const MOLOCO_V2_MACRO_SPEC: ReadonlyArray<{ key: string; placeholder: string }> = [
  { key: 'mraid_viewable', placeholder: '#IMP_TRACE_MRAID_VIEWABLE_ESC#' },
  { key: 'game_viewable', placeholder: '#IMP_TRACE_GAME_VIEWABLE_ESC#' },
  { key: 'click', placeholder: '#CLICK_TEMPLATE_ESC#' },
  { key: 'engagement', placeholder: '#PLAYABLE_ENGAGEMENT_ESC#' },
  { key: 'complete', placeholder: '#IMP_TRACE_COMPLETE_ESC#' },
  { key: 'redirection', placeholder: '#PLAYABLE_REDIRECTION_ESC#' },
  { key: 'final_url', placeholder: '#FINAL_LANDING_URL_ESC#' },
  { key: 'start_muted', placeholder: '#START_MUTED#' },
  { key: 'taps_for_engagement', placeholder: '#PLAYABLE_TAPS_FOR_ENGAGEMENT#' },
  { key: 'taps_for_redirection', placeholder: '#PLAYABLE_TAPS_FOR_REDIRECTION#' },
  { key: 'cachebuster', placeholder: '#CACHEBUSTER#' },
  { key: 'draw_custom_close_button', placeholder: '#DRAW_CUSTOM_CLOSE_BUTTON#' },
];

/** ASSET_REVISION must be YYYYMMDD.NN (UTC) per Moloco spec §2.2.1. */
export const ASSET_REVISION_RE = /^\d{8}\.\d{2}$/;

/** Spec version this packager targets (§2.2.1 ASSET_VERSION). */
export const MOLOCO_V2_ASSET_VERSION = '2.0';

/**
 * PLBX brand mark: four circles in a diamond, swept by a rainbow gradient.
 * Minified to fit the 3 KB launcher budget — the stop list is defined once on
 * #g0 and inherited via href by #g1–#g3, which only override the gradient axis
 * (keeps the reference's flowing multi-direction look without 4× the bytes).
 */
const PLBX_LOGO_SVG =
  '<svg id="lg" viewBox="0 0 65 65" fill="none" xmlns="http://www.w3.org/2000/svg">' +
  '<ellipse cx="38.47" cy="13.17" rx="12.89" ry="12.89" fill="url(#g0)"/>' +
  '<ellipse cx="51.36" cy="38.47" rx="12.89" ry="12.89" fill="url(#g1)"/>' +
  '<circle cx="26.06" cy="51.36" r="12.89" fill="url(#g2)"/>' +
  '<circle cx="13.17" cy="26.06" r="12.89" fill="url(#g3)"/>' +
  '<defs>' +
  '<linearGradient id="g0" x1="84" y1="60.7" x2="225" y2="-288" gradientUnits="userSpaceOnUse">' +
  '<stop stop-color="#F80000"/><stop offset=".1" stop-color="#FFC700"/>' +
  '<stop offset=".3" stop-color="#FC56B8"/><stop offset=".5" stop-color="#712BFB"/>' +
  '<stop offset=".7" stop-color="#0085FF"/><stop offset=".91" stop-color="#00ECC0"/>' +
  '</linearGradient>' +
  '<linearGradient id="g1" href="#g0" x1="-112" y1="111.8" x2="244" y2="-5.5" gradientUnits="userSpaceOnUse"/>' +
  '<linearGradient id="g2" href="#g0" x1="-105" y1="-37" x2="-109" y2="78" gradientUnits="userSpaceOnUse"/>' +
  '<linearGradient id="g3" href="#g0" x1="-31" y1="17" x2="18" y2="94" gradientUnits="userSpaceOnUse"/>' +
  '</defs></svg>';

function escapeHtml(s: string): string {
  return s.replace(/[<>&"]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '&' ? '&amp;' : '&quot;',
  );
}

/**
 * Render the launcher HTML. Output is minified — no leading whitespace, single line.
 */
export function buildLauncher(opts: LauncherBuildOptions): string {
  const meta =
    `<!--ASSET_PROVIDER=${escapeHtml(opts.assetProvider)};` +
    `ASSET_TITLE=${escapeHtml(opts.assetTitle)};` +
    `ASSET_REVISION=${escapeHtml(opts.assetRevision)};` +
    `ASSET_VERSION=${escapeHtml(opts.assetVersion)}-->`;

  // Moloco macros — DSP substitutes the #...# placeholders server-side at bid time.
  // Generated from MOLOCO_V2_MACRO_SPEC (single source of truth; see validateLauncher).
  const macros =
    'window.MOLOCO_MACROS={' +
    MOLOCO_V2_MACRO_SPEC.map((m) => `${m.key}:"${m.placeholder}"`).join(',') +
    '};';

  const baseStyle = 'html,body{margin:0;width:100%;height:100%;background:#000;overflow:hidden}';

  let splashBlock = '';
  let splashStyle = '';
  if (opts.includeSplash) {
    // Branded loading splash: pulsing PLBX rainbow mark + wordmark + progress
    // bar, on a radial-dark backdrop (ports the studio reference launcher).
    // A custom inner can be supplied via splashSvg.
    const inner =
      opts.splashSvg ||
      `${PLBX_LOGO_SVG}<div class=t>PLAYBOX</div>`;
    splashStyle =
      '#s{position:fixed;top:0;left:0;right:0;bottom:0;width:100%;height:100%;' +
      'display:flex;flex-direction:column;gap:16px;' +
      'align-items:center;justify-content:center;z-index:9;' +
      'background:radial-gradient(ellipse at center,#1a1d28 0%,#0b0d12 75%);' +
      'transition:opacity .5s ease-out}' +
      '#s.h{opacity:0;pointer-events:none}' +
      '#lg{width:88px;height:88px;animation:plbxp 1.8s ease-in-out infinite;' +
      'filter:drop-shadow(0 0 24px rgba(124,196,255,.18))}' +
      '@keyframes plbxp{0%,100%{transform:scale(1) rotate(0)}' +
      '50%{transform:scale(.92) rotate(-3deg);opacity:.78}}' +
      "#s .t{font:600 14px/1 system-ui,-apple-system,sans-serif;letter-spacing:.22em;" +
      'text-transform:uppercase;color:#e6ecf3;opacity:.92}';
    // Splash auto-hides when the game signals readiness: the payload bridge
    // calls window.__plbx_splash_hide() from game_ready(). A 12s fallback
    // guarantees the splash never gets stuck if that signal never arrives.
    const hideJs =
      'window.__plbx_splash_hide=function(){var s=document.getElementById("s");' +
      'if(!s)return;s.className="h";setTimeout(function(){if(s.parentNode)' +
      's.parentNode.removeChild(s)},550)};setTimeout(window.__plbx_splash_hide,12000);';
    splashBlock = `<div id="s">${inner}</div><script>${hideJs}</script>`;
  }

  const head =
    '<head>' +
    '<meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1,user-scalable=no">' +
    '<title>Ad</title>' +
    '<script src="mraid.js"></script>' +
    `<script>${macros}</script>` +
    `<style>${baseStyle}${splashStyle}</style>` +
    '</head>';

  const body =
    '<body>' +
    splashBlock +
    `<script src="${opts.payloadUrl}"></script>` +
    '%{IMP_BEACON}' +
    '</body>';

  return `${meta}<!doctype html><html>${head}${body}</html>`;
}

/**
 * Replace the #PAYLOAD_URL# placeholder with the real CDN URL after the
 * payload has been uploaded (Moloco creative-assets API returns the asset_url).
 */
export function fillLauncherPayloadUrl(launcherHtml: string, payloadUrl: string): string {
  return launcherHtml.split(PAYLOAD_URL_PLACEHOLDER).join(payloadUrl);
}

/** One launcher validation result. `detail` is filled only on failure. */
export interface LauncherCheck {
  id: string;
  label: string;
  ok: boolean;
  detail?: string;
}

/** Strict launcher byte ceiling (Moloco spec §2.1). */
export const LAUNCHER_MAX_BYTES = 3 * 1024;

/**
 * Validate a built Moloco V2 launcher against spec v2.0. Shared by the package-time
 * gate (validateLauncherStructure → build aborts on failure) and the preview
 * "Validate" window (rendered as a pass/fail checklist).
 *
 * Catches the regressions this validator previously missed: wrong macro *values*
 * (only keys were checked before), malformed ASSET_REVISION, and a relative
 * payload <script src> (breaks once Moloco serves the launcher standalone).
 *
 * @param launcherHtml the built launcher.html / launcher-final.html
 */
export function validateLauncher(launcherHtml: string): LauncherCheck[] {
  const html = launcherHtml;
  const checks: LauncherCheck[] = [];
  const add = (id: string, label: string, ok: boolean, detail?: string) =>
    checks.push({ id, label, ok, detail: ok ? undefined : detail });

  // --- Metadata header (§2.2.1) ---
  add('asset_provider', 'ASSET_PROVIDER metadata present', /<!--[\s\S]*?ASSET_PROVIDER=/.test(html),
    'metadata comment header missing ASSET_PROVIDER=');

  add('asset_version', `ASSET_VERSION=${MOLOCO_V2_ASSET_VERSION}`,
    new RegExp(`ASSET_VERSION=${MOLOCO_V2_ASSET_VERSION.replace('.', '\\.')}\\b`).test(html),
    `ASSET_VERSION must be ${MOLOCO_V2_ASSET_VERSION}`);

  const revMatch = html.match(/ASSET_REVISION=([^\s;>-]+)/);
  const revVal = revMatch ? revMatch[1] : '';
  add('asset_revision', 'ASSET_REVISION format YYYYMMDD.NN',
    !!revVal && ASSET_REVISION_RE.test(revVal),
    `ASSET_REVISION="${revVal}" must match YYYYMMDD.NN (§2.2.1)`);

  // --- Loader (§2.2.2 / §2.2.3) ---
  add('mraid_js', '<script src="mraid.js"> present', /<script\s+src=["']?mraid\.js["']?[^>]*>/i.test(html),
    '<script src="mraid.js"> missing');

  add('macros_declared', 'MOLOCO_MACROS declared', /MOLOCO_MACROS\s*=/.test(html),
    'window.MOLOCO_MACROS object not declared');

  // Macro VALUES — the core fix. Each key must carry Moloco's exact placeholder
  // token (not just be present). A wrong/invented value never expands at bid time.
  const wrongMacros: string[] = [];
  for (const m of MOLOCO_V2_MACRO_SPEC) {
    // Match  key : "placeholder"  with flexible quoting/spacing.
    const re = new RegExp(`["']?${m.key}["']?\\s*:\\s*["']${escapeRegExp(m.placeholder)}["']`);
    if (!re.test(html)) wrongMacros.push(m.key);
  }
  add('macro_values', 'All macros use Moloco spec placeholders', wrongMacros.length === 0,
    `macro key(s) missing or with non-spec value: ${wrongMacros.join(', ')}`);

  // --- Impression beacon (§2.2.4) ---
  add('imp_beacon', '%{IMP_BEACON} present + last before </body>',
    /%\{IMP_BEACON\}\s*<\/body>/i.test(html),
    /%\{IMP_BEACON\}/.test(html)
      ? '%{IMP_BEACON} must be the last content before </body>'
      : '%{IMP_BEACON} placeholder missing');

  // --- Payload reference: must NOT be a relative path (§2.3 / hosting). The
  // launcher ships standalone — a relative payload .js has no sibling to resolve.
  // Allowed: #PAYLOAD_URL# placeholder, an absolute http(s) URL, or inline (no src).
  // mraid.js is the one permitted relative script and is excluded here.
  const relPayload = findRelativePayloadSrc(html);
  add('no_relative_payload', 'No relative payload script', relPayload === null,
    `payload <script src="${relPayload}"> is relative — use absolute CDN URL or #PAYLOAD_URL#`);

  // --- Size ceiling (§2.1). Only meaningful for the production launcher (placeholder
  // or absolute URL); the inline launcher-local is exempt and skipped by the caller.
  const bytes = Buffer.byteLength(html, 'utf-8');
  add('size', `Launcher < ${LAUNCHER_MAX_BYTES} B`, bytes <= LAUNCHER_MAX_BYTES,
    `launcher is ${bytes} B, exceeds ${LAUNCHER_MAX_BYTES} B`);

  return checks;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Returns the first relative <script src> that looks like a payload (a .js that is
 * not mraid.js, not the #PAYLOAD_URL# placeholder, not an absolute URL), or null.
 */
function findRelativePayloadSrc(html: string): string | null {
  const re = /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const src = m[1];
    if (src === 'mraid.js') continue;
    if (src === PAYLOAD_URL_PLACEHOLDER) continue;
    if (/^https?:\/\//i.test(src)) continue;
    if (/^data:/i.test(src)) continue;
    if (/\.js(\?|$)/i.test(src)) return src;
  }
  return null;
}
