/**
 * The calculation engine — section 4 of the App Spec sheet, one function per row.
 *
 * Everything here is pure: given the log and the profile it returns numbers.
 * Screens never re-derive these inline, so the Progress card, the Settings
 * read-only block and the insight copy can never disagree with each other.
 */

import {
  ACTIVITY_FACTORS,
  MAINTAIN_BAND_KG,
  DateKey,
  HabitKey,
  HABIT_KEYS,
  MealEntry,
  Measurement,
  Profile,
  WeighIn,
  WorkoutEntry,
} from '../data/types';
import { addDays, daysBetween, fromKey, toKey, todayKey } from './date';

/** 7 700 kcal ≈ 1 kg of body fat. */
export const KCAL_PER_KG = 7700;
/** The plan spans 730 days from the start date. */
export const PLAN_DAYS = 730;

export function mean(values: number[]): number | null {
  if (!values.length) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ── the log ──────────────────────────────────────────────────────────────────

/** Every entry, oldest first. */
export function sortedEntries(entries: WeighIn[]): WeighIn[] {
  return entries.slice().sort((a, b) => (a.logDate < b.logDate ? -1 : a.logDate > b.logDate ? 1 : 0));
}

/** Only the entries that actually carry a weight, oldest first. */
export function weighedEntries(entries: WeighIn[]): (WeighIn & { weightKg: number })[] {
  return sortedEntries(entries).filter(
    (e): e is WeighIn & { weightKg: number } => e.weightKg != null && !Number.isNaN(e.weightKg),
  );
}

export function entryFor(entries: WeighIn[], date: DateKey): WeighIn | null {
  return entries.find((e) => e.logDate === date) ?? null;
}

/**
 * A day counts as logged if any field is filled — not just a weight.
 * (Spec §3: "A day with no weight still counts as a logged day if any other
 * field is filled, but only a weight drives the trend.")
 */
export function isLogged(entry: WeighIn | null): boolean {
  if (!entry) return false;
  return (
    entry.weightKg != null ||
    entry.calories != null ||
    entry.proteinG != null ||
    entry.waterL != null ||
    entry.steps != null ||
    entry.cardioMin != null ||
    entry.sleepH != null ||
    !!entry.strengthDone ||
    !!entry.notes
  );
}

// ── current weight and daily change ──────────────────────────────────────────

/**
 * The most recent non-empty weight at or before `asOf` — not the highest date,
 * so gaps in logging cannot break it. Falls back to the starting weight.
 */
export function currentWeight(entries: WeighIn[], profile: Profile, asOf: DateKey = todayKey()): number {
  const w = weighedEntries(entries).filter((e) => e.logDate <= asOf);
  return w.length ? w[w.length - 1].weightKg : profile.startWeightKg;
}

/** The weight logged strictly before `date`, or the starting weight for the first entry. */
export function previousWeight(entries: WeighIn[], profile: Profile, date: DateKey): number {
  const before = weighedEntries(entries).filter((e) => e.logDate < date);
  return before.length ? before[before.length - 1].weightKg : profile.startWeightKg;
}

/** Signed change in kg. Negative is a loss. */
export function dailyChange(entries: WeighIn[], profile: Profile, date: DateKey): number | null {
  const entry = entryFor(entries, date);
  if (!entry || entry.weightKg == null) return null;
  return entry.weightKg - previousWeight(entries, profile, date);
}

/**
 * Mean of the last `n` calendar days including `asOf`.
 * This — not the raw weigh-in — is the line the user should judge progress by.
 */
export function averageOverLastDays(entries: WeighIn[], n: number, asOf: DateKey = todayKey()): number | null {
  const first = addDays(asOf, -(n - 1));
  const vals = weighedEntries(entries)
    .filter((e) => e.logDate >= first && e.logDate <= asOf)
    .map((e) => e.weightKg);
  return mean(vals);
}

// ── body metrics ─────────────────────────────────────────────────────────────

export function bmi(weightKg: number, heightCm: number): number {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

/** WHO bands, exactly as the spec lists them. */
export function bmiBand(value: number): string {
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Healthy range';
  if (value < 30) return 'Overweight';
  if (value < 35) return 'Obesity class I';
  if (value < 40) return 'Obesity class II';
  return 'Obesity class III';
}

/** BMI 18.5–24.9 converted back to kg for this height. */
export function healthyWeightRange(heightCm: number): { lowKg: number; highKg: number } {
  return { lowKg: weightForBmi(18.5, heightCm), highKg: weightForBmi(24.9, heightCm) };
}

/** The inverse of `bmi` — what a given BMI weighs at this height. */
export function weightForBmi(bmiValue: number, heightCm: number): number {
  const m = heightCm / 100;
  return bmiValue * m * m;
}

/**
 * Mifflin-St Jeor. Takes the *current* weight, not the starting weight —
 * resting burn drops as the user loses, and freezing it would overstate TDEE.
 */
export function bmr(weightKg: number, profile: Profile): number {
  return (
    10 * weightKg + 6.25 * profile.heightCm - 5 * profile.ageYears + (profile.sex === 'Male' ? 5 : -161)
  );
}

export function tdee(weightKg: number, profile: Profile): number {
  return bmr(weightKg, profile) * ACTIVITY_FACTORS[profile.activityLevel];
}

/**
 * The age at which the adult formulas in this file start to apply.
 *
 * Lives here rather than in `health.ts` because the calculations themselves
 * have to ask the question — and `health.ts` already depends on this file,
 * so asking the other way round would be a cycle.
 */
export const ADULT_AGE = 18;

export function isAdult(profile: Profile): boolean {
  return profile.ageYears >= ADULT_AGE;
}

/**
 * TDEE minus the calorie target — or null for anyone under 18.
 *
 * Null rather than zero, and null rather than a number nobody displays: a
 * deficit is a prescription, and prescribing one for a growing body is the
 * thing this app must not do. Returning a number and hoping every screen
 * remembers to hide it is how it leaks back in.
 */
export function plannedDailyDeficit(weightKg: number, profile: Profile): number | null {
  if (!isAdult(profile)) return null;
  return tdee(weightKg, profile) - profile.targetCalories;
}

/** kg per week implied by the planned deficit. Null when there is no deficit. */
export function expectedLossPerWeek(weightKg: number, profile: Profile): number | null {
  const deficit = plannedDailyDeficit(weightKg, profile);
  return deficit == null ? null : (deficit * 7) / KCAL_PER_KG;
}

/** kg per week needed to reach the goal inside the 730-day plan. */
export function requiredPacePerWeek(profile: Profile): number {
  return ((profile.startWeightKg - profile.goalWeightKg) / PLAN_DAYS) * 7;
}

/** The deficit the suggestion aims for. Named so the copy can quote it. */
export const SUGGESTED_DEFICIT_KCAL = 750;

/**
 * The lowest the *suggestion* will go.
 *
 * Distinct from `calorieFloor` in health.ts, which is the lowest the app will
 * *accept* and is lower for women. Suggesting and accepting are different
 * promises, and the onboarding copy used to state one while the app enforced
 * the other.
 */
export const SUGGESTION_FLOOR_KCAL = 1500;

/** TDEE − 750, rounded to the nearest 50, never below the suggestion floor. */
export function suggestedCalorieTarget(tdeeValue: number): number {
  return Math.max(
    SUGGESTION_FLOOR_KCAL,
    Math.round((tdeeValue - SUGGESTED_DEFICIT_KCAL) / 50) * 50,
  );
}

/** Default protein: 1.2 g per kg of goal weight. */
export function suggestedProteinTarget(goalWeightKg: number): number {
  return Math.round(goalWeightKg * 1.2);
}

// ── trend and projection ─────────────────────────────────────────────────────

/**
 * Signed kg per day: mean of the last 7 days minus the mean of the 7 before.
 * Negative means losing. Null until there are 14 days of data — the spec is
 * explicit that a misleading number is worse than "not enough data".
 */
export function trendPerDay(entries: WeighIn[], asOf: DateKey = todayKey()): number | null {
  const weighed = weighedEntries(entries).filter((e) => e.logDate <= asOf);
  if (weighed.length < 2) return null;
  if (daysBetween(weighed[0].logDate, asOf) < 13) return null;

  const recent = averageOverLastDays(entries, 7, asOf);
  const prior = averageOverLastDays(entries, 7, addDays(asOf, -7));
  if (recent == null || prior == null) return null;

  return (recent - prior) / 7;
}

/** Positive when losing — the recent rate, from the 14-day trend. */
export function weeklyLossKg(entries: WeighIn[], asOf?: DateKey): number | null {
  const t = trendPerDay(entries, asOf);
  return t == null ? null : -t * 7;
}

/**
 * Average loss per day across the whole journey — total lost over the days
 * elapsed since the first weigh-in. Positive when losing, null before there is
 * a span to divide by.
 *
 * This, not the 14-day trend, is the figure the Progress card and the loss-rate
 * insight are labelled against ("Averaging 0.6 kg per week over the last 8
 * weeks"). The trend still decides *whether* a projection is shown at all.
 */
export function averageDailyLossKg(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): number | null {
  const weighed = weighedEntries(entries).filter((e) => e.logDate <= asOf);
  if (weighed.length < 2) return null;
  const days = daysBetween(weighed[0].logDate, weighed[weighed.length - 1].logDate);
  if (days <= 0) return null;
  const lost = profile.startWeightKg - weighed[weighed.length - 1].weightKg;
  return lost / days;
}

export function averageWeeklyLossKg(
  entries: WeighIn[],
  profile: Profile,
  asOf?: DateKey,
): number | null {
  const daily = averageDailyLossKg(entries, profile, asOf);
  return daily == null ? null : daily * 7;
}

/**
 * Current 7-day average carried forward at the current trend, floored at the
 * goal weight. Null while the trend is unknown.
 */
export function projectedWeight(
  entries: WeighIn[],
  profile: Profile,
  daysAhead: number,
  asOf: DateKey = todayKey(),
): number | null {
  const t = trendPerDay(entries, asOf);
  const base = averageOverLastDays(entries, 7, asOf);
  if (t == null || base == null) return null;
  return Math.max(profile.goalWeightKg, base + t * daysAhead);
}

/**
 * Days left to the goal, or null when there is nothing honest to say.
 *
 * Two separate jobs, per the spec: the 14-day *trend* decides whether a
 * projection is shown at all — flat or upward means a dash, never an
 * extrapolation — and the journey *average* rate then sizes it, which is the
 * steadier of the two and the one the design's figures are drawn from.
 */
export function daysToGoal(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): number | null {
  // A projected date to arrive at a goal weight is a prescription too.
  if (!isAdult(profile)) return null;

  const trend = trendPerDay(entries, asOf);
  if (trend == null || trend >= 0) return null;

  const rate = averageDailyLossKg(entries, profile, asOf);
  if (rate == null || rate <= 0) return null;

  const remaining = currentWeight(entries, profile, asOf) - profile.goalWeightKg;
  if (remaining <= 0) return null;

  const days = remaining / rate;
  return Number.isFinite(days) ? days : null;
}

export function estimatedGoalDate(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): Date | null {
  const days = daysToGoal(entries, profile, asOf);
  if (days == null) return null;
  const d = fromKey(asOf);
  d.setDate(d.getDate() + Math.round(days));
  return d;
}

export function weeksToGoal(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): number | null {
  const days = daysToGoal(entries, profile, asOf);
  return days == null ? null : days / 7;
}

/** (start − current) / (start − goal), clamped to 0–100. */
export function goalCompletionPct(entries: WeighIn[], profile: Profile, asOf?: DateKey): number {
  const span = profile.startWeightKg - profile.goalWeightKg;
  if (span <= 0) return 0;
  const current = currentWeight(entries, profile, asOf);
  return clamp(((profile.startWeightKg - current) / span) * 100, 0, 100);
}

export function totalLostKg(entries: WeighIn[], profile: Profile, asOf?: DateKey): number {
  return profile.startWeightKg - currentWeight(entries, profile, asOf);
}

export function remainingKg(entries: WeighIn[], profile: Profile, asOf?: DateKey): number {
  return currentWeight(entries, profile, asOf) - profile.goalWeightKg;
}

// ── maintaining ──────────────────────────────────────────────────────────────

export type MaintainState = 'in-range' | 'above' | 'below';

export interface MaintainStatus {
  state: MaintainState;
  /** Signed distance from the goal. Negative is below it. */
  deltaKg: number;
  lowKg: number;
  highKg: number;
  /** Share of the last 30 logged days spent inside the band, 0–100. */
  daysInRangePct: number | null;
}

/**
 * Where the user sits against a maintenance band rather than a countdown.
 *
 * Maintaining has no "percent complete" — there is nowhere to arrive. What
 * matters is whether today is inside the band and how much of the last month
 * has been, so that is what this returns.
 */
export function maintainStatus(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): MaintainStatus {
  const lowKg = profile.goalWeightKg - MAINTAIN_BAND_KG;
  const highKg = profile.goalWeightKg + MAINTAIN_BAND_KG;
  const current = currentWeight(entries, profile, asOf);
  const deltaKg = current - profile.goalWeightKg;

  const recent = weighedEntries(entries).filter(
    (e) => e.logDate <= asOf && daysBetween(e.logDate, asOf) < 30,
  );
  const inRange = recent.filter((e) => e.weightKg >= lowKg && e.weightKg <= highKg);

  return {
    state: current > highKg ? 'above' : current < lowKg ? 'below' : 'in-range',
    deltaKg,
    lowKg,
    highKg,
    daysInRangePct: recent.length ? Math.round((inRange.length / recent.length) * 100) : null,
  };
}

/** Milestones and projections only make sense while heading somewhere. */
export function isCountdown(profile: Profile): boolean {
  return profile.goalType === 'lose';
}

// ── habits ───────────────────────────────────────────────────────────────────

/**
 * Six booleans per day. Derived from the log and never editable by hand —
 * manual ticks would desynchronise the score from the data.
 *
 * Returns null for a day outside the plan (before the start date or in the
 * future): the spec wants no tick at all there, not a zero.
 */
export function habitTicks(
  entry: WeighIn | null,
  profile: Profile,
  date: DateKey,
  asOf: DateKey = todayKey(),
): Record<HabitKey, boolean> | null {
  if (date > asOf || date < profile.startDate) return null;
  return {
    weight: entry?.weightKg != null,
    calories: (entry?.calories ?? 0) > 0,
    water: (entry?.waterL ?? 0) >= profile.targetWaterL,
    steps: (entry?.steps ?? 0) >= profile.targetSteps,
    workout: (entry?.cardioMin ?? 0) > 0 || !!entry?.strengthDone,
    sleep: (entry?.sleepH ?? 0) >= profile.targetSleepH,
  };
}

export function habitsMetCount(ticks: Record<HabitKey, boolean> | null): number {
  if (!ticks) return 0;
  return HABIT_KEYS.filter((k) => ticks[k]).length;
}

/** Mean of the six ticks for a day, 0–1. Null outside the plan. */
export function dailyHabitScore(
  entries: WeighIn[],
  profile: Profile,
  date: DateKey,
  asOf?: DateKey,
): number | null {
  const ticks = habitTicks(entryFor(entries, date), profile, date, asOf);
  if (!ticks) return null;
  return habitsMetCount(ticks) / HABIT_KEYS.length;
}

/** Rolling habit consistency over the last `n` days, as a 0–100 percentage. */
export function consistencyPct(
  entries: WeighIn[],
  profile: Profile,
  n: number,
  asOf: DateKey = todayKey(),
): number {
  const scores: number[] = [];
  for (let i = 0; i < n; i++) {
    const date = addDays(asOf, -i);
    if (date < profile.startDate) break;
    const s = dailyHabitScore(entries, profile, date, asOf);
    if (s != null) scores.push(s);
  }
  return Math.round((mean(scores) ?? 0) * 100);
}

/** How often a single habit was met over the last `n` days. */
export function habitRatePct(
  entries: WeighIn[],
  profile: Profile,
  habit: HabitKey,
  n: number,
  asOf: DateKey = todayKey(),
): number | null {
  let met = 0;
  let total = 0;
  for (let i = 0; i < n; i++) {
    const date = addDays(asOf, -i);
    if (date < profile.startDate) break;
    const ticks = habitTicks(entryFor(entries, date), profile, date, asOf);
    if (!ticks) continue;
    total++;
    if (ticks[habit]) met++;
  }
  return total ? Math.round((met / total) * 100) : null;
}

/** Consecutive days with a weight logged. Resets to 0 on a miss. */
export function weighInStreaks(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): { current: number; longest: number } {
  const weighed = new Set(weighedEntries(entries).map((e) => e.logDate));
  const span = Math.max(0, daysBetween(profile.startDate, asOf));

  let current = 0;
  let longest = 0;
  let run = 0;

  // Walk forwards from the start date so "longest" is a true maximum.
  for (let i = 0; i <= span; i++) {
    const date = addDays(profile.startDate, i);
    if (weighed.has(date)) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  // The current streak is the run ending today — or yesterday, if today is
  // simply not logged yet rather than missed.
  if (weighed.has(asOf)) {
    current = run;
  } else {
    let back = 0;
    for (let i = 1; i <= span; i++) {
      if (weighed.has(addDays(asOf, -i))) back++;
      else break;
    }
    current = back;
  }
  return { current, longest };
}

// ── roll-ups ─────────────────────────────────────────────────────────────────

export interface WeekRollup {
  index: number;
  start: DateKey;
  end: DateKey;
  averageWeightKg: number | null;
  /** Positive means lost, versus the previous week's average. */
  lostKg: number | null;
  pctChange: number | null;
  avgCalories: number | null;
  avgProteinG: number | null;
  avgSteps: number | null;
  avgSleepH: number | null;
  avgWaterL: number | null;
  cardioMin: number;
  strengthDays: number;
  daysLogged: number;
}

/**
 * Weeks are fixed 7-day buckets counted from the start date — week 1 is
 * start_date … start_date+6 — not calendar weeks.
 */
export function weeklyRollups(
  entries: WeighIn[],
  profile: Profile,
  asOf: DateKey = todayKey(),
): WeekRollup[] {
  const span = daysBetween(profile.startDate, asOf);
  if (span < 0) return [];
  const bucketCount = Math.floor(span / 7) + 1;
  const out: WeekRollup[] = [];
  let prevAvg: number | null = null;

  for (let i = 0; i < bucketCount; i++) {
    const start = addDays(profile.startDate, i * 7);
    const end = addDays(start, 6);
    const inWeek = entries.filter((e) => e.logDate >= start && e.logDate <= end && e.logDate <= asOf);
    if (!inWeek.length) continue;

    const weights = inWeek.filter((e) => e.weightKg != null).map((e) => e.weightKg as number);
    const avg = mean(weights);

    out.push({
      index: i + 1,
      start,
      end,
      averageWeightKg: avg,
      lostKg: avg == null ? null : prevAvg == null ? profile.startWeightKg - avg : prevAvg - avg,
      pctChange: avg == null || prevAvg == null ? null : ((avg - prevAvg) / prevAvg) * 100,
      avgCalories: mean(inWeek.filter((e) => e.calories != null).map((e) => e.calories as number)),
      avgProteinG: mean(inWeek.filter((e) => e.proteinG != null).map((e) => e.proteinG as number)),
      avgSteps: mean(inWeek.filter((e) => e.steps != null).map((e) => e.steps as number)),
      avgSleepH: mean(inWeek.filter((e) => e.sleepH != null).map((e) => e.sleepH as number)),
      avgWaterL: mean(inWeek.filter((e) => e.waterL != null).map((e) => e.waterL as number)),
      cardioMin: inWeek.reduce((a, e) => a + (e.cardioMin ?? 0), 0),
      strengthDays: inWeek.filter((e) => e.strengthDone).length,
      daysLogged: inWeek.filter((e) => isLogged(e)).length,
    });

    if (avg != null) prevAvg = avg;
  }
  return out;
}

export interface MonthRollup {
  month: string; // YYYY-MM
  label: string;
  startWeightKg: number | null;
  endWeightKg: number | null;
  lostKg: number | null;
  pctLost: number | null;
  avgDailyLossKg: number | null;
  avgWeeklyLossKg: number | null;
  daysLogged: number;
}

/** Calendar months. */
export function monthlyRollups(entries: WeighIn[], asOf: DateKey = todayKey()): MonthRollup[] {
  const byMonth = new Map<string, WeighIn[]>();
  for (const e of sortedEntries(entries)) {
    if (e.logDate > asOf) continue;
    const m = e.logDate.slice(0, 7);
    const list = byMonth.get(m) ?? [];
    list.push(e);
    byMonth.set(m, list);
  }

  return Array.from(byMonth.keys())
    .sort()
    .map((m) => {
      const list = byMonth.get(m)!;
      const weighed = list.filter((e) => e.weightKg != null);
      const startW = weighed.length ? (weighed[0].weightKg as number) : null;
      const endW = weighed.length ? (weighed[weighed.length - 1].weightKg as number) : null;
      const lost = startW != null && endW != null ? startW - endW : null;
      const daysLogged = list.filter((e) => isLogged(e)).length;
      const daily = lost != null && daysLogged > 0 ? lost / daysLogged : null;
      return {
        month: m,
        label: fromKey(`${m}-01`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        startWeightKg: startW,
        endWeightKg: endW,
        lostKg: lost,
        pctLost: startW && lost != null ? (lost / startW) * 100 : null,
        avgDailyLossKg: daily,
        avgWeeklyLossKg: daily == null ? null : daily * 7,
        daysLogged,
      };
    });
}

// ── milestones ───────────────────────────────────────────────────────────────

export type MilestoneStatus = 'Achieved' | 'Pending' | 'Overdue';

export interface Milestone {
  targetKg: number;
  kgFromStart: number;
  pctOfGoal: number;
  /** Null for a profile with no planned deficit — nothing to pace against. */
  targetDate: Date | null;
  achievedDate: DateKey | null;
  daysTaken: number | null;
  status: MilestoneStatus;
  reward: string;
}

/**
 * Every 5 kg from floor(start/5)*5 down to the goal weight.
 *
 * `achieved` is passed in rather than recomputed so an achieved date, once
 * set, never changes — even if the user regains weight or edits an old entry.
 */
export function milestones(
  entries: WeighIn[],
  profile: Profile,
  rewards: Record<string, string>,
  achieved: Record<string, DateKey>,
  asOf: DateKey = todayKey(),
): Milestone[] {
  const top = Math.floor(profile.startWeightKg / 5) * 5;
  const span = profile.startWeightKg - profile.goalWeightKg;
  const deficit = plannedDailyDeficit(currentWeight(entries, profile, asOf), profile);
  const planRate = deficit == null ? null : Math.max(0.01, deficit / KCAL_PER_KG);
  const out: Milestone[] = [];

  for (let target = top; target >= profile.goalWeightKg - 1e-9; target -= 5) {
    const kgFromStart = profile.startWeightKg - target;
    let targetDate: Date | null = null;
    if (planRate != null) {
      targetDate = fromKey(profile.startDate);
      targetDate.setDate(targetDate.getDate() + Math.round(kgFromStart / planRate));
    }

    const achievedDate = achieved[String(target)] ?? null;
    // With no target date there is nothing to be late against, so a
    // milestone can be reached or waiting — never "Overdue".
    const status: MilestoneStatus = achievedDate
      ? 'Achieved'
      : targetDate && toKey(targetDate) < asOf
        ? 'Overdue'
        : 'Pending';

    out.push({
      targetKg: target,
      kgFromStart,
      pctOfGoal: span > 0 ? (kgFromStart / span) * 100 : 0,
      targetDate,
      achievedDate,
      daysTaken: achievedDate ? daysBetween(profile.startDate, achievedDate) : null,
      status,
      reward: rewards[String(target)] ?? '',
    });
  }
  return out;
}

/**
 * Milestones crossed by `weight` that have no achieved date yet.
 * Used on save to stamp immutable achieved dates and fire the celebration.
 */
export function newlyAchievedMilestones(
  weightKg: number,
  profile: Profile,
  achieved: Record<string, DateKey>,
): number[] {
  const top = Math.floor(profile.startWeightKg / 5) * 5;
  const out: number[] = [];
  for (let target = top; target >= profile.goalWeightKg - 1e-9; target -= 5) {
    if (weightKg <= target && !achieved[String(target)]) out.push(target);
  }
  return out;
}

// ── log totals ───────────────────────────────────────────────────────────────

export function mealTotals(meals: MealEntry[], date: DateKey) {
  const list = meals.filter((m) => m.logDate === date);
  return {
    count: list.length,
    calories: list.reduce((a, m) => a + m.calories, 0),
    proteinG: list.reduce((a, m) => a + m.proteinG, 0),
  };
}

export function workoutTotals(workouts: WorkoutEntry[], date: DateKey) {
  const list = workouts.filter((w) => w.logDate === date);
  return {
    count: list.length,
    durationMin: list.reduce((a, w) => a + w.durationMin, 0),
    caloriesBurned: list.reduce((a, w) => a + w.caloriesBurned, 0),
    /** Cardio and Walk minutes feed cardio_min. */
    cardioMin: list
      .filter((w) => w.type === 'Cardio' || w.type === 'Walk')
      .reduce((a, w) => a + w.durationMin, 0),
    /** A Strength entry sets strength_done for that date. */
    strengthDone: list.some((w) => w.type === 'Strength'),
  };
}

// ── measurements ─────────────────────────────────────────────────────────────

export const MEASUREMENT_FIELDS = [
  { key: 'waistCm', label: 'Waist' },
  { key: 'chestCm', label: 'Chest' },
  { key: 'armsCm', label: 'Arms' },
  { key: 'thighsCm', label: 'Thighs' },
  { key: 'neckCm', label: 'Neck' },
] as const;

export type MeasurementField = (typeof MEASUREMENT_FIELDS)[number]['key'];

/** Each metric alongside its change versus the earliest recorded measurement. */
export function measurementDeltas(measurements: Measurement[]) {
  const sorted = measurements.slice().sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
  if (!sorted.length) return [];
  const first = sorted[0];
  const latest = sorted[sorted.length - 1];
  return MEASUREMENT_FIELDS.map(({ key, label }) => ({
    key,
    label,
    latestCm: latest[key],
    firstCm: first[key],
    deltaCm: latest[key] - first[key],
  }));
}

export interface PhotoComparison {
  before: Measurement;
  after: Measurement;
  days: number;
  /** Null when either day has no weigh-in — a photo pair is still worth showing. */
  weightDeltaKg: number | null;
  waistDeltaCm: number;
}

/**
 * The earliest and latest measurements that actually carry a photo.
 *
 * Null when fewer than two do: a before-and-after needs both halves, and one
 * photo on its own is not a comparison.
 */
export function photoComparison(
  measurements: Measurement[],
  entries: WeighIn[],
): PhotoComparison | null {
  const withPhotos = measurements
    .filter((m) => !!m.photo)
    .sort((a, b) => (a.logDate < b.logDate ? -1 : 1));
  if (withPhotos.length < 2) return null;

  const before = withPhotos[0];
  const after = withPhotos[withPhotos.length - 1];
  const beforeKg = entryFor(entries, before.logDate)?.weightKg ?? null;
  const afterKg = entryFor(entries, after.logDate)?.weightKg ?? null;

  return {
    before,
    after,
    days: daysBetween(before.logDate, after.logDate),
    weightDeltaKg: beforeKg != null && afterKg != null ? afterKg - beforeKg : null,
    waistDeltaCm: after.waistCm - before.waistCm,
  };
}

// ── formatting ───────────────────────────────────────────────────────────────

/** One decimal, em-dash for nothing. Used for every weight on screen. */
export function f1(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : n.toFixed(1);
}

export function int(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? '—' : Math.round(n).toLocaleString('en-GB');
}

/**
 * A signed delta with its arrow. Colour is never the only signal, so the arrow
 * is part of the string itself rather than a separate decorative element.
 */
export function signed(deltaKg: number, unit = 'kg'): string {
  if (Math.abs(deltaKg) < 0.05) return `No change ${unit === 'kg' ? '' : unit}`.trim();
  return `${deltaKg < 0 ? '↓' : '↑'} ${Math.abs(deltaKg).toFixed(1)} ${unit}`;
}
