/**
 * What should be on the reminder schedule, given the log.
 *
 * Split from `notifications.ts` so the rules run on Node: that file has to
 * touch `expo` and `expo-notifications`, which the tests cannot load. Same
 * pattern as `lockRules.ts` / `lock.ts`.
 *
 * A scheduled notification cannot evaluate a condition when it fires, so the
 * conditional ones ("skipped if already weighed", "only while water is
 * behind") are decided here, and the schedule is rewritten whenever the log
 * changes. If today's condition is already met, today's occurrence is simply
 * left off.
 */

import { AppData, DateKey } from '../data/types';
import { entryFor, habitTicks, habitsMetCount, milestones } from './calc';
import { addDays, daysBetween, fromKey, todayKey } from './date';
import { formatterFor } from './units';

export interface PlannedReminder {
  /** Stable per occurrence, so tests and logs can name one. */
  id: string;
  title: string;
  body: string;
  date: Date;
}

/**
 * Water check-ins, and how much of the day's target should be in by then.
 * A steady pace, loosely: a third by late morning, most of it by early
 * evening. Nothing after 18:00 — a nudge to drink a litre at bedtime helps
 * nobody.
 */
export const WATER_CHECKS: readonly { minutes: number; share: number }[] = [
  { minutes: 11 * 60, share: 0.3 },
  { minutes: 15 * 60, share: 0.6 },
  { minutes: 18 * 60, share: 0.8 },
];

/** Days of water check-ins scheduled ahead. Short, because pace is re-read on every change. */
const WATER_DAYS = 3;

/** 420 → "07:00". */
export function minutesLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Steps a reminder time by `delta` minutes, wrapping round midnight. */
export function shiftMinutes(minutes: number, delta: number): number {
  return (((minutes + delta) % 1440) + 1440) % 1440;
}

function at(date: DateKey, minutes: number): Date {
  const d = fromKey(date);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

export function plannedReminders(data: AppData, now: Date = new Date()): PlannedReminder[] {
  const { profile, notifications } = data;
  const u = formatterFor(profile.units);
  const today = todayKey();
  const out: PlannedReminder[] = [];

  // 1 · Morning weigh-in — skipped on a day whose weight is already in.
  if (notifications.morningWeighIn) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      if (entryFor(data.entries, date)?.weightKg != null) continue;
      const when = at(date, notifications.morningMinutes);
      if (when <= now) continue;
      out.push({
        id: `weigh-${date}`,
        title: 'Time to weigh in',
        body: 'Step on the scale before breakfast — one tap on Today and it is logged.',
        date: when,
      });
    }
  }

  // 2 · Evening nudge — only while fewer than 3 of the 6 habits are ticked.
  if (notifications.eveningLog) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const ticks = habitTicks(entryFor(data.entries, date), profile, date, date);
      // Future days have nothing logged yet, so they qualify by definition.
      if (ticks && habitsMetCount(ticks) >= 3) continue;
      const when = at(date, notifications.eveningMinutes);
      if (when <= now) continue;
      out.push({
        id: `evening-${date}`,
        title: 'Anything to log?',
        body: 'A few habits are still open for today. It takes a minute.',
        date: when,
      });
    }
  }

  // 3 · Water — at each check-in, only while behind the pace for that hour.
  if (notifications.water && profile.targetWaterL > 0) {
    for (let i = 0; i < WATER_DAYS; i++) {
      const date = addDays(today, i);
      const drunk = entryFor(data.entries, date)?.waterL ?? 0;
      for (const check of WATER_CHECKS) {
        const due = profile.targetWaterL * check.share;
        if (drunk >= due) continue;
        const when = at(date, check.minutes);
        if (when <= now) continue;
        out.push({
          id: `water-${date}-${check.minutes}`,
          title: 'Water check',
          body: `About ${u.volume(due)} by now keeps you on pace for ${u.volume(profile.targetWaterL)}.`,
          date: when,
        });
      }
    }
  }

  // 4 · Weekly summary — every 7 days from the start date, at 09:00.
  if (notifications.weeklySummary) {
    const elapsed = daysBetween(profile.startDate, today);
    const nextBoundary = Math.ceil(Math.max(0, elapsed) / 7) * 7;
    const next = data.entries.length
      ? milestones(data.entries, profile, data.rewards, data.achieved, today).find(
          (m) => m.status !== 'Achieved',
        )
      : null;
    for (let w = 0; w < 4; w++) {
      const date = addDays(profile.startDate, nextBoundary + w * 7);
      const when = at(date, 9 * 60);
      if (when <= now) continue;
      out.push({
        id: `week-${date}`,
        title: 'Your week in review',
        body: next
          ? `See what moved this week. Next milestone: ${u.weight(next.targetKg)}.`
          : 'See what moved this week.',
        date: when,
      });
    }
  }

  return out;
}
