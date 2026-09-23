/**
 * Derived data, computed once per data change.
 *
 * Everything in `lib/calc` is pure and cheap to call, but several functions
 * walk the whole log — `weeklyRollups`, `weighInStreaks`, `buildInsights`,
 * the per-habit rates. At the 730-day horizon the spec plans for, one
 * Progress render costs ~13 ms of recomputation, and screens re-render on
 * every keystroke in a Today field.
 *
 * So the walk happens here, once, memoised on the log itself, and screens read
 * finished values. A screen that needs something not in here can still call
 * `lib/calc` directly — this is a cache, not a gate.
 */

import React, { createContext, useContext, useMemo } from 'react';

import { useStore } from './store';
import { DateKey, HabitKey, HABIT_KEYS, Profile, WeighIn } from './types';
import {
  Milestone,
  MonthRollup,
  WeekRollup,
  averageOverLastDays,
  averageWeeklyLossKg,
  bmi,
  bmiBand,
  consistencyPct,
  currentWeight,
  estimatedGoalDate,
  goalCompletionPct,
  habitRatePct,
  isCountdown,
  MaintainStatus,
  maintainStatus,
  milestones as buildMilestones,
  monthlyRollups,
  projectedWeight,
  remainingKg,
  totalLostKg,
  trendPerDay,
  weeklyRollups,
  weighInStreaks,
  weighedEntries,
} from '../lib/calc';
import { Insight, buildInsights } from '../lib/insights';
import { UnitFormatter, formatterFor } from '../lib/units';
import { daysBetween } from '../lib/date';

export interface Projection {
  label: string;
  days: number;
  weightKg: number | null;
}

export interface Derived {
  today: DateKey;
  profile: Profile;
  /** Formatter bound to the profile's units setting. */
  u: UnitFormatter;

  weighed: (WeighIn & { weightKg: number })[];
  currentKg: number;
  lostKg: number;
  remainingKg: number;
  completionPct: number;
  sevenDayAverageKg: number | null;

  bmi: number;
  bmiBand: string;

  /** Signed kg per day; negative means losing. Null before 14 days of data. */
  trendPerDay: number | null;
  averageWeeklyLossKg: number | null;
  goalDate: Date | null;
  /** +1 week / +1 month / +3 months, floored at the goal. */
  projections: Projection[];

  weeks: WeekRollup[];
  months: MonthRollup[];
  weekNumber: number;

  /**
   * False while maintaining: milestones, projections and goal completion all
   * assume a destination, and maintaining has none.
   */
  isCountdown: boolean;
  /** Only meaningful when `isCountdown` is false. */
  maintain: MaintainStatus;

  milestones: Milestone[];
  nextMilestone: Milestone | null;

  streaks: { current: number; longest: number };
  consistency7: number;
  consistency30: number;
  habitRates: Record<HabitKey, number | null>;

  insights: Insight[];
}

const DerivedContext = createContext<Derived | null>(null);

export function DerivedProvider({ children }: { children: React.ReactNode }) {
  const { data, today } = useStore();
  const { profile, entries, rewards, achieved } = data;

  const value = useMemo<Derived>(() => {
    const u = formatterFor(profile.units);

    const weighed = weighedEntries(entries).filter((e) => e.logDate <= today);
    const currentKg = currentWeight(entries, profile, today);
    const trend = trendPerDay(entries, today);

    const ms = buildMilestones(entries, profile, rewards, achieved, today);
    const bmiValue = bmi(currentKg, profile.heightCm);

    const habitRates = HABIT_KEYS.reduce(
      (acc, key) => {
        acc[key] = habitRatePct(entries, profile, key, 30, today);
        return acc;
      },
      {} as Record<HabitKey, number | null>,
    );

    return {
      today,
      profile,
      u,

      weighed,
      currentKg,
      lostKg: totalLostKg(entries, profile, today),
      remainingKg: remainingKg(entries, profile, today),
      completionPct: goalCompletionPct(entries, profile, today),
      sevenDayAverageKg: averageOverLastDays(entries, 7, today),

      bmi: bmiValue,
      bmiBand: bmiBand(bmiValue),

      trendPerDay: trend,
      averageWeeklyLossKg: averageWeeklyLossKg(entries, profile, today),
      goalDate: estimatedGoalDate(entries, profile, today),
      projections: [
        { label: '+1 week', days: 7 },
        { label: '+1 month', days: 30 },
        { label: '+3 months', days: 90 },
      ].map(({ label, days }) => ({
        label,
        days,
        weightKg: projectedWeight(entries, profile, days, today),
      })),

      weeks: weeklyRollups(entries, profile, today),
      months: monthlyRollups(entries, today),
      weekNumber: Math.max(1, Math.ceil((daysBetween(profile.startDate, today) + 1) / 7)),

      isCountdown: isCountdown(profile),
      maintain: maintainStatus(entries, profile, today),

      milestones: ms,
      nextMilestone: ms.find((m) => m.status !== 'Achieved') ?? null,

      streaks: weighInStreaks(entries, profile, today),
      consistency7: consistencyPct(entries, profile, 7, today),
      consistency30: consistencyPct(entries, profile, 30, today),
      habitRates,

      insights: buildInsights(entries, profile, today),
    };
  }, [entries, profile, rewards, achieved, today]);

  return <DerivedContext.Provider value={value}>{children}</DerivedContext.Provider>;
}

export function useDerived(): Derived {
  const ctx = useContext(DerivedContext);
  if (!ctx) throw new Error('useDerived must be used inside <DerivedProvider>');
  return ctx;
}

/** Units alone — for screens that format numbers but need nothing derived. */
export function useUnits(): UnitFormatter {
  return useDerived().u;
}
