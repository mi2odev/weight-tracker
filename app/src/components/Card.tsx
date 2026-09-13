import React from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, space } from '../theme/tokens';
import { Caption, Label, Stat } from './Type';

/**
 * Style-frame rule: cards take a hairline border *or* a light shadow, never
 * both. This app uses the hairline throughout.
 */
export function Card({
  children,
  style,
  hero = false,
  padded = true,
}: {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** 18 pt radius instead of 14 pt. */
  hero?: boolean;
  padded?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.line,
          borderRadius: hero ? radius.lg : radius.md,
        },
        padded && { paddingHorizontal: 13, paddingVertical: 11 },
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** The half-width tile used in the 2-up grids on Progress, Today and Habits. */
export function StatCard({
  label,
  value,
  unit,
  sub,
  valueColor,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  valueColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <Card style={{ flex: 1, gap: 2 }}>
      <Label numberOfLines={1}>{label}</Label>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.xs }}>
        <Stat color={valueColor}>{value}</Stat>
        {!!unit && (
          <Caption style={{ fontSize: 11 }} color={colors.muted}>
            {unit}
          </Caption>
        )}
      </View>
      {!!sub && <Caption numberOfLines={2}>{sub}</Caption>}
    </Card>
  );
}

/**
 * Fixed-column grid.
 *
 * Built from explicit rows of `flex: 1` cells rather than flexWrap — wrapping
 * cannot give equal-width columns once a gap is involved, and every grid in
 * this design is on a strict 2- or 3-column rhythm.
 */
export function Grid({
  children,
  columns = 2,
  gap = space.sm,
}: {
  children: React.ReactNode;
  columns?: number;
  gap?: number;
}) {
  const items = React.Children.toArray(children);
  const rows: React.ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) rows.push(items.slice(i, i + columns));

  return (
    <View style={{ gap }}>
      {rows.map((row, i) => (
        <View key={i} style={{ flexDirection: 'row', gap }}>
          {row.map((cell, j) => (
            <View key={j} style={{ flex: 1 }}>
              {cell}
            </View>
          ))}
          {/* Keep a short final row aligned to the columns above it. */}
          {Array.from({ length: columns - row.length }, (_, k) => (
            <View key={`pad-${k}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** The 2-up stat grid used on Progress, Today and Habits. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return <Grid columns={2}>{children}</Grid>;
}
