/**
 * The point of a template library is that it stays short enough to scan. So
 * these lean on the duplicate rules: saving the same meal twice would leave
 * the user choosing between two identical lines, which is worse than not
 * offering the feature at all.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  findSavedMeal,
  findSavedWorkout,
  normaliseName,
  rankSavedMeals,
  rankSavedWorkouts,
  savedMealSummary,
  savedWorkoutSummary,
  templateFromMeal,
  templateFromWorkout,
  upsertSavedMeal,
  upsertSavedWorkout,
} from './templates';
import { MealEntry, SavedMeal, SavedWorkout, WorkoutEntry } from '../data/types';

const porridge: SavedMeal = {
  id: 's1',
  mealType: 'Breakfast',
  description: 'Porridge and berries',
  calories: 410,
  proteinG: 14,
};

const run: SavedWorkout = {
  id: 'w1',
  type: 'Cardio',
  session: 'Treadmill intervals',
  durationMin: 35,
  intensity: 'Medium',
  caloriesBurned: 380,
};

describe('comparing names the way a person would', () => {
  it('ignores case, padding and doubled spaces', () => {
    assert.equal(normaliseName('  Porridge   and  Berries '), 'porridge and berries');
  });
});

describe('finding a duplicate meal', () => {
  it('matches on the name regardless of how it was typed', () => {
    const hit = findSavedMeal([porridge], {
      description: '  porridge AND berries ',
      mealType: 'Breakfast',
    });
    assert.equal(hit?.id, 's1');
  });

  it('does not match the same food logged as a different meal', () => {
    // Porridge at breakfast and porridge as a snack are two entries worth
    // keeping apart in a list someone is scanning.
    assert.equal(findSavedMeal([porridge], { description: 'Porridge and berries', mealType: 'Snack' }), null);
  });

  it('ignores the numbers, which drift between servings', () => {
    const hit = findSavedMeal([porridge], { description: 'Porridge and berries', mealType: 'Breakfast' });
    assert.equal(hit?.calories, 410, 'matched despite carrying its own figures');
  });

  it('never matches on an empty name', () => {
    assert.equal(findSavedMeal([porridge], { description: '   ', mealType: 'Breakfast' }), null);
  });
});

describe('saving a meal', () => {
  it('adds one that is genuinely new', () => {
    const out = upsertSavedMeal([porridge], { ...porridge, id: 's2', description: 'Eggs on toast' });
    assert.equal(out.length, 2);
  });

  it('updates the duplicate rather than adding a second line', () => {
    const out = upsertSavedMeal([porridge], { ...porridge, id: 's-new', calories: 430 });
    assert.equal(out.length, 1);
    assert.equal(out[0].calories, 430, 're-saving means "this is the right number now"');
    assert.equal(out[0].id, 's1', 'and it keeps its identity');
  });

  it('leaves the other entries alone', () => {
    const eggs: SavedMeal = { ...porridge, id: 's2', description: 'Eggs on toast' };
    const out = upsertSavedMeal([porridge, eggs], { ...porridge, id: 's-new', calories: 430 });
    assert.equal(out.length, 2);
    assert.equal(out.find((m) => m.id === 's2')?.description, 'Eggs on toast');
  });
});

describe('workouts follow the same rules', () => {
  it('matches on name and type', () => {
    assert.equal(findSavedWorkout([run], { session: 'treadmill intervals', type: 'Cardio' })?.id, 'w1');
    assert.equal(findSavedWorkout([run], { session: 'Treadmill intervals', type: 'Walk' }), null);
  });

  it('updates a duplicate instead of piling up', () => {
    const out = upsertSavedWorkout([run], { ...run, id: 'w-new', durationMin: 45 });
    assert.equal(out.length, 1);
    assert.equal(out[0].durationMin, 45);
    assert.equal(out[0].id, 'w1');
  });
});

describe('turning a logged row into a template', () => {
  it('keeps everything but the day', () => {
    const saved = templateFromMeal(
      { mealType: 'Lunch', description: 'Chicken and rice', calories: 710, proteinG: 48 },
      's9',
    );
    assert.deepEqual(saved, {
      id: 's9',
      mealType: 'Lunch',
      description: 'Chicken and rice',
      calories: 710,
      proteinG: 48,
    });
    assert.equal('logDate' in saved, false, 'a template has no date');
  });

  it('does the same for a workout', () => {
    const saved = templateFromWorkout(
      { type: 'Walk', session: 'Evening loop', durationMin: 25, intensity: 'Low', caloriesBurned: 110 },
      'w9',
    );
    assert.equal('logDate' in saved, false);
    assert.equal(saved.session, 'Evening loop');
  });
});

describe('the line under a saved name', () => {
  it('reads out a meal', () => {
    assert.equal(savedMealSummary(porridge), '410 kcal · 14 g protein');
  });

  it('groups thousands, since a big meal should not read as 1250', () => {
    assert.equal(savedMealSummary({ ...porridge, calories: 1250 }), '1,250 kcal · 14 g protein');
  });

  it('reads out a workout, and leaves out a calorie figure nobody entered', () => {
    assert.equal(savedWorkoutSummary(run), '35 min · Medium · 380 kcal');
    assert.equal(savedWorkoutSummary({ ...run, caloriesBurned: 0 }), '35 min · Medium');
  });
});

describe('ordering the library', () => {
  const eggs: SavedMeal = { ...porridge, id: 's2', description: 'Eggs on toast' };
  const soup: SavedMeal = { ...porridge, id: 's3', description: 'Apple soup', mealType: 'Breakfast' };

  const logged = (description: string, times: number): MealEntry[] =>
    Array.from({ length: times }, (_, i) => ({
      id: `m${description}${i}`,
      logDate: '2026-09-13',
      mealType: 'Breakfast' as const,
      description,
      calories: 0,
      proteinG: 0,
    }));

  it('floats what gets eaten most to the top', () => {
    const ranked = rankSavedMeals([soup, eggs, porridge], [
      ...logged('Porridge and berries', 5),
      ...logged('Eggs on toast', 2),
    ]);
    assert.deepEqual(ranked.map((m) => m.id), ['s1', 's2', 's3']);
  });

  it('falls back to alphabetical when nothing has been logged', () => {
    const ranked = rankSavedMeals([porridge, eggs, soup], []);
    assert.deepEqual(ranked.map((m) => m.description), [
      'Apple soup',
      'Eggs on toast',
      'Porridge and berries',
    ]);
  });

  it('does not reorder the caller\'s array', () => {
    const input = [porridge, eggs];
    rankSavedMeals(input, logged('Eggs on toast', 9));
    assert.equal(input[0].id, 's1');
  });

  it('ranks workouts the same way', () => {
    const loop: SavedWorkout = { ...run, id: 'w2', session: 'Evening loop', type: 'Walk' };
    const workouts: WorkoutEntry[] = [
      { id: 'a', logDate: '2026-09-13', type: 'Walk', session: 'Evening loop', durationMin: 25, intensity: 'Low', caloriesBurned: 0 },
      { id: 'b', logDate: '2026-09-14', type: 'Walk', session: 'Evening loop', durationMin: 25, intensity: 'Low', caloriesBurned: 0 },
    ];
    assert.deepEqual(rankSavedWorkouts([run, loop], workouts).map((w) => w.id), ['w2', 'w1']);
  });
});
