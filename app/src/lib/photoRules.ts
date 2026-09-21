/**
 * Which photo files are still spoken for.
 *
 * Photos are referenced by URI from a measurement, and the files outlive the
 * rows: a delete, a reset and a restore each leave images on disk that nothing
 * points at any more. Left alone they are invisible clutter that still shows
 * up in the phone's storage figures — and, for photos of someone's body, that
 * is not merely untidy.
 *
 * The rule cuts the other way too, which is why this is a separate function
 * with its own tests: deleting a file that *is* still referenced destroys a
 * photo the user can never get back. When in doubt, the file is kept.
 *
 * Pure: no native imports, so the comparison is tested on Node.
 */

/** A row that may or may not carry a photo. Only the URI matters here. */
export interface PhotoOwner {
  photo?: string | null;
}

/**
 * The final path segment, lower-cased, with any query string dropped.
 *
 * Comparing by name rather than by whole URI on purpose: the same file can be
 * addressed as `file:///…/x.jpg` or `/…/x.jpg`, and percent-encoding differs
 * between the picker, the file system and a restore. A mismatch there would
 * silently delete a photo that is still in use.
 */
export function photoFileName(uri: string | null | undefined): string | null {
  if (!uri) return null;
  const withoutQuery = uri.split('?')[0].split('#')[0];
  const name = withoutQuery.split('/').pop();
  if (!name) return null;
  let decoded = name;
  try {
    decoded = decodeURIComponent(name);
  } catch {
    /* a stray % is not a reason to treat the file as unclaimed */
  }
  return decoded.toLowerCase();
}

// ── when a sweep is safe at all ──────────────────────────────────────────────

/**
 * What the launch knows about how the stored payload arrived.
 *
 * All four fields matter, because each one describes a state in which the
 * measurements in memory are *not* an account of which photos are wanted.
 */
export interface LaunchHydration {
  status: 'first-run' | 'loaded' | 'unreadable';
  /** False when the payload had to be rescued instead of parsed. */
  parsed: boolean;
  /** True when the payload came from a build newer than this one. */
  downgrade: boolean;
  /** True when migration dropped or repaired measurement rows. */
  measurementsAltered: boolean;
}

export type SweepTrigger =
  | { kind: 'launch'; hydration: LaunchHydration }
  /** A reset, restore or delete whose undo window has closed. */
  | { kind: 'user-action' };

export interface SweepDecision {
  sweep: boolean;
  /** Why not. Null when there is simply nothing to delete. */
  blockedBy:
    | 'storage-unreadable'
    | 'nothing-loaded'
    | 'payload-rescued'
    | 'downgrade'
    | 'measurements-altered'
    | 'no-owners'
    | null;
}

const GO: SweepDecision = { sweep: true, blockedBy: null };
const NOTHING: SweepDecision = { sweep: false, blockedBy: null };

/**
 * Whether it is safe to delete unreferenced photo files at all.
 *
 * The sweep compares the files on disk against the measurements in memory, so
 * it is only ever as trustworthy as those measurements. There are several
 * states where they are not the whole story, and in every one of them a sweep
 * would delete photos the user still has a claim to:
 *
 * - **The payload was rescued, not parsed.** The app is running on
 *   `emptyData()` while `wt.data.corrupt.*` still references every photo. A
 *   sweep here deletes the lot, and the rescue copy becomes worthless.
 * - **Storage never answered**, or there was nothing to load. Same reasoning:
 *   an empty log in memory is not evidence of an empty log on disk.
 * - **A downgrade.** The stored payload is deliberately not being written
 *   over, so its measurements — not the migrated ones — are what count.
 * - **Migration altered the measurements.** Rows it dropped may still be
 *   recoverable from the pre-migration snapshot; their photos should be too.
 *
 * On top of all that: finding files but *no* owners at launch is treated as a
 * reason to stop, not as a mandate to delete everything. Wiping a user's
 * entire photo set is not something to do on an inference. Only an explicit
 * reset or restore, whose undo has already expired, may clear the last one.
 */
export function maySweepPhotos(
  trigger: SweepTrigger,
  counts: { owners: number; files: number },
): SweepDecision {
  if (counts.files === 0) return NOTHING;

  if (trigger.kind === 'launch') {
    const { status, parsed, downgrade, measurementsAltered } = trigger.hydration;

    if (status === 'unreadable') return { sweep: false, blockedBy: 'storage-unreadable' };
    if (status !== 'loaded') return { sweep: false, blockedBy: 'nothing-loaded' };
    if (!parsed) return { sweep: false, blockedBy: 'payload-rescued' };
    if (downgrade) return { sweep: false, blockedBy: 'downgrade' };
    if (measurementsAltered) return { sweep: false, blockedBy: 'measurements-altered' };
    if (counts.owners === 0) return { sweep: false, blockedBy: 'no-owners' };
  }

  return GO;
}

/**
 * Files in the photo directory that no measurement references.
 *
 * Anything whose name cannot be read is treated as claimed and left alone.
 */
export function orphanedPhotoFiles(files: string[], owners: PhotoOwner[]): string[] {
  const claimed = new Set<string>();
  for (const owner of owners) {
    const name = photoFileName(owner.photo);
    if (name) claimed.add(name);
  }

  return files.filter((file) => {
    const name = photoFileName(file);
    return name != null && !claimed.has(name);
  });
}
