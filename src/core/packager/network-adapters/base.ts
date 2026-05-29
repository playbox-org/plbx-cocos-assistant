import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';

export interface NetworkAdapter {
  readonly networkId: string;
  /** Apply network-specific transformations to the HTML */
  transform(builder: HtmlBuilder, config: PackageConfig): void;
  /** Custom JS bundle filename for ZIP networks (e.g. 'creative.js') */
  getJsBundleName(): string | null;
  /** Extra config.json content to include in ZIP */
  getZipConfig(config: PackageConfig): Record<string, any> | null;
  /**
   * Substrings that must NOT appear anywhere in the final HTML (including
   * JS comments and string literals). The packager scans the generated HTML
   * against this list and refuses to emit the build on match. Used to guard
   * against validator-level rejections that would otherwise be discovered
   * only after upload.
   */
  getForbiddenStrings(): string[];
  /**
   * Substrings that MUST appear in the final HTML. Packager scans and aborts
   * if any are missing. Guards against silent regressions in transitive code
   * (base adapter, runtime-loader) that could strip critical runtime wiring.
   * Example: MRAID defer-boot gate — if missing, video+playable combo goes
   * black screen in prod without any build-time signal.
   */
  getRequiredStrings(): string[];
}

/**
 * Build the `window.plbx_html` bridge.
 * This is the API that game code calls for download/redirect.
 * Each network routes these calls to the appropriate SDK.
 * Also aliased as `window.super_html` for backward compatibility.
 */
function buildPlbxBridge(downloadBody: string, extras?: string): string {
  return `window.plbx_html = window.plbx_html || {
  google_play_url: "",
  appstore_url: "",
  download: function(url) {
    url = url || this.google_play_url || this.appstore_url || "";
    ${downloadBody}
  },
  game_end: function() {},
  game_ready: function() {},
  is_audio: function() { return true; },
  is_hide_download: function() { return false; },
  is_muted: function() { return false; },
  report: function() {},
  tap: function() {}
};
window.super_html = window.super_html || window.plbx_html;${extras ? '\n' + extras : ''}`;
}

/** MRAID bridge — used by ironSource, AppLovin, Unity, AdColony, etc. */
export function mraidBridge(): string {
  return buildPlbxBridge(
    `if (window.mraid) { url ? mraid.open(url) : mraid.open(); } else if (url) { window.open(url, "_blank"); }`,
    // Game CTA dispatchers often call window.install()/window.open(link) directly
    // (bypassing plbx_html.download). In an MRAID ad container window.open is
    // unreliable/blocked and the network (AppLovin, ironSource, Unity, ...) only
    // tracks the click via mraid.open. Route both to mraid.open.
    `window.install = function() { var d = window.plbx_html.google_play_url || window.plbx_html.appstore_url || ""; if (window.mraid) { d ? mraid.open(d) : mraid.open(); } };
var _plbxOrigOpen = window.open;
window.open = function(u) {
  if (window.mraid) { try { u ? mraid.open(u) : mraid.open(); } catch(e) {} return null; }
  try { return _plbxOrigOpen.apply(window, arguments); } catch(e) { return null; }
};`,
  );
}

/**
 * MRAID defer-boot gate — same pattern as super-html's viewable_start_ads().
 * Defers Cocos boot until ad is viewable. Fixes video+playable combo black screen
 * (AppLovin Axon etc.) where playable HTML preloads in hidden WebView while video plays,
 * causing Cocos to init with 0x0 canvas.
 *
 * Registers window.__plbx_pre_boot(origBoot) — called by runtime-loader before Cocos boot.
 * If mraid.isViewable() → boot immediately. Else → wait for viewableChange(true) → boot.
 * If no mraid at all → boot immediately (runtime preview, validators without MRAID).
 */
export function mraidDeferBootGate(): string {
  return `window.__plbx_pre_boot = function(boot) {
  if (!window.mraid) { boot(); return; }
  function gate() {
    if (mraid.isViewable()) { boot(); return; }
    mraid.addEventListener('viewableChange', function h(v) {
      if (v) { mraid.removeEventListener('viewableChange', h); boot(); }
    });
  }
  mraid.getState() === 'loading' ? mraid.addEventListener('ready', gate) : gate();
};`;
}

/** Facebook/Moloco bridge */
export function facebookBridge(): string {
  return buildPlbxBridge(
    `if (window.FbPlayableAd) { FbPlayableAd.onCTAClick(); } else if (url) { window.open(url, "_blank"); }`,
    // Some game CTA dispatchers call window.install() / window.open() DIRECTLY
    // (bypassing plbx_html.download). In Facebook's sandboxed frame window.open()
    // is blocked ("'allow-popups' permission not set") AND the FB validator never
    // sees the click. So route BOTH paths to the FB SDK:
    //   - window.install (Mintegral CTA name; harmless here, no Mintegral SDK on FB)
    //     covers dispatchers that prefer window.install() (e.g. train-miner2-c4).
    //   - window.open override covers older dispatchers that call window.open(link)
    //     directly (e.g. train-miner v1). window.open is blocked on FB regardless,
    //     so redirecting it to onCTAClick strictly improves tracking.
    `window.install = function() { if (window.FbPlayableAd && FbPlayableAd.onCTAClick) FbPlayableAd.onCTAClick(); };
var _plbxOrigOpen = window.open;
window.open = function(u) {
  if (window.FbPlayableAd && FbPlayableAd.onCTAClick) { try { FbPlayableAd.onCTAClick(); } catch(e) {} return null; }
  try { return _plbxOrigOpen.apply(window, arguments); } catch(e) { return null; }
};`,
  );
}

/** Google Ads bridge */
export function googleBridge(): string {
  return buildPlbxBridge(
    `if (window.ExitApi) { ExitApi.exit(); } else { var dest = url || window.clickTag || ""; if (dest) window.open(dest, "_blank"); }`,
    [
      `window.plbx_html.is_hide_download = function() { return true; };`,
      // Game CTA dispatchers calling window.install()/window.open() directly must
      // route to ExitApi.exit() — Google tracks the click only via ExitApi.
      `window.install = function() { if (window.ExitApi) ExitApi.exit(); };
var _plbxOrigOpen = window.open;
window.open = function(u) {
  if (window.ExitApi) { try { ExitApi.exit(); } catch(e) {} return null; }
  try { return _plbxOrigOpen.apply(window, arguments); } catch(e) { return null; }
};`,
    ].join('\n'),
  );
}

/** TikTok/Pangle bridge — uses playableSDK for CTA, gameReady, and gameClose */
export function tiktokBridge(): string {
  return buildPlbxBridge(
    `if (window.playableSDK) { playableSDK.openAppStore(); } else if (url) { window.open(url, "_blank"); }`,
    [
      `window.plbx_html.game_ready = function() { if (window.playableSDK && playableSDK.reportGameReady) { playableSDK.reportGameReady(); } };`,
      `window.plbx_html.game_end = function() { if (window.playableSDK && playableSDK.reportGameClose) { playableSDK.reportGameClose(); } };`,
      // Game CTA dispatchers calling window.install()/window.open() directly must
      // route to playableSDK.openAppStore() — TikTok/Pangle track via the SDK.
      `window.install = function() { if (window.playableSDK && playableSDK.openAppStore) playableSDK.openAppStore(); };
var _plbxOrigOpen = window.open;
window.open = function(u) {
  if (window.playableSDK && playableSDK.openAppStore) { try { playableSDK.openAppStore(); } catch(e) {} return null; }
  try { return _plbxOrigOpen.apply(window, arguments); } catch(e) { return null; }
};`,
    ].join('\n'),
  );
}

/** Generic fallback bridge */
export function genericBridge(): string {
  return buildPlbxBridge(`if (url) { window.open(url, "_blank"); }`);
}

export class BaseAdapter implements NetworkAdapter {
  constructor(
    public readonly networkId: string,
    protected readonly networkConfig: NetworkConfig,
  ) {}

  /** Override in subclasses for network-specific bridge */
  protected getPlbxBridge(_config: PackageConfig): string {
    if (this.networkConfig.mraid) return mraidBridge();
    return genericBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    // Inject MRAID if needed
    if (this.networkConfig.mraid) {
      builder.injectHeadScript('mraid.js');
      // Defer Cocos boot until mraid.isViewable() — fixes video+playable combo black screen
      builder.injectBodyScript(mraidDeferBootGate());
    }
    // Inject SDK URL if specified
    if (this.networkConfig.sdkUrl) {
      builder.injectHeadScript(this.networkConfig.sdkUrl);
    }
    // Inject SDK inline JS if specified
    if (this.networkConfig.sdkInline) {
      builder.injectBodyScript(this.networkConfig.sdkInline);
    }

    // Inject plbx_html bridge (store URLs from config)
    const bridge = this.getPlbxBridge(config);
    const storeSetup = [
      config.storeUrlIos ? `window.plbx_html.appstore_url = "${config.storeUrlIos}";` : '',
      config.storeUrlAndroid ? `window.plbx_html.google_play_url = "${config.storeUrlAndroid}";` : '',
      // super-html channel marker. Games written for super-html (e.g. train-miner)
      // detect the build via `window.super_html_channel` and route CTA through
      // `super_html.download()` (which we alias to plbx_html.download → the right
      // per-network SDK) + set their own store URLs. Without it the game falls to
      // window.install()/window.open() which is unreliable/blocked in ad sandboxes.
      `window.super_html_channel = "${this.networkId}";`,
    ]
      .filter(Boolean)
      .join('\n');
    builder.injectBodyScript(bridge + (storeSetup ? '\n' + storeSetup : ''));

    // Inject custom head from config
    if (config.customInjectHead) {
      builder.injectBodyScript(config.customInjectHead);
    }
    // Inject custom body from config
    if (config.customInjectBody) {
      builder.injectBodyScript(config.customInjectBody);
    }
  }

  getJsBundleName(): string | null {
    return this.networkConfig.jsBundle || null;
  }

  getZipConfig(config: PackageConfig): Record<string, any> | null {
    return this.networkConfig.zipConfig || null;
  }

  getForbiddenStrings(): string[] {
    return [];
  }

  getRequiredStrings(): string[] {
    // MRAID networks must ship the defer-boot gate — without it, video+playable
    // combo (AppLovin Axon, etc.) shows black screen because Cocos initializes
    // in hidden WebView with 0x0 canvas.
    if (this.networkConfig.mraid) {
      return [
        '__plbx_pre_boot = function',
        'mraid.isViewable',
        'viewableChange',
        'mraid.js',
      ];
    }
    return [];
  }
}
