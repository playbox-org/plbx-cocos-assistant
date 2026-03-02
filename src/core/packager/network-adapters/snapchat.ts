import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

const ORIENTATION_MAP: Record<string, number> = {
  portrait: 1,
  landscape: 2,
  auto: 0,
};

/**
 * Snapchat adapter.
 * getZipConfig returns { orientation: 1 } for portrait, { orientation: 2 } for landscape,
 * { orientation: 0 } for auto.
 */
export class SnapchatAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  getZipConfig(config: PackageConfig): Record<string, any> | null {
    const orientation = ORIENTATION_MAP[config.orientation] ?? 0;
    return { orientation };
  }
}
