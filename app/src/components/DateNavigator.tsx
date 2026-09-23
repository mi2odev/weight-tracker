import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, MIN_TAP, radius, space } from '../theme/tokens';
import { addDays, formatLong, todayKey } from '../lib/date';
import { DateKey } from '../data/types';
import { Icon } from './Icon';
import { Body } from './Type';

/**
 * ‹ Wednesday 23 September ›
 *
 * Shared by Today and the food log so both move through days the same way.
 * Never steps past today — there is nothing to log in the future. When the
 * day shown is not today, tapping the date jumps straight back.
 */
export function DateNavigator({
  cursor,
  onChange,
}: {
  cursor: DateKey;
  onChange: (date: DateKey) => void;
}) {
  const { colors } = useTheme();
  const today = todayKey();
  const atToday = cursor >= today;

  return (
    <View
      style={{
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
        onPress={() => onChange(addDays(cursor, -1))}
        style={{ width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="chevronLeft" size={15} color={colors.muted} strokeWidth={2} />
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={atToday ? formatLong(cursor) : `${formatLong(cursor)}. Go to today`}
        disabled={atToday}
        onPress={() => onChange(today)}
        style={{ alignItems: 'center', flexShrink: 1 }}
      >
        <Body style={{ fontFamily: font.semibold, fontSize: 15 }} numberOfLines={1}>
          {formatLong(cursor)}
        </Body>
        {!atToday && (
          <Body style={{ fontFamily: font.semibold, fontSize: 11 }} color={colors.accent}>
            Back to today
          </Body>
        )}
      </Pressable>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Next day"
        accessibilityState={{ disabled: atToday }}
        disabled={atToday}
        onPress={() => onChange(addDays(cursor, 1))}
        style={{ width: MIN_TAP, height: MIN_TAP, alignItems: 'center', justifyContent: 'center' }}
      >
        <Icon name="chevronRight" size={15} color={atToday ? colors.disabled : colors.muted} strokeWidth={2} />
      </Pressable>
    </View>
  );
}
