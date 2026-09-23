import { useMemo, useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { CsvImportPreview, RestorePreview, useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { describeData, hasAnyData } from '../data/schema';
import {
  ACTIVITY_LEVELS,
  ActivityLevel,
  DiagnosticsSettings,
  GOAL_TYPES,
  GoalType,
  LockSettings,
  CustomReminder,
  NotificationSettings,
  ReminderTime,
  ReminderToggle,
  WATER_INTERVALS,
  Sex,
  Units,
} from '../data/types';
import { Card, Grid } from '../components/Card';
import { GhostButton, NumberField, PrimaryButton, SectionHeading, Segmented, Toggle, ValueRow } from '../components/Controls';
import { ConfirmDialog, Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption, Title } from '../components/Type';
import {
  birthYearForAge,
  bmi,
  bmiBand,
  currentAge,
  currentWeight,
  expectedLossPerWeek,
  healthyWeightRange,
  int,
  bmr as restingBurn,
  plannedDailyDeficit,
  requiredPacePerWeek,
  tdee as maintenance,
} from '../lib/calc';
import { formatMedium } from '../lib/date';
import { ConflictChoice } from '../lib/backup';
import { checkCalorieTarget, checkGoalWeight, isAdult, UNDER_18_NOTICE } from '../lib/health';
import { formatBytes, totalPhotoBytes } from '../lib/photos';
import { remindersSupported, sendTestReminder } from '../lib/notifications';
import { daysLabel, minutesLabel, shiftMinutes, waterCheckTimes } from '../lib/reminderRules';
import { MAX_CUSTOM_REMINDERS } from '../data/schema';
import { parseDecimalInput } from '../lib/numberInput';

/** How many measurements still have a photo file behind them. */
function photoCount(data: { measurements: { photo?: string | null }[] }): number {
  return data.measurements.filter((m) => !!m.photo).length;
}

/** One line that says what is on, so Settings still answers the question. */
function lockSummary(lock: LockSettings, diagnostics: DiagnosticsSettings): string {
  const parts = [
    lock.enabled ? 'App lock is on' : 'App lock is off',
    diagnostics.crashReports ? 'crash reports are kept' : 'crash reports are off',
  ];
  return `${parts.join(', ')}. Everything stays on this device unless you export it.`;
}

/** " and 3 photos", or nothing at all — the backup only carries them on request. */
function photosIn(photos: Record<string, string>): string {
  const count = Object.keys(photos).length;
  if (!count) return '';
  return ` and ${count} ${count === 1 ? 'photo' : 'photos'}`;
}

type DaysKey = 'weighDays' | 'eveningDays' | 'waterDays';

const REMINDERS: { key: ReminderToggle; label: string; sub: string; time?: ReminderTime; days?: DaysKey }[] = [
  { key: 'morningWeighIn', label: 'Morning weigh-in', sub: 'Skipped once you have weighed in', time: 'morningMinutes', days: 'weighDays' },
  { key: 'eveningLog', label: 'Evening check-in', sub: 'Only if under 3 habits are ticked', time: 'eveningMinutes', days: 'eveningDays' },
  { key: 'water', label: 'Water', sub: 'Repeats through the day; stops once you hit your target', days: 'waterDays' },
  { key: 'weeklySummary', label: 'Weekly summary', sub: 'Every 7 days from your start date' },
  { key: 'milestoneReached', label: 'Milestone reached', sub: 'Once, the first time you cross one' },
];

export function SettingsScreen({
  onBack,
  onOpenPrivacy,
}: {
  onBack: () => void;
  onOpenPrivacy: () => void;
}) {
  const { colors, preference, setPreference } = useTheme();
  const {
    data,
    setNotification,
    setReminderTime,
    setReminderDays,
    saveCustomReminder,
    removeCustomReminder,
    updateProfile,
    replayOnboarding,
    loadDemo,
    resetAll,
    exportCsv,
    exportBackup,
    previewRestore,
    applyRestore,
    previewCsvImport,
    applyCsvImport,
    showToast,
  } = useStore();
  const { u } = useDerived();
  const { profile, entries } = data;

  const [planSheet, setPlanSheet] = useState(false);
  const [editingReminder, setEditingReminder] = useState<CustomReminder | null>(null);
  const [targetSheet, setTargetSheet] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [restore, setRestore] = useState<RestorePreview | null>(null);
  const [csvImport, setCsvImport] = useState<CsvImportPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const photoBytes = useMemo(
    () => totalPhotoBytes(data.measurements.map((m) => m.photo).filter((p): p is string => !!p)),
    [data.measurements],
  );

  const current = currentWeight(entries, profile);
  const bmiValue = bmi(current, profile.heightCm);
  const healthy = healthyWeightRange(profile.heightCm);
  const bmrValue = restingBurn(current, profile);
  const tdeeValue = maintenance(current, profile);
  const deficit = plannedDailyDeficit(current, profile);

  return (
    <Screen title="Settings" meta="Profile" onBack={onBack}>
      <SectionHeading title="Your plan" />
      <Card padded={false} hero style={{ paddingHorizontal: 18 }}>
        <ValueRow label="Start date" value={formatMedium(profile.startDate)} />
        <ValueRow label="Starting weight" value={u.weight(profile.startWeightKg)} />
        <ValueRow label="Goal weight" value={u.weight(profile.goalWeightKg)} />
        <ValueRow label="Height" value={u.height(profile.heightCm)} />
        <ValueRow label="Age" value={`${currentAge(profile)} yrs`} />
        <ValueRow label="Sex" value={profile.sex} />
        <ValueRow label="Activity level" value={profile.activityLevel} last />
      </Card>
      <GhostButton label="Edit plan" onPress={() => setPlanSheet(true)} />

      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Daily targets" />
      </View>
      <Card padded={false} hero style={{ paddingHorizontal: 18 }}>
        <ValueRow label="Calories" value={`${int(profile.targetCalories)} kcal`} />
        <ValueRow label="Protein" value={`${profile.targetProteinG} g`} />
        <ValueRow label="Water" value={u.volume(profile.targetWaterL)} />
        <ValueRow label="Steps" value={int(profile.targetSteps)} />
        <ValueRow label="Sleep" value={`${profile.targetSleepH} h`} last />
      </Card>
      <GhostButton label="Edit targets" onPress={() => setTargetSheet(true)} />

      {/* ── notifications ───────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Notifications" />
      </View>
      <View style={{ gap: space.sm }}>
        {REMINDERS.map((reminder) => {
          const on = data.notifications[reminder.key];
          const minutes = reminder.time ? data.notifications[reminder.time] : null;
          return (
            <Card key={reminder.key} style={{ paddingHorizontal: 17, paddingVertical: 13, gap: space.sm }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
                <View style={{ flex: 1, gap: 1 }}>
                  <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>{reminder.label}</Body>
                  <Caption style={{ fontSize: 11.5, lineHeight: 16 }}>{reminder.sub}</Caption>
                </View>
                <Toggle
                  value={on}
                  accessibilityLabel={reminder.label}
                  onChange={(next) => setNotification(reminder.key, next)}
                />
              </View>
              {reminder.time && minutes != null && on && (
                <TimeStepper
                  label={reminder.label}
                  minutes={minutes}
                  onChange={(next) => setReminderTime(reminder.time!, next)}
                />
              )}
              {reminder.key === 'water' && on && (
                <WaterSchedule
                  settings={data.notifications}
                  onTime={setReminderTime}
                  onOnlyBehind={(next) => setNotification('waterOnlyBehind', next)}
                />
              )}
              {reminder.days && on && (
                <DayPicker
                  label={reminder.label}
                  days={data.notifications[reminder.days]}
                  onChange={(days) => setReminderDays(reminder.days!, days)}
                />
              )}
            </Card>
          );
        })}
      </View>

      {/* ── the user's own reminders ────────────────────────────────────── */}
      <View style={{ marginTop: space.md }}>
        <SectionHeading title="Your reminders" trailing={`${data.notifications.custom.length} of ${MAX_CUSTOM_REMINDERS}`} />
      </View>
      <View style={{ gap: space.sm }}>
        {data.notifications.custom.map((r) => (
          <Card key={r.id} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingRight: 17 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${r.label}`}
                onPress={() => setEditingReminder(r)}
                style={{ flex: 1, paddingLeft: 17, paddingVertical: 13, gap: 1 }}
              >
                <Body style={{ fontFamily: font.semibold, fontSize: 14 }} numberOfLines={1}>
                  {r.label}
                </Body>
                <Caption style={{ fontSize: 11.5 }}>
                  {minutesLabel(r.minutes)} · {daysLabel(r.days)}
                </Caption>
              </Pressable>
              <Toggle
                value={r.enabled}
                accessibilityLabel={`${r.label} on`}
                onChange={(enabled) => saveCustomReminder({ ...r, enabled })}
              />
            </View>
          </Card>
        ))}
        {data.notifications.custom.length < MAX_CUSTOM_REMINDERS && (
          <GhostButton
            label="Add a reminder"
            dashed
            onPress={() =>
              setEditingReminder({
                id: `r-${Date.now()}`,
                label: '',
                minutes: 8 * 60,
                days: [0, 1, 2, 3, 4, 5, 6],
                enabled: true,
              })
            }
          />
        )}
      </View>
      <ReminderSheet
        reminder={editingReminder}
        isNew={editingReminder != null && !data.notifications.custom.some((r) => r.id === editingReminder.id)}
        onClose={() => setEditingReminder(null)}
        onSave={(r) => {
          saveCustomReminder(r);
          setEditingReminder(null);
        }}
        onDelete={(id) => {
          removeCustomReminder(id);
          setEditingReminder(null);
        }}
      />
      {remindersSupported ? (
        <GhostButton
          label="Send a test notification"
          tone="muted"
          onPress={async () => {
            const sent = await sendTestReminder().catch(() => false);
            showToast(sent ? 'Sent — it arrives in a few seconds' : 'Notifications are blocked in system settings');
          }}
        />
      ) : (
        <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
          Expo Go on Android can't show phone notifications, so these reach you in the bell on Today
          instead. The installed app (a development or store build) delivers them to your lock screen
          too — the switches and times here carry over.
        </Caption>
      )}

      {/* ── units ───────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Units" />
      </View>
      <Segmented
        options={['metric', 'imperial'] as const}
        value={profile.units}
        onChange={(units: Units) => updateProfile({ units })}
      />
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        Display only — everything is stored in kilograms and centimetres, so switching back and forth never loses
        precision.
      </Caption>

      {/* ── appearance ──────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Appearance" />
      </View>
      <Segmented
        options={['system', 'light', 'dark'] as const}
        value={preference}
        onChange={setPreference}
      />

      {/* ── read-only calculated block ──────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Calculated for you" trailing="Read-only" />
      </View>
      {!isAdult(profile) ? (
        <Card hero style={{ padding: 18, gap: space.sm }}>
          <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Targets are off for now</Body>
          <Body style={{ fontSize: 13.5, lineHeight: 20 }} color={colors.muted}>
            {UNDER_18_NOTICE}
          </Body>
        </Card>
      ) : (
      <Card padded={false} hero style={{ paddingHorizontal: 18 }}>
        <ValueRow label="BMI" note="weight ÷ height²" value={bmiValue.toFixed(1)} />
        <ValueRow label="Classification" note="WHO bands" value={bmiBand(bmiValue)} />
        <ValueRow
          label="Healthy weight range"
          note="BMI 18.5–24.9 at your height"
          value={`${u.weightValue(healthy.lowKg)}–${u.weight(healthy.highKg)}`}
        />
        <ValueRow
          label="Resting burn (BMR)"
          note="Mifflin-St Jeor, recalculated as you lose"
          value={`${int(bmrValue)} kcal`}
        />
        <ValueRow label="Maintenance (TDEE)" note="BMR × activity factor" value={`${int(tdeeValue)} kcal`} />
        <ValueRow label="Planned daily deficit" note="TDEE − calorie target" value={`${int(deficit)} kcal`} />
        <ValueRow
          label="Expected loss at target"
          note="7 700 kcal ≈ 1 kg"
          value={`${u.weight(expectedLossPerWeek(current, profile))}/week`}
        />
        <ValueRow
          label="Required pace"
          note="To reach goal inside 730 days"
          value={`${u.weight(requiredPacePerWeek(profile))}/week`}
          last
        />
      </Card>
      )}

      {/* ── privacy ─────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Privacy" />
      </View>
      <GhostButton label="App lock, crash reports and what leaves" onPress={onOpenPrivacy} />
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        {lockSummary(data.lock, data.diagnostics)}
      </Caption>

      {/* ── backup ──────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Backup" />
      </View>
      <GhostButton label="Back up everything (JSON)" onPress={() => void exportBackup(false)} />
      {photoBytes > 0 && (
        <GhostButton
          label={`Back up with photos (adds ~${formatBytes(photoBytes)})`}
          tone="muted"
          onPress={() => void exportBackup(true)}
        />
      )}
      <GhostButton
        label="Restore from backup"
        tone="muted"
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const preview = await previewRestore();
            if (preview) setRestore(preview);
          } finally {
            setBusy(false);
          }
        }}
      />
      <GhostButton
        label="Import weigh-ins from CSV"
        tone="muted"
        onPress={async () => {
          if (busy) return;
          setBusy(true);
          try {
            const preview = await previewCsvImport();
            if (preview) setCsvImport(preview);
          } finally {
            setBusy(false);
          }
        }}
      />
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        A backup is one JSON file holding everything, and it is what a restore reads. Progress photos
        are left out unless you choose to include them, because they make the file much bigger. CSV is
        for spreadsheets — importing one merges weigh-ins by date and leaves meals, workouts and
        measurements alone.
      </Caption>

      {/* ── data ────────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Data" />
      </View>
      <GhostButton label="Export everything as CSV" onPress={exportCsv} />
      <GhostButton label="Replay onboarding" tone="muted" onPress={replayOnboarding} />
      <GhostButton
        label="Load the 8-week demo journey"
        tone="muted"
        onPress={() => (hasAnyData(data) ? setConfirmDemo(true) : loadDemo())}
      />
      <GhostButton label="Reset everything" tone="muted" onPress={() => setConfirmReset(true)} />
      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.sm, paddingHorizontal: space.xs }}>
        Everything lives on this device. The demo journey fills in eight weeks of weigh-ins so the populated screens
        are reachable without waiting — it replaces whatever is logged now, and you can undo it from the toast.
      </Caption>

      <ConfirmDialog
        visible={restore !== null}
        title="Restore this backup?"
        body={
          restore
            ? `The backup holds ${restore.summary}${
                photosIn(restore.photos)
              }${
                restore.exportedAt ? `, saved ${formatMedium(restore.exportedAt.slice(0, 10))}` : ''
              }. Restoring replaces your current data (${describeData(data)}). You can undo this from the toast that follows.`
            : ''
        }
        confirmLabel="Restore it"
        destructive
        onCancel={() => setRestore(null)}
        onConfirm={() => {
          const picked = restore;
          setRestore(null);
          if (picked) applyRestore(picked);
        }}
      />

      <CsvImportDialog
        preview={csvImport}
        onCancel={() => setCsvImport(null)}
        onConfirm={(choice) => {
          const picked = csvImport;
          setCsvImport(null);
          if (picked) applyCsvImport(picked.rows, choice);
        }}
      />

      <PlanSheet visible={planSheet} onClose={() => setPlanSheet(false)} />
      <TargetSheet visible={targetSheet} onClose={() => setTargetSheet(false)} />

      {/* Both actions replace the whole dataset, so both ask first and both
          leave an Undo on the toast. */}
      <ConfirmDialog
        visible={confirmDemo}
        title="Replace your log with the demo?"
        body={`You have ${describeData(data)}. Loading the demo journey replaces all of it. You can undo this from the toast that follows, or export a copy first.`}
        confirmLabel="Load the demo"
        destructive
        onCancel={() => setConfirmDemo(false)}
        onConfirm={() => {
          setConfirmDemo(false);
          loadDemo();
        }}
      />

      <ConfirmDialog
        visible={confirmReset}
        title="Reset everything?"
        body={`You have ${describeData(data)}. Resetting clears all of it${
          photoCount(data) ? `, and deletes ${photoCount(data) === 1 ? 'the progress photo' : `all ${photoCount(data)} progress photos`} from this device` : ''
        }. You can undo this from the toast that follows, but not after it disappears — export a copy first if you want to keep it.`}
        confirmLabel="Delete it all"
        destructive
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false);
          resetAll();
        }}
      />
    </Screen>
  );
}

// ── edit sheets ──────────────────────────────────────────────────────────────

function PlanSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateProfile, showToast } = useStore();
  const { u } = useDerived();
  const { profile } = data;

  // Fields hold display units; every bound is checked against metric.
  const [startWeight, setStartWeight] = useState(u.weightField(profile.startWeightKg));
  const [goalWeight, setGoalWeight] = useState(u.weightField(profile.goalWeightKg));
  const [height, setHeight] = useState(u.lengthField(profile.heightCm));
  const [age, setAge] = useState(String(currentAge(profile)));
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);
  const [goalType, setGoalType] = useState<GoalType>(profile.goalType);
  /** The goal weight the user has already been warned about and kept. */
  const [acknowledged, setAcknowledged] = useState<number | null>(null);

  const submit = () => {
    const sw = u.parseWeight(startWeight);
    const gw = u.parseWeight(goalWeight);
    const h = u.parseLength(height);
    const a = Number.parseInt(age, 10);

    if (sw == null || sw < 30 || sw > 400)
      return showToast(`Starting weight must be ${u.weightValue(30)}–${u.weight(400)}`);
    if (gw == null || gw < 30 || gw > 400)
      return showToast(`Goal weight must be ${u.weightValue(30)}–${u.weight(400)}`);
    // Maintaining means holding at a weight, so the goal is allowed to equal
    // or exceed where you started — only a countdown needs it to be below.
    if (goalType === 'lose' && gw >= sw)
      return showToast('To lose weight, your goal has to be below your starting weight');

    if (h == null || h < 100 || h > 250)
      return showToast(`Height must be ${u.height(100)}–${u.height(250)}`);
    if (!Number.isFinite(a) || a < 14 || a > 100) return showToast('Age must be 14–100');

    // Checked after height, since the BMI bands depend on it. A goal under
    // BMI 17 is refused outright; between 17 and 18.5 it warns once and saves
    // on the second tap, so the choice stays the user's.
    const goalCheck = checkGoalWeight(gw, { ...profile, heightCm: h });
    if (goalCheck.error) return showToast(goalCheck.error);
    if (goalCheck.warning && acknowledged !== gw) {
      setAcknowledged(gw);
      return showToast(goalCheck.warning);
    }

    updateProfile({
      startWeightKg: sw,
      goalWeightKg: gw,
      heightCm: h,
      birthYear: birthYearForAge(a),
      sex,
      activityLevel: activity,
      goalType,
    });
    onClose();
    showToast('Plan updated');
  };

  return (
    <Sheet visible={visible} title="Edit plan" onClose={onClose}>
      <Grid columns={2}>
        <NumberField label="Starting weight" unit={u.labels.weight} value={startWeight} onChangeText={setStartWeight} />
        <NumberField label="Goal weight" unit={u.labels.weight} value={goalWeight} onChangeText={setGoalWeight} />
        <NumberField label="Height" unit={u.labels.length} value={height} onChangeText={setHeight} />
        <NumberField label="Age" unit="yrs" value={age} onChangeText={setAge} />
      </Grid>
      <View style={{ gap: space.sm }}>
        <Caption style={{ fontSize: 11.5 }}>What is the plan?</Caption>
        <Segmented options={GOAL_TYPES} value={goalType} onChange={setGoalType} />
        {goalType === 'maintain' && (
          <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
            Maintaining swaps the countdown for a target band of ±1.5 kg. Milestones and the projected goal date
            switch off — there is nowhere to arrive.
          </Caption>
        )}
      </View>

      <Segmented options={['Male', 'Female'] as const} value={sex} onChange={setSex} />
      <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
        Sex is used only for the resting-burn constant (+5 / −161).
      </Caption>
      <Segmented options={ACTIVITY_LEVELS} value={activity} onChange={setActivity} />
      <PrimaryButton label="Save plan" onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}

function TargetSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateProfile, showToast } = useStore();
  const { u, currentKg: current } = useDerived();
  const { profile } = data;

  const [calories, setCalories] = useState(String(profile.targetCalories));
  const [protein, setProtein] = useState(String(profile.targetProteinG));
  const [water, setWater] = useState(u.volumeField(profile.targetWaterL));
  const [steps, setSteps] = useState(String(profile.targetSteps));
  const [sleep, setSleep] = useState(String(profile.targetSleepH));
  /** The target the user has already been warned about and kept. */
  const [acknowledged, setAcknowledged] = useState<number | null>(null);

  const submit = () => {
    // `parseInt` stops at a separator, so a step target shown as "8,000"
    // came back as 8. Everything goes through the same reader now.
    const values = {
      targetCalories: Math.round(parseDecimalInput(calories) ?? NaN),
      targetProteinG: Math.round(parseDecimalInput(protein) ?? NaN),
      targetWaterL: u.parseVolume(water) ?? NaN,
      targetSteps: Math.round(parseDecimalInput(steps) ?? NaN),
      targetSleepH: parseDecimalInput(sleep) ?? NaN,
    };
    if (Object.values(values).some((v) => !Number.isFinite(v) || v <= 0)) {
      return showToast('Every target needs a positive number');
    }

    const check = checkCalorieTarget(values.targetCalories, profile, current);
    if (check.error) return showToast(check.error);
    if (check.warning && acknowledged !== values.targetCalories) {
      setAcknowledged(values.targetCalories);
      return showToast(check.warning);
    }

    updateProfile(values);
    onClose();
    showToast('Targets updated');
  };

  return (
    <Sheet visible={visible} title="Daily targets" onClose={onClose}>
      <Grid columns={2}>
        <NumberField label="Calories" unit="kcal" value={calories} onChangeText={setCalories} />
        <NumberField label="Protein" unit="g" value={protein} onChangeText={setProtein} />
        <NumberField label="Water" unit={u.labels.volume} value={water} onChangeText={setWater} />
        <NumberField label="Steps" value={steps} onChangeText={setSteps} />
        <NumberField label="Sleep" unit="h" value={sleep} onChangeText={setSleep} />
      </Grid>
      <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
        Water, steps and sleep are the habit thresholds — a habit counts as met at or above its target.
      </Caption>
      <PrimaryButton label="Save targets" onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}

/**
 * A CSV import is not a yes/no — when a day exists in both files the user has
 * to say which one wins, so this asks that instead of a plain confirmation.
 * With no conflicts it collapses to a single "Import" button.
 */
function CsvImportDialog({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: CsvImportPreview | null;
  onCancel: () => void;
  onConfirm: (choice: ConflictChoice) => void;
}) {
  const { colors } = useTheme();
  if (!preview) return null;

  const lines = [
    `${preview.newCount} new day${preview.newCount === 1 ? '' : 's'}`,
    preview.conflictCount > 0
      ? `${preview.conflictCount} day${preview.conflictCount === 1 ? '' : 's'} already logged differently`
      : null,
    preview.identicalCount > 0 ? `${preview.identicalCount} unchanged` : null,
    preview.skipped > 0 ? `${preview.skipped} row${preview.skipped === 1 ? '' : 's'} unreadable` : null,
  ].filter(Boolean);

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(28,28,26,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
        }}
      >
        <View style={{ width: '100%', backgroundColor: colors.card, borderRadius: 24, padding: space.xl, gap: space.sm }}>
          <Title style={{ fontSize: 20 }}>Import {preview.fileName}?</Title>

          <Body style={{ fontSize: 14, lineHeight: 20 }} color={colors.muted}>
            {lines.join(' · ')}.
            {preview.warning ? ` ${preview.warning}` : ''}
          </Body>

          {preview.conflictCount > 0 && (
            <Body style={{ fontSize: 14, lineHeight: 20, marginTop: space.xs }} color={colors.muted}>
              Some of those days are already logged. Which should win?
            </Body>
          )}

          <View style={{ gap: space.sm, marginTop: space.md }}>
            {preview.conflictCount > 0 ? (
              <>
                <PrimaryButton label="Keep what I have" onPress={() => onConfirm('keep-mine')} />
                <GhostButton label="Use the file's values" onPress={() => onConfirm('use-theirs')} />
              </>
            ) : (
              <PrimaryButton label="Import" onPress={() => onConfirm('use-theirs')} />
            )}
            <GhostButton label="Cancel" tone="muted" onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** 07:00 with a step either side — half-hour steps cover every sensible choice in a few taps. */
function TimeStepper({
  label,
  minutes,
  onChange,
  caption = 'Time',
  step: stepSize = 30,
}: {
  label: string;
  minutes: number;
  onChange: (minutes: number) => void;
  caption?: string;
  /** Minutes per tap. */
  step?: number;
}) {
  const { colors } = useTheme();
  const step = (delta: number, text: string, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onChange(shiftMinutes(minutes, delta))}
      style={({ pressed }) => ({
        width: 44,
        height: 36,
        borderRadius: radius.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.line : colors.tint,
      })}
    >
      <Body style={{ fontFamily: font.semibold, fontSize: 18 }} color={colors.accent}>
        {text}
      </Body>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm }}>
      <Caption style={{ flex: 1, fontSize: 12 }}>{caption}</Caption>
      {step(-stepSize, '−', `${label} ${stepSize} minutes earlier`)}
      <Body
        style={{ fontFamily: font.semibold, fontSize: 16, minWidth: 58, textAlign: 'center' }}
        accessibilityLabel={`${label} at ${minutesLabel(minutes)}`}
      >
        {minutesLabel(minutes)}
      </Body>
      {step(stepSize, '+', `${label} ${stepSize} minutes later`)}
    </View>
  );
}

const INTERVAL_LABELS: Record<number, string> = {
  30: '30 min',
  60: '1 h',
  90: '1½ h',
  120: '2 h',
  180: '3 h',
  240: '4 h',
};

/** How often, from when, until when — and whether to skip while on pace. */
function WaterSchedule({
  settings,
  onTime,
  onOnlyBehind,
}: {
  settings: NotificationSettings;
  onTime: (key: ReminderTime, minutes: number) => void;
  onOnlyBehind: (next: boolean) => void;
}) {
  const { colors } = useTheme();
  const times = waterCheckTimes(settings);
  const { waterStartMinutes: start, waterEndMinutes: end } = settings;
  return (
    <View style={{ gap: space.sm }}>
      <Caption style={{ fontSize: 12 }}>Every</Caption>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {WATER_INTERVALS.map((every) => {
          const active = settings.waterEveryMinutes === every;
          return (
            <Pressable
              key={every}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`Every ${INTERVAL_LABELS[every]}`}
              onPress={() => onTime('waterEveryMinutes', every)}
              style={({ pressed }) => ({
                minHeight: 36,
                paddingHorizontal: space.md,
                borderRadius: radius.pill,
                justifyContent: 'center',
                backgroundColor: active ? colors.accent : pressed ? colors.line : colors.tint,
              })}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={active ? colors.onAccent : colors.accent}>
                {INTERVAL_LABELS[every]}
              </Body>
            </Pressable>
          );
        })}
      </View>
      {/* The window can't close before it opens: a step that would cross the
          other end is ignored. */}
      <TimeStepper
        label="Water reminders from"
        caption="From"
        minutes={start}
        onChange={(next) => next < end && onTime('waterStartMinutes', next)}
      />
      <TimeStepper
        label="Water reminders until"
        caption="Until"
        minutes={end}
        onChange={(next) => next > start && onTime('waterEndMinutes', next)}
      />
      <Caption style={{ fontSize: 11.5, lineHeight: 16 }}>
        {times.length === 1 ? 'Once a day' : `${times.length} a day`}:{' '}
        {times.length > 6
          ? `${times.slice(0, 3).map(minutesLabel).join(', ')} … ${minutesLabel(times[times.length - 1])}`
          : times.map(minutesLabel).join(', ')}
      </Caption>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>Only when I'm behind</Body>
          <Caption style={{ fontSize: 11.5 }}>Skip a reminder while you're on pace for the day</Caption>
        </View>
        <Toggle
          value={settings.waterOnlyBehind}
          accessibilityLabel="Only remind me when I'm behind on water"
          onChange={onOnlyBehind}
        />
      </View>
    </View>
  );
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Seven round toggles, Monday first, plus a one-word summary. */
function DayPicker({ label, days, onChange }: { label: string; days: number[]; onChange: (days: number[]) => void }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Caption style={{ fontSize: 12 }}>Days</Caption>
        <Caption style={{ fontSize: 12, fontFamily: font.semibold }}>{daysLabel(days)}</Caption>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {DAY_LETTERS.map((letter, d) => {
          const on = days.includes(d);
          return (
            <Pressable
              key={d}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${label} on ${DAY_FULL[d]}`}
              onPress={() => onChange(on ? days.filter((x) => x !== d) : [...days, d])}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 19,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? colors.accent : pressed ? colors.line : colors.tint,
              })}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={on ? colors.onAccent : colors.accent}>
                {letter}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Add or edit one of the user's own reminders. */
function ReminderSheet({
  reminder,
  isNew,
  onClose,
  onSave,
  onDelete,
}: {
  reminder: CustomReminder | null;
  isNew: boolean;
  onClose: () => void;
  onSave: (r: CustomReminder) => void;
  onDelete: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [draft, setDraft] = useState<CustomReminder | null>(reminder);
  const [lastId, setLastId] = useState<string | null>(reminder?.id ?? null);
  // A fresh draft each time a different reminder opens.
  if ((reminder?.id ?? null) !== lastId) {
    setLastId(reminder?.id ?? null);
    setDraft(reminder);
  }
  const label = draft?.label.trim() ?? '';
  return (
    <Sheet visible={reminder != null} title={isNew ? 'New reminder' : 'Edit reminder'} onClose={onClose}>
      {draft && (
        <>
          <Card style={{ gap: 3 }}>
            <Caption style={{ fontSize: 10.5, letterSpacing: 0.7, textTransform: 'uppercase', fontFamily: font.semibold }}>
              What to remind you
            </Caption>
            <TextInput
              value={draft.label}
              onChangeText={(text) => setDraft({ ...draft, label: text.slice(0, 60) })}
              placeholder="Take vitamins, go for a walk…"
              placeholderTextColor={colors.disabled}
              accessibilityLabel="Reminder text"
              style={{ padding: 0, fontFamily: font.medium, fontSize: 16, color: colors.text, outlineWidth: 0 }}
            />
          </Card>
          <Card style={{ gap: space.md }}>
            <TimeStepper
              label="Reminder"
              minutes={draft.minutes}
              step={15}
              onChange={(minutes) => setDraft({ ...draft, minutes })}
            />
            <DayPicker label="Reminder" days={draft.days} onChange={(days) => setDraft({ ...draft, days })} />
          </Card>
          <PrimaryButton
            label={isNew ? 'Add reminder' : 'Save reminder'}
            disabled={!label || draft.days.length === 0}
            onPress={() => onSave({ ...draft, label })}
          />
          {!isNew && <GhostButton label="Delete this reminder" tone="muted" onPress={() => onDelete(draft.id)} />}
        </>
      )}
    </Sheet>
  );
}
