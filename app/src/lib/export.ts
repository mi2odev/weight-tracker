/**
 * Writing the export to disk and handing it to the share sheet.
 *
 * The serialisation itself is in `csv.ts`, which stays free of native imports
 * so it can be tested directly.
 */

import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { AppData } from '../data/types';
import { buildExport } from './csv';

export * from './csv';

/**
 * Writes the export and opens the share sheet.
 *
 * Returns a message for the caller to surface. Sharing one file at a time is
 * the only thing every platform supports, so the weigh-in log — the one a user
 * actually wants — goes through the sheet, and the rest are written beside it.
 */
export async function shareExport(data: AppData): Promise<string> {
  const files = buildExport(data);
  if (!data.entries.length) return 'Nothing logged to export yet';

  const directory = new FileSystem.Directory(FileSystem.Paths.cache, 'exports');
  if (!directory.exists) directory.create({ intermediates: true });

  let primary: string | null = null;
  for (const file of files) {
    const handle = new FileSystem.File(directory, file.name);
    if (handle.exists) handle.delete();
    handle.create();
    handle.write(file.contents);
    if (file.name.includes('weigh-ins')) primary = handle.uri;
  }

  if (!primary) return 'Export failed';

  if (!(await Sharing.isAvailableAsync())) {
    return `Saved ${files.length} CSV files to app storage`;
  }

  await Sharing.shareAsync(primary, {
    mimeType: 'text/csv',
    dialogTitle: 'Export your weight log',
    UTI: 'public.comma-separated-values-text',
  });

  return `Exported ${files.length} CSV files`;
}
