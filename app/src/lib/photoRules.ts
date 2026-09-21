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
