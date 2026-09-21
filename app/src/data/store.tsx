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
  DiagnosticsSettings,
  MealEntry,
  Measurement,
  LockSettings,
  NotificationSettings,
  Profile,
  WeighIn,
  WorkoutEntry,
} from './types';
import { demoData, emptyData } from './seed';
import { describeData, hasAnyData, migrate } from './schema';
import { mealTotals, newlyAchievedMilestones, workoutTotals } from '../lib/calc';
import { fireMilestoneReached, syncReminders } from '../lib/notifications';
import { pickBackup, pickWeighInCsv, shareBackup, shareExport } from '../lib/export';
import { applyRestoredPhotos, ConflictChoice, mergeWeighIns, previewMerge } from '../lib/backup';
import {
  LaunchHydration,
  readAsBase64,
  restorePhotos,
  sweepOrphanedPhotos,
} from '../lib/photos';
import { todayKey } from '../lib/date';
import { HydrationResult, mayPersist, readStoredPayload } from '../lib/hydration';
import {
  isDowngrade,
  premigrationKey,
  shouldSnapshot,
  snapshotsToPrune,
} from '../lib/snapshots';

export const STORAGE_KEY = 'wt.data.v1';
/** A rescued copy of a payload that would not parse. Never deleted by the app. */
export const CORRUPT_KEY_PREFIX = 'wt.data.corrupt.';
const PERSIST_DEBOUNCE_MS = 500;

export interface Celebration {
  targetKg: number;
  kgFromStart: number;
  pctOfGoal: number;
  reward: string;
}

export type SaveWeighInError = 'not-a-number' | 'out-of-range' | 'future';

export interface UndoAction {
  label: string;
  run: () => void;
  /**
   * Runs once the undo window has closed without the undo being taken.
   *
   * This is where anything irreversible belongs. Deleting a photo file the
   * moment its row disappears makes "Undo" a lie: the row comes back pointing
   * at a file that no longer exists.
   */
  onExpire?: () => void;
}

interface StoreValue {
  data: AppData;
  hydrated: boolean;
  /** True when storage would not answer, after retries. Nothing is written. */
  storageUnreadable: boolean;
  /** Tries the first read again, for the retry button on the blocking screen. */
  retryHydration: () => void;

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

  /**
   * Returns a reason code, or null on success. The *wording* is the screen's
   * job: only the screen knows whether to say kilograms or pounds.
   */
  saveWeighIn: (date: DateKey, weightKg: number) => SaveWeighInError | null;
  updateEntry: (date: DateKey, patch: Partial<WeighIn>) => void;

  addMeal: (meal: Omit<MealEntry, 'id'>) => void;
  updateMeal: (id: string, patch: Partial<Omit<MealEntry, 'id'>>) => void;
  removeMeal: (id: string) => void;
  addWorkout: (workout: Omit<WorkoutEntry, 'id'>) => void;
  updateWorkout: (id: string, patch: Partial<Omit<WorkoutEntry, 'id'>>) => void;
  removeWorkout: (id: string) => void;
  addMeasurement: (m: Omit<Measurement, 'id'>) => void;
  updateMeasurement: (id: string, patch: Partial<Omit<Measurement, 'id'>>) => void;
  /** Deletes a measurement set. Its photo file outlives the undo window. */
  removeMeasurement: (id: string) => void;
  /** Clears a day's weight without touching the rest of the row. */
  removeWeighIn: (date: DateKey) => void;

  setReward: (targetKg: number, reward: string) => void;
  updateProfile: (patch: Partial<Profile>) => void;
  completeOnboarding: (profile: Profile) => void;
  replayOnboarding: () => void;
  setNotification: (key: keyof NotificationSettings, value: boolean) => void;
  setLock: (patch: Partial<LockSettings>) => void;
  setDiagnostics: (patch: Partial<DiagnosticsSettings>) => void;

  loadDemo: () => void;
  resetAll: () => void;
  /** Writes the log out as CSV and opens the share sheet. */
  exportCsv: () => Promise<void>;
  /** The whole dataset as one JSON file, which is what a restore needs. */
  exportBackup: (includePhotos?: boolean) => Promise<void>;
  /**
   * Picks a backup and validates it. Nothing is applied — the caller shows
   * the summary, asks, and then calls `applyRestore`.
   */
  previewRestore: () => Promise<RestorePreview | null>;
  applyRestore: (preview: RestorePreview) => void;
  /** Picks this app's weigh-in CSV and reports what merging it would do. */
  previewCsvImport: () => Promise<CsvImportPreview | null>;
  applyCsvImport: (rows: WeighIn[], onConflict: ConflictChoice) => void;
}

export interface RestorePreview {
  data: AppData;
  exportedAt: string | null;
  summary: string;
  /**
   * The backup's photos as base64, keyed by measurement id. Held rather than
   * written: nothing touches the file system until the user confirms.
   */
  photos: Record<string, string>;
}

export interface CsvImportPreview {
  fileName: string;
  rows: WeighIn[];
  newCount: number;
  conflictCount: number;
  identicalCount: number;
  skipped: number;
  warning: string | null;
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
  /**
   * Null while the first read is in flight. `mayPersist` — not "is this
   * non-null" — decides whether writing is allowed, because a finished but
   * failed hydration is exactly the case that must never write.
   */
  const [hydration, setHydration] = useState<HydrationResult | null>(null);
  const [cursor, setCursor] = useState<DateKey>(() => todayKey());
  const [toast, setToast] = useState('');
  const [undo, setUndo] = useState<UndoAction | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);

  /** Everything downstream still asks one question: is the data ready? */
  const hydrated = hydration != null && hydration.status !== 'unreadable';
  const storageUnreadable = hydration?.status === 'unreadable';

  /** Always the latest committed state, readable synchronously. */
  const dataRef = useRef<AppData>(data);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<AppData | null>(null);
  /** Set during hydration when a payload had to be rescued; reported once. */
  const corruptNotice = useRef<string | null>(null);
  /**
   * Set when the stored payload came from a newer build. Suppresses writing
   * until the user changes something, so fields this build does not know
   * about are not deleted by a migration round-trip.
   */
  const downgradeHold = useRef(false);
  const downgradeNotice = useRef(false);
  /**
   * What the launch learned about how the payload arrived, for the photo
   * sweep. An empty log in memory is only evidence of an empty log on disk
   * when the payload actually loaded and parsed.
   */
  const launchFacts = useRef<Omit<LaunchHydration, 'status'>>({
    parsed: false,
    downgrade: false,
    measurementsAltered: false,
  });
  /** The undo currently on offer, so its `onExpire` fires exactly once. */
  const pendingUndo = useRef<UndoAction | null>(null);
  /**
   * True between a failed save and the next successful one. Keeps the warning
   * to once per run of failures rather than once per keystroke, and clears
   * itself so a second spell of trouble is reported again.
   */
  const writeFailed = useRef(false);

  // ── commit ─────────────────────────────────────────────────────────────────

  /**
   * The only way state changes. Moves the ref first so anything computed on
   * the next line — or by a second action in the same tick — sees this write.
   */
  const commit = useCallback((next: AppData) => {
    // The first change after a downgrade releases the write hold: the user's
    // edit is now the newest thing there is, so it should be saved.
    downgradeHold.current = false;
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

  /**
   * Closes the window on the undo that is currently offered.
   *
   * `taken` decides what that means: the user pressed Undo, so the pending
   * cleanup is abandoned — or the window simply ran out, and whatever was
   * waiting on it can now happen for good.
   */
  const settleUndo = useCallback((taken: boolean) => {
    const pending = pendingUndo.current;
    pendingUndo.current = null;
    if (pending && !taken) pending.onExpire?.();
  }, []);

  const showToast = useCallback((message: string, undoable?: UndoAction) => {
    // A new toast replaces the old one, so the previous window is over.
    settleUndo(false);
    pendingUndo.current = undoable ?? null;

    setToast(message);
    setUndo(
      undoable
        ? {
            ...undoable,
            // Taking the undo cancels the cleanup that was waiting on it.
            run: () => {
              settleUndo(true);
              undoable.run();
            },
          }
        : null,
    );
    if (toastTimer.current) clearTimeout(toastTimer.current);
    // An undoable toast lingers longer — it is asking a question, not just
    // reporting, and 2.4 s is not enough time to decide.
    toastTimer.current = setTimeout(
      () => {
        settleUndo(false);
        setToast('');
        setUndo(null);
      },
      undoable ? 5000 : 2400,
    );
  }, [settleUndo]);

  // ── hydration ──────────────────────────────────────────────────────────────

  /**
   * Copies the payload a migration is about to replace, then prunes all but
   * the newest two. Failures are swallowed: a snapshot that cannot be written
   * is a shame, but refusing to open the app over it would be worse.
   */
  const keepSnapshot = useCallback(async (raw: string, fromVersion: number) => {
    try {
      await AsyncStorage.setItem(premigrationKey(fromVersion), raw);
      const stale = snapshotsToPrune(await AsyncStorage.getAllKeys() as string[]);
      if (stale.length) await AsyncStorage.multiRemove(stale);
    } catch {
      /* best effort — never block startup on a backup copy */
    }
  }, []);

  /**
   * Loads the stored payload, or reports that it could not be loaded.
   *
   * The one rule that matters here: a read that *throws* is not an empty log.
   * `readStoredPayload` retries, and if storage still will not answer this
   * leaves `hydration` at `unreadable` — which keeps `hydrated` false, which
   * keeps the persist effect from running. Nothing is written over data that
   * might still be there. Root shows a retry screen instead of an empty app.
   */
  const hydrate = useCallback(async () => {
    const result = await readStoredPayload({ read: () => AsyncStorage.getItem(STORAGE_KEY) });

    if (result.status === 'unreadable') {
      if (__DEV__) console.warn('[store] storage unreadable after retries', result.error);
      setHydration(result);
      return;
    }

    if (result.status === 'loaded') {
      let parsed: unknown = null;
      let readable = true;
      try {
        parsed = JSON.parse(result.raw);
      } catch {
        readable = false;
      }

      launchFacts.current = { parsed: readable, downgrade: false, measurementsAltered: false };

      if (!readable) {
        // Rescue the bytes before anything can write over them. Persistence
        // is gated on `hydrated`, which is only set below, so this await
        // always wins the race against the first save.
        const backupKey = `${CORRUPT_KEY_PREFIX}${Date.now()}`;
        try {
          await AsyncStorage.setItem(backupKey, result.raw);
          corruptNotice.current = backupKey;
        } catch {
          corruptNotice.current = 'unsaved';
        }
      } else {
        const migrated = migrate(parsed);

        // Counted rather than matched on note wording: if migration produced
        // fewer measurement rows than the payload held, some were dropped,
        // and the photos they referenced may still be wanted.
        const storedRows = Array.isArray((parsed as { measurements?: unknown })?.measurements)
          ? ((parsed as { measurements: unknown[] }).measurements).length
          : 0;
        launchFacts.current.measurementsAltered =
          storedRows !== migrated.data.measurements.length ||
          migrated.notes.some((note) => note.includes('measurement'));

        // Keep the bytes a migration is about to replace. Awaited before
        // anything can be written, for the same reason the corrupt rescue is.
        if (shouldSnapshot(migrated)) {
          await keepSnapshot(result.raw, migrated.fromVersion);
        }

        commit(migrated.data);

        // Data from a newer build can hold fields this one drops, so writing
        // it back would delete them. Hold off until the user edits something
        // — at that point their change is the newer truth.
        if (isDowngrade(migrated.fromVersion)) {
          downgradeHold.current = true;
          downgradeNotice.current = true;
          launchFacts.current.downgrade = true;
        }

        if (migrated.notes.length && __DEV__) {
          // Not shown to the user: a repaired field is not their problem,
          // and the log is what matters for diagnosing it.
          console.warn('[store] migration notes', migrated.fromVersion, migrated.notes);
        }
      }
    }

    setHydration(result);
  }, [commit, keepSnapshot]);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  /** For the retry button on the "couldn't open your data" screen. */
  const retryHydration = useCallback(() => {
    setHydration(null);
    void hydrate();
  }, [hydrate]);

  /**
   * Tidies up anything a cut-short undo window left behind — the app being
   * killed mid-toast, say.
   *
   * Only safe when the payload loaded cleanly. On the corrupt path the app is
   * running on `emptyData()` while the rescued copy still references every
   * photo, so a sweep here would delete the lot and leave the rescue
   * worthless. `maySweepPhotos` is what refuses that, and the other states
   * where the measurements in memory are not the whole story.
   */
  useEffect(() => {
    if (!hydration) return;
    sweepOrphanedPhotos(dataRef.current.measurements, {
      kind: 'launch',
      hydration: { status: hydration.status, ...launchFacts.current },
    });
  }, [hydration]);

  /** Told once, after hydration, so the message is not lost to a re-render. */
  useEffect(() => {
    if (!hydrated || !downgradeNotice.current) return;
    downgradeNotice.current = false;
    showToast('Your data was saved by a newer version — nothing will be overwritten until you change something');
  }, [hydrated, showToast]);

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

  /**
   * Writes the pending state, and says something if it cannot.
   *
   * A failed save used to be swallowed entirely, so someone whose phone was
   * out of space could log for weeks against nothing. Now they are told once
   * — once, because the debounce fires on every keystroke and a toast per
   * character would be its own kind of broken — and the next change tries
   * again regardless.
   */
  const flushWrite = useCallback(() => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
    const pending = pendingWrite.current;
    if (!pending) return;
    pendingWrite.current = null;

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(pending))
      .then(() => {
        writeFailed.current = false;
      })
      .catch(() => {
        // Put it back, unless something newer is already queued — otherwise a
        // failure with no further edits would leave the change only in memory
        // and never try again.
        if (!pendingWrite.current) pendingWrite.current = pending;

        if (writeFailed.current) return;
        writeFailed.current = true;
        showToast(
          "Couldn't save — your phone may be low on storage. Export a backup from Settings.",
        );
      });
  }, [showToast]);

  useEffect(() => {
    if (!mayPersist(hydration) || downgradeHold.current) return;
    pendingWrite.current = data;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(flushWrite, PERSIST_DEBOUNCE_MS);
  }, [data, hydration, flushWrite]);

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

      if (!Number.isFinite(weightKg)) return 'not-a-number';
      if (weightKg < 30 || weightKg > 400) return 'out-of-range';
      if (date > todayKey()) return 'future';

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
      } else if (date < prev.profile.startDate) {
        // Logging never fails — the entry is saved. But stats and habit ticks
        // are anchored to the start date, so a day before it would sit outside
        // every roll-up. Offer to move the anchor rather than refusing.
        showToast('Saved — that day is before your plan started', {
          label: 'Move start',
          run: () =>
            update((current) => ({
              ...current,
              profile: { ...current.profile, startDate: date },
            })),
        });
      } else {
        showToast(date === todayKey() ? 'Weigh-in saved for today' : 'Weigh-in saved');
      }
      return null;
    },
    [commit, update, showToast],
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

  const updateMeal = useCallback<StoreValue['updateMeal']>(
    (id, patch) => {
      update((prev) => {
        const i = prev.meals.findIndex((m) => m.id === id);
        if (i < 0) return prev;
        const meals = prev.meals.slice();
        meals[i] = { ...meals[i], ...patch };
        const next: AppData = { ...prev, meals };
        // The date can move, so both days' roll-ups are recomputed.
        const withOld = { ...next, entries: applyLogRollup(next, prev.meals[i].logDate) };
        return { ...withOld, entries: applyLogRollup(withOld, meals[i].logDate) };
      });
    },
    [update],
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

  const updateWorkout = useCallback<StoreValue['updateWorkout']>(
    (id, patch) => {
      update((prev) => {
        const i = prev.workouts.findIndex((w) => w.id === id);
        if (i < 0) return prev;
        const workouts = prev.workouts.slice();
        workouts[i] = { ...workouts[i], ...patch };
        const next: AppData = { ...prev, workouts };
        const withOld = { ...next, entries: applyLogRollup(next, prev.workouts[i].logDate) };
        return { ...withOld, entries: applyLogRollup(withOld, workouts[i].logDate) };
      });
    },
    [update],
  );

  const updateMeasurement = useCallback<StoreValue['updateMeasurement']>(
    (id, patch) => {
      update((prev) => ({
        ...prev,
        measurements: prev.measurements
          .map((m) => (m.id === id ? { ...m, ...patch } : m))
          .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
      }));
    },
    [update],
  );

  /**
   * Deletes a measurement set, offering it back.
   *
   * The photo file is *not* deleted here. Removing it now would make the undo
   * a lie: the row would come back pointing at an image that no longer exists.
   * It goes once the window closes instead.
   */
  const removeMeasurement = useCallback<StoreValue['removeMeasurement']>(
    (id) => {
      const prev = dataRef.current;
      const removed = prev.measurements.find((m) => m.id === id);
      if (!removed) return;

      commit({ ...prev, measurements: prev.measurements.filter((m) => m.id !== id) });

      showToast('Measurement deleted', {
        label: 'Undo',
        run: () =>
          update((current) => ({
            ...current,
            measurements: current.measurements
              .concat(removed)
              .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
          })),
        onExpire: () => sweepOrphanedPhotos(dataRef.current.measurements, { kind: 'user-action' }),
      });
    },
    [commit, update, showToast],
  );

  /**
   * Clearing a weigh-in leaves the day's other fields alone — the user is
   * removing a bad number, not the day. Undoable like every other delete.
   */
  const removeWeighIn = useCallback<StoreValue['removeWeighIn']>(
    (date) => {
      const prev = dataRef.current;
      const entry = prev.entries.find((e) => e.logDate === date);
      if (!entry || entry.weightKg == null) return;
      const previousWeight = entry.weightKg;

      commit({
        ...prev,
        entries: prev.entries.map((e) => (e.logDate === date ? { ...e, weightKg: null } : e)),
      });

      showToast('Weigh-in cleared', {
        label: 'Undo',
        run: () =>
          update((current) => ({
            ...current,
            entries: current.entries.map((e) =>
              e.logDate === date ? { ...e, weightKg: previousWeight } : e,
            ),
          })),
      });
    },
    [commit, update, showToast],
  );

  /**
   * One measurement set per day. Saving a second for a day that already has
   * one replaces it — and because that silently discards real numbers, the
   * replaced set goes into the undo closure.
   */
  const addMeasurement = useCallback<StoreValue['addMeasurement']>(
    (m) => {
      const prev = dataRef.current;
      const replaced = prev.measurements.find((x) => x.logDate === m.logDate);
      // Re-measuring a day should not silently orphan that day's photo file —
      // the new set inherits it unless the caller supplied one of its own.
      const photo = m.photo ?? replaced?.photo ?? null;

      commit({
        ...prev,
        measurements: prev.measurements
          .filter((x) => x.logDate !== m.logDate)
          .concat({ ...m, photo, id: `meas-${Date.now()}` })
          .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
      });

      if (!replaced) {
        showToast(prev.measurements.length ? 'Measurement saved' : 'Baseline recorded');
        return;
      }

      showToast('Measurement replaced', {
        label: 'Undo',
        run: () =>
          update((current) => ({
            ...current,
            measurements: current.measurements
              .filter((x) => x.logDate !== replaced.logDate)
              .concat(replaced)
              .sort((a, b) => (a.logDate < b.logDate ? -1 : 1)),
          })),
      });
    },
    [commit, update, showToast],
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
              // A reset or a restore can orphan every photo at once, but the
              // files have to survive the undo — which would hand back
              // measurements that still point at them.
              onExpire: () => sweepOrphanedPhotos(dataRef.current.measurements, { kind: 'user-action' }),
            }
          : // Nothing to offer back, so nothing is waiting: sweep now.
            undefined,
      );

      if (!hasAnyData(snapshot)) sweepOrphanedPhotos(next.measurements, { kind: 'user-action' });
    },
    [commit, showToast],
  );

  const setLock = useCallback<StoreValue['setLock']>(
    (patch) => {
      update((prev) => ({ ...prev, lock: { ...prev.lock, ...patch } }));
    },
    [update],
  );

  const setDiagnostics = useCallback<StoreValue['setDiagnostics']>(
    (patch) => {
      update((prev) => ({ ...prev, diagnostics: { ...prev.diagnostics, ...patch } }));
    },
    [update],
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

  const exportBackup = useCallback<StoreValue['exportBackup']>(
    async (includePhotos = false) => {
      try {
        const data = dataRef.current;
        // Photos roughly double in size as base64, so carrying them is a
        // separate choice rather than the default.
        const photos = includePhotos
          ? readAsBase64(
              Object.fromEntries(
                data.measurements.filter((m) => m.photo).map((m) => [m.id, m.photo as string]),
              ),
            )
          : undefined;
        showToast(await shareBackup(data, photos));
      } catch {
        showToast('Could not write the backup — try again');
      }
    },
    [showToast],
  );

  const previewRestore = useCallback<StoreValue['previewRestore']>(async () => {
    try {
      const picked = await pickBackup();
      if (picked.canceled) return null;
      if (!picked.ok) {
        showToast(picked.reason);
        return null;
      }
      return {
        data: picked.data,
        exportedAt: picked.exportedAt,
        summary: describeData(picked.data),
        photos: picked.photos,
      };
    } catch {
      showToast('Could not read that file — try again');
      return null;
    }
  }, [showToast]);

  /**
   * A restore replaces everything, so the outgoing dataset goes into the undo
   * closure exactly as the demo and reset paths do.
   */
  const applyRestore = useCallback<StoreValue['applyRestore']>(
    (preview) => {
      // Photo *bytes* travel in a backup; photo *paths* do not survive the
      // trip, so the files are written here, at the point of no return, and
      // every measurement is re-pointed at what actually landed on this device.
      replaceAll(
        applyRestoredPhotos(preview.data, restorePhotos(preview.photos)),
        'Backup restored',
      );
    },
    [replaceAll],
  );

  const previewCsvImport = useCallback<StoreValue['previewCsvImport']>(async () => {
    try {
      const picked = await pickWeighInCsv();
      if (picked.canceled) return null;
      if (!picked.rows.length) {
        showToast(picked.warning ?? 'No weigh-ins found in that file');
        return null;
      }
      const preview = previewMerge(dataRef.current.entries, picked.rows);
      return {
        fileName: picked.name,
        rows: picked.rows,
        newCount: preview.newDates.length,
        conflictCount: preview.conflictDates.length,
        identicalCount: preview.identicalDates.length,
        skipped: picked.skipped,
        warning: picked.warning,
      };
    } catch {
      showToast('Could not read that file — try again');
      return null;
    }
  }, [showToast]);

  /**
   * Merging adds days and may overwrite existing ones, so it is undoable the
   * same way a delete is — the whole previous log goes in the closure.
   */
  const applyCsvImport = useCallback<StoreValue['applyCsvImport']>(
    (rows, onConflict) => {
      const snapshot = dataRef.current;
      const merged = mergeWeighIns(snapshot.entries, rows, onConflict);
      const added = merged.length - snapshot.entries.length;

      commit({ ...snapshot, entries: merged });

      showToast(added > 0 ? `Imported — ${added} new day(s)` : 'Imported', {
        label: 'Undo',
        run: () => commit(snapshot),
      });
    },
    [commit, showToast],
  );

  const value = useMemo<StoreValue>(
    () => ({
      data,
      hydrated,
      storageUnreadable,
      retryHydration,
      cursor,
      setCursor,
      toast,
      showToast,
      undo,
      dismissUndo: () => {
        settleUndo(false);
        setUndo(null);
      },
      celebration,
      dismissCelebration: () => setCelebration(null),
      saveWeighIn,
      updateEntry,
      addMeal,
      updateMeal,
      removeMeal,
      addWorkout,
      updateWorkout,
      removeWorkout,
      addMeasurement,
      updateMeasurement,
      removeMeasurement,
      removeWeighIn,
      setReward,
      updateProfile,
      completeOnboarding,
      replayOnboarding,
      setNotification,
      setLock,
      setDiagnostics,
      loadDemo,
      resetAll,
      exportCsv,
      exportBackup,
      previewRestore,
      applyRestore,
      previewCsvImport,
      applyCsvImport,
    }),
    [
      data,
      hydrated,
      storageUnreadable,
      retryHydration,
      cursor,
      toast,
      showToast,
      undo,
      settleUndo,
      celebration,
      saveWeighIn,
      updateEntry,
      addMeal,
      updateMeal,
      removeMeal,
      addWorkout,
      updateWorkout,
      removeWorkout,
      addMeasurement,
      updateMeasurement,
      removeMeasurement,
      removeWeighIn,
      setReward,
      updateProfile,
      completeOnboarding,
      replayOnboarding,
      setNotification,
      setLock,
      setDiagnostics,
      loadDemo,
      resetAll,
      exportCsv,
      exportBackup,
      previewRestore,
      applyRestore,
      previewCsvImport,
      applyCsvImport,
    ],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error('useStore must be used inside <StoreProvider>');
  return ctx;
}
