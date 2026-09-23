import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';

/**
 * The 104 × 44 sparkline in the corner of the Progress hero card —
 * the last 14 weigh-ins, no axis, no dots.
 */
export function Sparkline({
  values,
  width = 104,
  height = 44,
}: {
  values: number[];
  width?: number;
  height?: number;
}) {
  const { colors } = useTheme();
  if (values.length < 2) return null;

  const lo = Math.min(...values) - 0.2;
  const hi = Math.max(...values) + 0.2;
  const span = hi - lo || 1;

  const d = values
    .map((v, i) => {
      const x = 2 + (i / (values.length - 1)) * (width - 4);
      const y = 4 + (1 - (v - lo) / span) * (height - 10);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    // Decorative: the same numbers are already announced by the hero card it
    // sits beside, so repeating them would just be noise.
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path
        d={d}
        fill="none"
        stroke={colors.accent}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
