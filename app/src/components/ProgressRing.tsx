import React from 'react';
import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useTheme } from '../theme/ThemeContext';

/**
 * A thin ring that fills clockwise from twelve o'clock. Children sit in the
 * middle — usually the number the ring stands for, so colour is never the
 * only signal.
 */
export function ProgressRing({
  value,
  size = 48,
  stroke = 5,
  color,
  children,
}: {
  /** 0 – 1. */
  value: number;
  size?: number;
  stroke?: number;
  color?: string;
  children?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(1, Math.max(0, value));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.rail} strokeWidth={stroke} fill="none" />
        {v > 0 && (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color ?? colors.accent}
            strokeWidth={stroke}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={`${c} ${c}`}
            strokeDashoffset={c * (1 - v)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </Svg>
      {children}
    </View>
  );
}
