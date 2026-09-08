/**
 * Which kit registry entries the panel offers as checkboxes.
 *
 * Nothing is hidden today. The kit's `plbx` entry (the Playbox export archive:
 * `source.html` + `build.zip` + `plbx.json`) is a first-class target in the
 * grid like Luna — the build a developer hands to the Playbox platform —
 * decided 2026-09-08. The hook stays so a registry entry that must never be
 * packaged from the panel has one place to go.
 */

/** `readonly string[]`, not `as const` — `.includes(n.id)` on a tuple is TS2345. */
export const HIDDEN_NETWORK_IDS: readonly string[] = [];

export function selectableNetworks<T extends { id: string }>(all: T[]): T[] {
  return all.filter((n) => !HIDDEN_NETWORK_IDS.includes(n.id));
}
