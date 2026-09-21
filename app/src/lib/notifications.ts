/**
 * The four reminders — section 6 of the App Spec sheet.
 *
 * All four are *local* notifications, scheduled on the device. That matters:
 * it means they work offline, which the spec requires, and they work in Expo
 * Go, which remote push no longer does.
 *
 * Two of the four are conditional ("suppressed if today's weight is already
 * logged", "only if fewer than 3 of the 6 habits are ticked"). A scheduled
 * notification cannot evaluate a condition at fire time, so instead the
 * schedule is rewritten whenever the log changes: if today's condition is
 * already satisfied, today's occurrence is simply not scheduled.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { AppData, DateKey } from '../data/types';
import { entryFor, habitTicks, habitsMetCount, milestones } from './calc';
import { addDays, daysBetween, fromKey, todayKey } from './date';

/** Identifiers so a reschedule replaces rather than duplicates. */
const CHANNEL = 'reminders';

export const REMINDER_TIMES = {
  morningWeighIn: { hour: 7, minute: 0 },
  eveningLog: { hour: 21, minute: 0 },
  weeklySummary: { hour: 9, minute: 0 },
} as const;

let handlerInstalled = false;

function installHandler() {
  if (handlerInstalled) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  handlerInstalled = true;
}

/**
 * Asks for permission if it has not been decided yet.
 * Returns false when the user has said no — callers should treat that as
 * "reminders off" rather than an error.
 */
export async function ensurePermission(): Promise<boolean> {
  installHandler();

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

interface Scheduled {
  title: string;
  body: string;
  date: Date;
}

/**
 * Works out what should be on the schedule right now, given the log.
 * Pure, so the rules are testable without touching the notification system.
 */
export function plannedReminders(data: AppData, now: Date = new Date()): Scheduled[] {
  const { profile, notifications } = data;
  const today = todayKey();
  const out: Scheduled[] = [];

  const at = (date: DateKey, hour: number, minute: number) => {
    const d = fromKey(date);
    d.setHours(hour, minute, 0, 0);
    return d;
  };

  // 1 · Daily weigh-in reminder — suppressed if today's weight is already logged.
  if (notifications.morningWeighIn) {
    const { hour, minute } = REMINDER_TIMES.morningWeighIn;
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const logged = entryFor(data.entries, date)?.weightKg != null;
      if (logged) continue;
      const when = at(date, hour, minute);
      if (when <= now) continue;
      out.push({
        title: 'Time to weigh in',
        body: 'One tap on the Today screen and the day is logged.',
        date: when,
      });
    }
  }

  // 2 · Evening log reminder — only if fewer than 3 of the 6 habits are ticked.
  if (notifications.eveningLog) {
    const { hour, minute } = REMINDER_TIMES.eveningLog;
    for (let i = 0; i < 7; i++) {
      const date = addDays(today, i);
      const ticks = habitTicks(entryFor(data.entries, date), profile, date, date);
      // Future days have nothing logged yet, so they qualify by definition.
      if (ticks && habitsMetCount(ticks) >= 3) continue;
      const when = at(date, hour, minute);
      if (when <= now) continue;
      out.push({
        title: 'Anything to log?',
        body: 'A couple of habits are still open for today.',
        date: when,
      });
    }
  }

  // 3 · Weekly summary — every 7 days from the start date.
  if (notifications.weeklySummary) {
    const { hour, minute } = REMINDER_TIMES.weeklySummary;
    const elapsed = daysBetween(profile.startDate, today);
    // The next boundary at or after today.
    const nextBoundary = Math.ceil(Math.max(0, elapsed) / 7) * 7;
    for (let w = 0; w < 4; w++) {
      const date = addDays(profile.startDate, nextBoundary + w * 7);
      const when = at(date, hour, minute);
      if (when <= now) continue;
      const next = data.entries.length
        ? milestones(data.entries, profile, data.rewards, data.achieved, today).find(
            (m) => m.status !== 'Achieved',
          )
        : null;
      out.push({
        title: 'Your week in review',
        body: next
          ? `See what moved this week. Next milestone: ${next.targetKg.toFixed(1)} kg.`
          : 'See what moved this week.',
        date: when,
      });
    }
  }

  return out;
}

/**
 * Rewrites the whole schedule to match the log. Called after any change that
 * could flip one of the conditional rules.
 */
export async function syncReminders(data: AppData): Promise<void> {
  const anyOn =
    data.notifications.morningWeighIn ||
    data.notifications.eveningLog ||
    data.notifications.weeklySummary;

  installHandler();
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!anyOn) return;

  const granted = await ensurePermission();
  if (!granted) return;

  for (const reminder of plannedReminders(data)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: reminder.title, body: reminder.body },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminder.date,
        channelId: Platform.OS === 'android' ? CHANNEL : undefined,
      },
    });
  }
}

/**
 * Milestone reached — fired once, at the moment the achieved date is set,
 * rather than scheduled ahead. Deep-links nowhere yet; it carries the reward
 * the user wrote for it.
 */
export async function fireMilestoneReached(
  targetKg: number,
  kgFromStart: number,
  reward: string,
): Promise<void> {
  installHandler();
  const granted = await ensurePermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${kgFromStart.toFixed(1)} kg down`,
      body: reward
        ? `You crossed ${targetKg.toFixed(1)} kg. Your reward: ${reward}`
        : `You crossed ${targetKg.toFixed(1)} kg. Time to pick a reward.`,
      data: { screen: 'milestones', targetKg },
    },
    trigger: null, // immediately
  });
}
