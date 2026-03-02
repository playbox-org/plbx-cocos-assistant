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
}

export class BaseAdapter implements NetworkAdapter {
  constructor(
    public readonly networkId: string,
    protected readonly networkConfig: NetworkConfig,
  ) {}

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
}
