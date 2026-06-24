/**
 * PLBX branded loading splash — single source of truth.
 *
 * Used by:
 *  - launcher-builder.ts (MolocoV2 launcher, compact mode: svgWordmark:false,
 *    withProgressBar:false — fits the 3 KB launcher budget; hide on
 *    game_ready+viewable)
 *  - runtime-loader.ts generateFullHtml (all self-contained HTML builds,
 *    hide on first rendered Cocos frame via FIRST_FRAME_HOOK_JS)
 *
 * Visual follows plbx.ai: near-black #06020d backdrop with warm orange glow
 * (top) + purple haze (bottom), four-petal pinwheel mark with staggered petal
 * pulse (outer silhouette static), brand SVG wordmark sized to the mark width,
 * gradient progress bar (#ffb86c → #e850c1 → #49eaff).
 *
 * Fully inline (SVG + CSS + JS) — no network requests, preserving the
 * self-contained / no-network policy.
 */

/**
 * PLBX pinwheel mark: four gradient petals (24×24, from the brand SVG, path
 * coords rounded to 1 decimal). Petals grouped in <g class="pt"> so the
 * splash CSS can pulse them individually.
 */
export const PLBX_LOGO_SVG =
  "<svg id=\"lg\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g class=\"pt\"><path d=\"M16 8C11.6 8 8 4.4 8 0H19C21.8 0 24.1 2.4 22.5 4.7C21 6.7 18.7 8 16 8Z\" fill=\"url(#p0)\"/><path d=\"M16 16C16 11.6 19.6 8 24 8V19C24 21.8 21.6 24.1 19.3 22.5C17.3 21 16 18.7 16 16Z\" fill=\"url(#p1)\"/><path d=\"M8 16C12.4 16 16 19.6 16 24L5 24C2.2 24 -0.1 21.6 1.5 19.3C3 17.3 5.3 16 8 16Z\" fill=\"url(#p2)\"/><path d=\"M8 8C8 12.4 4.4 16 0 16L0 5C-0 2.2 2.4 -0.1 4.7 1.5C6.7 3 8 5.3 8 8Z\" fill=\"url(#p3)\"/></g><defs><linearGradient id=\"p0\" x1=\"24\" y1=\"0\" x2=\"8\" y2=\"8\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#FFC00C\"/><stop offset=\"1\" stop-color=\"#FB5101\"/></linearGradient><linearGradient id=\"p1\" x1=\"24\" y1=\"24\" x2=\"16\" y2=\"8\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#6833FB\"/><stop offset=\"1\" stop-color=\"#9938E7\"/></linearGradient><linearGradient id=\"p2\" x1=\"-0\" y1=\"24\" x2=\"16\" y2=\"16\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#01C7D6\"/><stop offset=\"1\" stop-color=\"#2866FD\"/></linearGradient><linearGradient id=\"p3\" x1=\"0\" y1=\"0\" x2=\"8\" y2=\"16\" gradientUnits=\"userSpaceOnUse\"><stop stop-color=\"#FFC00C\"/><stop offset=\"0.5\" stop-color=\"#E850C1\"/><stop offset=\"1\" stop-color=\"#9938E7\"/></linearGradient></defs></svg>";

/** Brand wordmark "Playbox" (white paths from the brand SVG). ~4 KB. */
export const PLBX_WORDMARK_SVG =
  "<svg class=\"wm\" viewBox=\"31 2.9 86.2 22.1\" xmlns=\"http://www.w3.org/2000/svg\"><path d=\"M68.4 11.6C68.4 13 68.6 14 68.9 14.6C69.2 15.3 69.6 15.6 70.3 15.6C70.6 15.6 70.9 15.5 71.1 15.3C71.4 15.1 71.6 14.9 71.7 14.6C71.9 14.2 72 13.8 72.1 13.3C72.2 12.7 72.2 12.1 72.2 11.4V7.5H76.1V16.5C76.1 17.3 76 18.1 75.8 18.9C75.6 19.7 75.4 20.4 75 21C74.7 21.6 74.2 22.1 73.7 22.6C73.1 23 72.5 23.4 71.8 23.6C71 23.9 70.2 24 69.3 24C68.8 24 68.3 23.9 67.7 23.9C67.1 23.8 66.5 23.6 66 23.5C65.4 23.3 64.9 23.1 64.4 22.8L65.2 18.9C65.8 19.4 66.5 19.8 67.2 20C67.9 20.2 68.5 20.4 69.1 20.4C69.9 20.4 70.5 20.2 71.1 19.9C71.6 19.6 72 19.1 72.3 18.5C72.6 17.9 72.7 17.2 72.7 16.3V14.1H72.5C72.5 15.2 72.3 16.1 71.9 16.9C71.6 17.6 71.2 18.1 70.6 18.4C70.1 18.8 69.4 18.9 68.7 18.9C67.8 18.9 67 18.7 66.4 18.2C65.8 17.8 65.3 17.1 65 16.1C64.7 15.2 64.6 14 64.6 12.7V7.5H68.4V11.6ZM57.6 7.2C58.9 7.2 59.9 7.4 60.7 7.9C61.6 8.3 62.2 9 62.5 9.9C63 10.8 63.2 11.9 63.2 13.2V20.2H59.8V16.6H59.6C59.6 17.3 59.3 18 58.9 18.6C58.5 19.2 58 19.7 57.3 20C56.6 20.4 55.9 20.6 55 20.6C54.4 20.6 53.8 20.4 53.2 20.2C52.6 20 52.1 19.6 51.8 19.1C51.4 18.6 51.2 17.9 51.2 17.1C51.2 16.3 51.4 15.7 51.7 15.2C52 14.7 52.4 14.3 52.9 14C53.4 13.7 54 13.5 54.6 13.3C55.2 13.2 55.8 13 56.4 12.9C57.2 12.8 57.8 12.6 58.3 12.5C58.7 12.4 59 12.3 59.1 12.2C59.3 12.1 59.3 11.9 59.3 11.7C59.3 11.2 59.2 10.8 58.8 10.6C58.5 10.4 58 10.2 57.5 10.2C57.1 10.2 56.8 10.3 56.4 10.4C56.1 10.6 55.8 10.8 55.5 11.1C55.3 11.5 55.2 11.9 55.2 12.5L51.8 12.3C51.7 11.3 51.9 10.4 52.2 9.8C52.6 9.1 53 8.6 53.6 8.2C54.2 7.8 54.8 7.6 55.5 7.4C56.2 7.2 56.9 7.2 57.6 7.2ZM81.6 7.1C81.6 7.5 81.6 8 81.6 8.5C81.5 9 81.5 9.5 81.4 10C81.3 10.6 81.2 11.1 81.1 11.6H81.4C81.5 10.6 81.8 9.7 82.1 9.1C82.5 8.4 83 7.9 83.6 7.6C84.1 7.3 84.8 7.2 85.5 7.2C86.5 7.2 87.3 7.4 88 7.9C88.7 8.4 89.2 9.1 89.6 10C90 11 90.2 12.2 90.2 13.7C90.2 15.2 90 16.5 89.5 17.5C89.1 18.6 88.6 19.3 87.8 19.8C87.1 20.3 86.3 20.6 85.4 20.6C84.6 20.6 84 20.4 83.5 20.1C82.9 19.7 82.5 19.3 82.1 18.6C81.7 18 81.5 17.2 81.3 16.3H81.1V20.2H77.7V3.4H81.6V7.1ZM97.6 7.2C98.9 7.2 99.9 7.4 100.9 7.9C101.8 8.4 102.6 9.1 103.1 10.1C103.6 11.1 103.9 12.3 103.9 13.9C103.9 15.4 103.6 16.7 103 17.7C102.5 18.7 101.7 19.4 100.8 19.9C99.8 20.3 98.7 20.6 97.5 20.6C96.3 20.6 95.2 20.3 94.3 19.8C93.3 19.3 92.6 18.6 92.1 17.6C91.5 16.6 91.3 15.4 91.3 13.9C91.3 12.3 91.5 11.1 92.1 10.1C92.6 9.1 93.4 8.3 94.3 7.9C95.3 7.4 96.4 7.2 97.6 7.2ZM38.3 4.3C39.3 4.3 40.1 4.4 40.9 4.7C41.7 4.9 42.4 5.2 42.9 5.7C43.5 6.1 44 6.7 44.3 7.4C44.6 8.1 44.8 9 44.8 10C44.8 11.2 44.5 12.3 43.9 13.2C43.4 14 42.6 14.7 41.5 15.1C40.4 15.5 39.1 15.7 37.5 15.7H35.9V20.2H32V4.3H38.3ZM49.9 20.2H46V3.4H49.9V20.2ZM109.7 11.6H109.8L111.7 7.5H116.1L112.3 13.8L116.2 20.2H111.6L109.8 16.2H109.7L107.8 20.2H103.3L107.3 13.8L103.3 7.5H107.9L109.7 11.6ZM59.3 14.3C59.1 14.4 58.7 14.5 58.4 14.6C58 14.7 57.6 14.8 57.2 14.8C56.9 14.9 56.5 15 56.2 15.1C55.9 15.2 55.6 15.4 55.4 15.6C55.2 15.8 55.1 16.1 55.1 16.4C55.1 16.9 55.3 17.2 55.5 17.4C55.8 17.6 56.2 17.7 56.6 17.7C56.9 17.7 57.2 17.7 57.5 17.6C57.8 17.5 58.1 17.3 58.4 17C58.7 16.8 58.9 16.5 59.1 16C59.3 15.6 59.3 15.1 59.3 14.5V14.3ZM97.5 10.2C97 10.2 96.6 10.3 96.2 10.6C95.9 10.9 95.7 11.3 95.5 11.9C95.3 12.4 95.2 13.1 95.2 13.8C95.2 15.1 95.4 16 95.8 16.7C96.3 17.3 96.9 17.7 97.6 17.7C98.1 17.7 98.5 17.5 98.9 17.3C99.2 17 99.5 16.6 99.6 16C99.8 15.5 99.9 14.8 99.9 14.1C99.9 13.2 99.8 12.5 99.6 12C99.4 11.4 99.1 11 98.8 10.7C98.4 10.3 98 10.2 97.5 10.2ZM84 10.4C83.8 10.4 83.5 10.5 83.3 10.5C83.1 10.6 82.8 10.7 82.6 10.9C82.4 11.1 82.3 11.3 82.1 11.6C81.9 11.8 81.8 12.1 81.7 12.5C81.6 12.9 81.6 13.3 81.6 13.8V14C81.6 14.6 81.6 15.1 81.8 15.5C81.9 16 82.1 16.3 82.3 16.6C82.5 16.9 82.8 17.1 83.1 17.3C83.4 17.4 83.7 17.4 84 17.4C84.5 17.4 84.9 17.3 85.2 17C85.6 16.7 85.8 16.2 86 15.7C86.2 15.2 86.2 14.6 86.2 14C86.2 13.4 86.2 12.8 86 12.2C85.8 11.7 85.6 11.3 85.3 10.9C84.9 10.6 84.5 10.4 84 10.4ZM35.9 7.4V12.6H37.9C38.9 12.6 39.6 12.4 40.1 12C40.6 11.6 40.8 10.9 40.8 10C40.8 9.2 40.6 8.5 40.1 8.1C39.7 7.7 39 7.4 38.1 7.4H35.9Z\" fill=\"white\"/></svg>";

export interface SplashParts {
  /** Contents for a <style> block (#s overlay, petal pulse, optional bar). */
  styleCss: string;
  /** <div id="s">…pinwheel + wordmark + bar…</div> */
  bodyHtml: string;
  /** Defines window.__plbx_splash_hide() — idempotent fade .5s → remove. */
  hideJs: string;
}

export interface SplashOptions {
  /** Include the indeterminate progress bar (default true). */
  withProgressBar?: boolean;
  /**
   * Use the brand SVG wordmark (default true, ~4 KB). false = CSS-text
   * "PLAYBOX" — compact mode for the 3 KB Moloco launcher budget.
   */
  svgWordmark?: boolean;
  /**
   * Client logo (a `data:` URL) shown in place of the PLBX pinwheel + wordmark
   * — clients who want their own brand on the loading screen. Keeps our
   * backdrop, progress bar, fade and first-frame hide; whole-image pulse (the
   * per-petal pulse needs our SVG paths). Only wired for full HTML builds, never
   * the Moloco launcher (3 KB ceiling).
   */
  customLogo?: { dataUrl: string };
}

export function buildSplash(opts: SplashOptions = {}): SplashParts {
  const customUrl = opts.customLogo?.dataUrl;
  const custom = !!customUrl;
  // Custom client logo → plain black, no gradients, no progress bar (the client
  // brand stands alone). PLBX splash keeps its branded backdrop + bar.
  const withBar = opts.withProgressBar !== false && !custom;
  const svgWord = opts.svgWordmark !== false;

  // Compact mode (Moloco launcher, 3 KB ceiling) trades the staggered petal
  // pulse + second glow gradient for a whole-mark pulse — ~250 B cheaper.
  const compact = !svgWord;

  const bg = custom
    ? '#000'
    : 'radial-gradient(60% 38% at 50% 0,#ff7a2629,#0000 70%)' +
      (compact ? '' : ',radial-gradient(50% 40% at 50% 110%,#6833fb38,#0000 70%)') +
      ' #06020d';

  let styleCss =
    '#s{position:fixed;inset:0;' +
    'display:flex;flex-direction:column;gap:20px;' +
    'align-items:center;justify-content:center;z-index:9999;' +
    'background:' + bg + ';' +
    'transition:opacity .5s ease-out}' +
    '#s.h{opacity:0;pointer-events:none}';

  let logo: string;
  let wordmark = '';
  if (customUrl) {
    // Custom client logo: fit any aspect, whole-image pulse, no PLBX wordmark.
    styleCss +=
      '#lg{max-width:96px;max-height:96px;width:auto;height:auto;' +
      'object-fit:contain;animation:pq 1.8s ease infinite}' +
      '@keyframes pq{0%,100%{transform:scale(1)}50%{transform:scale(.9)}}';
    logo = `<img id="lg" src="${customUrl}" alt="">`;
  } else {
    logo = PLBX_LOGO_SVG;
    styleCss +=
      '#lg{width:84px;height:84px}' +
      (compact
        ? // Byte-shaved for the 3 KB launcher: no opacity keyframe, short easing.
          '#lg{animation:pq 1.8s ease infinite}' +
          '@keyframes pq{0%,100%{transform:scale(1)}50%{transform:scale(.9)}}'
        : // E2: petals pulse toward center with a stagger; outer silhouette static.
          '#lg .pt path{transform-origin:12px 12px;animation:pq 1.8s ease-in-out infinite}' +
          '#lg .pt path:nth-child(2){animation-delay:.15s}' +
          '#lg .pt path:nth-child(3){animation-delay:.3s}' +
          '#lg .pt path:nth-child(4){animation-delay:.45s}' +
          '@keyframes pq{0%,100%{transform:scale(1)}50%{transform:scale(.86);opacity:.8}}');

    if (svgWord) {
      // Wordmark width matches the mark width.
      styleCss += '#s .wm{width:84px;height:auto;display:block;opacity:.95}';
      wordmark = PLBX_WORDMARK_SVG;
    } else {
      // Compact wordmark text. system-ui only — the named-font stack and
      // letter-spacing cost ~43 B the 3 KB launcher budget can't spare.
      styleCss += '#s .t{font:800 19px/1 system-ui,sans-serif;color:#fff}';
      wordmark = '<div class=t>Playbox</div>';
    }
  }

  let bar = '';
  if (withBar) {
    // Indeterminate bar: pure-CSS animated track, brand gradient, no JS state.
    styleCss +=
      '#s .b{width:128px;height:4px;border-radius:4px;overflow:hidden;' +
      'background:#ffffff1a}' +
      '#s .b i{display:block;width:40%;height:100%;border-radius:4px;' +
      'background:linear-gradient(90deg,#ffb86c,#e850c1,#49eaff);' +
      'animation:pb 1.2s ease-in-out infinite}' +
      '@keyframes pb{0%{transform:translateX(-100%)}100%{transform:translateX(350%)}}';
    bar = '<div class=b><i></i></div>';
  }

  const bodyHtml = `<div id="s">${logo}${wordmark}${bar}</div>`;

  const hideJs =
    'window.__plbx_splash_hide=function(){var s=document.getElementById("s");' +
    'if(!s)return;s.className="h";setTimeout(function(){if(s.parentNode)' +
    's.parentNode.removeChild(s)},550)};';

  return { styleCss, bodyHtml, hideJs };
}

/**
 * First-frame hide hook for generateFullHtml builds. Layered, no
 * arbitrary-timer-as-primary:
 *  1. cc.director EVENT_END_FRAME (Cocos 3.x emits after each rendered frame;
 *     EVENT_AFTER_DRAW fallback for older constants) — primary, deterministic.
 *  2. Double-rAF once cc.director.getScene() is truthy — covers builds where
 *     the director event constant is missing.
 *  3. Absolute 8s timeout — splash can never get stuck.
 * Polls for window.cc since boot is async (ZIP unpack + defer-boot gate).
 */
export const FIRST_FRAME_HOOK_JS =
  '(function(){var done=false;' +
  'function hide(){if(done)return;done=true;' +
  'try{window.__plbx_splash_hide&&window.__plbx_splash_hide()}catch(e){}}' +
  'function arm(){' +
  'try{var d=window.cc&&cc.director;' +
  'if(d&&cc.Director&&(cc.Director.EVENT_END_FRAME||cc.Director.EVENT_AFTER_DRAW)){' +
  'd.once(cc.Director.EVENT_END_FRAME||cc.Director.EVENT_AFTER_DRAW,function(){' +
  'requestAnimationFrame(hide)});return true}' +
  'if(d&&d.getScene&&d.getScene()){' +
  'requestAnimationFrame(function(){requestAnimationFrame(hide)});return true}' +
  '}catch(e){}return false}' +
  '(function poll(n){if(done)return;if(arm())return;' +
  'if(n>0)setTimeout(function(){poll(n-1)},100)})(80);' +
  'setTimeout(hide,8000);' +
  '})();';

/**
 * Raw (uncompressed) bytes the splash adds to an HTML build — style + body +
 * hideJs + first-frame hook + wrapper tags. Honest maximum; gzip on the
 * CDN/ad-network shrinks it further. Static markup → effectively constant.
 */
export function splashByteCost(opts: SplashOptions = {}): number {
  const s = buildSplash(opts);
  return Buffer.byteLength(
    s.styleCss + s.bodyHtml + s.hideJs + FIRST_FRAME_HOOK_JS,
    'utf8',
  );
}
