import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyData } from '../data/seed';
import { Profile, WeighIn } from '../data/types';
import { addDays } from './date';
import { bmiPosition, bmiScaleMax, lastSevenDays, periodStart, periodSummary, personalRecords, planPosition, weekdayPattern } from './progressStats';

const START = '2026-09-07'; // a Monday
const profile: Profile = { ...emptyData().profile, startDate: START, startWeightKg: 100, goalWeightKg: 80 };

describe('position against the plan', () => {
  it('draws a straight line from start to goal over 730 days', () => {
    const halfway = planPosition(profile, 90, addDays(START, 365));
    assert.equal(halfway.plannedKg, 90);
    assert.equal(halfway.aheadKg, 0);
  });

  it('reads further toward the goal as ahead', () => {
    const p = planPosition(profile, 95, addDays(START, 73)); // plan says 98
    assert.equal(p.plannedKg.toFixed(1), '98.0');
    assert.equal(p.aheadKg.toFixed(1), '3.0');
  });

  it('reads behind as negative, and works for a gain goal', () => {
    assert.ok(planPosition(profile, 99.5, addDays(START, 73)).aheadKg < 0);
    const gain = { ...profile, startWeightKg: 60, goalWeightKg: 70 };
    assert.ok(planPosition(gain, 63, addDays(START, 73)).aheadKg > 0, '63 kg is past the 61 kg the plan expects');
  });
});

describe('the weekday pattern', () => {
  const log = (values: [number, number][]): WeighIn[] => values.map(([d, kg]) => ({ logDate: addDays(START, d), weightKg: kg }));

  it('averages each weekday\'s overnight change, Monday first', () => {
    // Sunday → Monday is +0.4 twice; Monday → Tuesday is −0.2 twice.
    const entries = log([[6, 99], [7, 99.4], [8, 99.2], [13, 98.8], [14, 99.2], [15, 99]]);
    const p = weekdayPattern(entries, addDays(START, 20));
    assert.equal(p[0].avgKg!.toFixed(1), '0.4');
    assert.equal(p[1].avgKg!.toFixed(1), '-0.2');
    assert.equal(p[0].samples, 2);
  });

  it('ignores changes across a gap', () => {
    const p = weekdayPattern(log([[0, 100], [2, 99], [9, 98]]), addDays(START, 20));
    assert.ok(p.every((d) => d.samples === 0));
  });

  it('needs two samples before calling it a pattern', () => {
    const p = weekdayPattern(log([[6, 99], [7, 99.4]]), addDays(START, 20));
    assert.equal(p[0].avgKg, null);
    assert.equal(p[0].samples, 1);
  });
});

describe('the last seven days', () => {
  it('averages only the days that logged each field', () => {
    const asOf = addDays(START, 10);
    const entries: WeighIn[] = [
      { logDate: asOf, calories: 2000, steps: 8000 },
      { logDate: addDays(asOf, -1), calories: 1800 },
      { logDate: addDays(asOf, -9), calories: 9999 }, // outside the week
    ];
    const byField = Object.fromEntries(lastSevenDays(entries, asOf).map((f) => [f.field, f]));
    assert.equal(byField.calories.avg, 1900);
    assert.equal(byField.calories.days, 2);
    assert.equal(byField.steps.avg, 8000);
    assert.equal(byField.sleepH.avg, null);
  });
});

describe('personal records', () => {
  it('finds the lowest weigh-in, the best week and the logging rate', () => {
    const entries: WeighIn[] = Array.from({ length: 14 }, (_, i) => ({
      logDate: addDays(START, i),
      // A week's loss is average-to-average, as on Trends: week 1 averages
      // 99.1 (0.9 off the start), week 2 averages 97.8 (1.3 off week 1).
      weightKg: 100 - (i < 7 ? 0.3 * i : 1.8 + 0.1 * (i - 6)),
    }));
    const r = personalRecords(entries, profile, addDays(START, 13));
    assert.equal(r.lowest?.date, addDays(START, 13));
    assert.equal(r.weighedDays, 14);
    assert.equal(r.planDays, 14);
    assert.equal(r.longestStreak, 14);
    assert.equal(r.bestWeek?.index, 2);
    assert.equal(r.bestWeek?.lostKg.toFixed(1), '1.3');
  });

  it('is empty on a fresh plan', () => {
    const r = personalRecords([], profile, START);
    assert.equal(r.lowest, null);
    assert.equal(r.bestWeek, null);
    assert.equal(r.planDays, 1);
  });
});

describe('the BMI scale', () => {
  it('places a value along 15–45 and clamps the ends', () => {
    assert.equal(bmiPosition(30), 0.5);
    assert.equal(bmiPosition(10), 0);
    assert.equal(bmiPosition(60), 1);
  });

  it('stretches past 45 so a high start and today both stay visible', () => {
    assert.equal(bmiScaleMax(30, 28), 45);
    const max = bmiScaleMax(49.6, 48);
    assert.equal(max, 55);
    assert.ok(bmiPosition(49.6, max) < 1 && bmiPosition(48, max) < bmiPosition(49.6, max));
  });
});

describe('a chosen period', () => {
  const entries: WeighIn[] = Array.from({ length: 40 }, (_, i) => ({ logDate: addDays(START, i), weightKg: 100 - i * 0.1 }));

  it('covers the last N days, never before the start date', () => {
    assert.equal(periodStart(profile, addDays(START, 39), 30), addDays(START, 10));
    assert.equal(periodStart(profile, addDays(START, 5), 30), START);
    assert.equal(periodStart(profile, addDays(START, 39), 0), START, '0 means the whole plan');
  });

  it('reports the change, the weekly rate and the lowest point inside it', () => {
    const s = periodSummary(entries, profile, addDays(START, 39), 30);
    assert.equal(s.days, 30);
    assert.equal(s.changeKg!.toFixed(1), '-2.9');
    assert.equal(s.perWeekKg!.toFixed(1), '-0.7');
    assert.equal(s.lowest?.date, addDays(START, 39));
    assert.equal(s.weighedDays, 30);
  });

  it('gives no weekly rate for under a week of weigh-ins', () => {
    const s = periodSummary(entries, profile, addDays(START, 39), 7);
    assert.ok(s.changeKg != null);
    assert.equal(s.perWeekKg, null);
  });
});
