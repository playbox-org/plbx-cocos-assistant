import { BaseAdapter } from './base';
import { NetworkConfig } from '../../../shared/types';

/**
 * Shared MRAID adapter — used by AppLovin, Unity, ironSource, AdColony, etc.
 * MRAID injection is handled by BaseAdapter when networkConfig.mraid === true.
 */
export class MraidAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }
}
