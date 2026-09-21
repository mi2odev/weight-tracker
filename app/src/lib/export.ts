/**
 * Writing files to disk, handing them to the share sheet, and reading one
 * back in from the document picker.
 *
 * All the parsing and serialising lives next door in `csv.ts` and `backup.ts`,
 * which stay free of native imports so their rules can be tested on Node.
 * This file is only the side effects.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

import { AppData } from '../data/types';
import { buildExport } from './csv';
import { RestoreResult, backupFileName, buildBackup, parseBackup, parseWeighInCsv } from './backup';
import type { CsvImport } from './backup';

export * from './csv';

/** Everything written here is disposable — the share sheet is the delivery. */
function exportDirectory(): FileSystem.Directory {
  const directory = new FileSystem.Directory(FileSystem.Paths.cache, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });
  return directory;
}

function writeFile(name: string, contents: string): string {
  const handle = new FileSystem.File(exportDirectory(), name);
  if (handle.exists) handle.delete();
  handle.create();
  handle.write(contents);
  return handle.uri;
}

async function share(uri: string, mimeType: string, dialogTitle: string, uti: string) {
  await Sharing.shareAsync(uri, { mimeType, dialogTitle, UTI: uti });
}

// ── CSV ──────────────────────────────────────────────────────────────────────

/**
 * Shares every CSV, not just the weigh-ins.
 *
 * The share sheet takes one file at a time on every platform that matters, so
 * the files go out one after another rather than as a zip — adding an archive
 * library to bundle four small text files is not a trade worth making. The
 * user sees one sheet per file, in the order they are listed.
 */
export async function shareExport(data: AppData): Promise<string> {
  if (!data.entries.length) return 'Nothing logged to export yet';

  const files = buildExport(data);
  const written = files.map((file) => ({ name: file.name, uri: writeFile(file.name, file.contents) }));

  if (!(await Sharing.isAvailableAsync())) {
    return `Saved ${written.length} CSV files to app storage`;
  }

  for (const file of written) {
    // Sequential and awaited: two sheets at once means the second is dropped.
    await share(file.uri, 'text/csv', `Export — ${file.name}`, 'public.comma-separated-values-text');
  }

  return `Shared ${written.length} CSV files`;
}

// ── JSON backup ──────────────────────────────────────────────────────────────

/**
 * The whole dataset in one file, which is what a restore needs. CSV is for
 * spreadsheets; this is for putting the app back.
 */
export async function shareBackup(data: AppData, photos?: Record<string, string>): Promise<string> {
  const backup = buildBackup(data, photos);
  const name = backupFileName();
  const uri = writeFile(name, JSON.stringify(backup));

  if (!(await Sharing.isAvailableAsync())) {
    return 'Saved the backup to app storage';
  }

  await share(uri, 'application/json', 'Back up your weight log', 'public.json');
  return 'Backup shared — keep it somewhere safe';
}

/**
 * The last-resort export, for the crash screen.
 *
 * It reads the stored payload straight out of AsyncStorage and shares it
 * as-is. Deliberately bypasses the store: the store may be the thing that
 * just crashed, and someone staring at an error screen should still be able
 * to get their log off the phone. Nothing is parsed, migrated or validated —
 * whatever is on disk is what leaves.
 */
export async function shareRawStorage(payload: string): Promise<string> {
  const name = `weight-tracker-rescue-${new Date().toISOString().slice(0, 10)}.json`;
  const uri = writeFile(name, payload);

  if (!(await Sharing.isAvailableAsync())) {
    return 'Saved a copy to app storage';
  }

  await share(uri, 'application/json', 'Your weight log', 'public.json');
  return 'Shared — keep it somewhere safe';
}

/**
 * Shares one scrubbed crash report as a text file.
 *
 * The user has to start this, every time. Nothing is uploaded on its own, and
 * what goes out is exactly the text the crash screen and the Privacy screen
 * already showed them — `diagnostics.ts` built it, and there is no second,
 * fuller version kept back for this.
 */
export async function shareCrashReport(text: string): Promise<string> {
  const name = `weight-tracker-crash-${new Date().toISOString().slice(0, 10)}.txt`;
  const uri = writeFile(name, text);

  if (!(await Sharing.isAvailableAsync())) {
    return 'Saved the report to app storage';
  }

  await share(uri, 'text/plain', 'Crash report', 'public.plain-text');
  return 'Report shared — thank you';
}

// ── reading a file back in ───────────────────────────────────────────────────

export type PickedFile = { canceled: true } | { canceled: false; name: string; text: string };

/**
 * Opens the system file picker and reads the chosen file as text.
 *
 * `copyToCacheDirectory` matters: without it the URI can point into a
 * provider the app cannot read directly, and the read fails on a file the
 * user definitely just chose.
 */
export async function pickTextFile(types: string[]): Promise<PickedFile> {
  const result = await DocumentPicker.getDocumentAsync({
    type: types,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) return { canceled: true };

  const asset = result.assets[0];
  const file = new FileSystem.File(asset.uri);
  return { canceled: false, name: asset.name, text: file.textSync() };
}

export type BackupPick = { canceled: true } | ({ canceled: false } & RestoreResult);

/** Picks a JSON backup and validates it, without applying anything. */
export async function pickBackup(): Promise<BackupPick> {
  const picked = await pickTextFile(['application/json', 'text/plain', '*/*']);
  if (picked.canceled) return { canceled: true };
  return { canceled: false, ...parseBackup(picked.text) };
}

export type CsvPick = { canceled: true } | ({ canceled: false; name: string } & CsvImport);

/** Picks a weigh-in CSV and parses it, without merging anything. */
export async function pickWeighInCsv(): Promise<CsvPick> {
  const picked = await pickTextFile(['text/csv', 'text/comma-separated-values', 'text/plain', '*/*']);
  if (picked.canceled) return { canceled: true };
  return { canceled: false, name: picked.name, ...parseWeighInCsv(picked.text) };
}
