/**
 * Spec conformance tests for the calculation engine.
 *
 * Each case names the App Spec row it pins down. Run with `npm test`.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADULT_AGE,
  ageFrom,
  birthYearForAge,
  currentAge,
  averageDailyLossKg,
  averageWeeklyLossKg,
  bmi,
  bmiBand,
  bmr,
  consistencyPct,
  currentWeight,
  dailyChange,
  daysToGoal,
  estimatedGoalDate,
  expectedLossPerWeek,
  goalCompletionPct,
  habitTicks,
  isAdult,
  isCountdown,
  maintainStatus,
  healthyWeightRange,
  milestones,
  monthlyRollups,
  newlyAchievedMilestones,
  photoComparison,
  plannedDailyDeficit,
  requiredPacePerWeek,
  suggestedCalorieTarget,
  shouldOfferAdulthood,
  suggestedProteinTarget,
  tdee,
  trendPerDay,
  weeklyLossKg,
  weeklyRollups,
  weeksToGoal,
  weighInStreaks,
  workoutTotals,
} from './calc';
import { addDays } from './date';
import { Measurement, Profile, WeighIn, WorkoutEntry } from '../data/types';

const START = '2026-09-13';

const profile: Profile = {
  startDate: START,
  startWeightKg: 157,
  goalWeightKg: 100,
  heightCm: 178,
  birthYear: new Date().getFullYear() - 34,
  sex: 'Male',
  activityLevel: 'Lightly Active',
  goalType: 'lose',
  targetCalories: 2650,
  targetProteinG: 120,
  targetWaterL: 3,
  targetSteps: 8000,
  targetSleepH: 7,
  units: 'metric',
};

/** A steady 0.1 kg/day loss over `days` days from the start date. */
function steadyLog(days: number, from = 157, perDay = 0.1): WeighIn[] {
  return Array.from({ length: days }, (_, i) => ({
    logDate: addDays(START, i),
    weightKg: Math.round((from - i * perDay) * 10) / 10,
  }));
}

describe('current weight', () => {
  it('falls back to the starting weight when nothing is logged', () => {
    assert.equal(currentWeight([], profile, START), 157);
  });

  it('takes the most recent non-empty weight, not the highest date', () => {
    const entries: WeighIn[] = [
      { logDate: '2026-09-13', weightKg: 157 },
      { logDate: '2026-09-14', weightKg: 156.4 },
      { logDate: '2026-09-15', calories: 2100 }, // logged, but no weight
    ];
    assert.equal(currentWeight(entries, profile, '2026-09-15'), 156.4);
  });
});

describe('daily change', () => {
  it('measures the very first entry against the starting weight', () => {
    const entries: WeighIn[] = [{ logDate: START, weightKg: 156.5 }];
    assert.equal(dailyChange(entries, profile, START)?.toFixed(1), '-0.5');
  });

  it('measures against the previous logged weight across a gap', () => {
    const entries: WeighIn[] = [
      { logDate: '2026-09-13', weightKg: 157 },
      { logDate: '2026-09-20', weightKg: 156 },
    ];
    assert.equal(dailyChange(entries, profile, '2026-09-20'), -1);
  });
});

describe('body metrics', () => {
  it('computes BMI as weight over height squared', () => {
    assert.equal(bmi(152.2, 178).toFixed(1), '48.0');
  });

  it('uses the WHO bands', () => {
    assert.equal(bmiBand(18.4), 'Underweight');
    assert.equal(bmiBand(22), 'Healthy range');
    assert.equal(bmiBand(27), 'Overweight');
    assert.equal(bmiBand(32), 'Obesity class I');
    assert.equal(bmiBand(37), 'Obesity class II');
    assert.equal(bmiBand(48), 'Obesity class III');
  });

  it('converts BMI 18.5–24.9 back to kilos', () => {
    const range = healthyWeightRange(178);
    assert.equal(range.lowKg.toFixed(1), '58.6');
    assert.equal(range.highKg.toFixed(1), '78.9');
  });

  it('uses Mifflin-St Jeor with the current weight, not the starting weight', () => {
    // 10(152.2) + 6.25(178) − 5(34) + 5
    assert.equal(bmr(152.2, profile), 2469.5);
    assert.equal(Math.round(tdee(152.2, profile)), 3396);
  });

  it('derives the deficit and the pace it implies', () => {
    const deficit = plannedDailyDeficit(152.2, profile);
    assert.ok(deficit != null);
    assert.equal(Math.round(deficit), 746);

    const perWeek = expectedLossPerWeek(152.2, profile);
    assert.ok(perWeek != null);
    assert.equal(perWeek.toFixed(2), ((deficit * 7) / 7700).toFixed(2));
  });

  it('suggests TDEE − 750 to the nearest 50, floored at 1500', () => {
    assert.equal(suggestedCalorieTarget(3395.6), 2650);
    assert.equal(suggestedCalorieTarget(1900), 1500);
    assert.equal(suggestedProteinTarget(100), 120);
  });

  it('spreads the goal across the 730-day plan', () => {
    assert.equal(requiredPacePerWeek(profile).toFixed(2), '0.55');
  });
});

describe('trend', () => {
  it('is null before 14 days of data — never a guess', () => {
    assert.equal(trendPerDay(steadyLog(10), '2026-09-22'), null);
  });

  it('is the last 7 days minus the 7 before, once 14 days exist', () => {
    const entries = steadyLog(14);
    const asOf = addDays(START, 13);
    const trend = trendPerDay(entries, asOf);
    assert.ok(trend != null);
    // A flat 0.1 kg/day loss: each 7-day window mean is 0.7 kg apart.
    assert.equal(trend!.toFixed(2), '-0.10');
    assert.equal(weeklyLossKg(entries, asOf)!.toFixed(1), '0.7');
  });
});

describe('average loss rate', () => {
  it('is the total lost over the days elapsed, not the 14-day trend', () => {
    // 0.1 kg/day for 14 days → 0.7 kg/week, by either measure.
    const entries = steadyLog(14);
    const asOf = addDays(START, 13);
    assert.equal(averageDailyLossKg(entries, profile, asOf)!.toFixed(2), '0.10');
    assert.equal(averageWeeklyLossKg(entries, profile, asOf)!.toFixed(1), '0.7');
  });

  it('counts from day 0, not from the first weigh-in', () => {
    // Started at 157 on day 0 but first weighed on day 10 at 156: 1 kg over
    // 10 days, not over the 0 days between weigh-ins.
    const entries = [{ logDate: addDays(START, 10), weightKg: 156 }];
    assert.equal(averageDailyLossKg(entries, profile, addDays(START, 10))!.toFixed(2), '0.10');
    const later = [...entries, { logDate: addDays(START, 20), weightKg: 155 }];
    assert.equal(averageDailyLossKg(later, profile, addDays(START, 20))!.toFixed(2), '0.10', '2 kg over 20 days');
  });

  it('ignores weigh-ins from before the plan started', () => {
    const entries = [
      { logDate: addDays(START, -5), weightKg: 170 },
      { logDate: addDays(START, 7), weightKg: 156.3 },
    ];
    assert.equal(averageDailyLossKg(entries, profile, addDays(START, 7))!.toFixed(2), '0.10');
  });

  it('has no rate in the first week, when the change is mostly water', () => {
    assert.equal(averageDailyLossKg([{ logDate: START, weightKg: 156 }], profile, START), null);
    // 2 kg off the next morning would otherwise read as 14 kg a week.
    assert.equal(averageDailyLossKg([{ logDate: addDays(START, 1), weightKg: 155 }], profile, addDays(START, 1)), null);
    assert.ok(averageDailyLossKg([{ logDate: addDays(START, 7), weightKg: 156 }], profile, addDays(START, 7)) != null);
  });

  it('reports the journey average even when the recent trend differs', () => {
    // Fast for a fortnight, then a plateau: the average stays above the trend.
    const fast = steadyLog(14, 157, 0.2);
    const plateau = Array.from({ length: 7 }, (_, i) => ({
      logDate: addDays(START, 14 + i),
      weightKg: 154.2,
    }));
    const entries = [...fast, ...plateau];
    const asOf = addDays(START, 20);
    const average = averageWeeklyLossKg(entries, profile, asOf)!;
    const recent = weeklyLossKg(entries, asOf)!;
    assert.ok(average > recent, `expected journey average ${average} to exceed recent ${recent}`);
  });
});

describe('estimated goal date', () => {
  it('is null when the trend is flat or upward — never an extrapolation', () => {
    const flat = Array.from({ length: 20 }, (_, i) => ({ logDate: addDays(START, i), weightKg: 157 }));
    assert.equal(estimatedGoalDate(flat, profile, addDays(START, 19)), null);
    assert.equal(weeksToGoal(flat, profile, addDays(START, 19)), null);
  });

  it('sizes the projection from the journey average once the trend is downward', () => {
    const entries = steadyLog(14);
    const asOf = addDays(START, 13);
    const days = daysToGoal(entries, profile, asOf);
    // 55.7 kg still to lose at 0.1 kg/day ≈ 557 days.
    assert.ok(days != null);
    assert.equal(Math.round(days!), 557);
    assert.ok(estimatedGoalDate(entries, profile, asOf) instanceof Date);
  });

  it('is null once the goal is already reached', () => {
    const entries = steadyLog(14, 100.5, 0.1);
    assert.equal(estimatedGoalDate(entries, profile, addDays(START, 13)), null);
  });
});

describe('goal completion', () => {
  it('is the share of the whole span, clamped to 0–100', () => {
    const entries: WeighIn[] = [{ logDate: START, weightKg: 152.2 }];
    assert.equal(Math.round(goalCompletionPct(entries, profile, START)), 8);
    const past: WeighIn[] = [{ logDate: START, weightKg: 90 }];
    assert.equal(goalCompletionPct(past, profile, START), 100);
  });
});

describe('habit ticks', () => {
  const asOf = addDays(START, 2);

  it('derives all six from the logged values', () => {
    const entry: WeighIn = {
      logDate: START,
      weightKg: 152.2,
      calories: 2640,
      waterL: 2.8, // under the 3 L target
      steps: 9240,
      cardioMin: 35,
      sleepH: 7.2,
    };
    const ticks = habitTicks(entry, profile, START, asOf);
    assert.deepEqual(ticks, {
      weight: true,
      calories: true,
      water: false,
      steps: true,
      workout: true,
      sleep: true,
    });
  });

  it('counts a habit as met at exactly the target', () => {
    const entry: WeighIn = { logDate: START, waterL: 3, steps: 8000, sleepH: 7 };
    const ticks = habitTicks(entry, profile, START, asOf)!;
    assert.equal(ticks.water, true);
    assert.equal(ticks.steps, true);
    assert.equal(ticks.sleep, true);
  });

  it('ticks the workout habit from a strength session alone', () => {
    const entry: WeighIn = { logDate: START, strengthDone: true };
    assert.equal(habitTicks(entry, profile, START, asOf)!.workout, true);
  });

  it('produces no tick at all outside the plan, rather than a zero', () => {
    assert.equal(habitTicks(null, profile, addDays(START, 5), asOf), null); // future
    assert.equal(habitTicks(null, profile, addDays(START, -1), asOf), null); // before the start
  });
});

describe('consistency and streaks', () => {
  it('excludes days before the start date from the rolling score', () => {
    // One fully-logged day at the very start: the 7-day window must not be
    // diluted by the six days that precede the plan.
    const entries: WeighIn[] = [
      { logDate: START, weightKg: 157, calories: 2000, waterL: 3, steps: 8000, cardioMin: 30, sleepH: 8 },
    ];
    assert.equal(consistencyPct(entries, profile, 7, START), 100);
  });

  it('tracks the current and longest weigh-in streaks', () => {
    const entries: WeighIn[] = [0, 1, 2, 4, 5].map((i) => ({
      logDate: addDays(START, i),
      weightKg: 157 - i * 0.1,
    }));
    const streaks = weighInStreaks(entries, profile, addDays(START, 5));
    assert.equal(streaks.current, 2);
    assert.equal(streaks.longest, 3);
  });
});

describe('weekly roll-ups', () => {
  it('buckets 7 days from the start date, not calendar weeks', () => {
    const weeks = weeklyRollups(steadyLog(14), profile, addDays(START, 13));
    assert.equal(weeks.length, 2);
    assert.equal(weeks[0].start, START);
    assert.equal(weeks[0].end, addDays(START, 6));
    assert.equal(weeks[1].start, addDays(START, 7));
    assert.equal(weeks[0].daysLogged, 7);
    assert.equal(weeks[0].daysElapsed, 7);
  });

  it('counts only the days that have happened in the current week', () => {
    const weeks = weeklyRollups(steadyLog(10), profile, addDays(START, 9));
    assert.equal(weeks[1].daysElapsed, 3, 'day 8, 9 and 10 of the plan');
  });

  it('measures a week against the previous week average', () => {
    const weeks = weeklyRollups(steadyLog(14), profile, addDays(START, 13));
    assert.equal(weeks[1].lostKg!.toFixed(1), '0.7');
  });
});

describe('monthly roll-ups', () => {
  it('uses the first and last logged weight of each calendar month', () => {
    const entries: WeighIn[] = [
      { logDate: '2026-09-13', weightKg: 157 },
      { logDate: '2026-09-30', weightKg: 155 },
      { logDate: '2026-10-01', weightKg: 154.8 },
      { logDate: '2026-10-31', weightKg: 152 },
    ];
    const months = monthlyRollups(entries, '2026-10-31');
    assert.equal(months.length, 2);
    assert.equal(months[0].lostKg, 2);
    assert.equal(months[1].lostKg!.toFixed(1), '2.8');
    // 2.8 kg over the 30 days between the two weigh-ins, not over the 2 days logged.
    assert.equal(months[1].avgWeeklyLossKg!.toFixed(2), '0.65');
  });

  it('gives no rate for a month with a single weigh-in', () => {
    const months = monthlyRollups([{ logDate: '2026-09-13', weightKg: 157 }], '2026-09-30');
    assert.equal(months[0].avgDailyLossKg, null);
  });
});

describe('milestones', () => {
  it('runs every 5 kg from floor(start/5) down to the goal', () => {
    const list = milestones([], profile, {}, {}, START);
    assert.equal(list[0].targetKg, 155);
    assert.equal(list[list.length - 1].targetKg, 100);
    assert.equal(list.length, 12);
  });

  it('keeps an achieved date immutable once stamped', () => {
    const achieved = { '155': '2026-10-01' };
    // The log now shows a regain above 155 — the date must not move or clear.
    const entries: WeighIn[] = [{ logDate: '2026-11-01', weightKg: 156 }];
    const list = milestones(entries, profile, {}, achieved, '2026-11-01');
    const m155 = list.find((m) => m.targetKg === 155)!;
    assert.equal(m155.achievedDate, '2026-10-01');
    assert.equal(m155.status, 'Achieved');
    assert.equal(m155.daysTaken, 18);
  });

  it('reports only milestones not yet stamped as newly achieved', () => {
    assert.deepEqual(newlyAchievedMilestones(152.2, profile, {}), [155]);
    assert.deepEqual(newlyAchievedMilestones(152.2, profile, { '155': START }), []);
    assert.deepEqual(newlyAchievedMilestones(148, profile, { '155': START }), [150]);
  });
});

describe('workout roll-up', () => {
  it('feeds cardio minutes from Cardio and Walk, and strength from Strength', () => {
    const workouts: WorkoutEntry[] = [
      { id: '1', logDate: START, type: 'Cardio', session: 'Intervals', durationMin: 35, intensity: 'Medium', caloriesBurned: 380 },
      { id: '2', logDate: START, type: 'Walk', session: 'Loop', durationMin: 25, intensity: 'Low', caloriesBurned: 110 },
      { id: '3', logDate: START, type: 'Strength', session: 'Upper', durationMin: 40, intensity: 'High', caloriesBurned: 200 },
      { id: '4', logDate: START, type: 'Mobility', session: 'Stretch', durationMin: 15, intensity: 'Low', caloriesBurned: 40 },
    ];
    const totals = workoutTotals(workouts, START);
    assert.equal(totals.cardioMin, 60); // mobility and strength minutes excluded
    assert.equal(totals.strengthDone, true);
    assert.equal(totals.durationMin, 115);
  });
});

describe('maintaining', () => {
  const maintain: Profile = { ...profile, goalType: 'maintain', goalWeightKg: 75, startWeightKg: 75 };
  const on = (kg: number): WeighIn[] => [{ logDate: START, weightKg: kg }];

  it('treats the goal as a band, not a line', () => {
    assert.equal(maintainStatus(on(75), maintain, START).state, 'in-range');
    assert.equal(maintainStatus(on(76.4), maintain, START).state, 'in-range');
    assert.equal(maintainStatus(on(73.6), maintain, START).state, 'in-range');
  });

  it('reports above and below the band', () => {
    assert.equal(maintainStatus(on(77), maintain, START).state, 'above');
    assert.equal(maintainStatus(on(73), maintain, START).state, 'below');
  });

  it('exposes the band edges so a screen never recomputes them', () => {
    const status = maintainStatus(on(75), maintain, START);
    assert.equal(status.lowKg, 73.5);
    assert.equal(status.highKg, 76.5);
  });

  it('signs the delta from the goal', () => {
    assert.equal(maintainStatus(on(77), maintain, START).deltaKg.toFixed(1), '2.0');
    assert.equal(maintainStatus(on(73), maintain, START).deltaKg.toFixed(1), '-2.0');
  });

  it('scores the share of the last 30 days spent in range', () => {
    const entries: WeighIn[] = [
      { logDate: START, weightKg: 75 },
      { logDate: addDays(START, 1), weightKg: 78 }, // out
      { logDate: addDays(START, 2), weightKg: 76 },
      { logDate: addDays(START, 3), weightKg: 75.5 },
    ];
    assert.equal(maintainStatus(entries, maintain, addDays(START, 3)).daysInRangePct, 75);
  });

  it('has no score before anything is weighed', () => {
    assert.equal(maintainStatus([], maintain, START).daysInRangePct, null);
  });

  it('turns off the countdown, which has nowhere to arrive', () => {
    assert.equal(isCountdown(profile), true);
    assert.equal(isCountdown(maintain), false);
  });
});

describe('photoComparison', () => {
  const meas = (logDate: string, waistCm: number, photo: string | null): Measurement => ({
    id: `m-${logDate}`,
    logDate,
    waistCm,
    chestCm: 120,
    armsCm: 40,
    thighsCm: 70,
    neckCm: 45,
    photo,
  });

  it('pairs the earliest and latest photographed days', () => {
    const result = photoComparison(
      [
        meas(START, 130, 'file://a.jpg'),
        meas(addDays(START, 30), 126, null),
        meas(addDays(START, 60), 122, 'file://b.jpg'),
      ],
      [
        { logDate: START, weightKg: 157 },
        { logDate: addDays(START, 60), weightKg: 150 },
      ],
    );

    assert.ok(result);
    assert.equal(result.before.logDate, START);
    assert.equal(result.after.logDate, addDays(START, 60));
    assert.equal(result.days, 60);
    assert.equal(result.weightDeltaKg, -7);
    assert.equal(result.waistDeltaCm, -8);
  });

  it('needs both halves — one photo is not a comparison', () => {
    assert.equal(photoComparison([meas(START, 130, 'file://a.jpg')], []), null);
    assert.equal(photoComparison([meas(START, 130, null), meas(addDays(START, 7), 129, null)], []), null);
  });

  it('still pairs when a photographed day was never weighed', () => {
    const result = photoComparison(
      [meas(START, 130, 'file://a.jpg'), meas(addDays(START, 7), 129, 'file://b.jpg')],
      [{ logDate: START, weightKg: 157 }],
    );
    assert.ok(result);
    assert.equal(result.weightDeltaKg, null);
    assert.equal(result.waistDeltaCm, -1);
  });
});

describe('under 18, the app prescribes nothing', () => {
  const minor: Profile = { ...profile, birthYear: birthYearForAge(16), targetCalories: 0 };

  it('has no planned deficit, and no implied pace', () => {
    assert.equal(plannedDailyDeficit(157, minor), null);
    assert.equal(expectedLossPerWeek(157, minor), null);
  });

  it('still computes one for an adult, so the rule is the age and nothing else', () => {
    assert.notEqual(plannedDailyDeficit(157, profile), null);
    assert.notEqual(expectedLossPerWeek(157, profile), null);
    assert.equal(plannedDailyDeficit(157, { ...profile, birthYear: birthYearForAge(ADULT_AGE) }) != null, true);
  });

  it('gives milestones no target date, and never calls one overdue', () => {
    const rows = milestones([], minor, {}, {}, addDays(START, 400));
    assert.ok(rows.length > 0);
    for (const row of rows) {
      assert.equal(row.targetDate, null);
      assert.notEqual(row.status, 'Overdue');
    }
  });

  it('keeps target dates for an adult on the same dataset', () => {
    const rows = milestones([], profile, {}, {}, addDays(START, 400));
    assert.notEqual(rows[0].targetDate, null);
  });

  it('still marks a milestone reached — achievements are theirs either way', () => {
    const rows = milestones([], minor, {}, { '155': addDays(START, 20) }, addDays(START, 400));
    const reached = rows.find((r) => r.targetKg === 155);
    assert.equal(reached?.status, 'Achieved');
  });

  it('projects no goal date, however clear the downward trend is', () => {
    const losing: WeighIn[] = Array.from({ length: 30 }, (_, i) => ({
      logDate: addDays(START, i),
      weightKg: 157 - i * 0.1,
    }));
    const asOf = addDays(START, 29);

    assert.notEqual(daysToGoal(losing, profile, asOf), null, 'an adult gets a projection');
    assert.equal(daysToGoal(losing, minor, asOf), null);
    assert.equal(estimatedGoalDate(losing, minor, asOf), null);
    assert.equal(weeksToGoal(losing, minor, asOf), null);
  });

  it('scores the calories habit on having logged, not on hitting a target', () => {
    const ticks = habitTicks({ logDate: START, calories: 1200 }, minor, START, START);
    assert.equal(ticks?.calories, true, 'logging is the whole bar');

    const none = habitTicks({ logDate: START }, minor, START, START);
    assert.equal(none?.calories, false);
  });
});

describe('age is derived, not stored', () => {
  const born = (year: number): Profile => ({ ...profile, birthYear: year });

  it('reads the age off the year of birth', () => {
    assert.equal(ageFrom(1992, '2026-09-13'), 34);
    assert.equal(ageFrom(1992, '2027-01-01'), 35, 'it moves on its own');
    assert.equal(currentAge(born(1992), '2026-09-13'), 34);
  });

  it('round-trips through the form helper', () => {
    const year = birthYearForAge(34, '2026-09-13');
    assert.equal(currentAge(born(year), '2026-09-13'), 34);
  });

  it('feeds a resting burn that rises with the years, as the formula says', () => {
    // Mifflin-St Jeor subtracts 5 kcal per year of age, so a birthday lowers
    // BMR by 5. A stored age would have held it still for the whole plan.
    const p = born(1992);
    assert.equal(bmr(152.2, p, '2026-09-13') - bmr(152.2, p, '2027-09-13'), 5);
  });

  it('turns 18 on its own, without the profile being edited', () => {
    const p = born(2009);
    assert.equal(isAdult(p, '2026-12-31'), false);
    assert.equal(isAdult(p, '2027-01-01'), true);
  });

  it('starts giving a deficit once they are 18, not before', () => {
    const p = { ...born(2009), targetCalories: 2000 };
    assert.equal(plannedDailyDeficit(80, p), null);
    assert.equal(plannedDailyDeficit(80, p) === null, !isAdult(p));
  });
});

describe('the one-time adulthood notice', () => {
  const minorNow = { ...profile, birthYear: 2009, targetCalories: 0 };

  it('stays quiet while they are still under 18', () => {
    assert.equal(shouldOfferAdulthood(minorNow, false, '2026-12-31'), false);
  });

  it('offers once they turn 18 with no target set', () => {
    assert.equal(shouldOfferAdulthood(minorNow, false, '2027-01-01'), true);
  });

  it('does not offer twice', () => {
    assert.equal(shouldOfferAdulthood(minorNow, true, '2027-01-01'), false);
  });

  it('does not offer to someone who already has a target', () => {
    // Nothing was switched on behind their back, which is the whole point.
    assert.equal(
      shouldOfferAdulthood({ ...minorNow, targetCalories: 2000 }, false, '2027-01-01'),
      false,
    );
  });

  it('never offers to an adult who deliberately has no target', () => {
    // They are told once; after that the absence of a target is their choice.
    assert.equal(shouldOfferAdulthood({ ...profile, targetCalories: 0 }, true), false);
  });
});
