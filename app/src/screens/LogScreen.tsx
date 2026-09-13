import React, { useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { useStore } from '../data/store';
import { INTENSITIES, Intensity, MEAL_TYPES, MealType, WORKOUT_TYPES, WorkoutType } from '../data/types';
import { Card, Grid } from '../components/Card';
import { GhostButton, NumberField, PrimaryButton, SectionHeading, Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import { mealTotals, workoutTotals } from '../lib/calc';
import { formatShort, todayKey } from '../lib/date';

export function LogScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { data, cursor, addMeal, removeMeal, addWorkout, removeWorkout, showToast } = useStore();

  const [mealSheet, setMealSheet] = useState(false);
  const [workoutSheet, setWorkoutSheet] = useState(false);

  const meals = data.meals.filter((m) => m.logDate === cursor);
  const workouts = data.workouts.filter((w) => w.logDate === cursor);
  const mTotals = mealTotals(data.meals, cursor);
  const wTotals = workoutTotals(data.workouts, cursor);

  const dayLabel = cursor === todayKey() ? 'today' : formatShort(cursor);

  return (
    <Screen title="Food & training" meta={formatShort(cursor)} onBack={onBack}>
      <SectionHeading
        title="Meals"
        trailing={mTotals.count ? `${mTotals.calories.toLocaleString('en-GB')} kcal · ${mTotals.proteinG} g` : '—'}
      />

      <View style={{ gap: space.sm }}>
        {meals.map((meal) => (
          <Card
            key={meal.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: space.lg, paddingVertical: 13 }}
          >
            <Pill label={meal.mealType} />
            <View style={{ flex: 1, gap: 1 }}>
              <Body style={{ fontFamily: font.semibold, fontSize: 14 }} numberOfLines={1}>
                {meal.description}
              </Body>
              <Caption style={{ fontSize: 11.5 }}>
                {meal.calories.toLocaleString('en-GB')} kcal · {meal.proteinG} g protein
              </Caption>
            </View>
            <DeleteButton label={`Delete ${meal.description}`} onPress={() => removeMeal(meal.id)} />
          </Card>
        ))}

        {!meals.length && (
          <Card style={{ paddingVertical: space.xl, alignItems: 'center', borderStyle: 'dashed' }}>
            <Body style={{ fontSize: 13.5 }} color={colors.muted}>
              Nothing logged for {dayLabel} yet.
            </Body>
          </Card>
        )}

        <GhostButton label="Add a meal" dashed onPress={() => setMealSheet(true)} />
      </View>

      <View style={{ marginTop: space.xl }}>
        <SectionHeading
          title="Workouts"
          trailing={
            wTotals.count
              ? `${wTotals.durationMin} min · ${wTotals.caloriesBurned.toLocaleString('en-GB')} kcal`
              : '—'
          }
        />
      </View>

      <View style={{ gap: space.sm }}>
        {workouts.map((workout) => (
          <Card
            key={workout.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: space.lg, paddingVertical: 13 }}
          >
            <Pill label={workout.type} />
            <View style={{ flex: 1, gap: 1 }}>
              <Body style={{ fontFamily: font.semibold, fontSize: 14 }} numberOfLines={1}>
                {workout.session}
              </Body>
              <Caption style={{ fontSize: 11.5 }}>
                {workout.durationMin} min · {workout.intensity} · {workout.caloriesBurned} kcal
              </Caption>
            </View>
            <DeleteButton label={`Delete ${workout.session}`} onPress={() => removeWorkout(workout.id)} />
          </Card>
        ))}

        {!workouts.length && (
          <Card style={{ paddingVertical: space.xl, alignItems: 'center', borderStyle: 'dashed' }}>
            <Body style={{ fontSize: 13.5 }} color={colors.muted}>
              No training logged for {dayLabel}.
            </Body>
          </Card>
        )}

        <GhostButton label="Add a workout" dashed onPress={() => setWorkoutSheet(true)} />
      </View>

      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.lg, paddingHorizontal: space.xs }}>
        Daily totals roll into the weigh-in for this date unless you typed calories in by hand.
      </Caption>

      <MealSheet
        visible={mealSheet}
        onClose={() => setMealSheet(false)}
        onSubmit={(meal) => {
          addMeal({ ...meal, logDate: cursor });
          setMealSheet(false);
          showToast('Meal added');
        }}
      />

      <WorkoutSheet
        visible={workoutSheet}
        onClose={() => setWorkoutSheet(false)}
        onSubmit={(workout) => {
          addWorkout({ ...workout, logDate: cursor });
          setWorkoutSheet(false);
          showToast('Workout added');
        }}
      />
    </Screen>
  );
}

// ── pieces ───────────────────────────────────────────────────────────────────

function Pill({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: colors.tint,
      }}
    >
      <Caption
        style={{ fontSize: 10, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: font.semibold }}
        color={colors.accent}
      >
        {label}
      </Caption>
    </View>
  );
}

function DeleteButton({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} hitSlop={12} onPress={onPress}>
      <Icon name="trash" size={16} color={colors.disabled} />
    </Pressable>
  );
}

function TypePicker<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
      {options.map((option) => {
        const active = option === value;
        return (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(option)}
            style={{
              paddingHorizontal: 14,
              minHeight: 38,
              justifyContent: 'center',
              borderRadius: radius.pill,
              borderWidth: 1,
              borderColor: active ? colors.accent : colors.line,
              backgroundColor: active ? colors.tint : 'transparent',
            }}
          >
            <Body
              style={{ fontFamily: font.semibold, fontSize: 13 }}
              color={active ? colors.accent : colors.muted}
            >
              {option}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}

function TextField({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
        paddingHorizontal: 13,
        paddingVertical: 11,
        gap: 2,
      }}
    >
      <Caption style={{ fontSize: 10.5, letterSpacing: 0.735, textTransform: 'uppercase', fontFamily: font.semibold }}>
        {label}
      </Caption>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.disabled}
        accessibilityLabel={label}
        style={{ padding: 0, fontFamily: font.medium, fontSize: 15, color: colors.text, minHeight: 22 }}
      />
    </View>
  );
}

function MealSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (meal: { mealType: MealType; description: string; calories: number; proteinG: number }) => void;
}) {
  const { showToast } = useStore();
  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');

  const submit = () => {
    const kcal = Number.parseFloat(calories);
    const pro = Number.parseFloat(protein);
    if (!description.trim()) return showToast('Describe the meal first');
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 10000) return showToast('Calories must be 0–10 000');
    if (!Number.isFinite(pro) || pro < 0 || pro > 500) return showToast('Protein must be 0–500 g');
    onSubmit({ mealType, description: description.trim(), calories: Math.round(kcal), proteinG: Math.round(pro) });
    setDescription('');
    setCalories('');
    setProtein('');
  };

  return (
    <Sheet visible={visible} title="Add a meal" onClose={onClose}>
      <TypePicker options={MEAL_TYPES} value={mealType} onChange={setMealType} />
      <TextField
        label="Description"
        value={description}
        onChangeText={setDescription}
        placeholder="Chicken, rice, roasted peppers"
      />
      <Grid columns={2}>
        <NumberField label="Calories" unit="kcal" value={calories} onChangeText={setCalories} />
        <NumberField label="Protein" unit="g" value={protein} onChangeText={setProtein} />
      </Grid>
      <PrimaryButton label="Add meal" onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}

function WorkoutSheet({
  visible,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (workout: {
    type: WorkoutType;
    session: string;
    durationMin: number;
    intensity: Intensity;
    caloriesBurned: number;
  }) => void;
}) {
  const { showToast } = useStore();
  const [type, setType] = useState<WorkoutType>('Cardio');
  const [session, setSession] = useState('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('Medium');
  const [burned, setBurned] = useState('');

  const submit = () => {
    const mins = Number.parseFloat(duration);
    const kcal = burned === '' ? 0 : Number.parseFloat(burned);
    if (!session.trim()) return showToast('Name the session first');
    if (!Number.isFinite(mins) || mins < 0 || mins > 600) return showToast('Duration must be 0–600 minutes');
    if (!Number.isFinite(kcal) || kcal < 0) return showToast('Calories burned must be a positive number');
    onSubmit({
      type,
      session: session.trim(),
      durationMin: Math.round(mins),
      intensity,
      caloriesBurned: Math.round(kcal),
    });
    setSession('');
    setDuration('');
    setBurned('');
  };

  return (
    <Sheet visible={visible} title="Add a workout" onClose={onClose}>
      <TypePicker options={WORKOUT_TYPES} value={type} onChange={setType} />
      <TextField label="Session" value={session} onChangeText={setSession} placeholder="Treadmill intervals" />
      <Grid columns={2}>
        <NumberField label="Duration" unit="min" value={duration} onChangeText={setDuration} />
        <NumberField label="Burned" unit="kcal" value={burned} onChangeText={setBurned} />
      </Grid>
      <Segmented options={INTENSITIES} value={intensity} onChange={setIntensity} />
      <PrimaryButton label="Add workout" onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}
