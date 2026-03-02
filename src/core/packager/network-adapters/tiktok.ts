import { HtmlBuilder } from '../html-builder';
import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

const ORIENTATION_MAP: Record<string, number> = {
  portrait: 1,
  landscape: 2,
  auto: 0,
};

/**
 * TikTok adapter.
 * - Injects TikTok SDK script (via sdkUrl in NetworkConfig)
 * - getZipConfig returns { playable_orientation: 0|1|2 } based on orientation:
 *   auto=0, portrait=1, landscape=2
 */
export class TikTokAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  getZipConfig(config: PackageConfig): Record<string, any> | null {
    const orientation = ORIENTATION_MAP[config.orientation] ?? 0;
    return { playable_orientation: orientation };
  }
}
