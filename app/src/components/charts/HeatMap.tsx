import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { font, space } from '../../theme/tokens';
import { Caption } from '../Type';
import { Profile, WeighIn } from '../../data/types';
import { entryFor, habitsMetCount, habitTicks } from '../../lib/calc';
import { addDays, fromKey, WEEKDAY_INITIALS, weekdayIndex } from '../../lib/date';

const WEEKS = 5;

/**
 * Daily habit score as a calendar heat map, Monday-first, five weeks ending on
 * the current week.
 *
 * The ramp is indexed by the number of habits met (0–6) rather than a bucketed
 * percentage, which is what the style frame's swatch row is labelled against.
 * Days outside the plan — before the start date, or still in the future — get
 * no tile at all rather than a zero-score tile.
 */
export function HeatMap({
  entries,
  profile,
  asOf,
}: {
  entries: WeighIn[];
  profile: Profile;
  asOf: string;
}) {
  const { colors } = useTheme();

  // End the grid on the Sunday of the current week so the columns line up
  // under their weekday initials.
  const lastCell = addDays(asOf, 6 - weekdayIndex(asOf));
  const firstCell = addDays(lastCell, -(WEEKS * 7 - 1));

  const rows: string[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    rows.push(Array.from({ length: 7 }, (_, d) => addDays(firstCell, w * 7 + d)));
  }

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 5 }}>
        {WEEKDAY_INITIALS.map((initial, i) => (
          <Caption key={i} style={{ flex: 1, fontSize: 10, textAlign: 'center', fontFamily: font.semibold }}>
            {initial}
          </Caption>
        ))}
      </View>

      <View style={{ gap: 5, marginTop: 5 }}>
        {rows.map((row, r) => (
          <View key={r} style={{ flexDirection: 'row', gap: 5 }}>
            {row.map((date) => {
              const ticks = habitTicks(entryFor(entries, date), profile, date, asOf);
              const outside = ticks === null;
              const met = habitsMetCount(ticks);

              return (
                <View
                  key={date}
                  accessible
                  accessibilityLabel={
                    outside
                      ? `${date}, outside your plan`
                      : `${date}, ${met} of 6 habits met`
                  }
                  style={{
                    flex: 1,
                    aspectRatio: 1,
                    borderRadius: 9,
                    backgroundColor: outside ? 'transparent' : colors.heat[met],
                    borderWidth: 1,
                    borderColor: outside ? colors.line : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Caption
                    style={{ fontSize: 9.5, fontFamily: font.semibold }}
                    color={outside ? colors.disabled : met >= 4 ? colors.card : colors.muted}
                  >
                    {fromKey(date).getDate()}
                  </Caption>
                </View>
              );
            })}
          </View>
        ))}
      </View>

      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: space.md, justifyContent: 'flex-end' }}
      >
        <Caption style={{ fontSize: 10.5 }}>0</Caption>
        {colors.heat.map((hex, i) => (
          <View
            key={i}
            style={{ width: 16, height: 10, borderRadius: 3, backgroundColor: hex, borderWidth: 1, borderColor: colors.line }}
          />
        ))}
        <Caption style={{ fontSize: 10.5 }}>6 habits</Caption>
      </View>
    </View>
  );
}
