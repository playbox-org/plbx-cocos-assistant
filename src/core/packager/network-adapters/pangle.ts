import { NetworkConfig } from '../../../shared/types';
import { BaseAdapter } from './base';

/**
 * Pangle adapter.
 * Injects Pangle SDK script (via sdkUrl in NetworkConfig).
 * All other behavior is handled by BaseAdapter.
 */
export class PangleAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }
}
