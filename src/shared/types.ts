export type OutputFormat = 'html' | 'zip' | 'launcher-payload';
export type Orientation = 'portrait' | 'landscape' | 'auto';

export interface LauncherPayloadConfig {
  launcherMaxSize: number;   // strict bytes ceiling for launcher.html (e.g. 3 * 1024)
  payloadMaxSize: number;    // bytes ceiling for payload.js (e.g. 5 MB)
  assetProvider: string;     // metadata header value (e.g. "Playbox")
  assetVersion: string;      // metadata header value (e.g. "2.0")
  includeSplash: boolean;    // optional PLBX branded splash inside launcher
}

export interface NetworkConfig {
  id: string;
  name: string;
  format: OutputFormat;
  maxSize: number;           // bytes
  mraid: boolean;
  sdkUrl?: string;           // external SDK script URL to inject
  sdkInline?: string;        // inline JS to inject
  jsBundle?: string;         // custom JS filename in ZIP (e.g. 'creative.js')
  zipConfig?: Record<string, any>; // config.json content for ZIP
  zipStructure?: string;     // custom path inside ZIP (e.g. 'mintegral/')
  metaTags?: Record<string, string>; // meta tags to inject
  inlineAssets: boolean;     // whether to inline all assets into HTML
  singleFileZip?: boolean;   // ZIP containing a single fully-inlined HTML (e.g. Mintegral)
  /** Name the inner HTML after the outer .zip basename instead of index.html.
   *  Mintegral's 2026 zip-naming rule requires the file inside the archive to
   *  match the playable filename (e.g. RISE_play036_01.html). Only meaningful
   *  with singleFileZip. Falls back to index.html when the basename is "index". */
  htmlMatchesZipName?: boolean;
  dualFormat?: boolean;      // whether the network supports both html and zip output
  launcherPayload?: LauncherPayloadConfig; // launcher-payload format config
  /** Network whose validator requires a Google Play Store URL in the build (e.g. Unity
   *  Creative Pack). Packager warns (does not fail) if none is found in the build. */
  requiresStoreUrl?: boolean;
}

export interface PackageConfig {
  /** @deprecated Store URLs now flow from game code (set_google_play_url / set_app_store_url)
   *  and are mirrored to <head> by the packager. Kept optional for programmatic (CLI) callers. */
  storeUrlIos?: string;
  /** @deprecated see storeUrlIos */
  storeUrlAndroid?: string;
  orientation: Orientation;
  customInjectHead?: string;
  customInjectBody?: string;
  /** Runtime loader engine. Defaults to 'self-contained'. */
  loaderMode?: 'self-contained' | 'systemjs';
  /** Networks pinned to the legacy SystemJS loader regardless of loaderMode. */
  legacyLoaderNetworks?: string[];
  /** Show PLBX loading splash until the first rendered Cocos frame. Default true. */
  showSplash?: boolean;
  /** Absolute path to a client logo (PNG/JPG/WebP) shown on the splash instead
   *  of the PLBX pinwheel + wordmark. Empty/unreadable → default PLBX splash. */
  customSplashLogo?: string;
  /** Asset-container encodings to emit (self-contained loader only). Default
   *  ['base64']. With both, base122 → primary `index.html`, base64 → sibling `.b64.html`. */
  assetEncodings?: ('base64' | 'base122')[];
}

export interface AssetReportItem {
  uuid: string;
  name: string;
  path: string;
  file: string;      // absolute disk path
  type: string;
  sourceSize: number;
  buildSize: number;
  actualBuildSize?: number;    // real size from build dir
  extension: string;
  thumbnailPath?: string;
  buildStatus: 'confirmed' | 'predicted' | 'unused';
}

export interface BuildCategories {
  engine: number;    // cocos-js/cc.js
  plugins: number;   // other cocos-js/ files (spine, dragonbones, etc.)
  assets: number;    // assets/*/native/ + assets/*/import/
  scripts: number;   // src/chunks/*.js, src/*.bundle.js
  other: number;     // everything else (index.html, application.js, effect.bin, etc.)
}

export interface PackedHtmlEntry {
  network: string;   // directory name (applovin, unity, facebook, etc.)
  size: number;      // bytes
}

export interface BuildReport {
  timestamp: number;
  projectName: string;
  totalSourceSize: number;
  totalBuildSize: number;
  totalActualBuildSize?: number;
  buildDirExists: boolean;
  buildTimestamp?: number;
  buildCategories?: BuildCategories;
  packedHtmls?: PackedHtmlEntry[];
  assets: AssetReportItem[];
}

export interface CompressionResult {
  inputPath: string;
  outputPath: string;
  inputSize: number;
  outputSize: number;
  format: string;
  quality: number;
  savings: number;
}

export interface PackageResult {
  networkId: string;
  networkName: string;
  outputPath: string;
  outputSize: number;
  maxSize: number;
  withinLimit: boolean;
  format: OutputFormat;
  /** Only set for launcher-payload format: payload.js path */
  secondaryPath?: string;
  /** Only set for launcher-payload format: payload.js bytes */
  secondarySize?: number;
  /** Only set for launcher-payload format: payload size ceiling */
  secondaryMaxSize?: number;
  /** Only set for launcher-payload format: whether payload fits within limit */
  secondaryWithinLimit?: boolean;
  /** Non-fatal packaging warnings surfaced to the user (e.g. missing Google Play
   *  Store URL for a network whose validator requires it). */
  warnings?: string[];
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  projectName: string;
  timestamp: number;
}
