/**
 * The network checkbox grid lists every kit registry entry, the `plbx`
 * Playbox export target included — it is a build a developer hands to the
 * platform, like Luna, not a hidden implementation detail (decided 2026-09-08).
 * `selectableNetworks` is the one hook for hiding an entry, should one ever
 * need it.
 */
import { describe, it, expect } from 'vitest';
import { HIDDEN_NETWORK_IDS, selectableNetworks } from '../../src/core/networks-for-ui';

describe('selectableNetworks', () => {
  it('offers the plbx Playbox export target in the network grid, like Luna', () => {
    const all = [
      { id: 'ironsource', name: 'ironSource' },
      { id: 'plbx', name: 'Playbox (repack source)' },
      { id: 'luna', name: 'Luna' },
    ];
    expect(selectableNetworks(all).map((n) => n.id)).toEqual(['ironsource', 'plbx', 'luna']);
    expect(HIDDEN_NETWORK_IDS).not.toContain('plbx');
  });

  it('hides exactly the ids listed in HIDDEN_NETWORK_IDS and nothing else', () => {
    const all = [{ id: 'a' }, { id: 'b' }];
    expect(selectableNetworks(all)).toEqual(all);
  });
});
