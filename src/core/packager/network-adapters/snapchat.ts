import { NetworkConfig, PackageConfig } from '../../../shared/types';
import { BaseAdapter, snapchatBridge } from './base';

const ORIENTATION_MAP: Record<string, number> = {
  portrait: 1,
  landscape: 2,
  auto: 0,
};

/**
 * Snapchat adapter.
 * CTA is `ScPlayableAd.onCTAClick()` — Snap App Playables inject `window.ScPlayableAd`,
 * NOT MRAID (mraid.js is forbidden, so `mraid: false` in the network config). Verified
 * against Snap's App Playables spec + smoud/playable-sdk (src/core.ts snapchat branch).
 * getZipConfig returns { orientation: 1 } portrait / { orientation: 2 } landscape / { orientation: 0 } auto.
 */
export class SnapchatAdapter extends BaseAdapter {
  constructor(networkId: string, networkConfig: NetworkConfig) {
    super(networkId, networkConfig);
  }

  protected getPlbxBridge(_config: PackageConfig): string {
    return snapchatBridge();
  }

  getZipConfig(config: PackageConfig): Record<string, any> | null {
    const orientation = ORIENTATION_MAP[config.orientation] ?? 0;
    return { orientation };
  }
}
