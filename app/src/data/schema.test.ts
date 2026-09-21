/**
 * Migration is the code that stands between the user and a lost log, so the
 * cases here are the ones that would actually cost data: a v1 payload missing
 * a field added later, a half-written row, a value out of range.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CURRENT_SCHEMA_VERSION, describeData, hasAnyData, isDateKey, migrate } from './schema';
import { emptyData } from './seed';
import { NO_CALORIE_TARGET } from './types';

/** A minimal but valid v1 payload — no schemaVersion field. */
function v1Payload(over: Record<string, unknown> = {}) {
  return {
    profile: {
      startDate: '2026-09-13',
      startWeightKg: 157,
      goalWeightKg: 100,
      heightCm: 178,
      ageYears: 34,
      sex: 'Male',
      activityLevel: 'Lightly Active',
      goalType: 'lose',
      targetCalories: 2650,
      targetProteinG: 120,
      targetWaterL: 3,
      targetSteps: 8000,
      targetSleepH: 7,
      units: 'metric',
    },
    entries: [{ logDate: '2026-09-13', weightKg: 157 }],
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

describe('date keys', () => {
  it('accepts a real calendar day', () => {
    assert.equal(isDateKey('2026-09-13'), true);
  });

  it('rejects a well-formed string that is not a real day', () => {
    assert.equal(isDateKey('2026-02-30'), false);
    assert.equal(isDateKey('2026-13-01'), false);
    assert.equal(isDateKey('2026-00-10'), false);
  });

  it('rejects anything that is not a date string', () => {
    for (const bad of ['', '13/09/2026', '2026-9-13', null, 42, {}]) {
      assert.equal(isDateKey(bad), false, `expected ${JSON.stringify(bad)} to be rejected`);
    }
  });
});

describe('versioning', () => {
  it('treats a payload with no version field as v1 and stamps the current one', () => {
    const result = migrate(v1Payload());
    assert.equal(result.fromVersion, 1);
    assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(result.changed, true);
  });

  it('leaves a current-version payload unchanged', () => {
    const current = { ...v1Payload(), schemaVersion: CURRENT_SCHEMA_VERSION };
    const result = migrate(current);
    assert.equal(result.fromVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(result.notes, []);
    assert.equal(result.changed, false);
  });

  it('keeps what it can from a newer payload rather than discarding the log', () => {
    const future = { ...v1Payload(), schemaVersion: 99, somethingNew: { a: 1 } };
    const result = migrate(future);
    assert.equal(result.fromVersion, 99);
    assert.equal(result.data.entries.length, 1);
    assert.ok(result.notes.some((n) => n.includes('newer version')));
  });

  it('never throws on rubbish, and returns a working empty dataset', () => {
    for (const bad of [null, undefined, 42, 'nonsense', []]) {
      const result = migrate(bad);
      assert.equal(result.data.schemaVersion, CURRENT_SCHEMA_VERSION);
      assert.equal(result.data.entries.length, 0);
    }
  });
});

describe('deep-merging defaults', () => {
  it('fills in a notification flag added after the payload was written', () => {
    // v1 shipped before `milestoneReached` existed.
    const partial = v1Payload({
      notifications: { morningWeighIn: false, eveningLog: true, weeklySummary: true },
    });
    const { data } = migrate(partial);
    assert.equal(data.notifications.morningWeighIn, false, 'existing choice must survive');
    assert.equal(data.notifications.milestoneReached, emptyData().notifications.milestoneReached);
  });

  it('fills in a profile field the payload never had', () => {
    const profile = { ...v1Payload().profile } as Record<string, unknown>;
    delete profile.units;
    const { data } = migrate(v1Payload({ profile }));
    assert.equal(data.profile.units, 'metric');
    // The fields that were present are untouched.
    assert.equal(data.profile.startWeightKg, 157);
  });

  it('replaces an out-of-range profile value with the default and says so', () => {
    const { data, notes } = migrate(v1Payload({ profile: { ...v1Payload().profile, heightCm: 5 } }));
    assert.equal(data.profile.heightCm, emptyData().profile.heightCm);
    assert.ok(notes.some((n) => n.includes('heightCm')));
  });

  it('falls back to a whole default profile when it is missing', () => {
    const { data, notes } = migrate(v1Payload({ profile: undefined }));
    assert.equal(data.profile.startWeightKg, emptyData().profile.startWeightKg);
    assert.ok(notes.some((n) => n.includes('profile')));
  });
});

describe('log rows', () => {
  it('drops a row with no usable date but keeps the rest', () => {
    const { data, notes } = migrate(
      v1Payload({
        entries: [
          { logDate: '2026-09-13', weightKg: 157 },
          { weightKg: 156 }, // no date
          { logDate: 'not-a-date', weightKg: 155 },
        ],
      }),
    );
    assert.equal(data.entries.length, 1);
    assert.ok(notes.some((n) => n.includes('weigh-in')));
  });

  it('keeps a datable row but nulls a value that is out of range', () => {
    const { data } = migrate(
      v1Payload({ entries: [{ logDate: '2026-09-13', weightKg: 157, steps: 9_999_999 }] }),
    );
    assert.equal(data.entries.length, 1, 'the day itself must survive');
    assert.equal(data.entries[0].weightKg, 157);
    assert.equal(data.entries[0].steps, null);
  });

  it('collapses a duplicated date to one row', () => {
    const { data } = migrate(
      v1Payload({
        entries: [
          { logDate: '2026-09-13', weightKg: 157 },
          { logDate: '2026-09-13', weightKg: 156 },
        ],
      }),
    );
    assert.equal(data.entries.length, 1);
    assert.equal(data.entries[0].weightKg, 156, 'the last write wins');
  });

  it('sorts entries oldest first regardless of stored order', () => {
    const { data } = migrate(
      v1Payload({
        entries: [
          { logDate: '2026-09-15', weightKg: 156 },
          { logDate: '2026-09-13', weightKg: 157 },
        ],
      }),
    );
    assert.deepEqual(
      data.entries.map((e) => e.logDate),
      ['2026-09-13', '2026-09-15'],
    );
  });

  it('drops a meal with an unknown type', () => {
    const { data } = migrate(
      v1Payload({
        meals: [
          { id: 'a', logDate: '2026-09-13', mealType: 'Lunch', description: 'x', calories: 1, proteinG: 1 },
          { id: 'b', logDate: '2026-09-13', mealType: 'Brunch', description: 'y', calories: 1, proteinG: 1 },
        ],
      }),
    );
    assert.equal(data.meals.length, 1);
    assert.equal(data.meals[0].id, 'a');
  });

  it('gives a row without an id a stable replacement rather than dropping it', () => {
    const { data } = migrate(
      v1Payload({
        meals: [{ logDate: '2026-09-13', mealType: 'Lunch', description: 'x', calories: 1, proteinG: 1 }],
      }),
    );
    assert.equal(data.meals.length, 1);
    assert.ok(data.meals[0].id.length > 0);
  });

  it('drops a partial measurement, which has nothing to compare against', () => {
    const { data } = migrate(
      v1Payload({
        measurements: [
          { id: 'm1', logDate: '2026-09-13', waistCm: 132, chestCm: 126, armsCm: 40, thighsCm: 70, neckCm: 45 },
          { id: 'm2', logDate: '2026-09-27', waistCm: 130 },
        ],
      }),
    );
    assert.equal(data.measurements.length, 1);
    assert.equal(data.measurements[0].id, 'm1');
  });

  it('de-duplicates celebrated milestones so none can fire twice', () => {
    const { data } = migrate(v1Payload({ celebrated: [155, 155, 150] }));
    assert.deepEqual(data.celebrated, [155, 150]);
  });

  it('keeps only well-formed achieved dates, since they are immutable once set', () => {
    const { data } = migrate(
      v1Payload({ achieved: { '155': '2026-10-01', '150': 'whenever', notANumber: '2026-10-01' } }),
    );
    assert.deepEqual(data.achieved, { '155': '2026-10-01' });
  });
});

describe('data predicates', () => {
  it('knows when there is something to lose', () => {
    assert.equal(hasAnyData(emptyData()), false);
    assert.equal(hasAnyData(migrate(v1Payload()).data), true);
  });

  it('describes what a destructive action would throw away', () => {
    assert.equal(describeData(emptyData()), 'nothing logged yet');
    assert.equal(describeData(migrate(v1Payload()).data), '1 weigh-in');

    const many = migrate(
      v1Payload({
        entries: [
          { logDate: '2026-09-13', weightKg: 157 },
          { logDate: '2026-09-14', weightKg: 156 },
        ],
        meals: [{ id: 'a', logDate: '2026-09-13', mealType: 'Lunch', description: 'x', calories: 1, proteinG: 1 }],
      }),
    ).data;
    assert.equal(describeData(many), '2 weigh-ins, 1 meal');
  });
});

describe('v3 — no calorie target under 18', () => {
  it('clears a target an older build had suggested to a minor', () => {
    const result = migrate(v1Payload({
      profile: { ...v1Payload().profile, ageYears: 16, targetCalories: 2650 },
    }));

    assert.equal(result.data.profile.targetCalories, NO_CALORIE_TARGET);
    assert.equal(
      result.notes.some((n) => n.includes('under-18')),
      true,
      'a silently changed target should leave a trace',
    );
  });

  it('leaves an adult target exactly as it was', () => {
    const result = migrate(v1Payload());
    assert.equal(result.data.profile.targetCalories, 2650);
  });

  it('keeps a stored zero rather than treating it as a missing value', () => {
    const result = migrate(v1Payload({
      profile: { ...v1Payload().profile, ageYears: 16, targetCalories: NO_CALORIE_TARGET },
    }));
    assert.equal(result.data.profile.targetCalories, NO_CALORIE_TARGET);
  });

  it('still rejects an out-of-range target that is not the sentinel', () => {
    const result = migrate(v1Payload({
      profile: { ...v1Payload().profile, targetCalories: 50 },
    }));
    assert.equal(result.data.profile.targetCalories, emptyData().profile.targetCalories);
  });
});
