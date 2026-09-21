/**
 * The export is the user's way out of the app, so the escaping matters more
 * than the formatting: a note containing a comma must not shift every later
 * column by one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measurementsCsv, mealsCsv, neutraliseFormula, profileCsv, weighInsCsv } from './csv';
import { AppData, CURRENT_SCHEMA_VERSION, Profile } from '../data/types';

const profile: Profile = {
  startDate: '2026-09-13',
  startWeightKg: 157,
  goalWeightKg: 100,
  heightCm: 178,
  ageYears: 34,
  sex: 'Male',
  activityLevel: 'Lightly Active',
  targetCalories: 2650,
  targetProteinG: 120,
  targetWaterL: 3,
  targetSteps: 8000,
  targetSleepH: 7,
  units: 'metric',
};

function makeData(over: Partial<AppData> = {}): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile,
    entries: [],
    meals: [],
    workouts: [],
    measurements: [],
    rewards: {},
    achieved: {},
    celebrated: [],
    notifications: {
      morningWeighIn: true,
      eveningLog: true,
      weeklySummary: true,
      milestoneReached: true,
    },
    onboarded: true,
    ...over,
  };
}

describe('CSV escaping', () => {
  it('quotes a note containing a comma, keeping the column count', () => {
    const data = makeData({
      entries: [{ logDate: '2026-09-13', weightKg: 157, notes: 'Felt good, slept well' }],
    });
    const lines = weighInsCsv(data).split('\r\n');
    assert.equal(lines.length, 2);
    assert.ok(lines[1].includes('"Felt good, slept well"'));
    // 11 columns, and the quoted comma must not create a twelfth.
    assert.equal(lines[0].split(',').length, 11);
  });

  it('doubles an embedded quote', () => {
    const data = makeData({
      entries: [{ logDate: '2026-09-13', weightKg: 157, notes: 'Coach said "push"' }],
    });
    assert.ok(weighInsCsv(data).includes('"Coach said ""push"""'));
  });

  it('quotes a note containing a newline', () => {
    const data = makeData({
      entries: [{ logDate: '2026-09-13', weightKg: 157, notes: 'One\nTwo' }],
    });
    assert.ok(weighInsCsv(data).includes('"One\nTwo"'));
  });
});

describe('formula injection', () => {
  const withNote = (notes: string) =>
    weighInsCsv(makeData({ entries: [{ logDate: '2026-09-13', weightKg: 157, notes }] }))
      .split('\r\n')[1];

  it('neutralises every leading character a spreadsheet reads as a formula', () => {
    for (const lead of ['=', '+', '-', '@', '\t', '\r']) {
      const payload = `${lead}HYPERLINK("http://evil","click")`;
      const row = withNote(payload);
      assert.ok(
        row.includes(`'${lead}`) || row.includes(`"'${lead}`),
        `expected a leading quote for ${JSON.stringify(lead)}, got: ${row}`,
      );
    }
  });

  it('quotes as well as neutralises when the payload also needs escaping', () => {
    // Both problems at once: a formula lead and an embedded comma.
    const row = withNote('=SUM(A1,A2)');
    assert.ok(row.includes(`"'=SUM(A1,A2)"`), row);
  });

  it('leaves a negative number alone — it is data, not a formula', () => {
    const data = makeData({
      entries: [{ logDate: '2026-09-13', weightKg: 157, calories: -250 }],
    });
    const row = weighInsCsv(data).split('\r\n')[1];
    assert.equal(row.split(',')[2], '-250', 'a numeric cell must stay numeric');
    assert.ok(!row.includes("'-250"));
  });

  it('leaves ordinary text and dates alone', () => {
    const row = withNote('Felt good today');
    assert.ok(row.includes('Felt good today'));
    assert.ok(!row.includes("'Felt"));
    assert.equal(row.split(',')[0], '2026-09-13', 'dates must not gain a quote');
  });

  it('neutralises a meal description too, not only notes', () => {
    const data = makeData({
      meals: [
        { id: 'a', logDate: '2026-09-13', mealType: 'Lunch', description: '=1+1', calories: 1, proteinG: 1 },
      ],
    });
    assert.ok(mealsCsv(data).includes("'=1+1"));
  });

  it('is exposed on its own so the rule can be reused', () => {
    assert.equal(neutraliseFormula('=A1'), "'=A1");
    assert.equal(neutraliseFormula('safe'), 'safe');
    assert.equal(neutraliseFormula(-5), -5);
    assert.equal(neutraliseFormula(''), '');
    assert.equal(neutraliseFormula(null), null);
  });
});

describe('CSV contents', () => {
  it('writes an empty cell for a missing value, not "null"', () => {
    const data = makeData({ entries: [{ logDate: '2026-09-13', weightKg: 157 }] });
    const row = weighInsCsv(data).split('\r\n')[1];
    assert.ok(!row.includes('null'));
    assert.ok(!row.includes('undefined'));
    assert.equal(row.split(',')[0], '2026-09-13');
    assert.equal(row.split(',')[1], '157');
  });

  it('orders rows oldest first regardless of insertion order', () => {
    const data = makeData({
      entries: [
        { logDate: '2026-09-15', weightKg: 156 },
        { logDate: '2026-09-13', weightKg: 157 },
      ],
    });
    const rows = weighInsCsv(data).split('\r\n').slice(1);
    assert.equal(rows[0].split(',')[0], '2026-09-13');
    assert.equal(rows[1].split(',')[0], '2026-09-15');
  });

  it('exports metric regardless of the display setting', () => {
    const data = makeData({ profile: { ...profile, units: 'imperial' } });
    assert.ok(profileCsv(data).includes('start_weight_kg,157'));
    assert.ok(profileCsv(data).includes('units,imperial'));
  });

  it('writes measurements in centimetres', () => {
    const data = makeData({
      measurements: [
        { id: 'm1', logDate: '2026-09-13', waistCm: 132, chestCm: 126, armsCm: 40, thighsCm: 70, neckCm: 45 },
      ],
    });
    const row = measurementsCsv(data).split('\r\n')[1];
    assert.equal(row, '2026-09-13,132,126,40,70,45');
  });
});
