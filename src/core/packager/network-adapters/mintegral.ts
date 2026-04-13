import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

const MINTEGRAL_VIEWPORT =
  'width=device-width,user-scalable=no,initial-scale=1.0,minimum-scale=1.0,maximum-scale=1.0';

/**
 * Build Mintegral-specific plbx_html bridge.
 * Mintegral SDK provides: window.install() for CTA, window.gameEnd()/gameClose() for lifecycle.
 * PlayTurbo validator tracks calls to: gameReady, gameStart, gameClose, install, game_end.
 *
 * Matches super-html behavior:
 *   download → window.install() || window.open(url)
 *   game_end → window.gameEnd && window.gameEnd()
 *   gameStart is defined as top-level function (validator calls it)
 *   gameClose is defined as top-level function (game calls it on CTA)
 */
function mintegralBridge(): string {
  return `window.plbx_html = window.plbx_html || {
  google_play_url: "",
  appstore_url: "",
  download: function(url) {
    url = url || this.google_play_url || this.appstore_url || "";
    if (window.install) { window.install(); }
    else if (url) {
      var ua = navigator.userAgent || "";
      /iPhone/i.test(ua) ? window.location.href = url : window.open(url, "_blank");
    }
    if (typeof window.gameClose === 'function') { try { window.gameClose(); } catch(e) {} }
  },
  game_end: function() {
    if (typeof window.gameEnd === 'function') { try { window.gameEnd(); } catch(e) {} }
    if (typeof window.gameClose === 'function') { try { window.gameClose(); } catch(e) {} }
  },
  is_audio: function() { return true; },
  is_hide_download: function() { return false; }
};
window.super_html = window.super_html || window.plbx_html;`;
}

/**
 * Mintegral lifecycle functions.
 * - gameStart: defined so the validator can call it (triggers engine boot).
 *   Must NOT overwrite the validator's version if it exists.
 * - gameClose: defined so game code can signal game completion.
 */
function mintegralLifecycle(): string {
  return `if (typeof window.gameClose !== 'function') {
  window.gameClose = function() {};
}`;
}

/**
 * Mintegral adapter.
 * - Renames JS bundle to creative.js (handled via networkConfig.jsBundle)
 * - Injects custom viewport meta
 * - Injects Mintegral-specific bridge (install-based CTA)
 * - Injects lifecycle stubs (gameClose)
 */
export class MintegralAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return mintegralBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);
    builder.injectMeta('viewport', MINTEGRAL_VIEWPORT);
    builder.injectBodyScript(mintegralLifecycle());
  }

  // Mintegral PlayTurbo validator rejects creatives that mention its internal
  // preview helper script anywhere in the HTML — even inside JS comments.
  // See: https://playturbo.mintegral.com → "Rejected for technical error:
  // Please remove the strings related to 'preview-util.js' from the comments."
  getForbiddenStrings(): string[] {
    return ['preview-util.js', 'preview-util'];
  }
}
