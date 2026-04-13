import { NetworkAdapter, BaseAdapter } from './base';
import { AppLovinAdapter } from './applovin';
import { GoogleAdapter } from './google';
import { FacebookAdapter } from './facebook';
import { MintegralAdapter } from './mintegral';
import { TikTokAdapter } from './tiktok';
import { PangleAdapter } from './pangle';
import { SnapchatAdapter } from './snapchat';
import { getNetwork } from '../../../shared/networks';
import { NetworkConfig } from '../../../shared/types';

type AdapterConstructor = new (id: string, config: NetworkConfig) => NetworkAdapter;

const CUSTOM_ADAPTERS: Record<string, AdapterConstructor> = {
  applovin: AppLovinAdapter,
  google: GoogleAdapter,
  facebook: FacebookAdapter,
  moloco: FacebookAdapter, // same CTA pattern as Facebook
  mintegral: MintegralAdapter,
  tiktok: TikTokAdapter,
  pangle: PangleAdapter,
  snapchat: SnapchatAdapter,
};

export function getAdapter(networkId: string): NetworkAdapter {
  const config = getNetwork(networkId);
  if (!config) throw new Error(`Unknown network: ${networkId}`);

  const CustomAdapter = CUSTOM_ADAPTERS[networkId];
  if (CustomAdapter) {
    return new CustomAdapter(networkId, config);
  }

  return new BaseAdapter(networkId, config);
}

export { NetworkAdapter, BaseAdapter } from './base';
