/**
 * Restore is the one path where a bad file can cost the user everything they
 * have logged, so the tests here lean on the refusals: wrong file, truncated
 * file, file from another app. The merge tests pin the rule that an imported
 * blank never erases something already recorded.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BACKUP_FORMAT,
  backupFileName,
  buildBackup,
  mergeWeighIns,
  parseBackup,
  parseCsvLine,
  parseWeighInCsv,
  previewMerge,
} from './backup';
import { weighInsCsv } from './csv';
import { emptyData } from '../data/seed';
import { CURRENT_SCHEMA_VERSION, WeighIn } from '../data/types';

function dataWith(entries: WeighIn[]) {
  return { ...emptyData(), entries, onboarded: true };
}

describe('building a backup', () => {
  it('stamps the format, version and date', () => {
    const backup = buildBackup(dataWith([{ logDate: '2026-09-13', weightKg: 157 }]));
    assert.equal(backup.format, BACKUP_FORMAT);
    assert.equal(backup.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.ok(!Number.isNaN(Date.parse(backup.exportedAt)));
    assert.equal(backup.data.entries.length, 1);
  });

  it('omits the photos key entirely when there are none', () => {
    assert.equal('photos' in buildBackup(emptyData()), false);
    assert.equal('photos' in buildBackup(emptyData(), {}), false);
    assert.deepEqual(buildBackup(emptyData(), { m1: 'file:///a.jpg' }).photos, { m1: 'file:///a.jpg' });
  });

  it('names the file by date', () => {
    assert.equal(backupFileName(new Date('2026-09-21T10:00:00Z')), 'weight-tracker-backup-2026-09-21.json');
  });
});

describe('restoring a backup', () => {
  const roundTrip = (entries: WeighIn[]) => JSON.stringify(buildBackup(dataWith(entries)));

  it('round-trips its own output', () => {
    const result = parseBackup(roundTrip([{ logDate: '2026-09-13', weightKg: 157 }]));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.entries.length, 1);
    assert.equal(result.data.entries[0].weightKg, 157);
    assert.ok(result.exportedAt);
  });

  it('refuses a file that is not JSON', () => {
    const result = parseBackup('log_date,weight_kg\n2026-09-13,157');
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /not valid JSON/);
  });

  it('refuses valid JSON that is not a backup', () => {
    const result = parseBackup(JSON.stringify({ some: 'other app' }));
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /not made by this app/);
  });

  it('refuses a top-level array', () => {
    assert.equal(parseBackup('[1,2,3]').ok, false);
  });

  it('refuses an envelope with no data', () => {
    const result = parseBackup(
      JSON.stringify({ format: BACKUP_FORMAT, schemaVersion: CURRENT_SCHEMA_VERSION }),
    );
    assert.equal(result.ok, false);
    if (result.ok) return;
    assert.match(result.reason, /no data/);
  });

  it('repairs a damaged row rather than refusing the whole file', () => {
    const backup = buildBackup(dataWith([{ logDate: '2026-09-13', weightKg: 157 }]));
    // One good row, one that cannot be placed on any day.
    (backup.data.entries as unknown[]).push({ weightKg: 156 });
    const result = parseBackup(JSON.stringify(backup));
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.data.entries.length, 1, 'the good row survives');
    assert.ok(result.notes.length > 0, 'and the repair is reported');
  });
});

describe('CSV line parsing', () => {
  it('splits plain fields', () => {
    assert.deepEqual(parseCsvLine('a,b,c'), ['a', 'b', 'c']);
  });

  it('keeps a comma inside quotes in one field', () => {
    assert.deepEqual(parseCsvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
  });

  it('unescapes a doubled quote', () => {
    assert.deepEqual(parseCsvLine('a,"say ""hi""",c'), ['a', 'say "hi"', 'c']);
  });

  it('keeps empty trailing fields', () => {
    assert.deepEqual(parseCsvLine('a,,'), ['a', '', '']);
  });
});

describe('importing the weigh-in CSV', () => {
  it('round-trips this app own export, including a quoted note', () => {
    const exported = weighInsCsv(
      dataWith([
        { logDate: '2026-09-13', weightKg: 157, calories: 2400, notes: 'Felt good, slept well' },
        { logDate: '2026-09-14', weightKg: 156.6, steps: 9240, strengthDone: true },
      ]),
    );
    const { rows, skipped, warning } = parseWeighInCsv(exported);

    assert.equal(skipped, 0);
    assert.equal(warning, null);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].weightKg, 157);
    assert.equal(rows[0].calories, 2400);
    assert.equal(rows[0].notes, 'Felt good, slept well');
    assert.equal(rows[1].strengthDone, true);
  });

  it('strips the quote the export adds to a formula-like note', () => {
    const exported = weighInsCsv(dataWith([{ logDate: '2026-09-13', weightKg: 157, notes: '=1+1' }]));
    assert.ok(exported.includes("'=1+1"), 'precondition: the export neutralises it');
    assert.equal(parseWeighInCsv(exported).rows[0].notes, '=1+1');
  });

  it('matches columns by name, so a reordered file still imports', () => {
    const csv = 'weight_kg,notes,log_date\r\n157,hello,2026-09-13';
    const { rows } = parseWeighInCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].logDate, '2026-09-13');
    assert.equal(rows[0].weightKg, 157);
    assert.equal(rows[0].notes, 'hello');
  });

  it('skips a row with an unusable date and counts it', () => {
    const csv = 'log_date,weight_kg\r\n2026-09-13,157\r\nnot-a-date,156\r\n2026-02-30,155';
    const { rows, skipped } = parseWeighInCsv(csv);
    assert.equal(rows.length, 1);
    assert.equal(skipped, 2);
  });

  it('warns when the file has no date column at all', () => {
    const { rows, warning } = parseWeighInCsv('weight_kg\r\n157');
    assert.equal(rows.length, 0);
    assert.match(warning ?? '', /no log_date/);
  });

  it('warns about missing columns but still imports what is there', () => {
    const { rows, warning } = parseWeighInCsv('log_date,weight_kg\r\n2026-09-13,157');
    assert.equal(rows.length, 1);
    assert.match(warning ?? '', /missing/);
  });

  it('reports an empty file rather than pretending it worked', () => {
    assert.match(parseWeighInCsv('').warning ?? '', /empty/);
  });
});

describe('merging an import', () => {
  const mine: WeighIn[] = [
    { logDate: '2026-09-13', weightKg: 157, notes: 'mine' },
    { logDate: '2026-09-14', weightKg: 156.6 },
  ];

  it('separates new days from conflicting and identical ones', () => {
    const incoming: WeighIn[] = [
      { logDate: '2026-09-13', weightKg: 157, notes: 'mine' }, // identical
      { logDate: '2026-09-14', weightKg: 155.0 }, // conflict
      { logDate: '2026-09-15', weightKg: 154.4 }, // new
    ];
    const preview = previewMerge(mine, incoming);
    assert.deepEqual(preview.newDates, ['2026-09-15']);
    assert.deepEqual(preview.conflictDates, ['2026-09-14']);
    assert.deepEqual(preview.identicalDates, ['2026-09-13']);
  });

  it('adds new days under either choice', () => {
    const incoming: WeighIn[] = [{ logDate: '2026-09-15', weightKg: 154.4 }];
    for (const choice of ['keep-mine', 'use-theirs'] as const) {
      const merged = mergeWeighIns(mine, incoming, choice);
      assert.equal(merged.length, 3, choice);
      assert.equal(merged[2].weightKg, 154.4);
    }
  });

  it('keeps mine on conflict when asked to', () => {
    const merged = mergeWeighIns(mine, [{ logDate: '2026-09-14', weightKg: 155.0 }], 'keep-mine');
    assert.equal(merged.find((e) => e.logDate === '2026-09-14')?.weightKg, 156.6);
  });

  it('takes theirs on conflict when asked to', () => {
    const merged = mergeWeighIns(mine, [{ logDate: '2026-09-14', weightKg: 155.0 }], 'use-theirs');
    assert.equal(merged.find((e) => e.logDate === '2026-09-14')?.weightKg, 155.0);
  });

  it('never erases a value the import is simply silent about', () => {
    // The file has a row for the 13th but no note and no weight.
    const incoming: WeighIn[] = [{ logDate: '2026-09-13', weightKg: null, notes: undefined, steps: 9000 }];
    const merged = mergeWeighIns(mine, incoming, 'use-theirs');
    const day = merged.find((e) => e.logDate === '2026-09-13')!;
    assert.equal(day.weightKg, 157, 'a blank must not clear the weight');
    assert.equal(day.notes, 'mine', 'a blank must not clear the note');
    assert.equal(day.steps, 9000, 'but a value present in the file is taken');
  });

  it('does not call a blank-only row a conflict', () => {
    const preview = previewMerge(mine, [{ logDate: '2026-09-13', weightKg: null }]);
    assert.deepEqual(preview.conflictDates, []);
    assert.deepEqual(preview.identicalDates, ['2026-09-13']);
  });

  it('keeps the merged log sorted oldest first', () => {
    const merged = mergeWeighIns(mine, [{ logDate: '2026-09-01', weightKg: 158 }], 'use-theirs');
    assert.deepEqual(
      merged.map((e) => e.logDate),
      ['2026-09-01', '2026-09-13', '2026-09-14'],
    );
  });
});
