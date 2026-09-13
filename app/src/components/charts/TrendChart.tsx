import React, { useState } from 'react';
import { LayoutChangeEvent, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeContext';
import { font, space, tnum } from '../../theme/tokens';
import { Body, Caption } from '../Type';
import { DateKey, Profile, WeighIn } from '../../data/types';
import { f1, mean, weighedEntries } from '../../lib/calc';
import { daysBetween, formatShort } from '../../lib/date';

const PLOT_TOP = 12;
const PLOT_HEIGHT = 126;
const CHART_HEIGHT = 168;
/** Where the goal line sits when the goal is below the plotted range. */
const FLOOR_Y = 158;
const GUTTER = 26;

const NICE_STEPS = [0.25, 0.5, 1, 1.5, 2, 2.5, 5, 10];

function niceStep(span: number): number {
  const raw = span / 3.5;
  return NICE_STEPS.find((s) => s >= raw) ?? 10;
}

/**
 * Weight trend — grey daily weigh-in dots, a solid teal 7-day average, and a
 * dashed goal line, exactly the mapping the design brief specifies.
 *
 * The SVG is drawn in real pixel coordinates rather than a scaled viewBox so
 * the y-axis labels, which are Text nodes outside the SVG, line up with the
 * gridlines at every screen width.
 */
export function TrendChart({
  entries,
  profile,
  asOf,
}: {
  entries: WeighIn[];
  profile: Profile;
  asOf: DateKey;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);

  const series = weighedEntries(entries).filter((e) => e.logDate <= asOf);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  if (series.length < 2 || width === 0) {
    // Still return the measuring view so a layout pass can happen.
    return <View onLayout={onLayout} style={{ height: CHART_HEIGHT }} />;
  }

  const weights = series.map((e) => e.weightKg);
  const dataMin = Math.min(...weights);
  const dataMax = Math.max(...weights);
  const pad = Math.max(0.4, (dataMax - dataMin) * 0.08);
  const lo = dataMin - pad;
  const hi = dataMax + pad;

  const left = 30;
  const right = Math.max(left + 1, width - 2);
  const X = (i: number) => left + (i / (series.length - 1)) * (right - left);
  const Y = (w: number) => PLOT_TOP + (1 - (w - lo) / (hi - lo)) * PLOT_HEIGHT;

  // Gridline values: four steps down from the highest logged weight, rounded
  // to the nearest half kilo so the labels read as real weights.
  const step = niceStep(dataMax - dataMin);
  const top = Math.floor(dataMax * 2) / 2;
  const ticks = [0, 1, 2, 3].map((i) => top - i * step).filter((t) => t > lo && t < hi);

  // 7-day rolling average — the line the user should judge progress by.
  const rolling = series.map((entry) => {
    const window = series.filter((e) => {
      const back = daysBetween(e.logDate, entry.logDate);
      return back >= 0 && back <= 6;
    });
    return mean(window.map((e) => e.weightKg)) ?? entry.weightKg;
  });

  const avgPath = rolling
    .map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(v).toFixed(1)}`)
    .join(' ');

  const goalBelowScale = profile.goalWeightKg < lo;
  const goalY = goalBelowScale ? FLOOR_Y : Y(profile.goalWeightKg);

  const spanDays = daysBetween(series[0].logDate, series[series.length - 1].logDate) + 1;
  const weeks = Math.max(1, Math.ceil(spanDays / 7));

  return (
    <View>
      <View
        style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 }}
      >
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>Weight trend</Body>
        <Caption style={{ fontSize: 11 }}>
          {weeks} {weeks === 1 ? 'week' : 'weeks'} · {formatShort(series[0].logDate)} –{' '}
          {formatShort(series[series.length - 1].logDate)}
        </Caption>
      </View>

      <View onLayout={onLayout} style={{ marginTop: space.sm + 2, height: CHART_HEIGHT }}>
        {/* y-axis labels, laid out over the SVG so they use real text rendering */}
        {ticks.map((t) => (
          <Caption
            key={t}
            style={[{ position: 'absolute', left: 0, top: Y(t) - 6, fontSize: 9 }, tnum]}
          >
            {t.toFixed(1)}
          </Caption>
        ))}

        <Svg width={width} height={CHART_HEIGHT}>
          {ticks.map((t) => (
            <Line
              key={t}
              x1={GUTTER}
              y1={Y(t)}
              x2={right}
              y2={Y(t)}
              stroke={colors.line}
              strokeWidth={1}
            />
          ))}

          {series.map((e, i) => (
            <Circle key={e.logDate} cx={X(i)} cy={Y(e.weightKg)} r={2} fill={colors.neutral} />
          ))}

          <Path
            d={avgPath}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <Line
            x1={GUTTER}
            y1={goalY}
            x2={right}
            y2={goalY}
            stroke={colors.disabled}
            strokeWidth={1.4}
            strokeDasharray="5 4"
          />
        </Svg>

        <Caption
          style={{ position: 'absolute', left: GUTTER, top: goalY - 16, fontSize: 9 }}
          color={colors.disabled}
        >
          Goal {f1(profile.goalWeightKg)} kg{goalBelowScale ? ' — below this scale' : ''}
        </Caption>
      </View>

      <ChartLegend />
    </View>
  );
}

function ChartLegend() {
  const { colors } = useTheme();
  const items = [
    { label: 'Daily weigh-in', swatch: <Swatch color={colors.neutral} height={6} /> },
    { label: '7-day average', swatch: <Swatch color={colors.accent} height={3} /> },
    { label: 'Goal', swatch: <DashedSwatch color={colors.disabled} /> },
  ];
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14, paddingTop: space.xs, paddingHorizontal: 2 }}>
      {items.map((item) => (
        <View key={item.label} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {item.swatch}
          <Caption style={{ fontSize: 10.5 }}>{item.label}</Caption>
        </View>
      ))}
    </View>
  );
}

function Swatch({ color, height }: { color: string; height: number }) {
  return <View style={{ width: 14, height, borderRadius: 99, backgroundColor: color }} />;
}

function DashedSwatch({ color }: { color: string }) {
  return (
    <Svg width={14} height={3}>
      <Line x1={0} y1={1.5} x2={14} y2={1.5} stroke={color} strokeWidth={1.4} strokeDasharray="4 3" />
    </Svg>
  );
}
