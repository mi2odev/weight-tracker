import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { ACTIVITY_LEVELS, ActivityLevel, Profile, Sex, Units } from '../data/types';
import { Card } from '../components/Card';
import { NumberField, PrimaryButton, Segmented } from '../components/Controls';
import { Body, Caption, Label, Title } from '../components/Type';
import {
  bmr as restingBurn,
  expectedLossPerWeek,
  int,
  suggestedCalorieTarget,
  suggestedProteinTarget,
  tdee as maintenance,
} from '../lib/calc';
import { formatMedium, todayKey } from '../lib/date';
import { formatterFor } from '../lib/units';
import {
  calorieTargetExplainer,
  checkCalorieTarget,
  checkGoalWeight,
  isAdult,
  UNDER_18_NOTICE,
} from '../lib/health';
import { ADULT_AGE, birthYearForAge, currentAge } from '../lib/calc';
import { MAX_AGE, MIN_AGE } from '../data/schema';
import { defaultProfile } from '../data/seed';

const STEP_COUNT = 5;

interface Draft {
  units: Units;
  startWeight: string;
  goalWeight: string;
  height: string;
  age: string;
  sex: Sex;
  activity: ActivityLevel;
  calories: string;
}

/**
 * First-run wizard — collects the profile in the order the spec lists, tells
 * the user which numbers the app works out for them, and offers a suggested
 * calorie target they can override.
 */
export function OnboardingScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { completeOnboarding, showToast } = useStore();

  const base = defaultProfile();
  const [step, setStep] = useState(0);
  /** A value the user has been warned about and chosen to keep anyway. */
  const [acknowledged, setAcknowledged] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft>({
    units: base.units,
    startWeight: String(base.startWeightKg),
    goalWeight: String(base.goalWeightKg),
    height: String(base.heightCm),
    age: String(currentAge(base)),
    sex: base.sex,
    activity: base.activityLevel,
    calories: String(base.targetCalories),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  // Units are chosen on the first step, so every later field is entered and
  // validated in the unit the user actually thinks in.
  const u = useMemo(() => formatterFor(draft.units), [draft.units]);

  const num = (value: string, fallback: number) => {
    const parsed = Number.parseFloat(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const metric = (value: string, parse: (t: string) => number | null, fallback: number) =>
    parse(value) ?? fallback;

  /** A live profile shape, so the preview recalculates as the user types. */
  const preview = useMemo<Profile>(
    () => ({
      ...base,
      startDate: todayKey(),
      units: draft.units,
      startWeightKg: metric(draft.startWeight, u.parseWeight, base.startWeightKg),
      goalWeightKg: metric(draft.goalWeight, u.parseWeight, base.goalWeightKg),
      heightCm: metric(draft.height, u.parseLength, base.heightCm),
      birthYear: birthYearForAge(num(draft.age, currentAge(base))),
      sex: draft.sex,
      activityLevel: draft.activity,
      // Zero means "no target". Under 18 the app prescribes nothing, and
      // storing a number nobody is meant to act on is how it creeps back in.
      targetCalories: num(draft.age, currentAge(base)) >= ADULT_AGE
        ? num(draft.calories, base.targetCalories)
        : 0,
      targetProteinG: suggestedProteinTarget(metric(draft.goalWeight, u.parseWeight, base.goalWeightKg)),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  );

  const bmrValue = restingBurn(preview.startWeightKg, preview);
  const tdeeValue = maintenance(preview.startWeightKg, preview);
  const suggested = suggestedCalorieTarget(tdeeValue);

  const validate = (): string | null => {
    if (step === 0 && (preview.startWeightKg < 30 || preview.startWeightKg > 400))
      return `Starting weight must be between ${u.weightValue(30)} and ${u.weight(400)}`;
    if (step === 1) {
      if (preview.goalWeightKg < 30 || preview.goalWeightKg > 400)
        return `Goal weight must be between ${u.weightValue(30)} and ${u.weight(400)}`;
      if (preview.goalWeightKg >= preview.startWeightKg)
        return 'Your goal has to be below your starting weight';

      const goalCheck = checkGoalWeight(preview.goalWeightKg, preview);
      if (goalCheck.error) return goalCheck.error;
      if (goalCheck.warning && acknowledged !== preview.goalWeightKg) {
        setAcknowledged(preview.goalWeightKg);
        return goalCheck.warning;
      }
    }
    if (step === 2) {
      if (preview.heightCm < 100 || preview.heightCm > 250)
        return `Height must be between ${u.height(100)} and ${u.height(250)}`;
      const age = currentAge(preview);
      if (age < MIN_AGE || age > MAX_AGE) return `Age must be between ${MIN_AGE} and ${MAX_AGE}`;
    }
    if (step === 4 && isAdult(preview)) {
      const check = checkCalorieTarget(preview.targetCalories, preview, preview.startWeightKg);
      if (check.error) return check.error;
      if (check.warning && acknowledged !== preview.targetCalories) {
        setAcknowledged(preview.targetCalories);
        return check.warning;
      }
    }
    return null;
  };

  const next = () => {
    const error = validate();
    if (error) return showToast(error);
    if (step < STEP_COUNT - 1) {
      setStep(step + 1);
      // Once the body numbers exist, pre-fill the suggestion the user can override.
      if (step === 3) set('calories', String(suggestedCalorieTarget(tdeeValue)));
      return;
    }
    completeOnboarding(preview);
  };

  const skip = () => completeOnboarding({ ...base, startDate: todayKey() });

  const copy = STEP_COPY[step];
  // The targets step quotes numbers that live in health.ts, so it is built
  // rather than written out — the two had already drifted apart once.
  const body = step === 4 ? calorieTargetExplainer(preview.sex) : copy.body;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + space.lg, paddingHorizontal: space.xl, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
      >
        {/* progress dots */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 26 }}>
          {Array.from({ length: STEP_COUNT }, (_, i) => (
            <View
              key={i}
              style={{
                height: 4,
                flex: 1,
                borderRadius: radius.pill,
                backgroundColor: i <= step ? colors.accent : colors.line,
              }}
            />
          ))}
        </View>

        <Label color={colors.accent}>
          Step {step + 1} of {STEP_COUNT}
        </Label>
        <Title style={{ fontSize: 30, marginTop: space.sm, lineHeight: 35 }}>{copy.title}</Title>
        <Body style={{ fontSize: 15, lineHeight: 22, marginTop: space.sm + 2 }} color={colors.muted}>
          {body}
        </Body>

        <View style={{ gap: space.md, marginTop: 26 }}>
          {step === 0 && (
            <>
              <NumberField
                label="Starting weight"
                hint="Your weight today"
                unit={u.labels.weight}
                value={draft.startWeight}
                onChangeText={(t) => set('startWeight', t)}
              />
              <View style={{ gap: space.sm }}>
                <Label>Units</Label>
                <Segmented
                  options={['metric', 'imperial'] as const}
                  value={draft.units}
                  onChange={(units: Units) => {
                    // Re-express what has already been typed, so switching does
                    // not silently reinterpret 157 kg as 157 lb.
                    const next = formatterFor(units);
                    setDraft((prev) => ({
                      ...prev,
                      units,
                      startWeight: next.weightField(u.parseWeight(prev.startWeight) ?? base.startWeightKg),
                      goalWeight: next.weightField(u.parseWeight(prev.goalWeight) ?? base.goalWeightKg),
                      height: next.lengthField(u.parseLength(prev.height) ?? base.heightCm),
                    }));
                  }}
                />
              </View>
              <Card style={{ gap: 2 }}>
                <Label>Start date</Label>
                <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>{formatMedium(todayKey())}</Body>
                <Caption style={{ fontSize: 11.5 }}>Anchors every week, month and projection</Caption>
              </Card>
            </>
          )}

          {step === 1 && (
            <>
              <NumberField
                label="Goal weight"
                hint="Must be below your starting weight"
                unit={u.labels.weight}
                value={draft.goalWeight}
                onChangeText={(t) => set('goalWeight', t)}
              />
              <Pressable
                accessibilityRole="button"
                onPress={() => set('goalWeight', u.weightField(preview.startWeightKg * 0.9))}
              >
                <Card style={{ gap: 2 }}>
                  <Label color={colors.accent}>Suggested first target</Label>
                  <Body style={[{ fontFamily: font.semibold, fontSize: 15 }, tnum]}>
                    {u.weight(preview.startWeightKg * 0.9)} — 10% down
                  </Body>
                  <Caption style={{ fontSize: 11.5 }}>The clinical standard. Tap to use it.</Caption>
                </Card>
              </Pressable>
            </>
          )}

          {step === 2 && (
            <>
              <NumberField
                label="Height"
                hint={`${u.height(100)}–${u.height(250)}`}
                unit={u.labels.length}
                value={draft.height}
                onChangeText={(t) => set('height', t)}
              />
              <NumberField
                label="Age"
                hint="14–100 years"
                unit="yrs"
                value={draft.age}
                onChangeText={(t) => set('age', t)}
              />
              <View style={{ gap: space.sm }}>
                <Label>Sex</Label>
                <Segmented options={['Male', 'Female'] as const} value={draft.sex} onChange={(v) => set('sex', v)} />
                <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
                  Used only for the resting-burn constant. Nothing here leaves your phone.
                </Caption>
              </View>
            </>
          )}

          {step === 3 && (
            <View style={{ gap: space.sm }}>
              <Label>Activity level</Label>
              {ACTIVITY_LEVELS.map((level) => {
                const active = level === draft.activity;
                return (
                  <Pressable
                    key={level}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => set('activity', level)}
                    style={{
                      minHeight: 52,
                      justifyContent: 'center',
                      paddingHorizontal: 18,
                      borderRadius: radius.md,
                      borderWidth: 1,
                      borderColor: active ? colors.accent : colors.line,
                      backgroundColor: active ? colors.tint : colors.card,
                    }}
                  >
                    <Body
                      style={{ fontFamily: font.semibold, fontSize: 15 }}
                      color={active ? colors.accent : colors.text}
                    >
                      {level}
                    </Body>
                  </Pressable>
                );
              })}
              <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
                Pick the honest one, not the aspirational one.
              </Caption>
            </View>
          )}

          {step === 4 && !isAdult(preview) && (
            <Card hero style={{ padding: 20, gap: space.sm }}>
              <Label color={colors.accent}>One thing before you start</Label>
              <Body style={{ fontSize: 14, lineHeight: 21 }} color={colors.text}>
                {UNDER_18_NOTICE}
              </Body>
            </Card>
          )}

          {step === 4 && isAdult(preview) && (
            <>
              <NumberField
                label="Daily calories"
                hint={`Suggested ${int(suggested)} kcal from your maintenance figure`}
                unit="kcal"
                value={draft.calories}
                onChangeText={(t) => set('calories', t)}
              />

              <Card hero style={{ backgroundColor: colors.tint, borderColor: colors.tint, padding: 20 }}>
                <Label color={colors.accent}>We work these out for you</Label>
                <View style={{ gap: 10, marginTop: 14 }}>
                  <CalcRow label="Resting burn (BMR)" value={`${int(bmrValue)} kcal`} />
                  <CalcRow label="Maintenance (TDEE)" value={`${int(tdeeValue)} kcal`} />
                  <CalcRow label="Suggested target" value={`${int(suggested)} kcal`} />
                  <CalcRow
                    label="Expected pace"
                    value={`${u.weight(expectedLossPerWeek(preview.startWeightKg, preview))}/week`}
                  />
                  <CalcRow label="Protein target" value={`${preview.targetProteinG} g`} />
                </View>
                <Caption style={{ fontSize: 12, lineHeight: 17, marginTop: 14 }} color={colors.accent}>
                  Your calorie target is a suggestion. Change it any time in Settings — nothing here is locked.
                </Caption>
              </Card>
            </>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: space.sm + 2, marginTop: space.xl }}>
          {step > 0 && (
            <Pressable
              accessibilityRole="button"
              onPress={() => setStep(step - 1)}
              style={{
                minHeight: 52,
                paddingHorizontal: 22,
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>Back</Body>
            </Pressable>
          )}
          <PrimaryButton
            label={step === STEP_COUNT - 1 ? 'Start tracking' : 'Continue'}
            onPress={next}
            style={{ flex: 1 }}
          />
        </View>

        <Pressable
          accessibilityRole="button"
          onPress={skip}
          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: space.sm + 2 }}
        >
          <Body style={{ fontFamily: font.medium, fontSize: 13 }} color={colors.muted}>
            Skip — I&apos;ll set this up later
          </Body>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function CalcRow({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.md }}>
      <Body style={{ fontSize: 13 }} color={colors.accent}>
        {label}
      </Body>
      <Body style={[{ fontFamily: font.semibold, fontSize: 15 }, tnum]} color={colors.accent}>
        {value}
      </Body>
    </View>
  );
}

const STEP_COPY = [
  {
    title: 'Where you are starting',
    body: "Two numbers anchor everything: today's weight and the date you begin. Both stay fixed so your progress is measured from a real baseline.",
  },
  {
    title: 'Where you are going',
    body: 'A 10% drop is the clinical first target. You can set it further out — the plan simply gets longer.',
  },
  {
    title: 'About your body',
    body: 'Height, age and sex feed BMI and your resting burn. Nothing here leaves your phone.',
  },
  {
    title: 'How your days move',
    body: 'Activity level turns your resting burn into a maintenance figure. Pick the honest one, not the aspirational one.',
  },
  {
    title: 'Your daily targets',
    // Filled in at render: the floor depends on the profile being built.
    body: '',
  },
];
