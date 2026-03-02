import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, facebookBridge } from './base';

const FB_PLAYABLE_AD_SCRIPT = `var FbPlayableAd = FbPlayableAd || {};
FbPlayableAd.onCTAClick = function() { /* CTA handler */ };`;

/**
 * Facebook/Meta adapter (also used by Moloco — same CTA pattern).
 * Injects FbPlayableAd initialization script.
 */
export class FacebookAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return facebookBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);
    builder.injectBodyScript(FB_PLAYABLE_AD_SCRIPT);
  }
}
