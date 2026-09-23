/**
 * Data model — section 3 of the App Spec sheet.
 * Dates are always ISO `YYYY-MM-DD` local-day keys, never Date objects, so
 * they serialise cleanly and compare lexicographically.
 */

export type DateKey = string;

export type Sex = 'Male' | 'Female';

export type ActivityLevel =
  | 'Sedentary'
  | 'Lightly Active'
  | 'Moderately Active'
  | 'Very Active'
  | 'Extremely Active';

export const ACTIVITY_LEVELS: ActivityLevel[] = [
  'Sedentary',
  'Lightly Active',
  'Moderately Active',
  'Very Active',
  'Extremely Active',
];

/** Spec §3: Sedentary 1.2 / Lightly 1.375 / Moderately 1.55 / Very 1.725 / Extremely 1.9 */
export const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  Sedentary: 1.2,
  'Lightly Active': 1.375,
  'Moderately Active': 1.55,
  'Very Active': 1.725,
  'Extremely Active': 1.9,
};

export type Units = 'metric' | 'imperial';

/**
 * What the plan is for.
 *
 * `lose` is the original behaviour and the default. `maintain` swaps the
 * countdown for a target band and turns off everything that only makes sense
 * while heading somewhere: milestones, projections, goal completion.
 *
 * `gain` is deliberately absent — see README. Inverting the milestone ladder,
 * the "total lost" framing and the whole insight vocabulary is a much larger
 * change than adding a band.
 */
export type GoalType = 'lose' | 'maintain';

export const GOAL_TYPES: GoalType[] = ['lose', 'maintain'];

/** How far either side of the goal still counts as holding steady. */
export const MAINTAIN_BAND_KG = 1.5;

/**
 * `targetCalories` when the app sets no target at all — under-18 profiles.
 *
 * Zero rather than null so the field stays a plain number everywhere, and a
 * named constant rather than a bare 0 so the meaning survives being read six
 * months from now.
 */
export const NO_CALORIE_TARGET = 0;

export interface Profile {
  startDate: DateKey;
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number;
  /**
   * The year they were born, not their age.
   *
   * An age stored as a number is wrong from the next birthday onward, and this
   * plan runs for 730 days — so a stored age silently drifts by one or two
   * years through exactly the window where BMR and the under-18 rule depend on
   * it. A year of birth is the fact; the age is derived. See `currentAge`.
   */
  birthYear: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  /** Absent on payloads written before goal types existed; migrates to 'lose'. */
  goalType: GoalType;
  /** 0 means no target — see `NO_CALORIE_TARGET`. */
  targetCalories: number;
  targetProteinG: number;
  targetWaterL: number;
  targetSteps: number;
  targetSleepH: number;
  units: Units;
}

/** One record per calendar day. `logDate` is the primary key. */
export interface WeighIn {
  logDate: DateKey;
  weightKg?: number | null;
  calories?: number | null;
  proteinG?: number | null;
  waterL?: number | null;
  steps?: number | null;
  cardioMin?: number | null;
  strengthDone?: boolean;
  sleepH?: number | null;
  notes?: string;

  /**
   * Meal and workout totals roll into this row automatically — unless the user
   * typed the number in by hand, in which case their value wins and these
   * flags stop the roll-up from overwriting it.
   */
  manualCalories?: boolean;
  manualProtein?: boolean;
  manualCardio?: boolean;
}

export type MealType = 'Breakfast' | 'Lunch' | 'Dinner' | 'Snack';
export const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Dinner', 'Snack'];

export interface MealEntry {
  id: string;
  logDate: DateKey;
  mealType: MealType;
  description: string;
  calories: number;
  proteinG: number;
  notes?: string;
}

/**
 * A meal kept for reuse — the same shape minus the day it happened on.
 *
 * Logging "porridge and berries" every morning by retyping it is the kind of
 * friction that stops people logging at all, so a meal can be saved once and
 * added with a tap after that.
 */
export interface SavedMeal {
  id: string;
  mealType: MealType;
  description: string;
  calories: number;
  proteinG: number;
}

export type WorkoutType = 'Cardio' | 'Strength' | 'Mobility' | 'Sport' | 'Walk';
export const WORKOUT_TYPES: WorkoutType[] = ['Cardio', 'Strength', 'Mobility', 'Sport', 'Walk'];

export type Intensity = 'Low' | 'Medium' | 'High';
export const INTENSITIES: Intensity[] = ['Low', 'Medium', 'High'];

export interface WorkoutEntry {
  id: string;
  logDate: DateKey;
  type: WorkoutType;
  session: string;
  durationMin: number;
  intensity: Intensity;
  caloriesBurned: number;
  notes?: string;
}

/** A workout kept for reuse. See `SavedMeal`. */
export interface SavedWorkout {
  id: string;
  type: WorkoutType;
  session: string;
  durationMin: number;
  intensity: Intensity;
  caloriesBurned: number;
}

export interface Measurement {
  id: string;
  logDate: DateKey;
  waistCm: number;
  chestCm: number;
  armsCm: number;
  thighsCm: number;
  neckCm: number;
  photo?: string | null;
}

/**
 * Crash reporting, off unless the user turns it on. See `lib/diagnostics.ts`
 * for what a report may contain — never health data.
 */
export interface DiagnosticsSettings {
  crashReports: boolean;
}

/** See `lib/lockRules.ts`. Stored here so it survives a reinstall-from-backup. */
export interface LockSettings {
  enabled: boolean;
  graceSeconds: number;
}

/** The on/off switches among the notification settings. */
export type ReminderToggle =
  | 'morningWeighIn'
  | 'eveningLog'
  | 'weeklySummary'
  | 'milestoneReached'
  | 'water'
  | 'waterOnlyBehind';

/** The two reminders whose time the user picks. */
export type ReminderTime =
  | 'morningMinutes'
  | 'eveningMinutes'
  | 'waterStartMinutes'
  | 'waterEndMinutes'
  | 'waterEveryMinutes';

/** How often water reminders can repeat, in minutes. */
export const WATER_INTERVALS = [30, 60, 90, 120, 180, 240] as const;

export interface NotificationSettings {
  morningWeighIn: boolean;
  eveningLog: boolean;
  weeklySummary: boolean;
  milestoneReached: boolean;
  /** Water reminders, repeating through a window of the day. */
  water: boolean;
  /** Minutes between water reminders — one of WATER_INTERVALS. */
  waterEveryMinutes: number;
  /** The window they repeat in, minutes after midnight. */
  waterStartMinutes: number;
  waterEndMinutes: number;
  /** Skip a reminder when the day is already on pace for the target. */
  waterOnlyBehind: boolean;
  /** Weekdays each timed reminder runs on, Monday = 0. All seven by default. */
  weighDays: number[];
  eveningDays: number[];
  waterDays: number[];
  /** Reminders the user wrote themselves — "Vitamins, 08:00, every day". */
  custom: CustomReminder[];
  /** Minutes after midnight — 420 is 07:00. */
  morningMinutes: number;
  eveningMinutes: number;
}

export interface CustomReminder {
  id: string;
  label: string;
  /** Minutes after midnight, Algerian time. */
  minutes: number;
  /** Weekdays it runs on, Monday = 0. */
  days: number[];
  enabled: boolean;
}

/** The sections of the Progress page, which the user can reorder and hide. */
export type ProgressSection =
  | 'stats'
  | 'journey'
  | 'trend'
  | 'projections'
  | 'period'
  | 'rhythm'
  | 'week'
  | 'bmi'
  | 'records'
  | 'insights'
  | 'milestone';

export const PROGRESS_SECTIONS: ProgressSection[] = [
  'stats',
  'journey',
  'trend',
  'projections',
  'period',
  'rhythm',
  'week',
  'bmi',
  'records',
  'insights',
  'milestone',
];

/** Days the Progress page summarises; 0 means the whole plan. */
export type ProgressPeriod = 7 | 30 | 90 | 0;
export const PROGRESS_PERIODS: ProgressPeriod[] = [7, 30, 90, 0];

export interface ProgressLayout {
  order: ProgressSection[];
  hidden: ProgressSection[];
  period: ProgressPeriod;
}

/**
 * The stored-shape version.
 *
 * 1 — the original shape, with no version field at all.
 * 2 — adds `schemaVersion`; from here on every payload is deep-merged
 *     against the current defaults on load rather than shallow-spread.
 * 3 — an under-18 profile carries `targetCalories: 0`, meaning no target.
 *     Older payloads have a suggested one, which nobody should act on.
 * 4 — `profile.ageYears` becomes `profile.birthYear`, so age stops drifting,
 *     and `adulthoodNoticed` records whether the "you are 18 now" note has
 *     been shown.
 * 5 — adds `savedMeals` and `savedWorkouts`: reusable templates, so a meal
 *     eaten every morning is typed once rather than every day.
 * 8 — reminders get weekdays and user-written ones; the Progress page gets
 *     a saved layout (section order, hidden sections, period).
 * 7 — water reminders repeat at a chosen interval inside a chosen window.
 * 6 — reminder times become settings, a water reminder joins them, and
 *     `inboxRead` records which in-app notifications have been opened.
 *
 * Lives here rather than in `schema.ts` so `seed.ts` can stamp it without the
 * two files importing each other.
 */
export const CURRENT_SCHEMA_VERSION = 8;

export interface AppData {
  /** The shape version this payload was written at. See `data/schema.ts`. */
  schemaVersion: number;
  profile: Profile;
  entries: WeighIn[];
  meals: MealEntry[];
  workouts: WorkoutEntry[];
  /** Reusable templates, not log rows — they carry no date. */
  savedMeals: SavedMeal[];
  savedWorkouts: SavedWorkout[];
  measurements: Measurement[];
  /** Milestone target (kg) → the user's free-text reward. The only milestone input. */
  rewards: Record<string, string>;
  /**
   * Milestone achieved dates, persisted separately from the log because the
   * spec requires them to be immutable once set — recomputing from a log the
   * user later edits could move or erase them.
   */
  achieved: Record<string, DateKey>;
  /** Milestone targets whose celebration has already been shown once. */
  celebrated: number[];
  notifications: NotificationSettings;
  lock: LockSettings;
  diagnostics: DiagnosticsSettings;
  /**
   * Whether the user has been told, once, that turning 18 makes calorie
   * targets available. Stored rather than derived so it cannot nag.
   */
  adulthoodNoticed: boolean;
  /** Ids of in-app notifications already opened. See `lib/inbox.ts`. */
  inboxRead: string[];
  progressLayout: ProgressLayout;
  onboarded: boolean;
}

/** The six daily habits, in the order the spec lists them. */
export type HabitKey = 'weight' | 'calories' | 'water' | 'steps' | 'workout' | 'sleep';

export const HABIT_KEYS: HabitKey[] = ['weight', 'calories', 'water', 'steps', 'workout', 'sleep'];
