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
  // Four are validator-required (mraid_viewable, game_viewable, click, final_url);
  // engagement/complete/redirection drive lifecycle beacons; start_muted controls audio;
  // taps_for_engagement/redirection are per-campaign thresholds the adapter reads at tap
  // time; cachebuster + draw_custom_close_button are DSP-side toggles.
  const macros =
    'window.MOLOCO_MACROS={' +
    'mraid_viewable:"#MRAID_VIEWABLE#",' +
    'game_viewable:"#GAME_VIEWABLE#",' +
    'click:"#CLICK#",' +
    'engagement:"#ENGAGEMENT#",' +
    'complete:"#COMPLETE#",' +
    'redirection:"#REDIRECTION#",' +
    'final_url:"#FINAL_URL#",' +
    'start_muted:"#START_MUTED#",' +
    'taps_for_engagement:"#TAPS_FOR_ENGAGEMENT#",' +
    'taps_for_redirection:"#TAPS_FOR_REDIRECTION#",' +
    'cachebuster:"#CACHEBUSTER#",' +
    'draw_custom_close_button:"#DRAW_CLOSE#"' +
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
