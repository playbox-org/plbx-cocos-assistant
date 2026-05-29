/**
 * Boot lifecycle for the self-contained loader.
 *   plbx_boot         — install URL shim + SystemJS hooks + downloader, signal
 *                       gameReady, then start the engine.
 *   plbx_boot_engine  — run the deferred boot (window.__plbx_boot set by
 *                       generateFullHtml), gated by __plbx_pre_boot (mraid
 *                       defer-boot gate used by MRAID network adapters).
 */
import type { RuntimeLoaderOptions } from '../runtime-loader';

export function emitLifecycle(options: RuntimeLoaderOptions): string {
  const debug = options.debug ? 'true' : 'false';
  return `
var DEBUG = ${debug};

function plbx_boot() {
  if (DEBUG) console.log('[plbx] boot');
  _installPlbxUrlShim();
  plbx_install_shims();   // _XMLLocalRequest + _createLocalJSElement + fetch (before cc.js evals)
  plbx_patch_system();    // SystemJS resolve/instantiate/fetch
  // Backup: ensure media downloader handlers get installed once cc exists
  // (primary install is the instantiate hook right after cc.js evals).
  (function pollDl() {
    if (window.__plbx_dl) return;
    if (typeof cc !== 'undefined' && cc.assetManager && cc.assetManager.downloader) { plbx_install_downloader(); return; }
    setTimeout(pollDl, 30);
  })();

  // gameStart/gameClose: validator calls these. gameReady: we call it (poll —
  // the validator script may inject after us).
  if (typeof window.gameStart !== 'function') window.gameStart = function () { if (DEBUG) console.log('[plbx] gameStart'); };
  if (typeof window.gameClose !== 'function') window.gameClose = function () { if (DEBUG) console.log('[plbx] gameClose'); };
  var done = false;
  (function signal() {
    if (done) return;
    if (typeof window.gameReady === 'function') {
      done = true;
      try { window.gameReady(); } catch (e) { console.error('[plbx] gameReady:', e); }
      return;
    }
    setTimeout(signal, 50);
  })();

  plbx_boot_engine();
}

function plbx_boot_engine() {
  function doBoot() { try { window.__plbx_boot(); } catch (e) { console.error('[plbx] boot cb:', e); } }
  function callBoot() {
    if (typeof window.__plbx_boot !== 'function') { if (DEBUG) console.warn('[plbx] no __plbx_boot'); return; }
    // mraid defer-boot gate: network adapters set __plbx_pre_boot to delay boot
    // until mraid.isViewable() (video+playable combos).
    if (typeof window.__plbx_pre_boot === 'function') {
      try { window.__plbx_pre_boot(doBoot); } catch (e) { console.error('[plbx] pre_boot:', e); doBoot(); }
    } else doBoot();
  }
  if (typeof window.__plbx_boot === 'function') callBoot();
  else document.addEventListener('DOMContentLoaded', callBoot);
}
`;
}
