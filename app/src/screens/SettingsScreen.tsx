import React, { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { useStore } from '../data/store';
import { ACTIVITY_LEVELS, ActivityLevel, NotificationSettings, Sex } from '../data/types';
import { Card, Grid } from '../components/Card';
import { GhostButton, NumberField, PrimaryButton, SectionHeading, Segmented, Toggle, ValueRow } from '../components/Controls';
import { Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import {
  bmi,
  bmiBand,
  currentWeight,
  expectedLossPerWeek,
  f1,
  healthyWeightRange,
  int,
  bmr as restingBurn,
  plannedDailyDeficit,
  requiredPacePerWeek,
  tdee as maintenance,
} from '../lib/calc';
import { formatMedium } from '../lib/date';

const REMINDERS: { key: keyof NotificationSettings; label: string; sub: string }[] = [
  { key: 'morningWeighIn', label: 'Morning weigh-in', sub: '07:00 · skipped if already logged' },
  { key: 'eveningLog', label: 'Evening log nudge', sub: '21:00 · only if under 3 habits ticked' },
  { key: 'weeklySummary', label: 'Weekly summary', sub: 'Every 7 days from your start date' },
  { key: 'milestoneReached', label: 'Milestone reached', sub: 'Fires once, the first time you cross one' },
];

export function SettingsScreen({ onBack }: { onBack: () => void }) {
  const { preference, setPreference } = useTheme();
  const { data, setNotification, replayOnboarding, loadDemo, resetAll, showToast } = useStore();
  const { profile, entries } = data;

  const [planSheet, setPlanSheet] = useState(false);
  const [targetSheet, setTargetSheet] = useState(false);

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
        <ValueRow label="Starting weight" value={`${f1(profile.startWeightKg)} kg`} />
        <ValueRow label="Goal weight" value={`${f1(profile.goalWeightKg)} kg`} />
        <ValueRow label="Height" value={`${profile.heightCm} cm`} />
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
        <ValueRow label="Water" value={`${profile.targetWaterL} L`} />
        <ValueRow label="Steps" value={int(profile.targetSteps)} />
        <ValueRow label="Sleep" value={`${profile.targetSleepH} h`} last />
      </Card>
      <GhostButton label="Edit targets" onPress={() => setTargetSheet(true)} />

      {/* ── read-only calculated block ──────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Calculated for you" trailing="Read-only" />
      </View>
      <Card padded={false} hero style={{ paddingHorizontal: 18 }}>
        <ValueRow label="BMI" note="weight ÷ height²" value={bmiValue.toFixed(1)} />
        <ValueRow label="Classification" note="WHO bands" value={bmiBand(bmiValue)} />
        <ValueRow
          label="Healthy weight range"
          note="BMI 18.5–24.9 at your height"
          value={`${f1(healthy.lowKg)}–${f1(healthy.highKg)} kg`}
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
          value={`${f1(expectedLossPerWeek(current, profile))} kg/week`}
        />
        <ValueRow
          label="Required pace"
          note="To reach goal inside 730 days"
          value={`${f1(requiredPacePerWeek(profile))} kg/week`}
          last
        />
      </Card>

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

      {/* ── appearance ──────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Appearance" />
      </View>
      <Segmented
        options={['system', 'light', 'dark'] as const}
        value={preference}
        onChange={setPreference}
      />

      {/* ── data ────────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Data" />
      </View>
      <GhostButton label="Replay onboarding" tone="muted" onPress={replayOnboarding} />
      <GhostButton label="Load the 8-week demo journey" tone="muted" onPress={loadDemo} />
      <GhostButton
        label="Reset everything"
        tone="muted"
        onPress={() => {
          resetAll();
          showToast('Everything cleared');
        }}
      />
      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.sm, paddingHorizontal: space.xs }}>
        Everything lives on this device. The demo journey fills in eight weeks of weigh-ins so the populated screens
        are reachable without waiting.
      </Caption>

      <PlanSheet visible={planSheet} onClose={() => setPlanSheet(false)} />
      <TargetSheet visible={targetSheet} onClose={() => setTargetSheet(false)} />
    </Screen>
  );
}

// ── edit sheets ──────────────────────────────────────────────────────────────

function PlanSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { data, updateProfile, showToast } = useStore();
  const { profile } = data;

  const [startWeight, setStartWeight] = useState(String(profile.startWeightKg));
  const [goalWeight, setGoalWeight] = useState(String(profile.goalWeightKg));
  const [height, setHeight] = useState(String(profile.heightCm));
  const [age, setAge] = useState(String(profile.ageYears));
  const [sex, setSex] = useState<Sex>(profile.sex);
  const [activity, setActivity] = useState<ActivityLevel>(profile.activityLevel);

  const submit = () => {
    const sw = Number.parseFloat(startWeight);
    const gw = Number.parseFloat(goalWeight);
    const h = Number.parseInt(height, 10);
    const a = Number.parseInt(age, 10);

    if (!Number.isFinite(sw) || sw < 30 || sw > 400) return showToast('Starting weight must be 30–400 kg');
    if (!Number.isFinite(gw) || gw < 30 || gw > 400) return showToast('Goal weight must be 30–400 kg');
    if (gw >= sw) return showToast('Goal weight must be below your starting weight');
    if (!Number.isFinite(h) || h < 100 || h > 250) return showToast('Height must be 100–250 cm');
    if (!Number.isFinite(a) || a < 14 || a > 100) return showToast('Age must be 14–100');

    updateProfile({
      startWeightKg: sw,
      goalWeightKg: gw,
      heightCm: h,
      ageYears: a,
      sex,
      activityLevel: activity,
    });
    onClose();
    showToast('Plan updated');
  };

  return (
    <Sheet visible={visible} title="Edit plan" onClose={onClose}>
      <Grid columns={2}>
        <NumberField label="Starting weight" unit="kg" value={startWeight} onChangeText={setStartWeight} />
        <NumberField label="Goal weight" unit="kg" value={goalWeight} onChangeText={setGoalWeight} />
        <NumberField label="Height" unit="cm" value={height} onChangeText={setHeight} />
        <NumberField label="Age" unit="yrs" value={age} onChangeText={setAge} />
      </Grid>
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
  const { profile } = data;

  const [calories, setCalories] = useState(String(profile.targetCalories));
  const [protein, setProtein] = useState(String(profile.targetProteinG));
  const [water, setWater] = useState(String(profile.targetWaterL));
  const [steps, setSteps] = useState(String(profile.targetSteps));
  const [sleep, setSleep] = useState(String(profile.targetSleepH));

  const submit = () => {
    const values = {
      targetCalories: Number.parseInt(calories, 10),
      targetProteinG: Number.parseInt(protein, 10),
      targetWaterL: Number.parseFloat(water),
      targetSteps: Number.parseInt(steps, 10),
      targetSleepH: Number.parseFloat(sleep),
    };
    if (Object.values(values).some((v) => !Number.isFinite(v) || v <= 0)) {
      return showToast('Every target needs a positive number');
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
        <NumberField label="Water" unit="L" value={water} onChangeText={setWater} />
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
