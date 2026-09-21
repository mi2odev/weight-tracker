/**
 * Pre-migration snapshots.
 *
 * A migration rewrites the user's stored payload in place. When it repairs or
 * drops anything, the bytes it replaced are the only record of what was there
 * — so a copy is kept first, under a key the app never writes over. Two are
 * retained: enough to undo a bad migration that only became obvious after a
 * second launch, few enough not to hoard the user's storage.
 *
 * **Downgrades** are the sharper case. Data written by a *newer* build can
 * hold fields this build does not know about, and `migrate()` drops what it
 * does not recognise. Writing that back would quietly delete them. So a
 * downgrade takes the same copy and then holds off writing entirely until the
 * user changes something — at which point their edit is the newer truth.
 *
 * Pure: key shapes and retention policy only, no storage calls.
 */

import { CURRENT_SCHEMA_VERSION } from '../data/types';

export const PREMIGRATION_PREFIX = 'wt.data.premigration.';

/** How many snapshots survive a prune. */
export const KEEP_SNAPSHOTS = 2;

export function premigrationKey(fromVersion: number, at: number | Date = Date.now()): string {
  const stamp = at instanceof Date ? at.getTime() : at;
  return `${PREMIGRATION_PREFIX}${fromVersion}.${stamp}`;
}

export function isPremigrationKey(key: string): boolean {
  return key.startsWith(PREMIGRATION_PREFIX);
}

/** The timestamp encoded in a snapshot key, or null if it is not one of ours. */
export function snapshotTimestamp(key: string): number | null {
  if (!isPremigrationKey(key)) return null;
  const stamp = Number(key.slice(PREMIGRATION_PREFIX.length).split('.')[1]);
  return Number.isFinite(stamp) ? stamp : null;
}

/**
 * Which snapshot keys to delete so only the newest `keep` survive.
 *
 * Keys that are not snapshots are never returned — this decides what to prune
 * from a list of *all* storage keys, and deleting anything else would be a
 * catastrophe rather than a tidy-up.
 */
export function snapshotsToPrune(keys: string[], keep = KEEP_SNAPSHOTS): string[] {
  return keys
    .filter(isPremigrationKey)
    .map((key) => ({ key, at: snapshotTimestamp(key) }))
    // An unparseable timestamp sorts oldest, so a malformed key is pruned
    // before a real one is.
    .sort((a, b) => (b.at ?? -1) - (a.at ?? -1))
    .slice(keep)
    .map((entry) => entry.key);
}

export interface MigrationOutcome {
  fromVersion: number;
  changed: boolean;
  notes: string[];
}

/** A migration that rewrote anything has replaced bytes worth keeping. */
export function shouldSnapshot(outcome: MigrationOutcome): boolean {
  return outcome.changed || outcome.notes.length > 0;
}

/**
 * True when the payload came from a build newer than this one.
 *
 * `migrate()` drops fields it does not recognise, so writing a downgraded
 * payload back would delete whatever that newer build stored.
 */
export function isDowngrade(fromVersion: number, current = CURRENT_SCHEMA_VERSION): boolean {
  return fromVersion > current;
}
