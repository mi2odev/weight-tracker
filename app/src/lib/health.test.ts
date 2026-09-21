/**
 * Guardrails decide what the app is willing to endorse, so the tests here are
 * about the boundaries: what is refused, what is only warned about, and what
 * passes without comment.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ADULT_AGE,
  BLOCKED_GOAL_BMI,
  CALORIE_CEILING,
  calorieFloor,
  checkCalorieTarget,
  checkGoalWeight,
  isAdult,
  isLosingTooFast,
  suggestedGentlerTarget,
} from './health';
import { bmi, weightForBmi } from './calc';
import { Profile } from '../data/types';

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

/**
 * A smaller person. Worth knowing: at this size the calorie floor already
 * keeps the pace under 1% a week, so the floor does most of the protecting
 * and the pace warning rarely fires. It is the large-and-impatient case that
 * trips it — see the 157 kg profile below.
 */
const smaller: Profile = { ...profile, startWeightKg: 65, goalWeightKg: 60, heightCm: 165, sex: 'Female' };

describe('calorie floor', () => {
  it('is 1500 for men and 1200 for women', () => {
    assert.equal(calorieFloor('Male'), 1500);
    assert.equal(calorieFloor('Female'), 1200);
  });

  it('refuses anything under the floor', () => {
    const result = checkCalorieTarget(1400, profile, 157);
    assert.ok(result.error);
    assert.match(result.error!, /1,500 kcal is the lowest/);
  });

  it('accepts exactly the floor', () => {
    assert.equal(checkCalorieTarget(1500, profile, 157).error, null);
  });

  it('uses the lower floor for a female profile', () => {
    assert.equal(checkCalorieTarget(1250, { ...profile, sex: 'Female' }, 65).error, null);
    assert.ok(checkCalorieTarget(1150, { ...profile, sex: 'Female' }, 65).error);
  });

  it('refuses a slipped decimal point', () => {
    assert.ok(checkCalorieTarget(CALORIE_CEILING + 1, profile, 157).error);
  });

  it('refuses a value that is not a number', () => {
    assert.ok(checkCalorieTarget(Number.NaN, profile, 157).error);
  });
});

describe('pace warning', () => {
  it('says nothing about a sensible target', () => {
    // 157 kg at 2 650 kcal is well under 1% a week.
    const result = checkCalorieTarget(2650, profile, 157);
    assert.equal(result.error, null);
    assert.equal(result.warning, null);
  });

  it('leaves the floor alone for a small person, where it is already safe', () => {
    // 65 kg at 1 200 kcal is about 0.6 kg a week — under the 0.65 kg line.
    const result = checkCalorieTarget(1200, smaller, 65);
    assert.equal(result.error, null);
    assert.equal(result.warning, null);
  });

  it('warns — but does not block — when the pace exceeds about 1% a week', () => {
    // 157 kg at the 1 500 kcal floor is ~1.7 kg a week against a 1.57 kg line.
    const result = checkCalorieTarget(1500, profile, 157);
    assert.equal(result.error, null, 'at the floor, so it must still be allowed');
    assert.ok(result.warning);
    assert.match(result.warning!, /faster than the usual guidance/);
  });

  it('names a gentler target in the warning, never below the floor', () => {
    const gentler = suggestedGentlerTarget(profile, 157);
    assert.ok(gentler >= calorieFloor(profile.sex));
    assert.ok(checkCalorieTarget(1500, profile, 157).warning!.includes(gentler.toLocaleString('en-GB')));
  });

  it('suggests a target that actually lands under the threshold', () => {
    // Rounding up matters here: to the nearest 50 this lands at 1 650, which
    // still trips the warning it was offered to avoid.
    const gentler = suggestedGentlerTarget(profile, 157);
    assert.equal(checkCalorieTarget(gentler, profile, 157).warning, null);
  });

  it('keeps a supportive tone — no scolding', () => {
    const warning = checkCalorieTarget(1500, profile, 157).warning!;
    assert.match(warning, /your call/i);
    for (const scold of ['dangerous', 'you must', 'stop', 'wrong']) {
      assert.ok(!warning.toLowerCase().includes(scold), `warning should not say "${scold}"`);
    }
  });
});

describe('goal weight', () => {
  it('passes a goal inside the healthy range without comment', () => {
    const result = checkGoalWeight(75, profile);
    assert.equal(result.error, null);
    assert.equal(result.warning, null);
  });

  it('warns between BMI 17 and 18.5', () => {
    // 178 cm: BMI 18 is about 57 kg.
    const goal = weightForBmi(18, profile.heightCm);
    const result = checkGoalWeight(goal, profile);
    assert.equal(result.error, null, 'a warning must not block');
    assert.ok(result.warning);
    assert.match(result.warning!, /under the healthy range/);
  });

  it('blocks below BMI 17', () => {
    const goal = weightForBmi(16.5, profile.heightCm);
    const result = checkGoalWeight(goal, profile);
    assert.ok(result.error);
    assert.equal(result.warning, null);
    assert.match(result.error!, /will not set it as a goal/);
  });

  it('names the lowest goal it would accept, and that goal passes the block', () => {
    const floorKg = weightForBmi(BLOCKED_GOAL_BMI, profile.heightCm);
    assert.equal(checkGoalWeight(floorKg, profile).error, null);
    assert.ok(bmi(floorKg, profile.heightCm) >= BLOCKED_GOAL_BMI - 1e-9);
  });

  it('scales the thresholds with height', () => {
    const tall = { ...profile, heightCm: 200 };
    const short = { ...profile, heightCm: 150 };
    // 55 kg is fine for a short person and blocked for a very tall one.
    assert.equal(checkGoalWeight(55, short).error, null);
    assert.ok(checkGoalWeight(55, tall).error);
  });

  it('explains why rather than just refusing', () => {
    const error = checkGoalWeight(weightForBmi(15, profile.heightCm), profile).error!;
    assert.match(error, /doctor/);
  });
});

describe('age', () => {
  it('treats 18 and over as adult', () => {
    assert.equal(isAdult({ ...profile, ageYears: ADULT_AGE }), true);
    assert.equal(isAdult({ ...profile, ageYears: 17 }), false);
  });
});

describe('rapid loss', () => {
  it('is quiet with no trend yet', () => {
    assert.equal(isLosingTooFast(null, 100), false);
  });

  it('is quiet when the trend is flat or upward', () => {
    assert.equal(isLosingTooFast(0, 100), false);
    assert.equal(isLosingTooFast(0.1, 100), false);
  });

  it('is quiet at a normal pace', () => {
    // 1 kg a week at 100 kg is 1%, under the 1.5% alert line.
    assert.equal(isLosingTooFast(-1 / 7, 100), false);
  });

  it('fires above about 1.5% of body weight per week', () => {
    // 2 kg a week at 100 kg is 2%.
    assert.equal(isLosingTooFast(-2 / 7, 100), true);
  });

  it('scales with body weight, not an absolute number of kilos', () => {
    const perDay = -1.2 / 7; // 1.2 kg a week
    assert.equal(isLosingTooFast(perDay, 150), false, '0.8% for a larger person');
    assert.equal(isLosingTooFast(perDay, 60), true, '2% for a smaller one');
  });
});
