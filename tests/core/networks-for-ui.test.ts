/**
 * The network checkbox grid lists real ad networks. The kit's `plbx` entry is
 * the repack source target (what "Upload for packaging" sends to the door), not
 * a destination a developer picks — it must never show up as a checkbox.
 */
import { describe, it, expect } from 'vitest';
import { HIDDEN_NETWORK_IDS, selectableNetworks } from '../../src/core/networks-for-ui';

describe('selectableNetworks', () => {
  it('hides the plbx repack-source target from the network grid', () => {
    const all = [
      { id: 'applovin', name: 'AppLovin' },
      { id: 'plbx', name: 'Playbox (repack source)' },
      { id: 'unity', name: 'Unity' },
    ];
    expect(selectableNetworks(all).map((n) => n.id)).toEqual(['applovin', 'unity']);
    expect(HIDDEN_NETWORK_IDS).toContain('plbx');
  });

  it('leaves a list without hidden ids untouched', () => {
    const all = [{ id: 'applovin' }, { id: 'unity' }];
    expect(selectableNetworks(all)).toEqual(all);
  });
});
