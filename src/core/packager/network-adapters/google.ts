import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, googleBridge } from './base';

/**
 * Google Ads adapter.
 * - Injects ExitAPI script (via sdkUrl in NetworkConfig)
 * - Injects <meta name="ad-size"> based on orientation: portrait=320x480, landscape=480x320
 * - Injects <meta name="ad-orientation">
 */
export class GoogleAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return googleBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);

    const isLandscape = config.orientation === 'landscape';
    const size = isLandscape ? '480x320' : '320x480';
    const orientationLabel = isLandscape ? 'landscape' : 'portrait';

    builder.injectMeta('ad-size', size);
    builder.injectMeta('ad-orientation', orientationLabel);
  }
}
