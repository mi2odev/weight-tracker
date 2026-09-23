/**
 * Migration is the code that stands between the user and a lost log, so the
 * cases here are the ones that would actually cost data: a v1 payload missing
 * a field added later, a half-written row, a value out of range.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CURRENT_SCHEMA_VERSION, describeData, hasAnyData, INBOX_READ_CAP, isDateKey, migrate } from './schema';
import { emptyData } from './seed';
import { NO_CALORIE_TARGET } from './types';
import { currentAge } from '../lib/calc';

/** A minimal but valid v1 payload — no schemaVersion field. */
function v1Payload(over: Record<string, unknown> = {}) {
  return {
    profile: {
      startDate: '2026-09-13',
      startWeightKg: 157,
      goalWeightKg: 100,
      heightCm: 178,
      ageYears: 34, // v1 stored an age; v4 converts it to a birth year
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

describe('v4 — a birth year instead of an age', () => {
  const thisYear = new Date().getFullYear();

  it('converts a stored age into the year it stood for', () => {
    const result = migrate(v1Payload());
    assert.equal(result.data.profile.birthYear, thisYear - 34);
    assert.equal(currentAge(result.data.profile), 34, 'the same age, today');
  });

  it('keeps a birth year that is already stored', () => {
    const result = migrate(v1Payload({
      profile: { ...v1Payload().profile, birthYear: 1990, ageYears: 99 },
    }));
    assert.equal(result.data.profile.birthYear, 1990, 'the newer field wins');
  });

  it('falls back to the default rather than inventing an age', () => {
    const result = migrate(v1Payload({
      profile: { ...v1Payload().profile, ageYears: 'thirty' },
    }));
    assert.equal(result.data.profile.birthYear, emptyData().profile.birthYear);
  });

  it('refuses an age outside the bounds it would accept on the form', () => {
    for (const ageYears of [3, 140]) {
      const result = migrate(v1Payload({ profile: { ...v1Payload().profile, ageYears } }));
      assert.equal(result.data.profile.birthYear, emptyData().profile.birthYear, `age ${ageYears}`);
    }
  });

  it('starts everyone off not having seen the adulthood notice', () => {
    assert.equal(migrate(v1Payload()).data.adulthoodNoticed, false);
  });

  it('remembers that the notice was already shown', () => {
    assert.equal(migrate(v1Payload({ adulthoodNoticed: true })).data.adulthoodNoticed, true);
  });
});

describe('v5 — saved meals and workouts', () => {
  it('starts an older payload with an empty library rather than undefined', () => {
    const result = migrate(v1Payload());
    assert.deepEqual(result.data.savedMeals, []);
    assert.deepEqual(result.data.savedWorkouts, []);
  });

  it('keeps templates it can read', () => {
    const result = migrate(v1Payload({
      savedMeals: [{ id: 's1', mealType: 'Breakfast', description: 'Porridge', calories: 410, proteinG: 14 }],
      savedWorkouts: [{ id: 'w1', type: 'Cardio', session: 'Intervals', durationMin: 35, intensity: 'Medium', caloriesBurned: 380 }],
    }));

    assert.equal(result.data.savedMeals[0].description, 'Porridge');
    assert.equal(result.data.savedWorkouts[0].session, 'Intervals');
  });

  it('drops a template with no name or no type, which nothing could use', () => {
    const result = migrate(v1Payload({
      savedMeals: [
        { id: 'a', mealType: 'Breakfast' },
        { id: 'b', description: 'No type' },
        { id: 'c', mealType: 'Lunch', description: 'Fine' },
      ],
    }));
    assert.equal(result.data.savedMeals.length, 1);
    assert.equal(result.data.savedMeals[0].description, 'Fine');
  });

  it('fills in missing numbers rather than dropping the whole template', () => {
    const result = migrate(v1Payload({
      savedMeals: [{ id: 's1', mealType: 'Snack', description: 'An apple' }],
    }));
    assert.equal(result.data.savedMeals[0].calories, 0);
    assert.equal(result.data.savedMeals[0].proteinG, 0);
  });

  it('ignores a savedMeals that is not a list at all', () => {
    assert.deepEqual(migrate(v1Payload({ savedMeals: 'nope' })).data.savedMeals, []);
  });
});

describe('v6 — reminder times, water reminder, inbox', () => {
  it('fills the new settings on an older payload', () => {
    const result = migrate(v1Payload());
    assert.equal(result.data.notifications.water, true);
    assert.equal(result.data.notifications.morningMinutes, 7 * 60);
    assert.equal(result.data.notifications.eveningMinutes, 21 * 60);
    assert.deepEqual(result.data.inboxRead, []);
  });

  it('keeps a chosen time and rejects one outside the day', () => {
    const kept = migrate(v1Payload({ notifications: { morningMinutes: 390 } }));
    assert.equal(kept.data.notifications.morningMinutes, 390);
    const bad = migrate(v1Payload({ notifications: { morningMinutes: 5000, eveningMinutes: 'late' } }));
    assert.equal(bad.data.notifications.morningMinutes, 7 * 60);
    assert.equal(bad.data.notifications.eveningMinutes, 21 * 60);
  });

  it('keeps read ids as unique strings, newest last, within the cap', () => {
    const many = Array.from({ length: INBOX_READ_CAP + 20 }, (_, i) => `n${i}`);
    const result = migrate(v1Payload({ inboxRead: ['a', 'a', 3, null, ...many] }));
    assert.equal(result.data.inboxRead.length, INBOX_READ_CAP);
    assert.equal(result.data.inboxRead[result.data.inboxRead.length - 1], `n${INBOX_READ_CAP + 19}`);
    assert.ok(result.data.inboxRead.every((id) => typeof id === 'string'));
  });
});

describe('v7 — water reminder interval and window', () => {
  it('fills defaults on an older payload: every 2 h, 09:00–21:00, not pace-only', () => {
    const n = migrate(v1Payload()).data.notifications;
    assert.equal(n.waterEveryMinutes, 120);
    assert.equal(n.waterStartMinutes, 9 * 60);
    assert.equal(n.waterEndMinutes, 21 * 60);
    assert.equal(n.waterOnlyBehind, false);
  });

  it('keeps a chosen hourly interval and window', () => {
    const n = migrate(
      v1Payload({ notifications: { waterEveryMinutes: 60, waterStartMinutes: 480, waterEndMinutes: 1200 } }),
    ).data.notifications;
    assert.deepEqual([n.waterEveryMinutes, n.waterStartMinutes, n.waterEndMinutes], [60, 480, 1200]);
  });

  it('rejects an interval outside the list and a window that ends before it starts', () => {
    const n = migrate(
      v1Payload({ notifications: { waterEveryMinutes: 7, waterStartMinutes: 1200, waterEndMinutes: 480 } }),
    ).data.notifications;
    assert.deepEqual([n.waterEveryMinutes, n.waterStartMinutes, n.waterEndMinutes], [120, 540, 1260]);
  });
});

describe('v8 — reminder days, custom reminders, progress layout', () => {
  it('fills defaults on an older payload', () => {
    const r = migrate(v1Payload()).data;
    assert.deepEqual(r.notifications.weighDays, [0, 1, 2, 3, 4, 5, 6]);
    assert.deepEqual(r.notifications.custom, []);
    assert.equal(r.progressLayout.order.length, 11);
    assert.equal(r.progressLayout.period, 30);
  });

  it('cleans weekdays and drops custom reminders it cannot use', () => {
    const r = migrate(
      v1Payload({
        notifications: {
          waterDays: [6, 1, 1, 9, 'x'],
          custom: [
            { id: 'a', label: ' Vitamins ', minutes: 480, days: [0, 2] },
            { id: 'b', label: '', minutes: 480 },
            { id: 'c', label: 'Bad time', minutes: 5000 },
            'nope',
          ],
        },
      }),
    ).data.notifications;
    assert.deepEqual(r.waterDays, [1, 6]);
    assert.equal(r.custom.length, 1);
    assert.equal(r.custom[0].label, 'Vitamins');
    assert.equal(r.custom[0].enabled, true);
  });

  it('keeps a saved section order, appends sections it lacks, and drops unknown ones', () => {
    const layout = migrate(
      v1Payload({ progressLayout: { order: ['records', 'stats', 'bogus', 'records'], hidden: ['bmi', 'nope'], period: 7 } }),
    ).data.progressLayout;
    assert.deepEqual(layout.order.slice(0, 2), ['records', 'stats']);
    assert.equal(layout.order.length, 11);
    assert.deepEqual(layout.hidden, ['bmi']);
    assert.equal(layout.period, 7);
  });
});
