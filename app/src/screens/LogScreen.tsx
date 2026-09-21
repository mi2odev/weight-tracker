import React, { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, MIN_TAP, radius, space } from '../theme/tokens';
import { useStore } from '../data/store';
import { useUnits } from '../data/derived';
import {
  INTENSITIES,
  Intensity,
  MEAL_TYPES,
  MealEntry,
  MealType,
  WORKOUT_TYPES,
  WorkoutEntry,
  WorkoutType,
} from '../data/types';
import { Card, Grid } from '../components/Card';
import { GhostButton, NumberField, PrimaryButton, SectionHeading, Segmented } from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import { entryFor, mealTotals, workoutTotals } from '../lib/calc';
import { formatShort, todayKey } from '../lib/date';

export function LogScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const {
    data,
    cursor,
    addMeal,
    updateMeal,
    removeMeal,
    addWorkout,
    updateWorkout,
    removeWorkout,
    removeWeighIn,
    saveWeighIn,
    showToast,
  } = useStore();
  const u = useUnits();

  // null = closed, 'new' = adding, an entry = editing that row.
  const [mealSheet, setMealSheet] = useState<'new' | MealEntry | null>(null);
  const [workoutSheet, setWorkoutSheet] = useState<'new' | WorkoutEntry | null>(null);
  const [weighInSheet, setWeighInSheet] = useState(false);

  const meals = data.meals.filter((m) => m.logDate === cursor);
  const workouts = data.workouts.filter((w) => w.logDate === cursor);
  const mTotals = mealTotals(data.meals, cursor);
  const wTotals = workoutTotals(data.workouts, cursor);

  const dayLabel = cursor === todayKey() ? 'today' : formatShort(cursor);
  const dayWeight = entryFor(data.entries, cursor)?.weightKg ?? null;

  return (
    <Screen title="Food & training" meta={formatShort(cursor)} onBack={onBack}>
      <SectionHeading title="Weigh-in" />
      <Card padded={false}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              dayWeight == null ? 'Add a weigh-in for this day' : `Edit the weigh-in, ${u.weight(dayWeight)}`
            }
            onPress={() => setWeighInSheet(true)}
            style={{
              flex: 1,
              paddingLeft: space.lg,
              paddingVertical: 13,
              minHeight: MIN_TAP,
              justifyContent: 'center',
              gap: 1,
            }}
          >
            <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>
              {dayWeight == null ? 'Not weighed this day' : u.weight(dayWeight)}
            </Body>
            <Caption style={{ fontSize: 11.5 }}>
              {dayWeight == null ? 'Tap to add one' : 'Tap to change it'}
            </Caption>
          </Pressable>
          {dayWeight != null && (
            <DeleteButton label="Clear this weigh-in" onPress={() => removeWeighIn(cursor)} />
          )}
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeading
          title="Meals"
          trailing={mTotals.count ? `${mTotals.calories.toLocaleString('en-GB')} kcal · ${mTotals.proteinG} g` : '—'}
        />
      </View>

      <View style={{ gap: space.sm }}>
        {meals.map((meal) => (
          <Card key={meal.id} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${meal.description}`}
                accessibilityHint="Opens the meal for editing"
                onPress={() => setMealSheet(meal)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  paddingLeft: space.lg,
                  paddingVertical: 13,
                  minHeight: MIN_TAP,
                }}
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
              </Pressable>
              <DeleteButton label={`Delete ${meal.description}`} onPress={() => removeMeal(meal.id)} />
            </View>
          </Card>
        ))}

        {!meals.length && (
          <Card style={{ paddingVertical: space.xl, alignItems: 'center', borderStyle: 'dashed' }}>
            <Body style={{ fontSize: 13.5 }} color={colors.muted}>
              Nothing logged for {dayLabel} yet.
            </Body>
          </Card>
        )}

        <GhostButton label="Add a meal" dashed onPress={() => setMealSheet('new')} />
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
          <Card key={workout.id} padded={false}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Edit ${workout.session}`}
                accessibilityHint="Opens the workout for editing"
                onPress={() => setWorkoutSheet(workout)}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 13,
                  paddingLeft: space.lg,
                  paddingVertical: 13,
                  minHeight: MIN_TAP,
                }}
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
              </Pressable>
              <DeleteButton label={`Delete ${workout.session}`} onPress={() => removeWorkout(workout.id)} />
            </View>
          </Card>
        ))}

        {!workouts.length && (
          <Card style={{ paddingVertical: space.xl, alignItems: 'center', borderStyle: 'dashed' }}>
            <Body style={{ fontSize: 13.5 }} color={colors.muted}>
              No training logged for {dayLabel}.
            </Body>
          </Card>
        )}

        <GhostButton label="Add a workout" dashed onPress={() => setWorkoutSheet('new')} />
      </View>

      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.lg, paddingHorizontal: space.xs }}>
        Daily totals roll into the weigh-in for this date unless you typed calories in by hand.
      </Caption>

      <MealSheet
        target={mealSheet}
        onClose={() => setMealSheet(null)}
        onSubmit={(meal) => {
          const editing = mealSheet !== 'new' && mealSheet !== null ? mealSheet : null;
          if (editing) updateMeal(editing.id, meal);
          else addMeal({ ...meal, logDate: cursor });
          setMealSheet(null);
          showToast(editing ? 'Meal updated' : 'Meal added');
        }}
      />

      <WorkoutSheet
        target={workoutSheet}
        onClose={() => setWorkoutSheet(null)}
        onSubmit={(workout) => {
          const editing = workoutSheet !== 'new' && workoutSheet !== null ? workoutSheet : null;
          if (editing) updateWorkout(editing.id, workout);
          else addWorkout({ ...workout, logDate: cursor });
          setWorkoutSheet(null);
          showToast(editing ? 'Workout updated' : 'Workout added');
        }}
      />
      <WeighInSheet
        visible={weighInSheet}
        currentKg={dayWeight}
        onClose={() => setWeighInSheet(false)}
        onSubmit={(kg) => {
          const error = saveWeighIn(cursor, kg);
          if (error) {
            showToast(
              error === 'future'
                ? 'You cannot log a weigh-in in the future'
                : `Enter a weight between ${u.weightValue(30)} and ${u.weight(400)}`,
            );
            return;
          }
          setWeighInSheet(false);
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
  target,
  onClose,
  onSubmit,
}: {
  target: 'new' | MealEntry | null;
  onClose: () => void;
  onSubmit: (meal: { mealType: MealType; description: string; calories: number; proteinG: number }) => void;
}) {
  const { showToast } = useStore();
  const editing = target !== 'new' && target !== null ? target : null;

  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');

  // Refill the form whenever the sheet opens on a different row.
  useEffect(() => {
    if (target === null) return;
    setMealType(editing?.mealType ?? 'Breakfast');
    setDescription(editing?.description ?? '');
    setCalories(editing ? String(editing.calories) : '');
    setProtein(editing ? String(editing.proteinG) : '');
  }, [target, editing]);

  const submit = () => {
    const kcal = Number.parseFloat(calories);
    const pro = Number.parseFloat(protein);
    if (!description.trim()) return showToast('Describe the meal first');
    if (!Number.isFinite(kcal) || kcal < 0 || kcal > 10000) return showToast('Calories must be 0–10 000');
    if (!Number.isFinite(pro) || pro < 0 || pro > 500) return showToast('Protein must be 0–500 g');
    onSubmit({ mealType, description: description.trim(), calories: Math.round(kcal), proteinG: Math.round(pro) });
  };

  return (
    <Sheet visible={target !== null} title={editing ? 'Edit meal' : 'Add a meal'} onClose={onClose}>
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
      <PrimaryButton label={editing ? 'Save meal' : 'Add meal'} onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}

function WorkoutSheet({
  target,
  onClose,
  onSubmit,
}: {
  target: 'new' | WorkoutEntry | null;
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
  const editing = target !== 'new' && target !== null ? target : null;

  const [type, setType] = useState<WorkoutType>('Cardio');
  const [session, setSession] = useState('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('Medium');
  const [burned, setBurned] = useState('');

  useEffect(() => {
    if (target === null) return;
    setType(editing?.type ?? 'Cardio');
    setSession(editing?.session ?? '');
    setDuration(editing ? String(editing.durationMin) : '');
    setIntensity(editing?.intensity ?? 'Medium');
    setBurned(editing ? String(editing.caloriesBurned) : '');
  }, [target, editing]);

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
  };

  return (
    <Sheet visible={target !== null} title={editing ? 'Edit workout' : 'Add a workout'} onClose={onClose}>
      <TypePicker options={WORKOUT_TYPES} value={type} onChange={setType} />
      <TextField label="Session" value={session} onChangeText={setSession} placeholder="Treadmill intervals" />
      <Grid columns={2}>
        <NumberField label="Duration" unit="min" value={duration} onChangeText={setDuration} />
        <NumberField label="Burned" unit="kcal" value={burned} onChangeText={setBurned} />
      </Grid>
      <Segmented options={INTENSITIES} value={intensity} onChange={setIntensity} />
      <PrimaryButton
        label={editing ? 'Save workout' : 'Add workout'}
        onPress={submit}
        style={{ marginTop: space.xs }}
      />
    </Sheet>
  );
}

/**
 * Editing a past day's weight without leaving the Log.
 *
 * The Today screen owns the keypad; this is the smaller case of correcting a
 * number you already know, so a plain field is the right tool.
 */
function WeighInSheet({
  visible,
  currentKg,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  currentKg: number | null;
  onClose: () => void;
  onSubmit: (kg: number) => void;
}) {
  const { showToast } = useStore();
  const u = useUnits();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (visible) setValue(u.weightField(currentKg));
  }, [visible, currentKg, u]);

  const submit = () => {
    const kg = u.parseWeight(value);
    if (kg == null) return showToast('Enter a weight first');
    onSubmit(kg);
  };

  return (
    <Sheet visible={visible} title={currentKg == null ? 'Add a weigh-in' : 'Edit weigh-in'} onClose={onClose}>
      <NumberField label="Weight" unit={u.labels.weight} value={value} onChangeText={setValue} />
      <PrimaryButton label="Save weigh-in" onPress={submit} style={{ marginTop: space.xs }} />
    </Sheet>
  );
}
