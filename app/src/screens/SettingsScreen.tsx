import React, { useState } from 'react';
import { Modal, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { CsvImportPreview, RestorePreview, useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { describeData, hasAnyData } from '../data/schema';
import {
  ACTIVITY_LEVELS,
  ActivityLevel,
  GOAL_TYPES,
  GoalType,
  NotificationSettings,
  Sex,
  Units,
} from '../data/types';
import { Card, Grid } from '../components/Card';
import { GhostButton, NumberField, PrimaryButton, SectionHeading, Segmented, Toggle, ValueRow } from '../components/Controls';
import { ConfirmDialog, Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption, Title } from '../components/Type';
import {
  bmi,
  bmiBand,
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

const REMINDERS: { key: keyof NotificationSettings; label: string; sub: string }[] = [
  { key: 'morningWeighIn', label: 'Morning weigh-in', sub: '07:00 · skipped if already logged' },
  { key: 'eveningLog', label: 'Evening log nudge', sub: '21:00 · only if under 3 habits ticked' },
  { key: 'weeklySummary', label: 'Weekly summary', sub: 'Every 7 days from your start date' },
  { key: 'milestoneReached', label: 'Milestone reached', sub: 'Fires once, the first time you cross one' },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { colors, preference, setPreference } = useTheme();
  const {
    data,
    setNotification,
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
  } = useStore();
  const { u } = useDerived();
  const { profile, entries } = data;

  const [planSheet, setPlanSheet] = useState(false);
  const [targetSheet, setTargetSheet] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [restore, setRestore] = useState<RestorePreview | null>(null);
  const [csvImport, setCsvImport] = useState<CsvImportPreview | null>(null);
  const [busy, setBusy] = useState(false);

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
        <ValueRow label="Age" value={`${profile.ageYears} yrs`} />
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

      {/* ── reminders ───────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Reminders" />
      </View>
      <View style={{ gap: space.sm }}>
        {REMINDERS.map((reminder) => (
          <Card
            key={reminder.key}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: 17, paddingVertical: 13 }}
          >
            <View style={{ flex: 1, gap: 1 }}>
              <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>{reminder.label}</Body>
              <Caption style={{ fontSize: 11.5, lineHeight: 16 }}>{reminder.sub}</Caption>
            </View>
            <Toggle
              value={data.notifications[reminder.key]}
              accessibilityLabel={reminder.label}
              onChange={(next) => setNotification(reminder.key, next)}
            />
          </Card>
        ))}
      </View>

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

      {/* ── backup ──────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Backup" />
      </View>
      <GhostButton label="Back up everything (JSON)" onPress={exportBackup} />
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
        A backup is one JSON file holding everything, and it is what a restore reads. CSV is for spreadsheets —
        importing one merges weigh-ins by date and leaves meals, workouts and measurements alone.
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
          if (picked) applyRestore(picked.data);
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
        body={`You have ${describeData(data)}. Resetting clears all of it. You can undo this from the toast that follows, but not after it disappears — export a copy first if you want to keep it.`}
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
  const [age, setAge] = useState(String(profile.ageYears));
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
      ageYears: a,
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
    const values = {
      targetCalories: Number.parseInt(calories, 10),
      targetProteinG: Number.parseInt(protein, 10),
      targetWaterL: u.parseVolume(water) ?? NaN,
      targetSteps: Number.parseInt(steps, 10),
      targetSleepH: Number.parseFloat(sleep),
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
