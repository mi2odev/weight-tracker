/**
 * The extra figures behind the Progress page: where the plan expects you to
 * be, how each weekday tends to move, the last week against targets, and
 * personal records. Pure, so every number is tested on Node, and every one
 * of them reads the same log the rest of the app does.
 */

import { DateKey, Profile, WeighIn } from '../data/types';
import { isLogged, PLAN_DAYS, weeklyRollups, weighedEntries, weighInStreaks } from './calc';
import { addDays, daysBetween, weekdayIndex } from './date';

// ── against the plan ─────────────────────────────────────────────────────────

export interface PlanPosition {
  /** Where a straight line from start to goal over the 730-day plan is today. */
  plannedKg: number;
  /** Positive: ahead of that line (further toward the goal). */
  aheadKg: number;
}

export function planPosition(profile: Profile, currentKg: number, asOf: DateKey): PlanPosition {
  const days = Math.max(0, daysBetween(profile.startDate, asOf));
  const frac = Math.min(1, days / PLAN_DAYS);
  const plannedKg = profile.startWeightKg + (profile.goalWeightKg - profile.startWeightKg) * frac;
  const towardGoal = profile.goalWeightKg < profile.startWeightKg ? 1 : -1;
  return { plannedKg, aheadKg: (plannedKg - currentKg) * towardGoal };
}

// ── by weekday ───────────────────────────────────────────────────────────────

export interface WeekdayChange {
  /** Mean change in kg from the previous day's weigh-in; negative is a loss. */
  avgKg: number | null;
  /** How many day-over-day pairs it is drawn from. */
  samples: number;
}

/** Fewer pairs than this and the average says more about one day than a pattern. */
export const MIN_WEEKDAY_SAMPLES = 2;

/**
 * Average overnight change for each weekday, Monday first, over the last
 * `weeks` weeks. Only back-to-back days count — a change across a gap would
 * be several days' worth credited to one.
 */
export function weekdayPattern(entries: WeighIn[], asOf: DateKey, weeks = 8): WeekdayChange[] {
  const from = addDays(asOf, -weeks * 7);
  const weighed = weighedEntries(entries).filter((e) => e.logDate <= asOf && e.logDate > from);
  const sums = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (let i = 1; i < weighed.length; i++) {
    const prev = weighed[i - 1];
    const cur = weighed[i];
    if (daysBetween(prev.logDate, cur.logDate) !== 1) continue;
    const slot = sums[weekdayIndex(cur.logDate)];
    slot.total += cur.weightKg - prev.weightKg;
    slot.n += 1;
  }
  return sums.map(({ total, n }) => ({
    avgKg: n >= MIN_WEEKDAY_SAMPLES ? total / n : null,
    samples: n,
  }));
}

// ── the last seven days against targets ──────────────────────────────────────

export type TrackedField = 'calories' | 'proteinG' | 'waterL' | 'steps' | 'sleepH';

export interface FieldAverage {
  field: TrackedField;
  /** Mean of the days that logged it; null when none did. */
  avg: number | null;
  /** Days out of 7 that logged it. */
  days: number;
}

/** Days a period covers: `days`, or from the start date when `days` is 0 (all). */
export function periodStart(profile: Profile, asOf: DateKey, days: number): DateKey {
  const from = days > 0 ? addDays(asOf, -(days - 1)) : profile.startDate;
  return from < profile.startDate ? profile.startDate : from;
}

/** Daily averages of the tracked fields over the last `days` days (7 by default). */
export function lastSevenDays(entries: WeighIn[], asOf: DateKey, from: DateKey = addDays(asOf, -6)): FieldAverage[] {
  const week = entries.filter((e) => e.logDate >= from && e.logDate <= asOf);
  const fields: TrackedField[] = ['calories', 'proteinG', 'waterL', 'steps', 'sleepH'];
  return fields.map((field) => {
    const values = week.map((e) => e[field]).filter((v): v is number => v != null && Number.isFinite(v));
    return {
      field,
      avg: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      days: values.length,
    };
  });
}

// ── a chosen period ─────────────────────────────────────────────────────────

export interface PeriodSummary {
  from: DateKey;
  /** Calendar days in the period so far. */
  days: number;
  /** Last weigh-in minus first, inside the period; negative is a loss. */
  changeKg: number | null;
  /** That change per week, once the weigh-ins span a week or more. */
  perWeekKg: number | null;
  lowest: { kg: number; date: DateKey } | null;
  weighedDays: number;
  loggedDays: number;
}

export function periodSummary(entries: WeighIn[], profile: Profile, asOf: DateKey, days: number): PeriodSummary {
  const from = periodStart(profile, asOf, days);
  const inside = entries.filter((e) => e.logDate >= from && e.logDate <= asOf);
  const weighed = weighedEntries(inside);
  const first = weighed[0];
  const last = weighed[weighed.length - 1];
  const span = first && last ? daysBetween(first.logDate, last.logDate) : 0;
  const changeKg = first && last && span > 0 ? last.weightKg - first.weightKg : null;
  return {
    from,
    days: Math.max(0, daysBetween(from, asOf) + 1),
    changeKg,
    perWeekKg: changeKg != null && span >= 7 ? (changeKg / span) * 7 : null,
    lowest: weighed.reduce<{ kg: number; date: DateKey } | null>(
      (best, e) => (best == null || e.weightKg < best.kg ? { kg: e.weightKg, date: e.logDate } : best),
      null,
    ),
    weighedDays: weighed.length,
    loggedDays: inside.filter((e) => isLogged(e)).length,
  };
}

// ── records ──────────────────────────────────────────────────────────────────

export interface Records {
  lowest: { kg: number; date: DateKey } | null;
  bestWeek: { index: number; lostKg: number } | null;
  longestStreak: number;
  /** Days with a weigh-in since the start, and the days that have passed. */
  weighedDays: number;
  planDays: number;
}

export function personalRecords(entries: WeighIn[], profile: Profile, asOf: DateKey): Records {
  const weighed = weighedEntries(entries).filter((e) => e.logDate >= profile.startDate && e.logDate <= asOf);
  const lowest = weighed.reduce<{ kg: number; date: DateKey } | null>(
    (best, e) => (best == null || e.weightKg < best.kg ? { kg: e.weightKg, date: e.logDate } : best),
    null,
  );
  const bestWeek = weeklyRollups(entries, profile, asOf).reduce<{ index: number; lostKg: number } | null>(
    (best, w) => (w.lostKg != null && w.lostKg > 0 && (best == null || w.lostKg > best.lostKg) ? { index: w.index, lostKg: w.lostKg } : best),
    null,
  );
  return {
    lowest,
    bestWeek,
    longestStreak: weighInStreaks(entries, profile, asOf).longest,
    weighedDays: weighed.length,
    planDays: Math.max(0, daysBetween(profile.startDate, asOf) + 1),
  };
}

// ── the BMI scale ────────────────────────────────────────────────────────────

const BMI_MIN = 15;

/**
 * Where the scale ends: 45, or further for someone who started above it —
 * otherwise both "start" and "now" sit pinned at the end and the distance
 * covered, the whole point of the chart, disappears.
 */
export function bmiScaleMax(...values: number[]): number {
  return Math.max(45, Math.ceil((Math.max(...values) + 2) / 5) * 5);
}

/** The WHO bands the scale draws; the last one runs to the scale's end. */
export function bmiBands(max: number): { from: number; to: number; label: string }[] {
  return [
    { from: BMI_MIN, to: 18.5, label: 'Under' },
    { from: 18.5, to: 25, label: 'Healthy' },
    { from: 25, to: 30, label: 'Over' },
    { from: 30, to: 35, label: 'Class I' },
    { from: 35, to: 40, label: 'Class II' },
    { from: 40, to: max, label: 'Class III' },
  ];
}

/** Where a BMI sits along a scale ending at `max`, 0–1, clamped at the ends. */
export function bmiPosition(value: number, max = 45): number {
  return Math.min(1, Math.max(0, (value - BMI_MIN) / (max - BMI_MIN)));
}
