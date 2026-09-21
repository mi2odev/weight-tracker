/**
 * The single source of truth for the whole app.
 *
 * Offline-first, as the spec requires: every action writes to local state
 * immediately and persists to AsyncStorage after. The weigh-in is the one
 * action that can never fail, so it never awaits storage.
 *
 * Two rules keep that promise honest:
 *
 * - **State is read through `dataRef`, never from a `setData` updater.** React
 *   does not guarantee an updater has run by the time the calling function
 *   continues, so anything computed inside one and read straight after — a
 *   crossed milestone, a deleted row to offer back — could be missing. Every
 *   action computes from `dataRef.current`, commits the whole next state, and
 *   the ref moves synchronously so a second call in the same tick sees it.
 *
 * - **Writes are debounced, and flushed when the app leaves the foreground.**
 *   Typing in a Today field fires `updateEntry` per keystroke; serialising the
 *   whole dataset each time is wasted work, and doing it on the JS thread is
 *   felt. Nothing is lost on close because backgrounding flushes immediately.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  AppData,
  DateKey,
  MealEntry,
  Measurement,
  NotificationSettings,
  Profile,
  WeighIn,
  WorkoutEntry,
} from './types';
import { demoData, emptyData } from './seed';
import { hasAnyData, migrate } from './schema';
import { mealTotals, newlyAchievedMilestones, workoutTotals } from '../lib/calc';
import { fireMilestoneReached, syncReminders } from '../lib/notifications';
import { shareExport } from '../lib/export';
import { todayKey } from '../lib/date';

const STORAGE_KEY = 'wt.data.v1';
/** A rescued copy of a payload that would not parse. Never deleted by the app. */
export const CORRUPT_KEY_PREFIX = 'wt.data.corrupt.';
const PERSIST_DEBOUNCE_MS = 500;

export interface Celebration {
  targetKg: number;
  kgFromStart: number;
  pctOfGoal: number;
  reward: string;
}

export interface UndoAction {
  label: string;
  run: () => void;
}

interface StoreValue {
  data: AppData;
  hydrated: boolean;

  /** The day the user is currently looking at on Today / Log. */
  cursor: DateKey;
  setCursor: (d: DateKey) => void;

  toast: string;
  showToast: (message: string, undoable?: UndoAction) => void;
  /** Set alongside a toast when the action that raised it can be taken back. */
  undo: UndoAction | null;
  dismissUndo: () => void;

  celebration: Celebration | null;
  dismissCelebration: () => void;

  /** Returns an error string, or null on success. */
  saveWeighIn: (date: DateKey, weightKg: number) => string | null;
  updateEntry: (date: DateKey, patch: Partial<WeighIn>) => void;

  addMeal: (meal: Omit<MealEntry, 'id'>) => void;
  removeMeal: (id: string) => void;
  addWorkout: (workout: Omit<WorkoutEntry, 'id'>) => void;
  removeWorkout: (id: string) => void;
  addMeasurement: (m: Omit<Measurement, 'id'>) => void;

  setReward: (targetKg: number, reward: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  completeOnboarding: (profile: Profile) => void;
  replayOnboarding: () => void;
  setNotification: (key: keyof NotificationSettings, value: boolean) => void;

  loadDemo: () => void;
  resetAll: () => void;
  /** Writes the log out as CSV and opens the share sheet. */
  exportCsv: () => Promise<void>;
}

const StoreContext = createContext<StoreValue | null>(null);

/**
 * Re-derives the fields that meals and workouts own, leaving anything the user
 * typed by hand alone.
 */
function applyLogRollup(data: AppData, date: DateKey): WeighIn[] {
  const meals = mealTotals(data.meals, date);
  const workouts = workoutTotals(data.workouts, date);
  const entries = data.entries.slice();
  let i = entries.findIndex((e) => e.logDate === date);
  if (i < 0) {
    if (!meals.count && !workouts.count) return entries;
    entries.push({ logDate: date });
    i = entries.length - 1;
  }
  const entry = { ...entries[i] };

  if (!entry.manualCalories) entry.calories = meals.count ? meals.calories : null;
  if (!entry.manualProtein) entry.proteinG = meals.count ? meals.proteinG : null;
  if (!entry.manualCardio) {
    entry.cardioMin = workouts.count ? workouts.cardioMin : null;
    entry.strengthDone = workouts.strengthDone;
  }

  entries[i] = entry;
  return entries;
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<AppData>(() => emptyData());
  const [hydrated, setHydrated] = useState(false);
  const [cursor, setCursor] = useState<DateKey>(() => todayKey());
  const [toast, setToast] = useState('');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  /** Always the latest committed state, readable synchronously. */
  const dataRef = useRef<AppData>(data);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<AppData | null>(null);
  /** Set during hydration when a payload had to be rescued; reported once. */
  const corruptNotice = useRef<string | null>(null);

  // ── commit ─────────────────────────────────────────────────────────────────

  /**
   * The only way state changes. Moves the ref first so anything computed on
   * the next line — or by a second action in the same tick — sees this write.
   */
  const commit = useCallback((next: AppData) => {
    dataRef.current = next;
    setData(next);
  }, []);

  const update = useCallback(
    (fn: (prev: AppData) => AppData) => {
      const next = fn(dataRef.current);
      if (next !== dataRef.current) commit(next);
      return next;
    },
    [commit],
  );

  // ── toasts ─────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, undoable?: UndoAction) => {
    setToast(message);
    setUndo(undoable ?? null);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // An undoable toast lingers longer — it is asking a question, not just
    // reporting, and 2.4 s is not enough time to decide.
    toastTimer.current = setTimeout(
      () => {
        setToast('');
        setUndo(null);
      },
      undoable ? 5000 : 2400,
    );
  }, []);

  // ── hydration ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let raw: string | null = null;
      try {
        raw = await AsyncStorage.getItem(STORAGE_KEY);
      } catch {
        /* storage unreadable — start clean rather than block the app */
      }

      if (raw) {
        let parsed: unknown = null;
        let readable = true;
        try {
          parsed = JSON.parse(raw);
        } catch {
          readable = false;
        }

        if (!readable) {
          // Rescue the bytes before anything can write over them. Persistence
          // is gated on `hydrated`, which is only set below, so this await
          // always wins the race against the first save.
          const backupKey = `${CORRUPT_KEY_PREFIX}${Date.now()}`;
          try {
            await AsyncStorage.setItem(backupKey, raw);
            corruptNotice.current = backupKey;
          } catch {
            corruptNotice.current = 'unsaved';
          }
        } else {
          const result = migrate(parsed);
          if (!cancelled) commit(result.data);
          if (result.notes.length && __DEV__) {
            // Not shown to the user: a repaired field is not their problem,
            // and the log is what matters for diagnosing it.
            console.warn('[store] migration notes', result.fromVersion, result.notes);
          }
        }
      }

      if (!cancelled) setHydrated(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [commit]);

  /** Told once, after hydration, so the message is not lost to a re-render. */
  useEffect(() => {
    if (!hydrated || !corruptNotice.current) return;
    const rescued = corruptNotice.current !== 'unsaved';
    corruptNotice.current = null;
    showToast(
      rescued
        ? 'Saved data could not be read — a copy was kept and the app started fresh'
        : 'Saved data could not be read — the app started fresh',
    );
  }, [hydrated, showToast]);

  // ── persistence ────────────────────────────────────────────────────────────

  const flushWrite = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const pending = pendingWrite.current;
    if (!pending) return;
    pendingWrite.current = null;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    pendingWrite.current = data;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(flushWrite, PERSIST_DEBOUNCE_MS);
  }, [data, hydrated, flushWrite]);

  // Leaving the foreground is the last reliable moment before the process can
  // be killed, so the debounce is cut short there.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') flushWrite();
    });
    return () => sub.remove();
  }, [flushWrite]);

  useEffect(
    () => () => {
      flushWrite();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [flushWrite],
  );

  /**
   * Two of the four reminders are conditional on the log, so the schedule is
   * rewritten whenever the log or the toggles change rather than set once.
   * Debounced with the write for the same reason: rescheduling every
   * notification on each keystroke is a native round-trip nobody asked for.
   *
   * Failure is never surfaced — a reminder that could not be scheduled must
   * not block logging.
   */
  useEffect(() => {
    if (!hydrated || !data.onboarded) return;
    const timer = setTimeout(() => {
      syncReminders(data).catch(() => {});
    }, PERSIST_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [hydrated, data]);

  // ── actions ────────────────────────────────────────────────────────────────

  const saveWeighIn = useCallback<StoreValue['saveWeighIn']>(
    (date, weightKg) => {
      const prev = dataRef.current;

      if (!Number.isFinite(weightKg)) return 'Enter a weight first';
      if (weightKg < 30 || weightKg > 400) return 'Enter a weight between 30 and 400 kg';
      if (date > todayKey()) return 'You cannot log a weigh-in in the future';

      const entries = prev.entries.slice();
      const i = entries.findIndex((e) => e.logDate === date);
      // One record per calendar day — saving again edits it rather than
      // creating a duplicate.
      if (i < 0) entries.push({ logDate: date, weightKg });
      else entries[i] = { ...entries[i], weightKg };

      // Computed from the state being replaced, not from inside an updater.
      // Re-running this call is harmless: once the stamps are committed,
      // `newlyAchievedMilestones` returns nothing the second time.
      const crossed = newlyAchievedMilestones(weightKg, prev.profile, prev.achieved);
      const achieved = { ...prev.achieved };
      for (const target of crossed) {
        // Immutable once set, even if the user later regains weight.
        achieved[String(target)] = date;
      }

      commit({
        ...prev,
        entries,
        achieved,
        // A set, so a repeated commit cannot list a target twice.
        celebrated: Array.from(new Set([...prev.celebrated, ...crossed])),
      });

      if (crossed.length) {
        // Celebrate the deepest milestone crossed; the rest are simply stamped.
        const target = Math.min(...crossed);
        const span = prev.profile.startWeightKg - prev.profile.goalWeightKg;
        const kgFromStart = prev.profile.startWeightKg - target;
        const reward = prev.rewards[String(target)] ?? '';
        setCelebration({
          targetKg: target,
          kgFromStart,
          pctOfGoal: span > 0 ? (kgFromStart / span) * 100 : 0,
          reward,
        });
        // Fired once, the first time the achieved date is set.
        if (prev.notifications.milestoneReached) {
          fireMilestoneReached(target, kgFromStart, reward).catch(() => {});
        }
      } else {
        showToast(date === todayKey() ? 'Weigh-in saved for today' : 'Weigh-in saved');
      }
      return null;
    },
    [commit, showToast],
  );

  const updateEntry = useCallback<StoreValue['updateEntry']>(
    (date, patch) => {
      update((prev) => {
        const entries = prev.entries.slice();
        const i = entries.findIndex((e) => e.logDate === date);
        if (i < 0) entries.push({ logDate: date, ...patch });
        else entries[i] = { ...entries[i], ...patch };
        return { ...prev, entries };
      });
    },
    [update],
  );

  const addMeal = useCallback<StoreValue['addMeal']>(
    (meal) => {
      update((prev) => {
        const next: AppData = {
          ...prev,
          meals: prev.meals.concat({ ...meal, id: `meal-${Date.now()}-${prev.meals.length}` }),
        };
        return { ...next, entries: applyLogRollup(next, meal.logDate) };
      });
    },
    [update],
  );

  /**
   * Deletes are undoable: the removed row is captured and re-inserted intact,
   * so an accidental tap costs nothing. The roll-up is recomputed both ways.
   */
  const removeMeal = useCallback<StoreValue['removeMeal']>(
    (id) => {
      const prev = dataRef.current;
      const removed = prev.meals.find((m) => m.id === id);
      if (!removed) return;

      const next: AppData = { ...prev, meals: prev.meals.filter((m) => m.id !== id) };
      commit({ ...next, entries: applyLogRollup(next, removed.logDate) });

      showToast('Meal deleted', {
        label: 'Undo',
        run: () =>
          update((current) => {
            if (current.meals.some((m) => m.id === removed.id)) return current;
            const restored: AppData = { ...current, meals: current.meals.concat(removed) };
            return { ...restored, entries: applyLogRollup(restored, removed.logDate) };
          }),
      });
    },
    [commit, update, showToast],
  );

  const addWorkout = useCallback<StoreValue['addWorkout']>(
    (workout) => {
      update((prev) => {
        const next: AppData = {
          ...prev,
          workouts: prev.workouts.concat({ ...workout, id: `wo-${Date.now()}-${prev.workouts.length}` }),
        };
        return { ...next, entries: applyLogRollup(next, workout.logDate) };
      });
    },
    [update],
  );

  const removeWorkout = useCallback<StoreValue['removeWorkout']>(
    (id) => {
      const prev = dataRef.current;
      const removed = prev.workouts.find((w) => w.id === id);
      if (!removed) return;

      const next: AppData = { ...prev, workouts: prev.workouts.filter((w) => w.id !== id) };
      commit({ ...next, entries: applyLogRollup(next, removed.logDate) });

      showToast('Workout deleted', {
        label: 'Undo',
        run: () =>
          update((current) => {
            if (current.workouts.some((w) => w.id === removed.id)) return current;
            const restored: AppData = { ...current, workouts: current.workouts.concat(removed) };
            return { ...restored, entries: applyLogRollup(restored, removed.logDate) };
          }),
      });
    },
    [commit, update, showToast],
  );

  const addMeasurement = useCallback<StoreValue['addMeasurement']>(
    (m) => {
      update((prev) => ({
        ...prev,
        measurements: prev.measurements
          .filter((x) => x.logDate !== m.logDate)
          .concat({ ...m, id: `meas-${Date.now()}` })
          .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
      }));
    },
    [update],
  );

  const setReward = useCallback<StoreValue['setReward']>(
    (targetKg, reward) => {
      update((prev) => ({ ...prev, rewards: { ...prev.rewards, [String(targetKg)]: reward } }));
    },
    [update],
  );

  const updateProfile = useCallback<StoreValue['updateProfile']>(
    (patch) => {
      update((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
    },
    [update],
  );

  const completeOnboarding = useCallback<StoreValue['completeOnboarding']>(
    (profile) => {
      update((prev) => ({ ...prev, profile, onboarded: true }));
    },
    [update],
  );

  const replayOnboarding = useCallback(() => {
    update((prev) => ({ ...prev, onboarded: false }));
  }, [update]);

  const setNotification = useCallback<StoreValue['setNotification']>(
    (key, value) => {
      update((prev) => ({ ...prev, notifications: { ...prev.notifications, [key]: value } }));
    },
    [update],
  );

  /**
   * Swapping the whole dataset keeps the outgoing one in the undo closure, so
   * loading the demo or resetting is recoverable for as long as the toast is
   * up. Undo is only offered when there was something to lose.
   */
  const replaceAll = useCallback(
    (next: AppData, message: string) => {
      const snapshot = dataRef.current;
      commit(next);
      setCursor(todayKey());

      showToast(
        message,
        hasAnyData(snapshot)
          ? {
              label: 'Undo',
              run: () => {
                commit(snapshot);
                setCursor(todayKey());
              },
            }
          : undefined,
      );
    },
    [commit, showToast],
  );

  const loadDemo = useCallback(() => {
    replaceAll(demoData(), 'Loaded the 8-week demo journey');
  }, [replaceAll]);

  const resetAll = useCallback(() => {
    replaceAll(emptyData(), 'Everything cleared');
  }, [replaceAll]);

  const exportCsv = useCallback(async () => {
    try {
      showToast(await shareExport(dataRef.current));
    } catch {
      showToast('Could not export — try again');
    }
  }, [showToast]);

  const value = useMemo<StoreValue>(
    () => ({
      data,
      hydrated,
      cursor,
      setCursor,
      toast,
      showToast,
      undo,
      dismissUndo: () => setUndo(null),
      celebration,
      dismissCelebration: () => setCelebration(null),
      saveWeighIn,
      updateEntry,
      addMeal,
      removeMeal,
      addWorkout,
      removeWorkout,
      addMeasurement,
      setReward,
      updateProfile,
      completeOnboarding,
      replayOnboarding,
      setNotification,
      loadDemo,
      resetAll,
      exportCsv,
    }),
    [
      data,
      hydrated,
      cursor,
      toast,
      showToast,
      undo,
      celebration,
      saveWeighIn,
      updateEntry,
      addMeal,
      removeMeal,
      addWorkout,
      removeWorkout,
      addMeasurement,
      setReward,
      updateProfile,
      completeOnboarding,
      replayOnboarding,
      setNotification,
      loadDemo,
      resetAll,
      exportCsv,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
