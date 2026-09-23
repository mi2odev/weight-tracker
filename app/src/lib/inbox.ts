/**
 * The in-app inbox — the bell on Today.
 *
 * Phone notifications cannot reach everyone: Expo Go on Android has no
 * notification support at all, and plenty of people say no to the permission
 * prompt. The inbox carries the same messages inside the app, so nothing the
 * reminders would have said is lost, and it reads the same switches in
 * Settings so turning a reminder off quiets it in both places.
 *
 * Items are *derived* from the log every time, never stored. Only the ids of
 * the ones already opened are kept (`AppData.inboxRead`), which is why every
 * id here is stable: the same situation on the same day must produce the same
 * id, or a read item would come back as unread.
 *
 * Pure, so the rules are tested on Node.
 */

import { AppData, DateKey } from '../data/types';
import { entryFor, habitTicks, habitsMetCount, weeklyRollups, weighInStreaks } from './calc';
import { addDays, dayKeyAt, daysBetween, minuteOfDayAt } from './date';
import { WATER_CHECKS } from './reminderRules';
import { formatterFor } from './units';

export type InboxKind = 'weigh' | 'water' | 'evening' | 'milestone' | 'week' | 'streak' | 'measure';

/** Where tapping an item takes you. */
export type InboxTarget = 'today' | 'log' | 'milestones' | 'trends' | 'body';

export interface InboxItem {
  id: string;
  kind: InboxKind;
  title: string;
  body: string;
  /** The day it is about, for ordering and "2 days ago". */
  date: DateKey;
  target: InboxTarget;
}

/** How long a milestone or weekly summary stays in the inbox. */
const KEEP_DAYS = 14;

/** Streak lengths worth a word. */
const STREAK_MARKS = [7, 14, 21, 30, 60, 90, 100, 150, 200, 365];

/** Body measurements every two weeks is plenty; sooner is noise. */
const MEASURE_EVERY_DAYS = 14;

export function inboxItems(data: AppData, now: Date = new Date()): InboxItem[] {
  const { profile, notifications: n } = data;
  const u = formatterFor(profile.units);
  // Both on Algerian time — see lib/date.ts.
  const today = dayKeyAt(now);
  const clock = minuteOfDayAt(now);
  const entry = entryFor(data.entries, today);
  const out: InboxItem[] = [];

  // Nothing is due before the plan starts.
  if (today < profile.startDate) return out;

  // ── today's to-dos ─────────────────────────────────────────────────────────

  if (n.morningWeighIn && clock >= n.morningMinutes && entry?.weightKg == null) {
    out.push({
      id: `weigh-${today}`,
      kind: 'weigh',
      title: 'Time to weigh in',
      body: 'Same time each morning gives the cleanest trend. One tap and it is logged.',
      date: today,
      target: 'today',
    });
  }

  if (n.water && profile.targetWaterL > 0) {
    // Only the latest check-in that has passed — three stacked water nudges
    // would be nagging.
    const passed = WATER_CHECKS.filter((c) => clock >= c.minutes);
    const check = passed[passed.length - 1];
    const drunk = entry?.waterL ?? 0;
    if (check && drunk < profile.targetWaterL * check.share) {
      out.push({
        id: `water-${today}-${check.minutes}`,
        kind: 'water',
        title: 'Water check',
        body: `${u.volume(drunk)} so far. About ${u.volume(profile.targetWaterL * check.share)} by now keeps you on pace.`,
        date: today,
        target: 'today',
      });
    }
  }

  if (n.eveningLog && clock >= n.eveningMinutes) {
    const met = habitsMetCount(habitTicks(entry, profile, today, today));
    if (met < 3) {
      out.push({
        id: `evening-${today}`,
        kind: 'evening',
        title: 'Anything to log?',
        body: `${met} of 6 habits ticked today. A minute on Today closes the rest.`,
        date: today,
        target: 'today',
      });
    }
  }

  // ── things that happened ───────────────────────────────────────────────────

  if (n.milestoneReached) {
    for (const [target, date] of Object.entries(data.achieved)) {
      const age = daysBetween(date, today);
      if (age < 0 || age > KEEP_DAYS) continue;
      const kg = Number(target);
      const reward = data.rewards[target];
      out.push({
        id: `milestone-${target}`,
        kind: 'milestone',
        title: `${u.weight(profile.startWeightKg - kg)} down`,
        body: reward
          ? `You crossed ${u.weight(kg)}. Your reward: ${reward}`
          : `You crossed ${u.weight(kg)}. Pick a reward for it.`,
        date,
        target: 'milestones',
      });
    }
  }

  if (n.weeklySummary) {
    // The most recent *finished* week, for a week after it closed.
    const weeks = weeklyRollups(data.entries, profile, today).filter((w) => w.end < today);
    const last = weeks[weeks.length - 1];
    if (last && daysBetween(last.end, today) <= 7) {
      const lost = last.lostKg;
      // Weight going up is reported plainly, never as a failure.
      const moved =
        lost == null
          ? 'No weigh-ins to compare'
          : Math.abs(lost) < 0.05
            ? 'Held steady'
            : lost > 0
              ? `Down ${u.weight(lost)}`
              : `Up ${u.weight(-lost)} — one week is noise, the trend is what counts`;
      out.push({
        id: `week-${last.index}`,
        kind: 'week',
        title: `Week ${last.index} in review`,
        body: `${moved}. Logged ${last.daysLogged} of 7 days.`,
        date: addDays(last.end, 1),
        target: 'trends',
      });
    }
  }

  // Streaks and measurements have no switch of their own; they ride on the
  // weekly summary, which is the "how am I doing" channel.
  if (n.weeklySummary) {
    const { current } = weighInStreaks(data.entries, profile, today);
    if (entry?.weightKg != null && STREAK_MARKS.includes(current)) {
      out.push({
        id: `streak-${current}-${today}`,
        kind: 'streak',
        title: `${current}-day streak`,
        body: `You have weighed in ${current} days running. That consistency is what makes the trend line honest.`,
        date: today,
        target: 'today',
      });
    }

    const lastMeasured = data.measurements.reduce<DateKey | null>(
      (latest, m) => (latest == null || m.logDate > latest ? m.logDate : latest),
      null,
    );
    const since = lastMeasured ?? profile.startDate;
    const gap = daysBetween(since, today);
    if (gap >= MEASURE_EVERY_DAYS) {
      out.push({
        id: `measure-${since}`,
        kind: 'measure',
        title: lastMeasured ? 'Time to re-measure' : 'Take your first measurements',
        body: lastMeasured
          ? `It has been ${gap} days. Waist often moves when the scale does not.`
          : 'Waist, chest, arms, thighs and neck — a baseline shows change the scale misses.',
        date: addDays(since, MEASURE_EVERY_DAYS),
        target: 'body',
      });
    }
  }

  // Newest first; within a day, the order above (to-dos first).
  return out
    .map((item, order) => ({ item, order }))
    .sort((a, b) => (a.item.date === b.item.date ? a.order - b.order : a.item.date < b.item.date ? 1 : -1))
    .map(({ item }) => item);
}

export function unreadCount(items: InboxItem[], read: string[]): number {
  const seen = new Set(read);
  return items.filter((i) => !seen.has(i.id)).length;
}

/** "Today", "Yesterday", "3 days ago". */
export function inboxWhen(date: DateKey, today: DateKey): string {
  const d = daysBetween(date, today);
  if (d <= 0) return 'Today';
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}
