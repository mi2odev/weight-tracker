/**
 * Backup and restore — the file format the user owns.
 *
 * A CSV export is for spreadsheets: it flattens the data and loses the
 * profile's shape. A backup is the whole `AppData` verbatim, so restoring it
 * puts the app back exactly as it was. Both matter; they are not the same job.
 *
 * Pure: building a backup, parsing one, and parsing this app's own weigh-in
 * CSV all happen here, with no file system or picker. `export.ts` owns the
 * side effects.
 */

import { AppData, CURRENT_SCHEMA_VERSION, DateKey, WeighIn } from '../data/types';
import { migrate } from '../data/schema';
import { isDateKey } from '../data/schema';

/** Anything older than this cannot be understood and is refused outright. */
const MIN_RESTORABLE_VERSION = 1;

export interface BackupFile {
  /**
   * Marks the file as ours — a restore checks it before trusting anything.
   *
   * Deliberately still says `weight-tracker` after the rename to Weighpoint.
   * This string is a stored format identifier, not a label: changing it would
   * make every backup taken before the rename unrestorable, which is the one
   * thing a backup must never be.
   */
  format: 'weight-tracker-backup';
  schemaVersion: number;
  exportedAt: string;
  /** Present only when the user chose to include photos. */
  photos?: Record<string, string>;
  data: AppData;
}

/** Unchanged across the rename. See `BackupFile.format`. */
export const BACKUP_FORMAT = 'weight-tracker-backup';

export function buildBackup(data: AppData, photos?: Record<string, string>): BackupFile {
  return {
    format: BACKUP_FORMAT,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    ...(photos && Object.keys(photos).length ? { photos } : {}),
    data,
  };
}

export function backupFileName(now: Date = new Date()): string {
  const stamp = now.toISOString().slice(0, 10);
  return `weighpoint-backup-${stamp}.json`;
}

export type RestoreResult =
  | {
      ok: true;
      data: AppData;
      exportedAt: string | null;
      notes: string[];
      /** Base64 photos keyed by measurement id, when the backup carried them. */
      photos: Record<string, string>;
    }
  | { ok: false; reason: string };

/** Base64 photos off a parsed envelope, keeping only usable string entries. */
function readPhotos(raw: unknown): Record<string, string> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && value.length) out[id] = value;
  }
  return out;
}

/**
 * Validates a backup file's text and returns the data it holds.
 *
 * Deliberately strict about the envelope and forgiving about the contents:
 * the wrong *file* should be refused with a clear reason, but a right file
 * with one bad row should still restore the other three hundred, which is
 * what `migrate` already does.
 */
export function parseBackup(text: string): RestoreResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'That file is not valid JSON.' };
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: 'That file does not look like a backup.' };
  }

  const envelope = parsed as Record<string, unknown>;

  if (envelope.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      reason: 'That file was not made by this app. Pick a Weighpoint backup.',
    };
  }

  const version = typeof envelope.schemaVersion === 'number' ? envelope.schemaVersion : 0;
  if (version < MIN_RESTORABLE_VERSION) {
    return { ok: false, reason: 'That backup is too old to read.' };
  }

  if (typeof envelope.data !== 'object' || envelope.data === null) {
    return { ok: false, reason: 'That backup has no data in it.' };
  }

  // The payload goes through the same validation as anything loaded from disk.
  const result = migrate(envelope.data);

  return {
    ok: true,
    data: result.data,
    exportedAt: typeof envelope.exportedAt === 'string' ? envelope.exportedAt : null,
    notes: result.notes,
    photos: readPhotos(envelope.photos),
  };
}

/**
 * Re-points restored measurements at the photo files written on *this* device.
 *
 * Every URI in a backup belongs to the device that made it, so a measurement
 * either gets a freshly written local file or nothing at all. Keeping the old
 * path would leave the UI showing a broken frame for a photo that cannot exist.
 */
export function applyRestoredPhotos(data: AppData, uriById: Record<string, string>): AppData {
  if (!data.measurements.some((m) => m.photo || uriById[m.id])) return data;
  return {
    ...data,
    measurements: data.measurements.map((m) => ({ ...m, photo: uriById[m.id] ?? null })),
  };
}

// ── weigh-in CSV import ──────────────────────────────────────────────────────

/** Splits one CSV line, honouring quotes and doubled quotes inside them. */
export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(field);
      field = '';
    } else {
      field += ch;
    }
  }
  out.push(field);
  return out;
}

/** Undoes the single quote the export adds in front of a formula-like cell. */
function unneutralise(value: string): string {
  return value.startsWith("'") ? value.slice(1) : value;
}

function optionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export interface CsvImport {
  rows: WeighIn[];
  /** Lines that could not be read at all. */
  skipped: number;
  /** Set when the header did not look like this app's export. */
  warning: string | null;
}

const EXPECTED_HEADER = [
  'log_date',
  'weight_kg',
  'calories',
  'protein_g',
  'water_l',
  'steps',
  'cardio_min',
  'strength_done',
  'sleep_h',
];

/**
 * Reads the weigh-in CSV this app produces back into rows.
 *
 * Columns are matched by *name* from the header rather than by position, so a
 * file that has been through a spreadsheet — reordered, with an extra column
 * added — still imports.
 */
export function parseWeighInCsv(text: string): CsvImport {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim() !== '');
  if (!lines.length) return { rows: [], skipped: 0, warning: 'That file is empty.' };

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const index = (name: string) => header.indexOf(name);

  if (index('log_date') < 0) {
    return {
      rows: [],
      skipped: 0,
      warning: 'That CSV has no log_date column, so there is nothing to match days on.',
    };
  }

  const missing = EXPECTED_HEADER.filter((h) => index(h) < 0);
  const at = (cells: string[], name: string): string => {
    const i = index(name);
    return i >= 0 && i < cells.length ? unneutralise(cells[i]) : '';
  };

  const byDate = new Map<DateKey, WeighIn>();
  let skipped = 0;

  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const logDate = at(cells, 'log_date').trim();
    if (!isDateKey(logDate)) {
      skipped++;
      continue;
    }

    const strength = at(cells, 'strength_done').trim().toLowerCase();

    byDate.set(logDate, {
      logDate,
      weightKg: optionalNumber(at(cells, 'weight_kg')),
      calories: optionalNumber(at(cells, 'calories')),
      proteinG: optionalNumber(at(cells, 'protein_g')),
      waterL: optionalNumber(at(cells, 'water_l')),
      steps: optionalNumber(at(cells, 'steps')),
      cardioMin: optionalNumber(at(cells, 'cardio_min')),
      strengthDone: strength === 'yes' || strength === 'true' || strength === '1',
      sleepH: optionalNumber(at(cells, 'sleep_h')),
      notes: at(cells, 'notes') || undefined,
    });
  }

  return {
    rows: Array.from(byDate.values()).sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
    skipped,
    warning: missing.length
      ? `Some columns were missing (${missing.join(', ')}) — those values were left empty.`
      : null,
  };
}

// ── merging an import into the existing log ──────────────────────────────────

export type ConflictChoice = 'keep-mine' | 'use-theirs';

export interface MergePreview {
  /** Dates in the file that the log has no row for. */
  newDates: DateKey[];
  /** Dates present in both, where at least one value actually differs. */
  conflictDates: DateKey[];
  /** Dates present in both with nothing to choose between them. */
  identicalDates: DateKey[];
}

const COMPARED_FIELDS: (keyof WeighIn)[] = [
  'weightKg',
  'calories',
  'proteinG',
  'waterL',
  'steps',
  'cardioMin',
  'strengthDone',
  'sleepH',
  'notes',
];

/**
 * An imported blank is "no opinion", not "clear this value" — so anything
 * empty, absent or unticked in the file leaves what is already logged alone.
 */
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === '' || value === false;
}

function pick<T>(mine: T, theirs: T): T {
  return isBlank(theirs) ? mine : theirs;
}

function differs(a: WeighIn, b: WeighIn): boolean {
  return COMPARED_FIELDS.some((field) => {
    const theirs = b[field];
    if (isBlank(theirs)) return false;
    return (a[field] ?? null) !== theirs;
  });
}

/** What a merge would do, so the user can be asked before it happens. */
export function previewMerge(existing: WeighIn[], incoming: WeighIn[]): MergePreview {
  const current = new Map(existing.map((e) => [e.logDate, e]));
  const preview: MergePreview = { newDates: [], conflictDates: [], identicalDates: [] };

  for (const row of incoming) {
    const mine = current.get(row.logDate);
    if (!mine) preview.newDates.push(row.logDate);
    else if (differs(mine, row)) preview.conflictDates.push(row.logDate);
    else preview.identicalDates.push(row.logDate);
  }
  return preview;
}

/**
 * Merges by date. New days are always added; a day that exists in both is
 * resolved by `onConflict`, which the caller has asked the user about.
 *
 * An imported blank never erases a value that is already there — the file
 * says nothing about that field, which is different from saying it is empty.
 */
export function mergeWeighIns(
  existing: WeighIn[],
  incoming: WeighIn[],
  onConflict: ConflictChoice,
): WeighIn[] {
  const merged = new Map(existing.map((e) => [e.logDate, e]));

  for (const row of incoming) {
    const mine = merged.get(row.logDate);
    if (!mine) {
      merged.set(row.logDate, row);
      continue;
    }
    if (onConflict === 'keep-mine') continue;

    // Field by field, so a blank in the file leaves what is already there.
    merged.set(row.logDate, {
      ...mine,
      weightKg: pick(mine.weightKg, row.weightKg),
      calories: pick(mine.calories, row.calories),
      proteinG: pick(mine.proteinG, row.proteinG),
      waterL: pick(mine.waterL, row.waterL),
      steps: pick(mine.steps, row.steps),
      cardioMin: pick(mine.cardioMin, row.cardioMin),
      strengthDone: pick(mine.strengthDone, row.strengthDone),
      sleepH: pick(mine.sleepH, row.sleepH),
      notes: pick(mine.notes, row.notes),
    });
  }

  return Array.from(merged.values()).sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
}
