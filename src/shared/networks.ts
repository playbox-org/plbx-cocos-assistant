import { NetworkConfig, OutputFormat } from './types';

const MB5 = 5 * 1024 * 1024; // 5242880 bytes
const MB3 = 3 * 1024 * 1024; // 3145728 bytes
const MB2 = 2 * 1024 * 1024; // 2097152 bytes

export const NETWORKS: Record<string, NetworkConfig> = {
  preview: {
    id: 'preview',
    name: 'Preview',
    format: 'html',
    maxSize: 10 * 1024 * 1024, // 10MB — no real limit for preview
    mraid: false,
    inlineAssets: true,
  },
  applovin: {
    id: 'applovin',
    name: 'AppLovin',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
  },
  unity: {
    id: 'unity',
    name: 'Unity Ads',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
    requiresStoreUrl: true,
  },
  ironsource: {
    id: 'ironsource',
    name: 'ironSource',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
  },
  adcolony: {
    id: 'adcolony',
    name: 'AdColony',
    format: 'html',
    // No official DT Exchange / AdColony playable file-size limit is published;
    // 5 MB is an internal cap (was MB2 — that figure had no source). Verified 2026-07-01.
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
  },
  tapjoy: {
    id: 'tapjoy',
    name: 'Tapjoy',
    format: 'html',
    maxSize: 1.9 * 1024 * 1024, // 1.9 MB
    mraid: false,
    inlineAssets: true,
  },
  appreciate: {
    id: 'appreciate',
    name: 'Appreciate',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
  },
  chartboost: {
    id: 'chartboost',
    name: 'Chartboost',
    format: 'html',
    maxSize: MB3,
    mraid: true,
    inlineAssets: true,
  },
  liftoff: {
    id: 'liftoff',
    name: 'Liftoff',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
    dualFormat: true,
  },
  smadex: {
    id: 'smadex',
    name: 'Smadex',
    format: 'html',
    maxSize: MB5,
    mraid: false,
    inlineAssets: true,
  },
  rubeex: {
    id: 'rubeex',
    name: 'Rubeex',
    format: 'html',
    maxSize: MB5,
    mraid: false,
    inlineAssets: true,
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook/Meta',
    format: 'html',
    maxSize: MB5,        // ZIP total ceiling (<=100 files)
    htmlMaxSize: MB2,    // single-HTML / index.html must be <=2 MB (Meta). Verified 2026-07-01.
    mraid: false,
    inlineAssets: true,
    dualFormat: true,
  },
  moloco: {
    id: 'moloco',
    name: 'Moloco',
    format: 'html',
    maxSize: MB5,
    mraid: false,
    inlineAssets: true,
    // Moloco IEC guide: "Ad file must not be compressed into .zip" — HTML-only, no ZIP.
    dualFormat: false,
  },
  molocoV2: {
    id: 'molocoV2',
    name: 'Moloco V2.0 (Launcher API)',
    format: 'launcher-payload',
    maxSize: MB5, // overall ceiling — sub-limits enforced via launcherPayload below
    mraid: true,
    inlineAssets: true,
    launcherPayload: {
      launcherMaxSize: 3 * 1024, // 3 KB strict
      payloadMaxSize: MB5,
      assetProvider: 'Playbox',
      assetVersion: '2.0',
      includeSplash: true, // PLBX branded loading splash; auto-hides on game_ready (~1.8 KB total, still < 3 KB)
    },
  },
  nefta: {
    id: 'nefta',
    name: 'Nefta',
    format: 'html',
    maxSize: 5 * 1024 * 1024,
    mraid: false,
    inlineAssets: true,
    dualFormat: true,
  },
  google: {
    id: 'google',
    name: 'Google Ads',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    sdkUrl: 'https://tpc.googlesyndication.com/pagead/gadgets/html5/api/exitapi.js',
    singleFileZip: true,
    inlineAssets: false,
  },
  pangle: {
    id: 'pangle',
    name: 'Pangle',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    // Same union-fe-nc playable_sdk as TikTok; pstatp served a stale v3.4.1 build,
    // ibytedtos i18n is the current v3.49.0 that official Pangle docs instruct. Verified 2026-07-01.
    sdkUrl: 'https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js',
    singleFileZip: true,
    inlineAssets: false,
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    sdkUrl: 'https://sf16-muse-va.ibytedtos.com/obj/union-fe-nc-i18n/playable/sdk/playable-sdk.js',
    singleFileZip: true,
    inlineAssets: false,
  },
  vungle: {
    id: 'vungle',
    name: 'Vungle',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    singleFileZip: true,
    inlineAssets: false,
  },
  mytarget: {
    id: 'mytarget',
    name: 'MyTarget',
    format: 'zip',
    maxSize: MB2,
    mraid: true,
    singleFileZip: true,
    inlineAssets: false,
  },
  mintegral: {
    id: 'mintegral',
    name: 'Mintegral',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    singleFileZip: true,
    inlineAssets: false,
    // Mintegral 2026 rule: the HTML inside the zip must match the playable
    // filename (the outer .zip basename), not index.html — else load fails.
    htmlMatchesZipName: true,
  },
  adikteev: {
    id: 'adikteev',
    name: 'Adikteev',
    format: 'zip',
    maxSize: MB5,
    mraid: true,
    singleFileZip: true,
    inlineAssets: false,
  },
  bigabid: {
    id: 'bigabid',
    name: 'Bigabid',
    format: 'zip',
    maxSize: MB5,
    mraid: true,
    singleFileZip: true,
    inlineAssets: false,
  },
  inmobi: {
    id: 'inmobi',
    name: 'inMobi',
    format: 'html',
    maxSize: MB5,
    mraid: true,
    inlineAssets: true,
  },
  snapchat: {
    id: 'snapchat',
    name: 'Snapchat',
    format: 'zip',
    maxSize: MB5,
    // Snapchat App Playables use ScPlayableAd.onCTAClick() and forbid mraid.js —
    // NOT MRAID. CTA handled by SnapchatAdapter/snapchatBridge. Verified 2026-07-01
    // (Snap App Playables spec + smoud/playable-sdk).
    mraid: false,
    zipConfig: { orientation: 1 },
    singleFileZip: true,
    inlineAssets: false,
  },
  bigo: {
    id: 'bigo',
    name: 'Bigo Ads',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    sdkUrl: 'https://static-web.likeevideo.com/as/common-static/big-data/dsp-public/bgy-mraid-sdk.js',
    zipConfig: { orientation: 0 },
    singleFileZip: true,
    inlineAssets: false,
  },
  gdt: {
    id: 'gdt',
    name: 'GDT (Tencent)',
    format: 'zip',
    // 优量汇 spec: 包大小不大于3M. Verified 2026-07-01.
    maxSize: MB3,
    mraid: false,
    sdkUrl: 'https://qzs.gdtimg.com/union/res/union_sdk/page/unjs/unsdk.js',
    singleFileZip: true,
    inlineAssets: false,
  },
  kwai: {
    id: 'kwai',
    name: 'Kwai',
    format: 'zip',
    maxSize: MB5,
    mraid: false,
    singleFileZip: true,
    inlineAssets: false,
  },
  newsbreak: {
    id: 'newsbreak',
    name: 'NewsBreak',
    format: 'html',
    maxSize: MB5,
    mraid: false,
    inlineAssets: true,
  },
  yandex: {
    id: 'yandex',
    name: 'Yandex',
    format: 'zip',
    maxSize: MB3,
    mraid: false,
    jsBundle: 'res.js',
    inlineAssets: false,
  },
};

export function getNetwork(id: string): NetworkConfig | undefined {
  return NETWORKS[id];
}

/** Effective size ceiling for a given output format. Networks that cap single-HTML
 *  tighter than their ZIP (e.g. Facebook: 2 MB HTML / 5 MB ZIP) set `htmlMaxSize`. */
export function maxSizeForFormat(net: NetworkConfig, format: OutputFormat): number {
  return format === 'html' && net.htmlMaxSize ? net.htmlMaxSize : net.maxSize;
}

export function getNetworksByFormat(format: OutputFormat): NetworkConfig[] {
  return Object.values(NETWORKS).filter((n) => n.format === format);
}

export function getAllNetworks(): NetworkConfig[] {
  return Object.values(NETWORKS);
}
