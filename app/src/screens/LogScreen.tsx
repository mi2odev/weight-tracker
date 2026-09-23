import { useEffect, useState } from 'react';
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
  SavedMeal,
  SavedWorkout,
  WORKOUT_TYPES,
  WorkoutEntry,
  WorkoutType,
} from '../data/types';
import { Card, Grid } from '../components/Card';
import {
  GhostButton,
  NumberField,
  PrimaryButton,
  SectionHeading,
  Segmented,
  Toggle,
} from '../components/Controls';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { Screen } from '../components/Screen';
import { DateNavigator } from '../components/DateNavigator';
import { Body, Caption } from '../components/Type';
import { entryFor, mealTotals, workoutTotals } from '../lib/calc';
import { addDays, formatShort } from '../lib/date';
import { parseDecimalInput } from '../lib/numberInput';
import {
  matchesQuery,
  quickMeals,
  rankSavedMeals,
  rankSavedWorkouts,
  savedMealSummary,
  savedWorkoutSummary,
} from '../lib/templates';

export function LogScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const {
    data,
    today,
    cursor,
    setCursor,
    addMeal,
    updateMeal,
    removeMeal,
    addWorkout,
    updateWorkout,
    removeWorkout,
    removeWeighIn,
    saveWeighIn,
    showToast,
    logSavedMeal,
    copyMealsFromDay,
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
  const quick = quickMeals(data.savedMeals, data.meals, cursor);
  const previousDay = addDays(cursor, -1);
  const previousMealCount = data.meals.filter((m) => m.logDate === previousDay).length;
  const previousLabel = previousDay === addDays(today, -1) ? 'yesterday' : formatShort(previousDay);

  const dayLabel = cursor === today ? 'today' : formatShort(cursor);
  const dayWeight = entryFor(data.entries, cursor)?.weightKg ?? null;

  return (
    <Screen title="Food & training" onBack={onBack}>
      <DateNavigator cursor={cursor} firstDay={data.profile.startDate} onChange={setCursor} />

      <View style={{ marginTop: space.md }}>
        <SectionHeading title="Weigh-in" />
      </View>
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
            {previousMealCount > 0 && (
              <Pressable
                accessibilityRole="button"
                onPress={() => copyMealsFromDay(previousDay, cursor)}
                style={({ pressed }) => ({
                  marginTop: space.sm,
                  minHeight: MIN_TAP,
                  paddingHorizontal: space.lg,
                  justifyContent: 'center',
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Body style={{ fontFamily: font.semibold, fontSize: 14 }} color={colors.accent}>
                  Copy {previousMealCount === 1 ? '1 meal' : `${previousMealCount} meals`} from {previousLabel}
                </Body>
              </Pressable>
            )}
          </Card>
        )}

        {quick.length > 0 && (
          <View style={{ gap: 6 }}>
            <Caption style={{ fontSize: 11.5 }}>Quick add</Caption>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
              {quick.map((template) => (
                <Pressable
                  key={template.id}
                  accessibilityRole="button"
                  accessibilityLabel={`Add ${template.description}, ${savedMealSummary(template)}`}
                  onPress={() => logSavedMeal(template.id, cursor)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: MIN_TAP,
                    maxWidth: '100%',
                    paddingHorizontal: space.md,
                    borderRadius: radius.pill,
                    borderWidth: 1,
                    borderColor: colors.line,
                    opacity: pressed ? 0.6 : 1,
                  })}
                >
                  <Icon name="plus" size={12} color={colors.accent} />
                  <Body
                    style={{ fontFamily: font.semibold, fontSize: 13, flexShrink: 1 }}
                    color={colors.accent}
                    numberOfLines={1}
                  >
                    {template.description}
                  </Body>
                </Pressable>
              ))}
            </View>
          </View>
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
        onSubmit={(meal, options) => {
          const editing = mealSheet !== 'new' && mealSheet !== null ? mealSheet : null;
          if (editing) updateMeal(editing.id, meal);
          else addMeal({ ...meal, logDate: cursor }, options);
          setMealSheet(null);
          showToast(
            editing ? 'Meal updated' : options.save ? 'Meal added and saved for reuse' : 'Meal added',
          );
        }}
      />

      <WorkoutSheet
        target={workoutSheet}
        onClose={() => setWorkoutSheet(null)}
        onSubmit={(workout, options) => {
          const editing = workoutSheet !== 'new' && workoutSheet !== null ? workoutSheet : null;
          if (editing) updateWorkout(editing.id, workout);
          else addWorkout({ ...workout, logDate: cursor }, options);
          setWorkoutSheet(null);
          showToast(
            editing
              ? 'Workout updated'
              : options.save
                ? 'Workout added and saved for reuse'
                : 'Workout added',
          );
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

/**
 * The saved-templates list at the top of an entry sheet.
 *
 * Tapping a row *fills the form* rather than logging straight away — the
 * numbers on a repeated meal shift a little, and the user should get to look
 * before it lands in their day. Removing is a separate small target on the
 * right, so a mis-tap costs a fill rather than a deletion.
 */
function SavedPicker({
  title,
  items,
  onUse,
  onRemove,
}: {
  title: string;
  items: { id: string; name: string; detail: string }[];
  onUse: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const [showAll, setShowAll] = useState(false);

  // A long library turns the sheet into a scroll before the form even starts,
  // so past a handful it gets a search box and shows the most-used few.
  const searchable = items.length > PICKER_PREVIEW;
  const matches = items.filter((i) => matchesQuery(`${i.name} ${i.detail}`, query));
  const shown = query.trim() || showAll ? matches : matches.slice(0, PICKER_PREVIEW);
  const hidden = matches.length - shown.length;

  return (
    <View style={{ gap: space.xs }}>
      <Caption style={{ fontSize: 10.5, letterSpacing: 0.735, textTransform: 'uppercase', fontFamily: font.semibold }}>
        {title}
      </Caption>
      {searchable && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            minHeight: 42,
            paddingHorizontal: 13,
            borderRadius: radius.pill,
            backgroundColor: colors.rail,
          }}
        >
          <Icon name="search" size={14} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${items.length} saved`}
            placeholderTextColor={colors.disabled}
            accessibilityLabel={`Search ${title.toLowerCase()}`}
            autoCorrect={false}
            style={{ flex: 1, padding: 0, fontFamily: font.regular, fontSize: 14, color: colors.text, outlineWidth: 0 }}
          />
          {!!query && (
            <Pressable accessibilityRole="button" accessibilityLabel="Clear search" hitSlop={8} onPress={() => setQuery('')}>
              <Icon name="close" size={12} color={colors.muted} strokeWidth={1.8} />
            </Pressable>
          )}
        </View>
      )}
      {!shown.length && (
        <Caption style={{ fontSize: 12, paddingHorizontal: space.xs, paddingVertical: space.xs }}>
          Nothing saved matches “{query.trim()}”.
        </Caption>
      )}
      {shown.map((item) => (
        <View
          key={item.id}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: radius.md,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Use ${item.name}`}
            onPress={() => onUse(item.id)}
            style={({ pressed }) => ({
              flex: 1,
              gap: 1,
              paddingVertical: 11,
              paddingLeft: 13,
              paddingRight: space.sm,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Body numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: 14 }}>
              {item.name}
            </Body>
            <Caption numberOfLines={1} style={{ fontSize: 11.5 }}>
              {item.detail}
            </Caption>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name} from saved`}
            hitSlop={8}
            onPress={() => onRemove(item.id)}
            style={{ paddingHorizontal: 13, paddingVertical: 14 }}
          >
            <Icon name="close" size={13} color={colors.muted} strokeWidth={1.8} />
          </Pressable>
        </View>
      ))}
      {hidden > 0 && (
        <Pressable
          accessibilityRole="button"
          onPress={() => setShowAll(true)}
          style={{ minHeight: 36, justifyContent: 'center', paddingHorizontal: space.xs }}
        >
          <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={colors.accent}>
            Show {hidden} more
          </Body>
        </Pressable>
      )}
    </View>
  );
}

/** Saved rows shown before "Show N more". */
const PICKER_PREVIEW = 5;

/** The "keep this for next time" switch at the foot of an entry sheet. */
function SaveForReuse({
  value,
  onChange,
  label,
  hint,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingHorizontal: 13,
        paddingVertical: 11,
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        borderRadius: radius.md,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>{label}</Body>
        <Caption style={{ fontSize: 11.5, lineHeight: 16 }}>{hint}</Caption>
      </View>
      <Toggle value={value} onChange={onChange} accessibilityLabel={label} />
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
  onSubmit: (
    meal: { mealType: MealType; description: string; calories: number; proteinG: number },
    options: { save: boolean },
  ) => void;
}) {
  const { data, showToast, removeSavedMeal } = useStore();
  const editing = target !== 'new' && target !== null ? target : null;

  const [mealType, setMealType] = useState<MealType>('Breakfast');
  const [description, setDescription] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [save, setSave] = useState(false);

  // Most-eaten first, so the daily breakfast is the first thing in reach.
  const saved = rankSavedMeals(data.savedMeals, data.meals);

  // Refill the form whenever the sheet opens on a different row.
  useEffect(() => {
    if (target === null) return;
    setMealType(editing?.mealType ?? 'Breakfast');
    setDescription(editing?.description ?? '');
    setCalories(editing ? String(editing.calories) : '');
    setProtein(editing ? String(editing.proteinG) : '');
    setSave(false);
  }, [target, editing]);

  /** Fills the form from a saved meal, leaving the user free to adjust it. */
  const useSaved = (meal: SavedMeal) => {
    setMealType(meal.mealType);
    setDescription(meal.description);
    setCalories(String(meal.calories));
    setProtein(String(meal.proteinG));
  };

  /**
   * A blank number means zero, not a mistake.
   *
   * Requiring both refused to save an apple from anyone who did not know its
   * protein — which is most people, most of the time. The description is the
   * only thing actually needed to make the row worth having; a number that is
   * out of range is still refused, because that is a typo rather than a gap.
   */
  const submit = () => {
    if (!description.trim()) return showToast('Describe the meal first');

    const kcal = parseDecimalInput(calories) ?? 0;
    const pro = parseDecimalInput(protein) ?? 0;
    if (kcal < 0 || kcal > 10000) return showToast('Calories must be 0–10 000');
    if (pro < 0 || pro > 500) return showToast('Protein must be 0–500 g');

    onSubmit(
      {
        mealType,
        description: description.trim(),
        calories: Math.round(kcal),
        proteinG: Math.round(pro),
      },
      { save },
    );
  };

  return (
    <Sheet visible={target !== null} title={editing ? 'Edit meal' : 'Add a meal'} onClose={onClose}>
      {!editing && saved.length > 0 && (
        <SavedPicker
          title="Saved meals"
          items={saved.map((m) => ({
            id: m.id,
            name: m.description,
            detail: `${m.mealType} · ${savedMealSummary(m)}`,
          }))}
          onUse={(id) => {
            const meal = saved.find((m) => m.id === id);
            if (meal) useSaved(meal);
          }}
          onRemove={removeSavedMeal}
        />
      )}

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
      {!editing && (
        <SaveForReuse
          value={save}
          onChange={setSave}
          label="Keep this meal for reuse"
          hint="It will appear at the top of this sheet next time."
        />
      )}
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
  }, options: { save: boolean }) => void;
}) {
  const { data, showToast, removeSavedWorkout } = useStore();
  const editing = target !== 'new' && target !== null ? target : null;

  const [type, setType] = useState<WorkoutType>('Cardio');
  const [session, setSession] = useState('');
  const [duration, setDuration] = useState('');
  const [intensity, setIntensity] = useState<Intensity>('Medium');
  const [burned, setBurned] = useState('');
  const [save, setSave] = useState(false);

  const saved = rankSavedWorkouts(data.savedWorkouts, data.workouts);

  useEffect(() => {
    if (target === null) return;
    setType(editing?.type ?? 'Cardio');
    setSession(editing?.session ?? '');
    setDuration(editing ? String(editing.durationMin) : '');
    setIntensity(editing?.intensity ?? 'Medium');
    setBurned(editing ? String(editing.caloriesBurned) : '');
    setSave(false);
  }, [target, editing]);

  const useSaved = (workout: SavedWorkout) => {
    setType(workout.type);
    setSession(workout.session);
    setDuration(String(workout.durationMin));
    setIntensity(workout.intensity);
    setBurned(String(workout.caloriesBurned));
  };

  /** Same rule as a meal: a blank number is zero, not a reason to refuse. */
  const submit = () => {
    if (!session.trim()) return showToast('Name the session first');

    const mins = parseDecimalInput(duration) ?? 0;
    const kcal = parseDecimalInput(burned) ?? 0;
    if (mins < 0 || mins > 600) return showToast('Duration must be 0–600 minutes');
    if (kcal < 0) return showToast('Calories burned must be a positive number');
    onSubmit(
      {
        type,
        session: session.trim(),
        durationMin: Math.round(mins),
        intensity,
        caloriesBurned: Math.round(kcal),
      },
      { save },
    );
  };

  return (
    <Sheet visible={target !== null} title={editing ? 'Edit workout' : 'Add a workout'} onClose={onClose}>
      {!editing && saved.length > 0 && (
        <SavedPicker
          title="Saved workouts"
          items={saved.map((w) => ({
            id: w.id,
            name: w.session,
            detail: `${w.type} · ${savedWorkoutSummary(w)}`,
          }))}
          onUse={(id) => {
            const workout = saved.find((w) => w.id === id);
            if (workout) useSaved(workout);
          }}
          onRemove={removeSavedWorkout}
        />
      )}

      <TypePicker options={WORKOUT_TYPES} value={type} onChange={setType} />
      <TextField label="Session" value={session} onChangeText={setSession} placeholder="Treadmill intervals" />
      <Grid columns={2}>
        <NumberField label="Duration" unit="min" value={duration} onChangeText={setDuration} />
        <NumberField label="Burned" unit="kcal" value={burned} onChangeText={setBurned} />
      </Grid>
      <Segmented options={INTENSITIES} value={intensity} onChange={setIntensity} />
      {!editing && (
        <SaveForReuse
          value={save}
          onChange={setSave}
          label="Keep this workout for reuse"
          hint="It will appear at the top of this sheet next time."
        />
      )}
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
