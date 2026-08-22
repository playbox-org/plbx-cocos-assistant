/**
 * Which kit registry entries the panel offers as checkboxes.
 *
 * The kit's `plbx` entry is the repack SOURCE target — the archive "Upload for
 * packaging" sends to the door — not an ad network anyone delivers to, so it
 * must not appear in the grid (nor in `selectedNetworks`).
 */

/** `readonly string[]`, not `as const` — `.includes(n.id)` on a tuple is TS2345. */
export const HIDDEN_NETWORK_IDS: readonly string[] = ['plbx'];

export function selectableNetworks<T extends { id: string }>(all: T[]): T[] {
  return all.filter((n) => !HIDDEN_NETWORK_IDS.includes(n.id));
}
