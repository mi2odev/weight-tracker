/**
 * The single source of truth for the whole app.
 *
 * Offline-first, as the spec requires: every action writes to local state
 * immediately and persists to AsyncStorage after. The weigh-in is the one
 * action that can never fail, so it never awaits storage.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
import { mealTotals, newlyAchievedMilestones, workoutTotals } from '../lib/calc';
import { fireMilestoneReached, syncReminders } from '../lib/notifications';
import { shareExport } from '../lib/export';
import { todayKey } from '../lib/date';

const STORAGE_KEY = 'wt.data.v1';

export interface Celebration {
  targetKg: number;
  kgFromStart: number;
  pctOfGoal: number;
  reward: string;
}

interface StoreValue {
  data: AppData;
  hydrated: boolean;

  /** The day the user is currently looking at on Today / Log. */
  cursor: DateKey;
  setCursor: (d: DateKey) => void;

  toast: string;
  showToast: (message: string, undoable?: { label: string; run: () => void }) => void;
  /** Set alongside a toast when the action that raised it can be taken back. */
  undo: { label: string; run: () => void } | null;
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
  const [undo, setUndo] = useState<{ label: string; run: () => void } | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (raw) setData({ ...emptyData(), ...(JSON.parse(raw) as AppData) });
      })
      .catch(() => {
        /* corrupt or empty store — fall back to a clean first run */
      })
      .finally(() => setHydrated(true));
  }, []);

  // Persist after every change, once the initial read has settled so we never
  // write the empty default over real data.
  useEffect(() => {
    if (!hydrated) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, [data, hydrated]);

  /**
   * Two of the four reminders are conditional on the log, so the schedule is
   * rewritten whenever the log or the toggles change rather than set once.
   * Failure here is never surfaced — a reminder that could not be scheduled
   * must not block logging.
   */
  useEffect(() => {
    if (!hydrated || !data.onboarded) return;
    syncReminders(data).catch(() => {});
  }, [hydrated, data]);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const showToast = useCallback((message: string, undoable?: { label: string; run: () => void }) => {
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

  const saveWeighIn = useCallback<StoreValue['saveWeighIn']>(
    (date, weightKg) => {
      if (!Number.isFinite(weightKg)) return 'Enter a weight first';
      if (weightKg < 30 || weightKg > 400) return 'Enter a weight between 30 and 400 kg';
      if (date > todayKey()) return 'You cannot log a weigh-in in the future';

      let crossed: number[] = [];

      setData((prev) => {
        const entries = prev.entries.slice();
        const i = entries.findIndex((e) => e.logDate === date);
        // One record per calendar day — saving again edits it rather than
        // creating a duplicate.
        if (i < 0) entries.push({ logDate: date, weightKg });
        else entries[i] = { ...entries[i], weightKg };

        crossed = newlyAchievedMilestones(weightKg, prev.profile, prev.achieved);
        const achieved = { ...prev.achieved };
        for (const target of crossed) {
          // Immutable once set, even if the user later regains weight.
          achieved[String(target)] = date;
        }

        return { ...prev, entries, achieved, celebrated: prev.celebrated.concat(crossed) };
      });

      if (crossed.length) {
        // Celebrate the deepest milestone crossed; the rest are simply stamped.
        const target = Math.min(...crossed);
        const span = data.profile.startWeightKg - data.profile.goalWeightKg;
        const kgFromStart = data.profile.startWeightKg - target;
        const reward = data.rewards[String(target)] ?? '';
        setCelebration({
          targetKg: target,
          kgFromStart,
          pctOfGoal: span > 0 ? (kgFromStart / span) * 100 : 0,
          reward,
        });
        // Fired once, the first time the achieved date is set.
        if (data.notifications.milestoneReached) {
          fireMilestoneReached(target, kgFromStart, reward).catch(() => {});
        }
      } else {
        showToast(date === todayKey() ? 'Weigh-in saved for today' : 'Weigh-in saved');
      }
      return null;
    },
    [data.profile, data.rewards, data.notifications.milestoneReached, showToast],
  );

  const updateEntry = useCallback<StoreValue['updateEntry']>((date, patch) => {
    setData((prev) => {
      const entries = prev.entries.slice();
      const i = entries.findIndex((e) => e.logDate === date);
      if (i < 0) entries.push({ logDate: date, ...patch });
      else entries[i] = { ...entries[i], ...patch };
      return { ...prev, entries };
    });
  }, []);

  const addMeal = useCallback<StoreValue['addMeal']>((meal) => {
    setData((prev) => {
      const next: AppData = {
        ...prev,
        meals: prev.meals.concat({ ...meal, id: `meal-${Date.now()}-${prev.meals.length}` }),
      };
      return { ...next, entries: applyLogRollup(next, meal.logDate) };
    });
  }, []);

  /**
   * Deletes are undoable: the removed row is captured and re-inserted intact,
   * so an accidental tap costs nothing. The roll-up is recomputed both ways.
   */
  const removeMeal = useCallback<StoreValue['removeMeal']>(
    (id) => {
      let removed: MealEntry | undefined;
      setData((prev) => {
        removed = prev.meals.find((m) => m.id === id);
        if (!removed) return prev;
        const next: AppData = { ...prev, meals: prev.meals.filter((m) => m.id !== id) };
        return { ...next, entries: applyLogRollup(next, removed.logDate) };
      });

      if (!removed) return;
      const restored = removed;
      showToast('Meal deleted', {
        label: 'Undo',
        run: () =>
          setData((prev) => {
            if (prev.meals.some((m) => m.id === restored.id)) return prev;
            const next: AppData = { ...prev, meals: prev.meals.concat(restored) };
            return { ...next, entries: applyLogRollup(next, restored.logDate) };
          }),
      });
    },
    [showToast],
  );

  const addWorkout = useCallback<StoreValue['addWorkout']>((workout) => {
    setData((prev) => {
      const next: AppData = {
        ...prev,
        workouts: prev.workouts.concat({ ...workout, id: `wo-${Date.now()}-${prev.workouts.length}` }),
      };
      return { ...next, entries: applyLogRollup(next, workout.logDate) };
    });
  }, []);

  const removeWorkout = useCallback<StoreValue['removeWorkout']>(
    (id) => {
      let removed: WorkoutEntry | undefined;
      setData((prev) => {
        removed = prev.workouts.find((w) => w.id === id);
        if (!removed) return prev;
        const next: AppData = { ...prev, workouts: prev.workouts.filter((w) => w.id !== id) };
        return { ...next, entries: applyLogRollup(next, removed.logDate) };
      });

      if (!removed) return;
      const restored = removed;
      showToast('Workout deleted', {
        label: 'Undo',
        run: () =>
          setData((prev) => {
            if (prev.workouts.some((w) => w.id === restored.id)) return prev;
            const next: AppData = { ...prev, workouts: prev.workouts.concat(restored) };
            return { ...next, entries: applyLogRollup(next, restored.logDate) };
          }),
      });
    },
    [showToast],
  );

  const addMeasurement = useCallback<StoreValue['addMeasurement']>((m) => {
    setData((prev) => ({
      ...prev,
      measurements: prev.measurements
        .filter((x) => x.logDate !== m.logDate)
        .concat({ ...m, id: `meas-${Date.now()}` })
        .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
    }));
  }, []);

  const setReward = useCallback<StoreValue['setReward']>((targetKg, reward) => {
    setData((prev) => ({ ...prev, rewards: { ...prev.rewards, [String(targetKg)]: reward } }));
  }, []);

  const updateProfile = useCallback<StoreValue['updateProfile']>((patch) => {
    setData((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));
  }, []);

  const completeOnboarding = useCallback<StoreValue['completeOnboarding']>((profile) => {
    setData((prev) => ({ ...prev, profile, onboarded: true }));
  }, []);

  const replayOnboarding = useCallback(() => {
    setData((prev) => ({ ...prev, onboarded: false }));
  }, []);

  const setNotification = useCallback<StoreValue['setNotification']>((key, value) => {
    setData((prev) => ({ ...prev, notifications: { ...prev.notifications, [key]: value } }));
  }, []);

  const loadDemo = useCallback(() => {
    setData(demoData());
    setCursor(todayKey());
    showToast('Loaded the 8-week demo journey');
  }, [showToast]);

  const resetAll = useCallback(() => {
    setData(emptyData());
    setCursor(todayKey());
  }, []);

  const exportCsv = useCallback(async () => {
    try {
      showToast(await shareExport(data));
    } catch {
      showToast('Could not export — try again');
    }
  }, [data, showToast]);

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
