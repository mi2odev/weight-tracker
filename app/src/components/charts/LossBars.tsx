import React from 'react';
import { View } from 'react-native';
import { useTheme } from '../../theme/ThemeContext';
import { font, tnum } from '../../theme/tokens';
import { Caption } from '../Type';

const TRACK_HEIGHT = 132;
const MAX_BAR = 92;

export interface Bar {
  label: string;
  /** Positive is a loss. */
  value: number | null;
}

/**
 * Kilos lost per week or per month.
 *
 * Colour mapping from the design brief: losses are progress-green, flat or
 * gaining periods are neutral grey. A gain is never red — the amber-red in
 * this palette belongs to missed habits alone.
 */
export function LossBars({ bars }: { bars: Bar[] }) {
  const { colors } = useTheme();
  const max = Math.max(0.6, ...bars.map((b) => Math.abs(b.value ?? 0)));

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: TRACK_HEIGHT }}>
      {bars.map((bar, i) => {
        const value = bar.value ?? 0;
        const isLoss = value > 0.05;
        const height = Math.max(4, (Math.abs(value) / max) * MAX_BAR);
        return (
          <View
            key={`${bar.label}-${i}`}
            style={{ flex: 1, maxWidth: 52, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}
          >
            <Caption style={[{ fontSize: 10, fontFamily: font.semibold }, tnum]}>
              {bar.value == null ? '—' : `${isLoss ? '' : value < -0.05 ? '+' : ''}${Math.abs(value).toFixed(1)}`}
            </Caption>
            <View
              style={{
                width: '100%',
                height,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomLeftRadius: 4,
                borderBottomRightRadius: 4,
                backgroundColor: isLoss ? colors.green : colors.neutral,
              }}
            />
            <Caption style={{ fontSize: 10, fontFamily: font.semibold }}>{bar.label}</Caption>
          </View>
        );
      })}
    </View>
  );
}
