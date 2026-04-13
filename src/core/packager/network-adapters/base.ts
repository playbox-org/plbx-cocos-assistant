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
  is_hide_download: function() { return false; }
};
window.super_html = window.super_html || window.plbx_html;${extras ? '\n' + extras : ''}`;
}

/** MRAID bridge — used by ironSource, AppLovin, Unity, AdColony, etc. */
export function mraidBridge(): string {
  return buildPlbxBridge(
    `if (window.mraid) { url ? mraid.open(url) : mraid.open(); } else if (url) { window.open(url, "_blank"); }`,
  );
}

/** Facebook/Moloco bridge */
export function facebookBridge(): string {
  return buildPlbxBridge(`if (window.FbPlayableAd) { FbPlayableAd.onCTAClick(); } else if (url) { window.open(url, "_blank"); }`);
}

/** Google Ads bridge */
export function googleBridge(): string {
  return buildPlbxBridge(
    `if (window.ExitApi) { ExitApi.exit(); } else { var dest = url || window.clickTag || ""; if (dest) window.open(dest, "_blank"); }`,
    `window.plbx_html.is_hide_download = function() { return true; };`,
  );
}

/** TikTok/Pangle bridge — uses playableSDK for CTA, gameReady, and gameClose */
export function tiktokBridge(): string {
  return buildPlbxBridge(
    `if (window.playableSDK) { playableSDK.openAppStore(); } else if (url) { window.open(url, "_blank"); }`,
    [
      `window.plbx_html.game_ready = function() { if (window.playableSDK && playableSDK.reportGameReady) { playableSDK.reportGameReady(); } };`,
      `window.plbx_html.game_end = function() { if (window.playableSDK && playableSDK.reportGameClose) { playableSDK.reportGameClose(); } };`,
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
}
