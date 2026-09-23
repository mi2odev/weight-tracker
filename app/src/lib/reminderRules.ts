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

import { AppData, DateKey, NotificationSettings } from '../data/types';
import { entryFor, habitTicks, habitsMetCount, milestones } from './calc';
import { addDays, daysBetween, instantAt, todayKey, weekdayIndex } from './date';
import { formatterFor } from './units';

export interface PlannedReminder {
  /** Stable per occurrence, so tests and logs can name one. */
  id: string;
  title: string;
  body: string;
  date: Date;
}

/**
 * Water reminder times: every `waterEveryMinutes` from the start of the
 * window to its end, inclusive — 09:00, 11:00 … 21:00 by default.
 */
export function waterCheckTimes(n: NotificationSettings): number[] {
  const out: number[] = [];
  const step = Math.max(15, n.waterEveryMinutes);
  for (let t = n.waterStartMinutes; t <= n.waterEndMinutes; t += step) out.push(t);
  return out;
}

/**
 * How much of the day's target should be in by `minutes`: a straight line
 * from nothing at the start of the window to all of it at the end.
 */
export function waterDueBy(n: NotificationSettings, targetL: number, minutes: number): number {
  const span = n.waterEndMinutes - n.waterStartMinutes;
  if (span <= 0) return targetL;
  const share = Math.min(1, Math.max(0, (minutes - n.waterStartMinutes) / span));
  return targetL * share;
}

/** Whether a water reminder at `minutes` has anything to say, given what was drunk. */
export function waterReminderDue(
  n: NotificationSettings,
  targetL: number,
  drunkL: number,
  minutes: number,
): boolean {
  if (drunkL >= targetL) return false; // done for the day — no more nudges
  return !n.waterOnlyBehind || drunkL < waterDueBy(n, targetL, minutes);
}

/**
 * Pending notifications are capped by the OS (64 on iOS), so water — the
 * only one that repeats within a day — gets a budget. Hourly for 12 hours
 * fits three days; every 30 minutes fits one.
 */
const WATER_BUDGET = 40;

/** Everything pending at once stays under iOS's cap of 64, soonest first. */
export const MAX_PENDING = 60;

/** Whether a reminder set to `days` (Monday = 0) runs on `date`. */
export function runsOn(days: number[], date: DateKey): boolean {
  return days.includes(weekdayIndex(date));
}

/** 420 → "07:00". */
export function minutesLabel(minutes: number): string {
  const m = ((Math.round(minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Steps a reminder time by `delta` minutes, wrapping round midnight. */
export function shiftMinutes(minutes: number, delta: number): number {
  return (((minutes + delta) % 1440) + 1440) % 1440;
}

/** Reminder times are Algerian wall-clock times, whatever zone the phone is in. */
function at(date: DateKey, minutes: number): Date {
  return instantAt(date, minutes);
}

export function plannedReminders(data: AppData, now: Date = new Date()): PlannedReminder[] {
  const { profile, notifications } = data;
  const u = formatterFor(profile.units);
  const today = todayKey(now);
  const out: PlannedReminder[] = [];

  // 1 · Morning weigh-in — skipped on a day whose weight is already in.
  if (notifications.morningWeighIn) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      if (!runsOn(notifications.weighDays, date)) continue;
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
      if (!runsOn(notifications.eveningDays, date)) continue;
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

  // 3 · Water — at the chosen interval inside the chosen window; never once
  // the day's target is reached, and optionally only while behind pace.
  if (notifications.water && profile.targetWaterL > 0) {
    const times = waterCheckTimes(notifications);
    const days = Math.max(1, Math.min(3, Math.floor(WATER_BUDGET / Math.max(1, times.length))));
    const target = profile.targetWaterL;
    for (let i = 0; i < days; i++) {
      const date = addDays(today, i);
      if (!runsOn(notifications.waterDays, date)) continue;
      const drunk = entryFor(data.entries, date)?.waterL ?? 0;
      for (const minutes of times) {
        if (!waterReminderDue(notifications, target, drunk, minutes)) continue;
        const when = at(date, minutes);
        if (when <= now) continue;
        out.push({
          id: `water-${date}-${minutes}`,
          title: 'Time for some water',
          body:
            date === today && drunk > 0
              ? `${u.volume(drunk)} of ${u.volume(target)} so far — a glass now keeps you on track.`
              : `A glass now keeps you on track for ${u.volume(target)} today.`,
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

  // 5 · The user's own reminders, on the days they chose.
  for (const reminder of notifications.custom) {
    if (!reminder.enabled) continue;
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      if (!runsOn(reminder.days, date)) continue;
      const when = at(date, reminder.minutes);
      if (when <= now) continue;
      out.push({ id: `custom-${reminder.id}-${date}`, title: reminder.label, body: 'Your reminder from Weighpoint.', date: when });
    }
  }

  // Soonest first, and never more than the phone will hold. The schedule is
  // rewritten on every change, so what is cut now comes back as time passes.
  return out.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, MAX_PENDING);
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** "Every day", "Weekdays", "Weekends", "Never", or "Mon, Wed, Fri". */
export function daysLabel(days: number[]): string {
  const set = new Set(days);
  if (set.size === 7) return 'Every day';
  if (set.size === 0) return 'Never';
  const key = [...set].sort().join('');
  if (key === '01234') return 'Weekdays';
  if (key === '56') return 'Weekends';
  return [...set].sort().map((d) => DAY_NAMES[d]).join(', ');
}
