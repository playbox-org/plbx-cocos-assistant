import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, tiktokBridge } from './base';

const ORIENTATION_MAP: Record<string, number> = {
  portrait: 1,
  landscape: 2,
  auto: 0,
};

/**
 * TikTok adapter.
 * - Injects TikTok SDK script (via sdkUrl in NetworkConfig)
 * - Uses playableSDK.openAppStore() for CTA
 * - Bridges game_ready → playableSDK.reportGameReady()
 * - Bridges game_end → playableSDK.reportGameClose()
 * - Injects viewport meta for proper mobile rendering
 * - getZipConfig returns { playable_orientation: 0|1|2 } based on orientation:
 *   auto=0, portrait=1, landscape=2
 */
export class TikTokAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return tiktokBridge();
  }

  transform(builder: HtmlBuilder, config: PackageConfig): void {
    super.transform(builder, config);

    // Inject viewport meta for proper mobile rendering
    builder.injectMeta('viewport', 'width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no');
  }

  getZipConfig(config: PackageConfig): Record<string, any> | null {
    const orientation = ORIENTATION_MAP[config.orientation] ?? 0;
    return { playable_orientation: orientation };
  }
}
