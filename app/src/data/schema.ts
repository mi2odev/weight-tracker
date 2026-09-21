/**
 * Stored-shape versioning, migration and validation.
 *
 * The store used to hydrate with `{ ...emptyData(), ...parsed }` — a shallow
 * merge, so a field added inside `profile` or `notifications` in a later
 * version came back `undefined` on an older payload and every screen reading
 * it broke. This module deep-merges the defaults instead, and type-checks
 * every value rather than trusting whatever was on disk.
 *
 * Pure: no React, no AsyncStorage, no native imports. The rules are testable.
 */

import {
  ACTIVITY_FACTORS,
  CURRENT_SCHEMA_VERSION,
  GOAL_TYPES,
  GoalType,
  ActivityLevel,
  AppData,
  DateKey,
  INTENSITIES,
  Intensity,
  LockSettings,
  MEAL_TYPES,
  MealEntry,
  MealType,
  Measurement,
  NotificationSettings,
  Profile,
  Sex,
  Units,
  WORKOUT_TYPES,
  WeighIn,
  WorkoutEntry,
  WorkoutType,
} from './types';
import { emptyData } from './seed';

export { CURRENT_SCHEMA_VERSION };

export interface MigrationResult {
  data: AppData;
  /** The version the payload was stored at. 0 means unreadable or absent. */
  fromVersion: number;
  /** True when anything had to be repaired, filled in or dropped. */
  changed: boolean;
  /** What was repaired, for the log and for tests. Never shown verbatim. */
  notes: string[];
}

// ── primitives ───────────────────────────────────────────────────────────────

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** A real calendar day, not just four digits and two dashes. */
export function isDateKey(v: unknown): v is DateKey {
  if (typeof v !== 'string' || !DATE_KEY.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

function numberIn(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Optional numeric log field: absent and invalid both become null. */
function optionalNumber(v: unknown, min: number, max: number): number | null {
  if (v == null || v === '') return null;
  return numberIn(v, min, max);
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[]): T | null {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function text(v: unknown, maxLength: number): string | undefined {
  return typeof v === 'string' ? v.slice(0, maxLength) : undefined;
}

// ── profile ──────────────────────────────────────────────────────────────────

const SEXES: readonly Sex[] = ['Male', 'Female'];
const UNITS: readonly Units[] = ['metric', 'imperial'];
const ACTIVITY_NAMES = Object.keys(ACTIVITY_FACTORS) as ActivityLevel[];

function migrateProfile(raw: unknown, defaults: Profile, notes: string[]): Profile {
  if (!isObject(raw)) {
    notes.push('profile was missing or not an object — defaults used');
    return { ...defaults };
  }

  const take = <T>(key: keyof Profile, value: T | null, fallback: T): T => {
    if (value == null) {
      if (raw[key] !== undefined) notes.push(`profile.${String(key)} was invalid — default used`);
      return fallback;
    }
    return value;
  };

  // Bounds mirror the validation rules in section 3 of the spec.
  return {
    startDate: take('startDate', isDateKey(raw.startDate) ? raw.startDate : null, defaults.startDate),
    startWeightKg: take('startWeightKg', numberIn(raw.startWeightKg, 30, 400), defaults.startWeightKg),
    goalWeightKg: take('goalWeightKg', numberIn(raw.goalWeightKg, 30, 400), defaults.goalWeightKg),
    heightCm: take('heightCm', numberIn(raw.heightCm, 100, 250), defaults.heightCm),
    ageYears: take('ageYears', numberIn(raw.ageYears, 14, 100), defaults.ageYears),
    sex: take('sex', oneOf(raw.sex, SEXES), defaults.sex),
    activityLevel: take('activityLevel', oneOf(raw.activityLevel, ACTIVITY_NAMES), defaults.activityLevel),
    // Absent before goal types existed, so an older payload lands on 'lose',
    // which is exactly what it was doing.
    goalType: oneOf<GoalType>(raw.goalType, GOAL_TYPES) ?? defaults.goalType,
    targetCalories: take('targetCalories', numberIn(raw.targetCalories, 800, 10000), defaults.targetCalories),
    targetProteinG: take('targetProteinG', numberIn(raw.targetProteinG, 0, 500), defaults.targetProteinG),
    targetWaterL: take('targetWaterL', numberIn(raw.targetWaterL, 0, 15), defaults.targetWaterL),
    targetSteps: take('targetSteps', numberIn(raw.targetSteps, 0, 100000), defaults.targetSteps),
    targetSleepH: take('targetSleepH', numberIn(raw.targetSleepH, 0, 24), defaults.targetSleepH),
    units: take('units', oneOf(raw.units, UNITS), defaults.units),
  };
}

function migrateLock(raw: unknown, defaults: LockSettings): LockSettings {
  const src = isObject(raw) ? raw : {};
  return {
    enabled: bool(src.enabled, defaults.enabled),
    graceSeconds: numberIn(src.graceSeconds, 0, 3600) ?? defaults.graceSeconds,
  };
}

function migrateNotifications(raw: unknown, defaults: NotificationSettings): NotificationSettings {
  const src = isObject(raw) ? raw : {};
  return {
    morningWeighIn: bool(src.morningWeighIn, defaults.morningWeighIn),
    eveningLog: bool(src.eveningLog, defaults.eveningLog),
    weeklySummary: bool(src.weeklySummary, defaults.weeklySummary),
    milestoneReached: bool(src.milestoneReached, defaults.milestoneReached),
  };
}

// ── log rows ─────────────────────────────────────────────────────────────────

/**
 * A row without a usable date cannot be placed on any screen, so it is
 * dropped rather than guessed at. Individual bad fields inside an otherwise
 * datable row are nulled instead — losing one number beats losing the day.
 */
function migrateEntries(raw: unknown, notes: string[]): WeighIn[] {
  if (!Array.isArray(raw)) return [];
  const byDate = new Map<DateKey, WeighIn>();
  let dropped = 0;

  for (const row of raw) {
    if (!isObject(row) || !isDateKey(row.logDate)) {
      dropped++;
      continue;
    }
    const entry: WeighIn = {
      logDate: row.logDate,
      weightKg: optionalNumber(row.weightKg, 30, 400),
      calories: optionalNumber(row.calories, 0, 10000),
      proteinG: optionalNumber(row.proteinG, 0, 500),
      waterL: optionalNumber(row.waterL, 0, 15),
      steps: optionalNumber(row.steps, 0, 100000),
      cardioMin: optionalNumber(row.cardioMin, 0, 600),
      strengthDone: bool(row.strengthDone, false),
      sleepH: optionalNumber(row.sleepH, 0, 24),
      notes: text(row.notes, 280),
      manualCalories: bool(row.manualCalories, false),
      manualProtein: bool(row.manualProtein, false),
      manualCardio: bool(row.manualCardio, false),
    };
    // One record per calendar day is a hard rule, so a duplicated date keeps
    // the last one written rather than producing two rows for one day.
    if (byDate.has(entry.logDate)) dropped++;
    byDate.set(entry.logDate, entry);
  }

  if (dropped) notes.push(`${dropped} weigh-in row(s) dropped as unreadable or duplicated`);
  return Array.from(byDate.values()).sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
}

function migrateMeals(raw: unknown, notes: string[]): MealEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: MealEntry[] = [];
  let dropped = 0;

  raw.forEach((row, i) => {
    const mealType = isObject(row) ? oneOf<MealType>(row.mealType, MEAL_TYPES) : null;
    if (!isObject(row) || !isDateKey(row.logDate) || !mealType) {
      dropped++;
      return;
    }
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `meal-restored-${i}`,
      logDate: row.logDate,
      mealType,
      description: text(row.description, 280) ?? '',
      calories: numberIn(row.calories, 0, 10000) ?? 0,
      proteinG: numberIn(row.proteinG, 0, 500) ?? 0,
      notes: text(row.notes, 280),
    });
  });

  if (dropped) notes.push(`${dropped} meal(s) dropped as unreadable`);
  return out;
}

function migrateWorkouts(raw: unknown, notes: string[]): WorkoutEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: WorkoutEntry[] = [];
  let dropped = 0;

  raw.forEach((row, i) => {
    const type = isObject(row) ? oneOf<WorkoutType>(row.type, WORKOUT_TYPES) : null;
    if (!isObject(row) || !isDateKey(row.logDate) || !type) {
      dropped++;
      return;
    }
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `wo-restored-${i}`,
      logDate: row.logDate,
      type,
      session: text(row.session, 280) ?? '',
      durationMin: numberIn(row.durationMin, 0, 600) ?? 0,
      intensity: oneOf<Intensity>(row.intensity, INTENSITIES) ?? 'Medium',
      caloriesBurned: numberIn(row.caloriesBurned, 0, 10000) ?? 0,
      notes: text(row.notes, 280),
    });
  });

  if (dropped) notes.push(`${dropped} workout(s) dropped as unreadable`);
  return out;
}

function migrateMeasurements(raw: unknown, notes: string[]): Measurement[] {
  if (!Array.isArray(raw)) return [];
  const out: Measurement[] = [];
  let dropped = 0;

  raw.forEach((row, i) => {
    if (!isObject(row) || !isDateKey(row.logDate)) {
      dropped++;
      return;
    }
    const cm = (v: unknown) => numberIn(v, 1, 300);
    const values = [row.waistCm, row.chestCm, row.armsCm, row.thighsCm, row.neckCm].map(cm);
    // A measurement is a set — a partial one has nothing to compare against.
    if (values.some((v) => v == null)) {
      dropped++;
      return;
    }
    out.push({
      id: typeof row.id === 'string' && row.id ? row.id : `meas-restored-${i}`,
      logDate: row.logDate,
      waistCm: values[0]!,
      chestCm: values[1]!,
      armsCm: values[2]!,
      thighsCm: values[3]!,
      neckCm: values[4]!,
      photo: typeof row.photo === 'string' ? row.photo : null,
    });
  });

  if (dropped) notes.push(`${dropped} measurement(s) dropped as incomplete`);
  return out.sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
}

function migrateRewards(raw: unknown): Record<string, string> {
  if (!isObject(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isFinite(Number(key)) && typeof value === 'string') out[key] = value.slice(0, 280);
  }
  return out;
}

function migrateAchieved(raw: unknown): Record<string, DateKey> {
  if (!isObject(raw)) return {};
  const out: Record<string, DateKey> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Number.isFinite(Number(key)) && isDateKey(value)) out[key] = value;
  }
  return out;
}

function migrateCelebrated(raw: unknown): number[] {
  if (!Array.isArray(raw)) return [];
  // De-duplicated: a repeated target would fire a celebration twice.
  return Array.from(new Set(raw.filter((v): v is number => typeof v === 'number' && Number.isFinite(v))));
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * Turns whatever was on disk into a valid `AppData`, filling in defaults for
 * anything missing and dropping anything unusable. Never throws: the worst
 * case is a clean empty dataset, which is still a working app.
 */
export function migrate(raw: unknown): MigrationResult {
  const defaults = emptyData();
  const notes: string[] = [];

  if (!isObject(raw)) {
    return {
      data: defaults,
      fromVersion: 0,
      changed: true,
      notes: ['stored data was not an object — started fresh'],
    };
  }

  const fromVersion =
    typeof raw.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion)
      ? raw.schemaVersion
      : 1; // v1 predates the field

  // A payload from a *newer* build is left as intact as validation allows
  // rather than rejected — downgrading should not cost the user their log.
  if (fromVersion > CURRENT_SCHEMA_VERSION) {
    notes.push(`stored data is from a newer version (${fromVersion}) — unknown fields ignored`);
  }

  const data: AppData = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    profile: migrateProfile(raw.profile, defaults.profile, notes),
    entries: migrateEntries(raw.entries, notes),
    meals: migrateMeals(raw.meals, notes),
    workouts: migrateWorkouts(raw.workouts, notes),
    measurements: migrateMeasurements(raw.measurements, notes),
    rewards: migrateRewards(raw.rewards),
    achieved: migrateAchieved(raw.achieved),
    celebrated: migrateCelebrated(raw.celebrated),
    notifications: migrateNotifications(raw.notifications, defaults.notifications),
    lock: migrateLock(raw.lock, defaults.lock),
    onboarded: bool(raw.onboarded, defaults.onboarded),
  };

  return {
    data,
    fromVersion,
    changed: fromVersion !== CURRENT_SCHEMA_VERSION || notes.length > 0,
    notes,
  };
}

/** True when there is anything a destructive action would throw away. */
export function hasAnyData(data: AppData): boolean {
  return (
    data.entries.length > 0 ||
    data.meals.length > 0 ||
    data.workouts.length > 0 ||
    data.measurements.length > 0
  );
}

/** "312 weigh-ins, 540 meals" — for confirmation dialogs and restore summaries. */
export function describeData(data: AppData): string {
  const parts: [number, string, string][] = [
    [data.entries.length, 'weigh-in', 'weigh-ins'],
    [data.meals.length, 'meal', 'meals'],
    [data.workouts.length, 'workout', 'workouts'],
    [data.measurements.length, 'measurement', 'measurements'],
  ];
  const present = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
  return present.length ? present.join(', ') : 'nothing logged yet';
}
