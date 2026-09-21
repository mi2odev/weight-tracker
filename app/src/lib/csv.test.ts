/**
 * The export is the user's way out of the app, so the escaping matters more
 * than the formatting: a note containing a comma must not shift every later
 * column by one.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { measurementsCsv, profileCsv, weighInsCsv } from './csv';
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
