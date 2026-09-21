/**
 * Progress photos.
 *
 * These are the most sensitive thing in the app — more so than the numbers —
 * so two rules are structural rather than incidental:
 *
 * - **Photos live in the document directory, never the cache.** The cache is
 *   the OS's to delete when storage runs low, and losing a before-photo a
 *   user took six months ago is not recoverable.
 *
 * - **They never leave the device unless the user exports them.** Nothing here
 *   uploads. The picker copies a chosen image in; `readAsBase64` exists only
 *   so the backup can carry them when the user asks it to.
 */

import * as FileSystem from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';

import { DateKey } from '../data/types';
import { orphanedPhotoFiles, PhotoOwner } from './photoRules';

export * from './photoRules';

const PHOTO_DIR = 'progress-photos';

function photoDirectory(): FileSystem.Directory {
  const directory = new FileSystem.Directory(FileSystem.Paths.document, PHOTO_DIR);
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

/** Stable per measurement, so replacing a photo overwrites rather than piles up. */
function fileNameFor(logDate: DateKey, sourceUri: string): string {
  const extension = sourceUri.split('.').pop()?.split('?')[0]?.toLowerCase();
  const safe = extension && /^(jpg|jpeg|png|heic|webp)$/.test(extension) ? extension : 'jpg';
  return `${logDate}.${safe}`;
}

export type PhotoPick = { canceled: true } | { canceled: false; uri: string };

/**
 * Copies a picked image into the app's own storage and returns the new URI.
 *
 * The picker hands back a URI into a system cache or a provider that may not
 * survive; copying is what makes the photo the app's to keep.
 */
async function adopt(sourceUri: string, logDate: DateKey): Promise<string> {
  const target = new FileSystem.File(photoDirectory(), fileNameFor(logDate, sourceUri));
  if (target.exists) target.delete();
  new FileSystem.File(sourceUri).copy(target);
  return target.uri;
}

export async function pickFromLibrary(logDate: DateKey): Promise<PhotoPick> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    quality: 0.8,
  });
  if (result.canceled || !result.assets?.length) return { canceled: true };

  return { canceled: false, uri: await adopt(result.assets[0].uri, logDate) };
}

export async function takePhoto(logDate: DateKey): Promise<PhotoPick> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) return { canceled: true };

  const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
  if (result.canceled || !result.assets?.length) return { canceled: true };

  return { canceled: false, uri: await adopt(result.assets[0].uri, logDate) };
}

/** Every file currently sitting in the photo directory. */
export function listPhotoFiles(): string[] {
  try {
    return photoDirectory()
      .list()
      .filter((entry): entry is FileSystem.File => entry instanceof FileSystem.File)
      .map((file) => file.uri);
  } catch {
    return [];
  }
}

/**
 * Deletes the photo files nothing references any more, and reports how many.
 *
 * Deliberately driven by `orphanedPhotoFiles` rather than by a list of URIs a
 * caller remembered: after a reset or a restore the only reliable account of
 * what is still wanted is the measurements themselves.
 */
export function sweepOrphanedPhotos(owners: PhotoOwner[]): number {
  const orphans = orphanedPhotoFiles(listPhotoFiles(), owners);
  for (const uri of orphans) deletePhoto(uri);
  return orphans.length;
}

/** Removes the file behind a measurement's photo. Missing is not an error. */
export function deletePhoto(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const file = new FileSystem.File(uri);
    if (file.exists) file.delete();
  } catch {
    /* already gone, or outside our directory — nothing to do */
  }
}

/**
 * Photos as base64, keyed by measurement id — only for a backup the user has
 * explicitly asked to include them in. They roughly double in size as base64,
 * which is why it is a separate choice rather than the default.
 */
export function readAsBase64(byId: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, uri] of Object.entries(byId)) {
    try {
      const file = new FileSystem.File(uri);
      if (file.exists) out[id] = file.base64Sync();
    } catch {
      /* skip anything unreadable rather than failing the whole backup */
    }
  }
  return out;
}

/**
 * Writes backed-up photos back onto this device and returns their new URIs.
 *
 * A restored `file://` path points at the *old* device's sandbox, so the URI
 * in the backup is meaningless here — only the bytes travel. Anything that
 * cannot be written is left out, and the caller clears that measurement's
 * photo rather than leaving a URI to nothing.
 */
export function restorePhotos(byId: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, base64] of Object.entries(byId)) {
    try {
      const file = new FileSystem.File(photoDirectory(), `restored-${id}.jpg`);
      file.create({ overwrite: true });
      file.write(base64, { encoding: 'base64' });
      out[id] = file.uri;
    } catch {
      /* skip anything unwritable rather than failing the whole restore */
    }
  }
  return out;
}

/** True when a stored URI still points at a file that exists. */
export function photoExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new FileSystem.File(uri).exists;
  } catch {
    return false;
  }
}

/** Rough size of a photo set, so the UI can warn before a huge backup. */
export function totalPhotoBytes(uris: string[]): number {
  let total = 0;
  for (const uri of uris) {
    try {
      const file = new FileSystem.File(uri);
      if (file.exists) total += file.size ?? 0;
    } catch {
      /* unreadable — counts as nothing */
    }
  }
  return total;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
