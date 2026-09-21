/**
 * Automatic insight messages — section 5 of the App Spec sheet.
 *
 * Shown on Progress, one line each, always in this order. Every insight has an
 * explicit locked state, so the screen is never empty for a new user.
 *
 * Tone rule: never shame the user. A gain is always paired with a neutralising
 * sentence, and gains never carry alarm styling — the amber-red in this app
 * marks a missed habit and nothing else.
 */

import { Profile, WeighIn } from '../data/types';
import {
  averageDailyLossKg,
  averageOverLastDays,
  consistencyPct,
  currentWeight,
  f1,
  monthlyRollups,
  trendPerDay,
  weeklyRollups,
  weeksToGoal,
  weighedEntries,
} from './calc';
import { daysBetween, formatMonthYear, fromKey, todayKey } from './date';
import { isAdult, isLosingTooFast, rapidLossMessage, UNDER_18_NOTICE } from './health';
import { isCountdown, maintainStatus } from './calc';

export type InsightTone = 'good' | 'plain' | 'locked' | 'caution';
export type InsightIcon = 'down' | 'up' | 'rate' | 'goal' | 'steady' | 'habit' | 'lock' | 'caution';

export interface Insight {
  id: 'week' | 'rate' | 'projection' | 'momentum' | 'consistency' | 'pace';
  title: string;
  text: string;
  tone: InsightTone;
  icon: InsightIcon;
}

export function buildInsights(
  entries: WeighIn[],
  profile: Profile,
  asOf: string = todayKey(),
): Insight[] {
  const out: Insight[] = [];
  const weighed = weighedEntries(entries).filter((e) => e.logDate <= asOf);
  const spanDays = weighed.length ? daysBetween(weighed[0].logDate, asOf) : 0;
  const trend = trendPerDay(entries, asOf);
  const current = currentWeight(entries, profile, asOf);

  // 0 · Pace. Placed first because if it applies it matters more than any of
  // the numbers below it. Calm, not alarmed: this is a suggestion to get a
  // check-up, not a verdict.
  if (isLosingTooFast(trend, current)) {
    out.push({
      id: 'pace',
      title: 'Your pace',
      text: rapidLossMessage(-(trend as number) * 7),
      tone: 'caution',
      icon: 'caution',
    });
  }

  // Under-18s get no prescribed pace or projected date — the formulas behind
  // those are built for adult bodies — so the rest is replaced with a note.
  if (!isAdult(profile)) {
    out.push({
      id: 'rate',
      title: 'About your targets',
      text: UNDER_18_NOTICE,
      tone: 'locked',
      icon: 'lock',
    });
    out.push({
      id: 'consistency',
      title: 'Habit consistency',
      text: `Habit consistency over the last 7 days: ${consistencyPct(entries, profile, 7, asOf)}%.`,
      tone: 'plain',
      icon: 'habit',
    });
    return out;
  }

  // Maintaining has no countdown, so the projection and the "lost this week"
  // framing are replaced by how well the band is being held.
  if (!isCountdown(profile)) {
    const status = maintainStatus(entries, profile, asOf);
    out.push({
      id: 'week',
      title: 'Holding steady',
      text:
        status.state === 'in-range'
          ? `You are inside your target band of ${f1(status.lowKg)}–${f1(status.highKg)} kg.`
          : `You are ${f1(Math.abs(status.deltaKg))} kg ${status.state} your target band. Small, steady corrections work better than big ones.`,
      tone: status.state === 'in-range' ? 'good' : 'plain',
      icon: status.state === 'in-range' ? 'habit' : 'steady',
    });
    if (status.daysInRangePct != null) {
      out.push({
        id: 'rate',
        title: 'Time in range',
        text: `You have been inside the band on ${status.daysInRangePct}% of your weigh-ins this month.`,
        tone: 'plain',
        icon: 'rate',
      });
    }
    out.push({
      id: 'consistency',
      title: 'Habit consistency',
      text: `Habit consistency over the last 7 days: ${consistencyPct(entries, profile, 7, asOf)}%.`,
      tone: 'plain',
      icon: 'habit',
    });
    return out;
  }

  // 1 · This week — locked until two weeks of weigh-ins.
  if (spanDays < 14 || weighed.length < 2) {
    out.push({
      id: 'week',
      title: 'This week',
      text: 'Log at least two weeks of weigh-ins to unlock weekly insights.',
      tone: 'locked',
      icon: 'lock',
    });
  } else {
    const weeks = weeklyRollups(entries, profile, asOf);
    const lost = weeks.length ? (weeks[weeks.length - 1].lostKg ?? 0) : 0;
    out.push(
      lost >= 0
        ? {
            id: 'week',
            title: 'This week',
            text: `You lost ${f1(Math.abs(lost))} kg this week — keep it up!`,
            tone: 'good',
            icon: 'down',
          }
        : {
            id: 'week',
            title: 'This week',
            text: `You gained ${f1(Math.abs(lost))} kg this week. One week never defines a journey.`,
            tone: 'plain',
            icon: 'up',
          },
    );
  }

  // 2 · Loss rate — locked until three weigh-ins.
  if (weighed.length < 3) {
    out.push({
      id: 'rate',
      title: 'Loss rate',
      text: 'Three weigh-ins unlock your average rate of loss.',
      tone: 'locked',
      icon: 'lock',
    });
  } else if (trend == null) {
    out.push({
      id: 'rate',
      title: 'Loss rate',
      text: 'Two weeks of weigh-ins unlock your average rate of loss.',
      tone: 'locked',
      icon: 'lock',
    });
  } else if (trend >= 0) {
    out.push({
      id: 'rate',
      title: 'Loss rate',
      text: 'The trend is not downward yet. Worth a look at calories and activity this week.',
      tone: 'plain',
      icon: 'rate',
    });
  } else {
    // The journey average, matching the "Avg weekly loss" card — the trend
    // above has already established that the direction is downward.
    const perDay = averageDailyLossKg(entries, profile, asOf) ?? -trend;
    const weeks = Math.max(1, Math.round(spanDays / 7));
    out.push({
      id: 'rate',
      title: 'Loss rate',
      text: `Averaging ${f1(perDay * 7)} kg per week (${perDay.toFixed(2)} kg per day) over the last ${weeks} weeks.`,
      tone: 'plain',
      icon: 'rate',
    });
  }

  // 3 · Goal projection.
  if (current <= profile.goalWeightKg) {
    out.push({
      id: 'projection',
      title: 'Goal projection',
      text: `You reached your goal of ${f1(profile.goalWeightKg)} kg. That is the whole journey, done.`,
      tone: 'good',
      icon: 'goal',
    });
  } else {
    const weeks = weeksToGoal(entries, profile, asOf);
    if (weeks == null) {
      out.push({
        id: 'projection',
        title: 'Goal projection',
        text: 'A goal date appears once the trend points downward — no guesses here.',
        tone: 'locked',
        icon: 'lock',
      });
    } else {
      const when = fromKey(asOf);
      when.setDate(when.getDate() + Math.round(weeks * 7));
      out.push({
        id: 'projection',
        title: 'Goal projection',
        text: `Projected to reach your goal in about ${Math.round(weeks)} weeks (${formatMonthYear(when)}).`,
        tone: 'plain',
        icon: 'goal',
      });
    }
  }

  // 4 · Momentum — locked until roughly two months of data.
  const months = monthlyRollups(entries, asOf);
  if (months.length < 2) {
    out.push({
      id: 'momentum',
      title: 'Momentum',
      text: 'Two months of data unlock the momentum comparison.',
      tone: 'locked',
      icon: 'lock',
    });
  } else {
    const thisMonth = months[months.length - 1].avgDailyLossKg ?? 0;
    const lastMonth = months[months.length - 2].avgDailyLossKg ?? 0;
    const diff = thisMonth - lastMonth;
    out.push({
      id: 'momentum',
      title: 'Momentum',
      text:
        Math.abs(diff) < 0.005
          ? 'Your rate is steady compared with last month.'
          : diff > 0
            ? 'Accelerating — this month is running faster than last.'
            : 'Slowing slightly against last month. Still moving.',
      tone: 'plain',
      icon: 'steady',
    });
  }

  // 5 · Habit consistency — always available.
  out.push({
    id: 'consistency',
    title: 'Habit consistency',
    text: `Habit consistency over the last 7 days: ${consistencyPct(entries, profile, 7, asOf)}%.`,
    tone: 'plain',
    icon: 'habit',
  });

  return out;
}

/**
 * The chart needs two weigh-ins before it can draw a line; below that the
 * spec wants a written empty state rather than a one-point chart.
 */
export function chartIsReady(entries: WeighIn[], asOf?: string): boolean {
  return weighedEntries(entries).filter((e) => !asOf || e.logDate <= asOf).length >= 2;
}

/** The 7-day average, or null while nothing is logged. */
export function sevenDayAverage(entries: WeighIn[], asOf?: string): number | null {
  return averageOverLastDays(entries, 7, asOf);
}
