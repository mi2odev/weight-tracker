/**
 * Two datasets, mirroring the "Dataset: Day 1 / Week 9" switch the design
 * prototype carried.
 *
 * `emptyData()` is the real first-run state: a fresh profile, nothing logged,
 * onboarding still to do. Every empty and locked state in the app is reachable
 * from here.
 *
 * `demoData()` reproduces the populated journey the redesigned artboards show —
 * day 57 of 730, 157.0 kg down to 152.2 kg — using the same series generator
 * the `ProgressScreen.dc.html` prototype used, so the trend chart draws the
 * curve from artboard 1e rather than an invented one.
 */

import {
  AppData,
  CURRENT_SCHEMA_VERSION,
  DateKey,
  Measurement,
  MealEntry,
  Profile,
  SavedMeal,
  SavedWorkout,
  WeighIn,
  WorkoutEntry,
} from './types';
import { addDays, todayKey } from '../lib/date';
import { suggestedCalorieTarget, suggestedProteinTarget, tdee } from '../lib/calc';
import { templateFromMeal, templateFromWorkout } from '../lib/templates';
import { DEFAULT_LOCK } from '../lib/lockRules';

/** Off until the user says otherwise — that is what opt-in means. */
const DEFAULT_DIAGNOSTICS = { crashReports: false };

const DEFAULT_NOTIFICATIONS = {
  morningWeighIn: true,
  eveningLog: true,
  weeklySummary: true,
  milestoneReached: true,
  water: true,
  morningMinutes: 7 * 60,
  eveningMinutes: 21 * 60,
};

export function defaultProfile(): Profile {
  const base: Profile = {
    startDate: todayKey(),
    startWeightKg: 90,
    goalWeightKg: 81,
    heightCm: 175,
    birthYear: new Date().getFullYear() - 34,
    sex: 'Male',
    activityLevel: 'Lightly Active',
    goalType: 'lose',
    targetCalories: 2000,
    targetProteinG: 97,
    targetWaterL: 3,
    targetSteps: 8000,
    targetSleepH: 7,
    units: 'metric',
  };
  // Keep the suggested targets consistent with the profile's own numbers.
  base.targetCalories = suggestedCalorieTarget(tdee(base.startWeightKg, base));
  base.targetProteinG = suggestedProteinTarget(base.goalWeightKg);
  return base;
}

export function emptyData(): AppData {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: defaultProfile(),
    entries: [],
    meals: [],
    workouts: [],
    savedMeals: [],
    savedWorkouts: [],
    measurements: [],
    rewards: {},
    achieved: {},
    celebrated: [],
    notifications: { ...DEFAULT_NOTIFICATIONS },
    lock: { ...DEFAULT_LOCK },
    diagnostics: { ...DEFAULT_DIAGNOSTICS },
    adulthoodNoticed: false,
    inboxRead: [],
    onboarded: false,
  };
}

// ── the demo journey ─────────────────────────────────────────────────────────

/** Week-by-week anchors from the design prototype. */
const WEEKLY_ANCHORS = [156.8, 156.1, 155.4, 155.0, 154.3, 153.6, 152.9, 152.4];

const DEMO_DAYS = 57; // day 0 … day 56 — "Day 57 of 730"

/** Days deliberately left unlogged, so streaks and consistency are not perfect. */
const SKIPPED = new Set([9, 10, 23, 33]);

const WATER_CYCLE = [2.1, 3.2, 3.6, 2.6, 3.1, 4.0, 2.9];
const SLEEP_CYCLE = [6.4, 7.2, 7.9, 6.9, 7.5, 8.1, 6.1];

function seededWeight(i: number): number {
  const w = Math.min(7, Math.floor(i / 7));
  const base = WEEKLY_ANCHORS[w];
  const next = WEEKLY_ANCHORS[Math.min(7, w + 1)];
  const t = (i % 7) / 7;
  const trend = base + (next - base) * t * 0.85;
  return Math.round((trend + Math.sin(i * 1.9) * 0.32 + Math.sin(i * 0.7) * 0.18) * 10) / 10;
}

export function demoData(): AppData {
  const today = todayKey();
  const startDate = addDays(today, -(DEMO_DAYS - 1));

  const profile: Profile = {
    startDate,
    startWeightKg: 157,
    goalWeightKg: 100,
    heightCm: 178,
    birthYear: new Date().getFullYear() - 34,
    sex: 'Male',
    activityLevel: 'Lightly Active',
    goalType: 'lose',
    targetCalories: 2800, // user-overridden; the suggestion for this profile is 2 650
    targetProteinG: 120,
    targetWaterL: 3,
    targetSteps: 8000,
    targetSleepH: 7,
    units: 'metric',
  };

  const entries: WeighIn[] = [];
  for (let i = 0; i < DEMO_DAYS; i++) {
    if (SKIPPED.has(i)) continue;
    entries.push({
      logDate: addDays(startDate, i),
      weightKg: seededWeight(i),
      calories: 2380 + Math.round(Math.sin(i * 1.1) * 340),
      proteinG: 96 + (i % 13) * 4,
      waterL: WATER_CYCLE[i % 7],
      steps: 5600 + ((i * 1373) % 7200),
      cardioMin: i % 3 === 0 ? 40 : i % 5 === 0 ? 25 : 0,
      strengthDone: i % 4 === 1,
      sleepH: SLEEP_CYCLE[i % 7],
      notes: '',
    });
  }

  // Pin the last two days to the exact values the Today and Progress artboards
  // show, so the app opens on the screen the design was signed off against.
  const yesterday = entries.find((e) => e.logDate === addDays(today, -1));
  if (yesterday) yesterday.weightKg = 152.5;

  const last = entries[entries.length - 1];
  Object.assign(last, {
    weightKg: 152.2,
    calories: 2640,
    proteinG: 118,
    waterL: 2.8, // the one missed habit — 0.2 L under the 3 L target
    steps: 9240,
    cardioMin: 35,
    strengthDone: true,
    sleepH: 7.2,
    notes: 'Legs felt heavy but finished the session.',
  } satisfies Partial<WeighIn>);

  const measurements: Measurement[] = [
    { waistCm: 132, chestCm: 126, armsCm: 40, thighsCm: 70, neckCm: 45 },
    { waistCm: 130, chestCm: 125, armsCm: 39.5, thighsCm: 69, neckCm: 44.6 },
    { waistCm: 128.5, chestCm: 124, armsCm: 39.4, thighsCm: 68.2, neckCm: 44.2 },
    { waistCm: 126, chestCm: 122.5, armsCm: 39, thighsCm: 67.5, neckCm: 43.8 },
    { waistCm: 124.5, chestCm: 121, armsCm: 39, thighsCm: 66.8, neckCm: 43.5 },
  ].map((m, i) => ({ id: `meas-${i}`, logDate: addDays(startDate, i * 14), ...m }));

  const meals: MealEntry[] = [
    { mealType: 'Breakfast' as const, description: 'Greek yoghurt, berries, walnuts', calories: 420, proteinG: 32 },
    { mealType: 'Lunch' as const, description: 'Chicken, rice, roasted peppers', calories: 710, proteinG: 48 },
    { mealType: 'Snack' as const, description: 'Apple and a protein shake', calories: 260, proteinG: 26 },
  ].map((m, i) => ({ id: `meal-${i}`, logDate: today, ...m }));

  const workouts: WorkoutEntry[] = [
    {
      type: 'Cardio' as const,
      session: 'Treadmill intervals',
      durationMin: 35,
      intensity: 'Medium' as const,
      caloriesBurned: 380,
    },
    {
      type: 'Walk' as const,
      session: 'Evening loop',
      durationMin: 25,
      intensity: 'Low' as const,
      caloriesBurned: 110,
    },
  ].map((w, i) => ({ id: `wo-${i}`, logDate: today, ...w }));

  // The demo's own meals and workouts, kept as templates — this is exactly
  // what someone would save after logging the same lunch a few times.
  const savedMeals: SavedMeal[] = meals.map((m, i) => templateFromMeal(m, `saved-meal-${i}`));
  const savedWorkouts: SavedWorkout[] = workouts.map((w, i) =>
    templateFromWorkout(w, `saved-workout-${i}`),
  );

  // Stamp achieved dates the way the app would have as the user crossed them:
  // the earliest log date at or below each 5 kg mark.
  const achieved: Record<string, DateKey> = {};
  const top = Math.floor(profile.startWeightKg / 5) * 5;
  for (let target = top; target >= profile.goalWeightKg; target -= 5) {
    const hit = entries.find((e) => (e.weightKg ?? Infinity) <= target);
    if (hit) achieved[String(target)] = hit.logDate;
  }

  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile,
    entries,
    meals,
    savedMeals,
    savedWorkouts,
    workouts,
    measurements,
    rewards: { '155': 'New running shoes' },
    achieved,
    celebrated: Object.keys(achieved).map(Number),
    notifications: { ...DEFAULT_NOTIFICATIONS },
    lock: { ...DEFAULT_LOCK },
    diagnostics: { ...DEFAULT_DIAGNOSTICS },
    adulthoodNoticed: false,
    inboxRead: [],
    onboarded: true,
  };
}
