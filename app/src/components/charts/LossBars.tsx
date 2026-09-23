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
export function LossBars({
  bars,
  format = (kg) => kg.toFixed(1),
  unit = 'kg',
  scaleFloor = 0.6,
}: {
  bars: Bar[];
  /** Kilograms → the number printed on a bar, in the user's unit. */
  format?: (kg: number) => string;
  unit?: string;
  /** The smallest full-height value, so a quiet period doesn't draw as a cliff. */
  scaleFloor?: number;
}) {
  const { colors } = useTheme();
  const max = Math.max(scaleFloor, ...bars.map((b) => Math.abs(b.value ?? 0)));

  const summary = bars
    .filter((b) => b.value != null)
    .map((b) => `${b.label}: ${(b.value as number) > 0 ? 'lost' : 'gained'} ${format(Math.abs(b.value as number))} ${unit}`)
    .join(', ');

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summary ? `Weight change per period. ${summary}` : 'No periods to compare yet'}
      style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: TRACK_HEIGHT }}
    >
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
              {bar.value == null ? '—' : `${isLoss ? '' : value < -0.05 ? '+' : ''}${format(Math.abs(value))}`}
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
