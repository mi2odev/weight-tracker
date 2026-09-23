import React, { useMemo, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, MIN_TAP, radius, space, tnum, type } from '../theme/tokens';
import { SaveWeighInError, useStore } from '../data/store';
import { useUnits } from '../data/derived';
import { addWater, UnitFormatter, waterSteps } from '../lib/units';
import { WeighIn } from '../data/types';
import { Card, Grid } from '../components/Card';
import { NumberField, PrimaryButton, Toggle } from '../components/Controls';
import { HabitTicks } from '../components/HabitTicks';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Body, Display, Label } from '../components/Type';
import {
  dailyChange,
  entryFor,
  habitTicks,
  isAdult,
  isLogged,
  mealTotals,
  previousWeight,
  workoutTotals,
} from '../lib/calc';
import { addDays, daysBetween, formatLong, todayKey } from '../lib/date';
import { parseDecimalInput } from '../lib/numberInput';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', '⌫'];

/** 50 pt button + 10 pt padding top and bottom + the 1 pt hairline. */
const SAVE_BAR_HEIGHT = 71;

export function TodayScreen({ onOpenLog }: { onOpenLog: () => void }) {
  const { colors } = useTheme();
  const { data, cursor, setCursor, saveWeighIn, updateEntry, showToast } = useStore();
  const u = useUnits();
  const { profile, entries } = data;

  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);

  const today = todayKey();
  const entry = entryFor(entries, cursor);
  const savedWeight = entry?.weightKg ?? null;
  const dayNumber = daysBetween(profile.startDate, cursor) + 1;

  // The keypad is up whenever there is nothing saved for this day, or the user
  // has explicitly tapped Edit.
  const keypadUp = savedWeight == null || editing;

  const delta = useMemo(() => {
    if (draft !== '') {
      const parsed = u.parseWeight(draft);
      if (parsed == null) return null;
      return parsed - previousWeight(entries, profile, cursor);
    }
    return dailyChange(entries, profile, cursor);
  }, [draft, entries, profile, cursor, u]);

  const ticks = habitTicks(entry, profile, cursor, today);
  const dayHasData = isLogged(entry);

  const meals = mealTotals(data.meals, cursor);
  const workouts = workoutTotals(data.workouts, cursor);

  const pressKey = (key: string) => {
    setDraft((prev) => {
      // The keypad works in whatever unit is on screen; conversion to metric
      // happens once, on save.
      let next = prev !== '' ? prev : savedWeight != null ? u.weightField(savedWeight) : '';
      if (key === '⌫') next = next.slice(0, -1);
      else if (key === '.') next = !next.includes('.') && next !== '' ? `${next}.` : next;
      else next = (next + key).replace(/^0+(\d)/, '$1').slice(0, 5);
      return next;
    });
  };

  const draftKg = draft !== '' ? u.parseWeight(draft) : savedWeight;

  /**
   * Validated as you type rather than after the fact, so the Save button can
   * say why it is unavailable instead of a toast explaining it afterwards.
   */
  const draftError =
    draft === '' || draftKg == null
      ? null
      : draftKg < 30 || draftKg > 400
        ? `Enter a weight between ${u.weightValue(30)} and ${u.weight(400)}`
        : null;

  const onSave = () => {
    if (draftKg == null) {
      showToast('Enter a weight first');
      return;
    }
    const error = saveWeighIn(cursor, draftKg);
    if (error) showToast(saveErrorText(error, u));
    else {
      setDraft('');
      setEditing(false);
    }
  };

  /** Typing into a field marks it manual, so the meal/workout roll-up leaves it alone. */
  const setNumericField = (field: keyof WeighIn, manualFlag?: keyof WeighIn) => (text: string) => {
    // "2." parses to null, which is right: there is no number yet. The field
    // keeps the text either way, so the decimal point survives the round trip.
    const parsed = parseDecimalInput(text);
    updateEntry(cursor, {
      [field]: parsed,
      ...(manualFlag ? { [manualFlag]: text.trim() !== '' } : {}),
    } as Partial<WeighIn>);
  };

  const fieldText = (value: number | null | undefined) => (value == null ? '' : String(value));

  const saveLabel = savedWeight != null && !editing ? 'Update today' : 'Save weigh-in';
  const saveDisabled = draftError != null || (savedWeight != null && !editing && draft === '');

  return (
    <Screen
      title={cursor === today ? 'Today' : formatLong(cursor).split(' ')[0]}
      meta={`Day ${dayNumber} of 730`}
      contentStyle={{ gap: 0 }}
      footerHeight={SAVE_BAR_HEIGHT}
      footer={
        <View
          style={{
            paddingHorizontal: space.lg,
            paddingVertical: space.sm + 2,
            backgroundColor: colors.page,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <PrimaryButton label={saveLabel} onPress={onSave} disabled={saveDisabled} />
        </View>
      }
    >
      {/* ── date navigator ──────────────────────────────────────────────── */}
      <View
        style={{
          marginTop: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          height: 48,
          paddingHorizontal: space.xs,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous day"
          onPress={() => {
            setCursor(addDays(cursor, -1));
            setDraft('');
            setEditing(false);
          }}
          style={{ width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon name="chevronLeft" size={15} color={colors.muted} strokeWidth={2} />
        </Pressable>

        <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>{formatLong(cursor)}</Body>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next day"
          accessibilityState={{ disabled: cursor >= today }}
          disabled={cursor >= today}
          onPress={() => {
            setCursor(addDays(cursor, 1));
            setDraft('');
            setEditing(false);
          }}
          style={{ width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icon
            name="chevronRight"
            size={15}
            color={cursor >= today ? colors.disabled : colors.muted}
            strokeWidth={2}
          />
        </Pressable>
      </View>

      {/* ── the hero weigh-in ───────────────────────────────────────────── */}
      <Card hero style={{ marginTop: space.sm + 2, paddingHorizontal: 18, paddingTop: space.lg, paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Label style={type.eyebrow}>Weight</Label>
          {savedWeight != null && !editing && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit this weigh-in"
              onPress={() => {
                setEditing(true);
                setDraft('');
              }}
              style={{
                minHeight: 32,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={colors.accent}>
                Edit
              </Body>
            </Pressable>
          )}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm, marginTop: 2, minHeight: 70 }}>
          {draft !== '' || savedWeight != null ? (
            <Display>{draft !== '' ? draft : u.weightValue(savedWeight)}</Display>
          ) : (
            // Caret where the numeral will go.
            <View style={{ height: 70, justifyContent: 'center', paddingLeft: 2 }}>
              <View style={{ width: 3, height: 52, borderRadius: 2, backgroundColor: colors.accent }} />
            </View>
          )}
          <Body style={{ fontFamily: font.medium, fontSize: 20 }} color={colors.muted}>
            {u.labels.weight}
          </Body>
        </View>

        <View style={{ marginTop: 6 }}>
          <Body
            style={{ fontFamily: font.medium, fontSize: 14 }}
            color={draftError ? colors.missed : deltaColor(delta, colors)}
          >
            {draftError ?? deltaText(delta, draftKg, cursor === today, u)}
          </Body>
        </View>
      </Card>

      {/* ── keypad ──────────────────────────────────────────────────────── */}
      {keypadUp && (
        <View style={{ marginTop: space.md }}>
          <Grid columns={3}>
            {KEYS.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === '⌫' ? 'Delete' : key}
                onPress={() => pressKey(key)}
                style={({ pressed }) => ({
                  minHeight: 52,
                  borderRadius: radius.md,
                  backgroundColor: pressed ? colors.tint : colors.card,
                  borderWidth: 1,
                  borderColor: colors.line,
                  alignItems: 'center',
                  justifyContent: 'center',
                })}
              >
                <Body style={[{ fontFamily: font.medium, fontSize: 23 }, tnum]}>{key}</Body>
              </Pressable>
            ))}
          </Grid>
        </View>
      )}

      {/* ── derived habit ticks ─────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <HabitTicks ticks={ticks} dayHasData={dayHasData} />
      </View>

      {/* ── water: typed, or a glass at a time ─────────────────────────── */}
      <View style={{ marginTop: space.md, flexDirection: 'row', gap: space.sm }}>
        <View style={{ flex: 1 }}>
          <NumberField
              label="Water"
              unit={u.labels.volume}
              hint={volumeTargetHint(entry?.waterL, profile.targetWaterL, u)}
              value={u.volumeField(entry?.waterL)}
              onChangeText={(text) =>
                updateEntry(cursor, { waterL: text === '' ? null : u.parseVolume(text) })
              }
              valueColor={missedColor(entry?.waterL, profile.targetWaterL, colors)}
            />
        </View>
        <View style={{ gap: space.xs, justifyContent: 'center' }}>
          {waterSteps(u.units).map((step) => (
            <Pressable
              key={step.label}
              accessibilityRole="button"
              accessibilityLabel={`Add ${step.label.slice(1)} of water`}
              onPress={() => updateEntry(cursor, { waterL: addWater(entry?.waterL, step.litres) })}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 36,
                paddingHorizontal: space.md,
                borderRadius: radius.sm,
                backgroundColor: pressed ? colors.line : colors.tint,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={colors.accent}>
                {step.label}
              </Body>
            </Pressable>
          ))}
        </View>
      </View>

      {/* ── the other optional fields ───────────────────────────────────── */}
      <View style={{ marginTop: space.md }}>
        <Grid columns={2}>
        <NumberField
          label="Calories"
          unit="kcal"
          // No target under 18: the app sets none, so the field is a plain
          // log rather than something to hit.
          hint={
            isAdult(profile)
              ? `Target ${profile.targetCalories.toLocaleString('en-GB')}`
              : 'Logged, not scored'
          }
          value={fieldText(entry?.calories)}
          onChangeText={setNumericField('calories', 'manualCalories')}
        />
        <NumberField
          label="Protein"
          unit="g"
          hint={`Target ${profile.targetProteinG} g`}
          value={fieldText(entry?.proteinG)}
          onChangeText={setNumericField('proteinG', 'manualProtein')}
        />
        <NumberField
          label="Steps"
          hint={targetHint(entry?.steps, profile.targetSteps, '')}
          value={fieldText(entry?.steps)}
          onChangeText={setNumericField('steps')}
          valueColor={missedColor(entry?.steps, profile.targetSteps, colors)}
        />
        <NumberField
          label="Cardio"
          unit="min"
          hint="Any minutes count"
          value={fieldText(entry?.cardioMin)}
          onChangeText={setNumericField('cardioMin', 'manualCardio')}
        />
        <NumberField
          label="Sleep"
          unit="h"
          hint={targetHint(entry?.sleepH, profile.targetSleepH, 'h')}
          value={fieldText(entry?.sleepH)}
          onChangeText={setNumericField('sleepH')}
          valueColor={missedColor(entry?.sleepH, profile.targetSleepH, colors)}
        />

        {/* Strength — a toggle rather than a number */}
        <Card style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm }}>
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Label>Strength</Label>
            <Body
              style={{ fontFamily: font.semibold, fontSize: 13 }}
              color={entry?.strengthDone ? colors.text : colors.disabled}
            >
              {entry?.strengthDone ? 'Yes' : 'No'}
            </Body>
          </View>
          <Toggle
            value={!!entry?.strengthDone}
            accessibilityLabel="Strength session"
            onChange={(next) => updateEntry(cursor, { strengthDone: next, manualCardio: true })}
          />
        </Card>

        </Grid>
        <Card style={{ marginTop: space.sm, gap: 4 }}>
          <Label>Notes</Label>
          <TextInput
            value={entry?.notes ?? ''}
            onChangeText={(text) => updateEntry(cursor, { notes: text })}
            placeholder="How did the day feel?"
            placeholderTextColor={colors.disabled}
            multiline
            accessibilityLabel="Notes"
            style={{
              padding: 0,
              minHeight: 40,
              fontFamily: font.regular,
              fontSize: 14,
              lineHeight: 20,
              color: colors.text,
            }}
          />
        </Card>
      </View>

      {/* ── meals and training ──────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenLog}
        style={{
          marginTop: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: radius.md,
          minHeight: 48,
          paddingHorizontal: space.lg,
        }}
      >
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }} color={colors.accent}>
          Meals &amp; training
        </Body>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Body style={{ fontFamily: font.medium, fontSize: 13 }} color={colors.muted}>
            {meals.count || workouts.count
              ? `${meals.count} ${meals.count === 1 ? 'meal' : 'meals'} · ${workouts.count} ${
                  workouts.count === 1 ? 'session' : 'sessions'
                }`
              : 'Nothing yet'}
          </Body>
          <Icon name="chevronRight" size={12} color={colors.muted} />
        </View>
      </Pressable>
    </Screen>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * The store returns a reason code rather than prose, because only the screen
 * knows whether this user reads kilograms or pounds.
 */
function saveErrorText(error: SaveWeighInError, u: UnitFormatter): string {
  switch (error) {
    case 'not-a-number':
      return 'Enter a weight first';
    case 'out-of-range':
      return `Enter a weight between ${u.weightValue(30)} and ${u.weight(400)}`;
    case 'future':
      return 'You cannot log a weigh-in in the future';
  }
}

type Colors = ReturnType<typeof useTheme>['colors'];

/**
 * A loss is green; a gain is *not* red. The amber-red in this palette marks a
 * missed habit only, so a gain reads in plain text with an up arrow — the
 * arrow, not the colour, is what carries the direction.
 */
function deltaColor(delta: number | null, colors: Colors): string {
  if (delta == null) return colors.muted;
  return delta < -0.05 ? colors.greenText : colors.text;
}

function deltaText(
  delta: number | null,
  draftKg: number | null,
  isToday: boolean,
  u: UnitFormatter,
): string {
  if (delta == null) {
    return draftKg == null ? 'Nothing logged yet — tap a number' : 'First weigh-in of the plan';
  }
  const since = isToday ? 'yesterday' : 'the last weigh-in';
  const shown = u.weightDelta(delta);
  return shown === 'No change' ? `No change since ${since}` : `${shown} since ${since}`;
}

/** "− 0.2 L under 3 L" / "+ 1,240 over 8,000" — the shortfall spelled out. */
function targetHint(value: number | null | undefined, target: number, unit: string): string {
  const suffix = unit ? ` ${unit}` : '';
  if (value == null) return `Target ${target.toLocaleString('en-GB')}${suffix}`;
  const diff = value - target;
  if (Math.abs(diff) < 0.001) return `Exactly ${target.toLocaleString('en-GB')}${suffix}`;
  const rounded = unit === '' ? Math.round(Math.abs(diff)).toLocaleString('en-GB') : Math.abs(diff).toFixed(1);
  return diff < 0
    ? `− ${rounded}${suffix} under ${target.toLocaleString('en-GB')}${suffix}`
    : `+ ${rounded}${suffix} over ${target.toLocaleString('en-GB')}${suffix}`;
}

/** The same shortfall sentence, in whichever volume unit is on screen. */
function volumeTargetHint(
  litres: number | null | undefined,
  targetLitres: number,
  u: UnitFormatter,
): string {
  if (litres == null) return `Target ${u.volume(targetLitres)}`;
  const diff = litres - targetLitres;
  if (Math.abs(diff) < 0.001) return `Exactly ${u.volume(targetLitres)}`;
  // Under a litre, millilitres: glasses are 250 ml, and "0.1 L over" for
  // 50 ml was both rounded and harder to read.
  const magnitude =
    u.units === 'metric' && Math.abs(diff) < 1
      ? `${Math.round(Math.abs(diff) * 1000)} ml`
      : u.volume(Math.abs(diff));
  return diff < 0
    ? `− ${magnitude} under ${u.volume(targetLitres)}`
    : `+ ${magnitude} over ${u.volume(targetLitres)}`;
}

/** Amber-red on a logged value that missed its habit threshold. */
function missedColor(value: number | null | undefined, target: number, colors: Colors): string | undefined {
  if (value == null) return undefined;
  return value < target ? colors.missed : undefined;
}
