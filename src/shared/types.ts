export type OutputFormat = 'html' | 'zip';
export type Orientation = 'portrait' | 'landscape' | 'auto';

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
  dualFormat?: boolean;      // whether the network supports both html and zip output
}

export interface PackageConfig {
  storeUrlIos: string;
  storeUrlAndroid: string;
  orientation: Orientation;
  customInjectHead?: string;
  customInjectBody?: string;
}

export interface AssetReportItem {
  uuid: string;
  name: string;
  path: string;
  file: string;      // absolute disk path
  type: string;
  sourceSize: number;
  buildSize: number;
  extension: string;
  thumbnailPath?: string;
}

export interface BuildReport {
  timestamp: number;
  projectName: string;
  totalSourceSize: number;
  totalBuildSize: number;
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
}

export interface DeployResult {
  deploymentId: string;
  url: string;
  projectName: string;
  timestamp: number;
}
