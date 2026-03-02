import { OutputFormat, Orientation, PackageConfig, PackageResult } from '../../shared/types';

export interface PackagerOptions {
  /** Path to Cocos web-mobile build output directory */
  buildDir: string;
  /** Output directory for packaged files */
  outputDir: string;
  /** Network IDs to package for */
  networks: string[];
  /** Package configuration */
  config: PackageConfig;
  /** Output filename template, e.g. '{networkId}/index.{ext}' */
  outputTemplate?: string;
  /** User-defined template variables */
  templateVariables?: Record<string, string>;
  /** Progress callback */
  onProgress?: (networkId: string, status: 'starting' | 'processing' | 'done' | 'error', message?: string) => void;
}

export interface PackagerResult {
  results: PackageResult[];
  totalTime: number;
}
