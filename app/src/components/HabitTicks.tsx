import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { HabitKey, HABIT_KEYS } from '../data/types';
import { Card } from './Card';
import { ProgressRing } from './ProgressRing';
import { Icon, IconName } from './Icon';
import { Body, Caption } from './Type';

export const HABIT_META: Record<HabitKey, { label: string; icon: IconName; rule: (p: HabitRules) => string }> = {
  weight: { label: 'Weight', icon: 'weight', rule: () => 'A weight is logged' },
  calories: { label: 'Kcal', icon: 'food', rule: () => 'Calories logged for the day' },
  water: { label: 'Water', icon: 'water', rule: (p) => `≥ ${p.water} L` },
  steps: { label: 'Steps', icon: 'steps', rule: (p) => `≥ ${p.steps.toLocaleString('en-GB')} steps` },
  workout: { label: 'Move', icon: 'workout', rule: () => 'Cardio minutes or a strength session' },
  sleep: { label: 'Sleep', icon: 'sleep', rule: (p) => `≥ ${p.sleep} h` },
};

export interface HabitRules {
  water: number;
  steps: number;
  sleep: number;
}

/**
 * The six derived ticks. Read-only by design — the spec makes this a rule, not
 * a preference, because hand-editable ticks would let the score drift away
 * from the log.
 *
 * A habit only turns amber-red once the day has something logged: an untouched
 * day is dormant, not failed.
 */
export function HabitTicks({
  ticks,
  dayHasData,
}: {
  ticks: Record<HabitKey, boolean> | null;
  dayHasData: boolean;
}) {
  const { colors } = useTheme();
  const met = ticks ? HABIT_KEYS.filter((k) => ticks[k]).length : 0;

  return (
    <Card hero style={{ paddingHorizontal: space.lg, paddingVertical: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>Daily habits</Body>
          <Caption style={{ fontSize: 12 }}>{headline(met, dayHasData)}</Caption>
        </View>
        <ProgressRing value={met / 6} size={46} stroke={5} color={met === 6 ? colors.green : colors.accent}>
          <Body
            style={{ fontFamily: font.bold, fontSize: 13 }}
            numeric
            accessibilityLabel={`${met} of 6 habits met`}
          >
            {met}/6
          </Body>
        </ProgressRing>
      </View>

      <View style={{ flexDirection: 'row', gap: 6, marginTop: space.md }}>
        {HABIT_KEYS.map((key) => {
          const on = !!ticks?.[key];
          const missed = dayHasData && !on;
          const bg = on ? colors.accent : missed ? colors.missedTint : 'transparent';
          const border = on ? colors.accent : missed ? colors.missed : colors.line;
          const fg = on ? colors.onAccent : missed ? colors.missed : colors.disabled;

          return (
            <View key={key} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
              <View
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${HABIT_META[key].label}: ${on ? 'met' : missed ? 'missed' : 'not logged'}`}
                style={{
                  width: '100%',
                  height: 34,
                  borderRadius: radius.sm,
                  backgroundColor: bg,
                  borderWidth: 1,
                  borderColor: border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={HABIT_META[key].icon} size={15} color={fg} />
              </View>
              <Caption style={{ fontSize: 9, letterSpacing: 0.1 }}>{HABIT_META[key].label}</Caption>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

/** The line under "Daily habits" — encouragement, never a scolding. */
function headline(met: number, dayHasData: boolean): string {
  if (!dayHasData) return 'Log anything to get started';
  if (met === 6) return 'All six — a perfect day';
  if (met >= 4) return `${6 - met} to go — nearly there`;
  if (met >= 1) return `${met} done, ${6 - met} still open`;
  return 'Every tick counts';
}
