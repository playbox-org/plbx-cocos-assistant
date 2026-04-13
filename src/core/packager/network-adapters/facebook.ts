import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, facebookBridge } from './base';

/**
 * Facebook/Meta adapter (also used by Moloco — same CTA pattern).
 *
 * Do NOT inject a client-side `FbPlayableAd` stub: the Meta/Moloco validator
 * supplies the real `window.FbPlayableAd` with a working `onCTAClick`, and
 * any assignment like `FbPlayableAd.onCTAClick = function() {}` we inject
 * would overwrite it and kill CTA tracking. The `facebookBridge()` already
 * guards with `if (window.FbPlayableAd)` and falls back to `window.open`
 * for SDK-less environments.
 */
export class FacebookAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return facebookBridge();
  }
}
