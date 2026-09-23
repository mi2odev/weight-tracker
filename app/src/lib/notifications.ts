/**
 * Phone reminders — the native half.
 *
 * All of them are *local* notifications, scheduled on the device, so they
 * work offline. What goes on the schedule is decided in `reminderRules.ts`,
 * which is pure and tested; this file only hands that list to the OS.
 *
 * ## Why the module is loaded lazily
 *
 * `expo-notifications` cannot be imported at all on Android inside Expo Go.
 * Its index re-exports `DevicePushTokenAutoRegistration.fx`, which calls
 * `addPushTokenListener()` at module scope, and since SDK 53 that throws
 * rather than warns on Android in Expo Go — remote push was removed from the
 * Go client. A top-level import therefore takes the whole app down at
 * startup, before any screen renders, over a feature this app never uses.
 *
 * So the module is required on first use, and not at all where the require
 * itself is fatal. Reminders are the only thing that stops working there;
 * everything else in the app runs. A development build has no such limit.
 */

import { isRunningInExpoGo } from 'expo';
import { Platform } from 'react-native';

import { AppData } from '../data/types';
import { plannedReminders } from './reminderRules';

/** Identifiers so a reschedule replaces rather than duplicates. */
const CHANNEL = 'reminders';

/**
 * False only where importing `expo-notifications` would throw: Android inside
 * Expo Go. iOS in Expo Go downgrades to a console warning, so local
 * notifications still work there.
 */
export const remindersSupported = !(isRunningInExpoGo() && Platform.OS === 'android');

type NotificationsModule = typeof import('expo-notifications');
let cached: NotificationsModule | null = null;

/**
 * The module, or null where it cannot be loaded.
 *
 * `typeof import(...)` is erased at compile time, so this file still has no
 * runtime import of `expo-notifications` — which is the entire point.
 */
function api(): NotificationsModule | null {
  if (!remindersSupported) return null;
  if (!cached) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      cached = require('expo-notifications') as NotificationsModule;
    } catch (error) {
      if (__DEV__) console.warn('[notifications] unavailable on this build', error);
      return null;
    }
  }
  return cached;
}

let handlerInstalled = false;

function installHandler(Notifications: NotificationsModule) {
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
  const Notifications = api();
  if (!Notifications) return false;
  installHandler(Notifications);

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

/**
 * Rewrites the whole schedule to match the log. Called after any change that
 * could flip one of the conditional rules.
 */
export async function syncReminders(data: AppData): Promise<void> {
  const anyOn =
    data.notifications.morningWeighIn ||
    data.notifications.eveningLog ||
    data.notifications.weeklySummary ||
    data.notifications.water;

  const Notifications = api();
  if (!Notifications) return;

  installHandler(Notifications);
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
  targetLabel: string,
  lostLabel: string,
  reward: string,
): Promise<void> {
  const Notifications = api();
  if (!Notifications) return;

  installHandler(Notifications);
  const granted = await ensurePermission();
  if (!granted) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${lostLabel} down`,
      body: reward
        ? `You crossed ${targetLabel}. Your reward: ${reward}`
        : `You crossed ${targetLabel}. Time to pick a reward.`,
      data: { screen: 'milestones' },
    },
    trigger: null, // immediately
  });
}

/**
 * Sends one notification a few seconds from now, so the user can see what a
 * reminder looks like and confirm the permission actually works.
 * Resolves false when it could not be sent (no permission, or no support).
 */
export async function sendTestReminder(): Promise<boolean> {
  const Notifications = api();
  if (!Notifications) return false;
  installHandler(Notifications);
  const granted = await ensurePermission();
  if (!granted) return false;
  await Notifications.scheduleNotificationAsync({
    content: { title: 'Weighpoint', body: 'Reminders are working. See you at weigh-in time.' },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      channelId: Platform.OS === 'android' ? CHANNEL : undefined,
    },
  });
  return true;
}
