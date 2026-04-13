import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

/**
 * AppLovin adapter.
 * - MRAID injection is handled by BaseAdapter (networkConfig.mraid === true)
 * - CTA via mraid.open(url) — handled by BaseAdapter's mraidBridge()
 * - Injects viewport meta for proper mobile rendering
 */
export class AppLovinAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);

    // Inject viewport meta for proper mobile rendering (AppLovin requirement)
    builder.injectMeta('viewport', 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no');
  }
}
