import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { HabitKey, HABIT_KEYS } from '../data/types';
import { Card } from './Card';
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
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>Habits</Body>
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }} color={colors.muted} numeric>
          {met} of 6 met
        </Body>
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
