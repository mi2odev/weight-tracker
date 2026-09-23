/**
 * Reusable meals and workouts.
 *
 * Logging the same porridge every morning by retyping it is the kind of
 * friction that stops people logging at all. A row can be kept as a template
 * once and added with a tap afterwards.
 *
 * The rules here are about *not* filling that library with near-duplicates:
 * saving the same thing twice leaves the user picking between two identical
 * lines, which is worse than not offering the feature. Matching is on what
 * the user actually chose, not on the numbers, because "Porridge, 410 kcal"
 * and "Porridge, 415 kcal" are the same meal to everyone except a computer.
 *
 * Pure, so the matching is tested on Node.
 */

import { DateKey, MealEntry, MealType, SavedMeal, SavedWorkout, WorkoutEntry } from '../data/types';

/** Trimmed, lower-cased, and collapsed whitespace — how a person compares two names. */
export function normaliseName(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * The saved meal this one would duplicate, if any.
 *
 * Same description and same meal type. A porridge saved as Breakfast and the
 * same porridge as a Snack are two genuinely different entries to someone
 * scanning their list.
 */
export function findSavedMeal(
  saved: SavedMeal[],
  candidate: { description: string; mealType: MealType },
): SavedMeal | null {
  const name = normaliseName(candidate.description);
  if (!name) return null;
  return (
    saved.find((m) => normaliseName(m.description) === name && m.mealType === candidate.mealType) ??
    null
  );
}

/** The saved workout this one would duplicate, if any. Matched on name and type. */
export function findSavedWorkout(
  saved: SavedWorkout[],
  candidate: { session: string; type: WorkoutEntry['type'] },
): SavedWorkout | null {
  const name = normaliseName(candidate.session);
  if (!name) return null;
  return (
    saved.find((w) => normaliseName(w.session) === name && w.type === candidate.type) ?? null
  );
}

/**
 * Adds a meal to the library, or updates the one it duplicates.
 *
 * Updating rather than refusing is deliberate: someone re-saving a meal with
 * a corrected calorie figure means "this is the right number now", and
 * leaving the stale one in place would quietly ignore them.
 */
export function upsertSavedMeal(saved: SavedMeal[], meal: SavedMeal): SavedMeal[] {
  const existing = findSavedMeal(saved, meal);
  if (!existing) return [...saved, meal];
  return saved.map((m) => (m.id === existing.id ? { ...meal, id: existing.id } : m));
}

export function upsertSavedWorkout(saved: SavedWorkout[], workout: SavedWorkout): SavedWorkout[] {
  const existing = findSavedWorkout(saved, workout);
  if (!existing) return [...saved, workout];
  return saved.map((w) => (w.id === existing.id ? { ...workout, id: existing.id } : w));
}

/** A logged meal as a template — everything except the day it happened on. */
export function templateFromMeal(meal: Omit<MealEntry, 'id' | 'logDate'>, id: string): SavedMeal {
  return {
    id,
    mealType: meal.mealType,
    description: meal.description,
    calories: meal.calories,
    proteinG: meal.proteinG,
  };
}

export function templateFromWorkout(
  workout: Omit<WorkoutEntry, 'id' | 'logDate'>,
  id: string,
): SavedWorkout {
  return {
    id,
    type: workout.type,
    session: workout.session,
    durationMin: workout.durationMin,
    intensity: workout.intensity,
    caloriesBurned: workout.caloriesBurned,
  };
}

/** "420 kcal · 32 g protein" — the line under a saved meal's name. */
export function savedMealSummary(meal: SavedMeal): string {
  return `${Math.round(meal.calories).toLocaleString('en-GB')} kcal · ${Math.round(meal.proteinG)} g protein`;
}

/** "35 min · Medium · 380 kcal" — the line under a saved workout's name. */
export function savedWorkoutSummary(workout: SavedWorkout): string {
  const parts = [`${Math.round(workout.durationMin)} min`, workout.intensity];
  if (workout.caloriesBurned > 0) {
    parts.push(`${Math.round(workout.caloriesBurned).toLocaleString('en-GB')} kcal`);
  }
  return parts.join(' · ');
}

/**
 * Most-used first, then alphabetically.
 *
 * `usage` counts how often each template's name appears in the log, so the
 * breakfast someone eats daily rises to the top of the list on its own rather
 * than needing a favourites system on top of a favourites system.
 */
export function rankSavedMeals(saved: SavedMeal[], meals: MealEntry[]): SavedMeal[] {
  const usage = new Map<string, number>();
  for (const meal of meals) {
    const key = `${normaliseName(meal.description)}|${meal.mealType}`;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  const count = (m: SavedMeal) => usage.get(`${normaliseName(m.description)}|${m.mealType}`) ?? 0;

  return saved
    .slice()
    .sort((a, b) => count(b) - count(a) || normaliseName(a.description).localeCompare(normaliseName(b.description)));
}

export function rankSavedWorkouts(saved: SavedWorkout[], workouts: WorkoutEntry[]): SavedWorkout[] {
  const usage = new Map<string, number>();
  for (const workout of workouts) {
    const key = `${normaliseName(workout.session)}|${workout.type}`;
    usage.set(key, (usage.get(key) ?? 0) + 1);
  }
  const count = (w: SavedWorkout) => usage.get(`${normaliseName(w.session)}|${w.type}`) ?? 0;

  return saved
    .slice()
    .sort((a, b) => count(b) - count(a) || normaliseName(a.session).localeCompare(normaliseName(b.session)));
}

/** How many saved meals the Log screen offers as one-tap chips. */
export const QUICK_MEAL_COUNT = 3;

/**
 * The saved meals worth a one-tap chip: the most-used few.
 *
 * Kept short on purpose — a row of every template is the full picker again,
 * just harder to read. Anything further down is one tap away in the sheet.
 */
export function quickMeals(
  saved: SavedMeal[],
  meals: MealEntry[],
  day?: DateKey,
  limit = QUICK_MEAL_COUNT,
): SavedMeal[] {
  // What is already on the day is not a suggestion — offering this morning's
  // porridge again at lunch mostly invites a double entry. A second helping
  // is still one tap away in the sheet.
  const loggedToday = new Set(
    day == null
      ? []
      : meals
          .filter((m) => m.logDate === day)
          .map((m) => `${normaliseName(m.description)}|${m.mealType}`),
  );
  return rankSavedMeals(saved, meals)
    .filter((t) => !loggedToday.has(`${normaliseName(t.description)}|${t.mealType}`))
    .slice(0, Math.max(0, limit));
}

/** A template logged on a given day. */
export function mealFromTemplate(template: SavedMeal, logDate: DateKey, id: string): MealEntry {
  return {
    id,
    logDate,
    mealType: template.mealType,
    description: template.description,
    calories: template.calories,
    proteinG: template.proteinG,
  };
}

/**
 * Every meal from `from`, re-dated to `to` with fresh ids — "same as
 * yesterday" for people who eat the same thing most days.
 *
 * Ids come from `idFor` so the caller owns id generation (and the tests can
 * make them predictable). Order is kept, so breakfast still reads first.
 */
export function copyMeals(
  meals: MealEntry[],
  from: DateKey,
  to: DateKey,
  idFor: (index: number) => string,
): MealEntry[] {
  if (from === to) return [];
  return meals
    .filter((m) => m.logDate === from)
    .map((m, i) => ({ ...m, id: idFor(i), logDate: to }));
}

/**
 * Filters a saved list by what was typed: every word has to appear in the
 * name or the detail line, in any order, ignoring case. "chick rice" finds
 * "Chicken, rice, roasted peppers".
 */
export function matchesQuery(text: string, query: string): boolean {
  const words = normaliseName(query).split(' ').filter(Boolean);
  if (!words.length) return true;
  const haystack = normaliseName(text);
  return words.every((w) => haystack.includes(w));
}
