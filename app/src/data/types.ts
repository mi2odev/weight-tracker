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

export interface Profile {
  startDate: DateKey;
  startWeightKg: number;
  goalWeightKg: number;
  heightCm: number;
  ageYears: number;
  sex: Sex;
  activityLevel: ActivityLevel;
  /** Absent on payloads written before goal types existed; migrates to 'lose'. */
  goalType: GoalType;
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

/** See `lib/lockRules.ts`. Stored here so it survives a reinstall-from-backup. */
export interface LockSettings {
  enabled: boolean;
  graceSeconds: number;
}

export interface NotificationSettings {
  morningWeighIn: boolean;
  eveningLog: boolean;
  weeklySummary: boolean;
  milestoneReached: boolean;
}

/**
 * The stored-shape version.
 *
 * 1 — the original shape, with no version field at all.
 * 2 — adds `schemaVersion`; from here on every payload is deep-merged
 *     against the current defaults on load rather than shallow-spread.
 *
 * Lives here rather than in `schema.ts` so `seed.ts` can stamp it without the
 * two files importing each other.
 */
export const CURRENT_SCHEMA_VERSION = 2;

export interface AppData {
  /** The shape version this payload was written at. See `data/schema.ts`. */
  schemaVersion: number;
  profile: Profile;
  entries: WeighIn[];
  meals: MealEntry[];
  workouts: WorkoutEntry[];
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
  onboarded: boolean;
}

/** The six daily habits, in the order the spec lists them. */
export type HabitKey = 'weight' | 'calories' | 'water' | 'steps' | 'workout' | 'sleep';

export const HABIT_KEYS: HabitKey[] = ['weight', 'calories', 'water', 'steps', 'workout', 'sleep'];
