import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

/**
 * Moloco V2.0 (Launcher API) adapter.
 *
 * Spec: Moloco Playable Ad Integration v2.0 (Feb 2026).
 *
 * Build emits two files via the packager's launcher-payload branch:
 *  - launcher.html (< 3 KB) — submitted to Moloco QA via account manager
 *  - payload.js (IIFE) — uploaded through Moloco /cm/v1/creative-assets API
 *
 * Adapter responsibility: produce the plbx_html bridge that translates game
 * lifecycle callbacks into MOLOCO_MACROS impression beacons + mraid.open()
 * for the CTA. The macros object is provisioned by launcher.html at runtime;
 * the DSP substitutes the #...# placeholders before serving.
 */

const MOLOCO_V2_DEFAULT_TAP_ENGAGEMENT = 1;
const MOLOCO_V2_DEFAULT_TAP_REDIRECTION = 3;

function molocoV2Bridge(): string {
  return `(function(){
var M = window.MOLOCO_MACROS || {};
function decode(v) {
  if (v == null) return '';
  try { return decodeURIComponent(v); } catch(e) { return String(v); }
}
// Per-key debounce — catches games that wire CTA to multiple legacy bridges
// (super_html, mraid, plbx_html) on the same touch event, firing the same
// macro twice within ~1ms. A real user can't single-click twice that fast,
// so the throttle is safe; Moloco DSP would dedupe on its side anyway.
var _lastFireAt = {};
var FIRE_DEBOUNCE_MS = 100;
function fire(k) {
  var u = M[k];
  if (!u) return;
  var dec = decode(u);
  if (!dec) return;
  var now = Date.now();
  if (_lastFireAt[k] && (now - _lastFireAt[k]) < FIRE_DEBOUNCE_MS) return;
  _lastFireAt[k] = now;
  try { (new Image()).src = dec; } catch(e) {}
}
// Idempotent variant — used for behavioral beacons (engagement, redirection,
// game_viewable, complete) where Moloco DSP expects exactly one fire per
// session. Click is intentionally NOT idempotent: each CTA press should
// register as its own click.
var _fired = {};
function fireOnce(k) {
  if (_fired[k]) return;
  _fired[k] = true;
  fire(k);
}
function macroInt(k, fallback) {
  var raw = decode(M[k]);
  var n = parseInt(raw, 10);
  return (isFinite(n) && n > 0) ? n : fallback;
}
var taps = 0;
// Launcher splash dismissal is gated on BOTH signals: the game is loaded
// (game_ready) AND the ad container is actually on screen (mraid viewable).
// Hiding on game_ready alone can reveal a black/idle game before the slot is
// viewable; requiring both keeps the splash up until there's something to see.
var _splash = { ready: false, viewable: false };
function _trySplashHide() {
  if (_splash.ready && _splash.viewable && window.__plbx_splash_hide) {
    try { window.__plbx_splash_hide(); } catch(e) {}
  }
}
window.plbx_html = window.plbx_html || {};
window.plbx_html.google_play_url = window.plbx_html.google_play_url || "";
window.plbx_html.appstore_url = window.plbx_html.appstore_url || "";
window.plbx_html.download = function(url) {
  // CTA fires click only. Engagement is a behavioral signal driven by tap()
  // threshold — firing it from download too would double-count every CTA press.
  fire('click');
  try {
    var dest = M.final_url ? decode(M.final_url) : (url || "");
    if (window.mraid && dest) { mraid.open(dest); }
    else if (dest) { window.open(dest, '_blank'); }
  } catch(e) {}
};
window.plbx_html.game_end = function() { fireOnce('complete'); };
window.plbx_html.game_ready = function() {
  fireOnce('game_viewable');
  // Mark game-loaded; splash hides once the container is also viewable.
  _splash.ready = true;
  _trySplashHide();
};
window.plbx_html.is_audio = function() { return true; };
window.plbx_html.is_hide_download = function() { return false; };
// Live mute state. Seeded from start_muted (initial container state), then
// kept in sync by the MRAID audioVolumeChange listener below so the game can
// react when the user mutes/unmutes the ad mid-playback.
var _smInit = decode(M.start_muted);
var _muted = (_smInit === '1' || _smInit === 'true');
var _muteCbs = [];
function setMuted(m) {
  m = !!m;
  if (m === _muted) return;
  _muted = m;
  for (var i = 0; i < _muteCbs.length; i++) {
    try { _muteCbs[i](_muted); } catch(e) {}
  }
}
window.plbx_html.is_muted = function() { return _muted; };
window.plbx_html.on_mute_change = function(cb) {
  if (typeof cb !== 'function') return;
  _muteCbs.push(cb);
  // Sync the new subscriber to the current state immediately.
  try { cb(_muted); } catch(e) {}
};
window.plbx_html.report = function(k) { fire(k); };
window.plbx_html.tap = function() {
  taps++;
  var te = macroInt('taps_for_engagement', ${MOLOCO_V2_DEFAULT_TAP_ENGAGEMENT});
  var tr = macroInt('taps_for_redirection', ${MOLOCO_V2_DEFAULT_TAP_REDIRECTION});
  if (taps === te) fireOnce('engagement');
  if (taps === tr) fireOnce('redirection');
};
window.super_html = window.super_html || window.plbx_html;
// super-html channel marker: games (e.g. train-miner) detect the build via
// window.super_html_channel and route CTA through super_html.download() (→ our
// plbx_html.download → click beacon + mraid.open(final_url)). Without it they
// fall to window.open(link), losing the click beacon and the CTA redirect.
window.super_html_channel = window.super_html_channel || "moloco";

// Fire mraid_viewable beacon when the ad container reports viewability.
// Idempotent — Moloco DSP only wants one fire per session. Handles both
// the "already viewable at boot" case (rare, eager ad slots) and the
// async "becomes viewable later" case.
(function() {
  function fireMraidViewable() {
    if (_fired['mraid_viewable']) return;
    // fireOnce (NOT fire) — fire() never writes _fired, so a bare fire() here
    // would leave the _fired['mraid_viewable'] guard permanently false and the
    // beacon would re-fire on every viewableChange(true) / poll tick. Moloco DSP
    // expects exactly one viewable per session.
    fireOnce('mraid_viewable');
    // Container is on screen — second half of the splash-dismiss condition.
    _splash.viewable = true;
    _trySplashHide();
  }
  function attachListener() {
    if (!window.mraid) return;
    // Event-based: covers becomes-viewable-later.
    try {
      mraid.addEventListener('viewableChange', function(v) {
        if (v) fireMraidViewable();
      });
    } catch(e) {}
    // Poll-based: the launcher can fire the FIRST viewableChange before this
    // payload's listener is attached (the pulse is lost → splash stays up until a
    // second pulse — observed as "viewable only works the 2nd time"). Polling
    // isViewable() catches both the already-viewable and missed-first-pulse cases.
    // Idempotent: fireMraidViewable guards on _fired['mraid_viewable'].
    (function poll(n) {
      if (_fired['mraid_viewable']) return;
      try {
        if (typeof mraid.isViewable === 'function' && mraid.isViewable()) { fireMraidViewable(); return; }
      } catch(e) {}
      if (n > 0) setTimeout(function() { poll(n - 1); }, 200);
    })(50);
  }
  if (window.mraid) {
    try {
      if (typeof mraid.getState === 'function' && mraid.getState() === 'loading') {
        mraid.addEventListener('ready', attachListener);
      } else {
        attachListener();
      }
    } catch(e) { attachListener(); }
  }
})();

// Track live container volume (MRAID 3.0 audioVolumeChange). start_muted only
// covers the initial state; this lets the game mute/unmute its own audio when
// the user changes volume on the ad container mid-playback.
(function() {
  function onVolume(vol) {
    // vol: percentage 0-100, or null when the SDK cannot determine it.
    // null → leave current state untouched (avoid a false unmute).
    if (vol === null || typeof vol === 'undefined') return;
    setMuted(Number(vol) <= 0);
  }
  function attachVolume() {
    if (!window.mraid) return;
    try {
      if (typeof mraid.getAudioVolume === 'function') {
        var v = mraid.getAudioVolume();
        if (v !== null && typeof v !== 'undefined') setMuted(Number(v) <= 0);
      }
    } catch(e) {}
    try { mraid.addEventListener('audioVolumeChange', onVolume); } catch(e) {}
  }
  if (window.mraid) {
    try {
      if (typeof mraid.getState === 'function' && mraid.getState() === 'loading') {
        mraid.addEventListener('ready', attachVolume);
      } else {
        attachVolume();
      }
    } catch(e) { attachVolume(); }
  }
})();
})();`;
}

export class MolocoV2Adapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return molocoV2Bridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);
  }

  getForbiddenStrings(): string[] {
    // Moloco v2.0 spec section 2.5 — payload must not call out to non-Moloco
    // trackers. Guards against analytics SDKs accidentally pulled in by the game.
    return [
      'google-analytics.com',
      'googletagmanager.com',
      'doubleclick.net',
      'facebook.net/en_US/fbevents.js',
      'connect.facebook.net',
    ];
  }

  getRequiredStrings(): string[] {
    return [
      ...super.getRequiredStrings(),
      // Launcher structural markers
      'ASSET_PROVIDER=',
      'window.MOLOCO_MACROS',
      'mraid_viewable',
      'game_viewable',
      'click',
      'final_url',
      'taps_for_engagement',
      'taps_for_redirection',
      '%{IMP_BEACON}',
      '#PAYLOAD_URL#',
      // Payload bridge markers
      'decodeURIComponent',
      'window.plbx_html.report',
      'audioVolumeChange',
      'on_mute_change',
    ];
  }
}
