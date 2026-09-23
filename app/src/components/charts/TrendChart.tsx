import { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

import { useTheme } from '../../theme/ThemeContext';
import { font, radius, space, tnum } from '../../theme/tokens';
import { useUnits } from '../../data/derived';
import { Body, Caption } from '../Type';
import { DateKey, Profile, WeighIn } from '../../data/types';
import { mean, projectedWeight, weighedEntries } from '../../lib/calc';
import { addDays, daysBetween, formatMedium, formatShort } from '../../lib/date';

const PLOT_TOP = 12;
const PLOT_HEIGHT = 126;
const CHART_HEIGHT = 168;
/** Where the goal line sits when the goal is below the plotted range. */
const FLOOR_Y = 158;
const GUTTER = 26;

/** How far past the last weigh-in the projection is drawn. */
const PROJECTION_DAYS = 30;

const NICE_STEPS = [0.25, 0.5, 1, 1.5, 2, 2.5, 5, 10];

function niceStep(span: number): number {
  const raw = span / 3.5;
  return NICE_STEPS.find((s) => s >= raw) ?? 10;
}

const RANGES = [
  { label: '30d', days: 30 },
  { label: '90d', days: 90 },
  { label: 'All', days: Infinity },
] as const;

type RangeLabel = (typeof RANGES)[number]['label'];

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
  const u = useUnits();
  const [width, setWidth] = useState(0);
  const [range, setRange] = useState<RangeLabel>('All');
  const [selected, setSelected] = useState<number | null>(null);

  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const all = useMemo(
    () => weighedEntries(entries).filter((e) => e.logDate <= asOf),
    [entries, asOf],
  );

  const days = RANGES.find((r) => r.label === range)!.days;
  const series = useMemo(() => {
    if (days === Infinity) return all;
    const from = addDays(asOf, -(days - 1));
    return all.filter((e) => e.logDate >= from);
  }, [all, days, asOf]);

  // The projection continues the 7-day average forward at the current trend.
  const projectedKg = projectedWeight(entries, profile, PROJECTION_DAYS, asOf);

  if (series.length < 2 || width === 0) {
    return (
      <View>
        <ChartHeader range={range} onRange={setRange} series={series} />
        <View onLayout={onLayout} style={{ height: CHART_HEIGHT, justifyContent: 'center' }}>
          {width > 0 && (
            <Caption style={{ textAlign: 'center', fontSize: 12 }}>
              Not enough weigh-ins in this range.
            </Caption>
          )}
        </View>
      </View>
    );
  }

  const weights = series.map((e) => e.weightKg);
  const dataMin = Math.min(...weights);
  // The projection has to fit on the same axis, or the line runs off the card.
  const dataMax = Math.max(...weights);
  const lowestPlotted = projectedKg != null ? Math.min(dataMin, projectedKg) : dataMin;
  const pad = Math.max(0.4, (dataMax - lowestPlotted) * 0.08);
  const lo = lowestPlotted - pad;
  const hi = dataMax + pad;

  const left = 30;
  const right = Math.max(left + 1, width - 2);
  // With a projection, the logged series occupies the left portion and the
  // forward line the rest, split by their share of the total day span.
  const loggedDays = daysBetween(series[0].logDate, series[series.length - 1].logDate) || 1;
  const totalDays = projectedKg != null ? loggedDays + PROJECTION_DAYS : loggedDays;
  const loggedRight = left + (loggedDays / totalDays) * (right - left);

  const X = (i: number) => left + (i / (series.length - 1)) * (loggedRight - left);
  const Y = (w: number) => PLOT_TOP + (1 - (w - lo) / (hi - lo)) * PLOT_HEIGHT;

  const step = niceStep(dataMax - lowestPlotted);
  const top = Math.floor(dataMax * 2) / 2;
  const ticks = [0, 1, 2, 3].map((i) => top - i * step).filter((t) => t > lo && t < hi);

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

  const lastAvg = rolling[rolling.length - 1];
  const projectionPath =
    projectedKg == null
      ? null
      : `M${loggedRight.toFixed(1)} ${Y(lastAvg).toFixed(1)} L${right.toFixed(1)} ${Y(projectedKg).toFixed(1)}`;

  const goalBelowScale = profile.goalWeightKg < lo;
  const goalY = goalBelowScale ? FLOOR_Y : Y(profile.goalWeightKg);

  const picked = selected != null ? series[selected] : null;

  /** Nearest point to the tap, so a fingertip does not have to hit a 2 pt dot. */
  const onTap = (x: number) => {
    if (x > loggedRight + 8) return setSelected(null);
    let best = 0;
    let bestDist = Infinity;
    for (let i = 0; i < series.length; i++) {
      const dist = Math.abs(X(i) - x);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
    }
    setSelected((prev) => (prev === best ? null : best));
  };

  return (
    <View>
      <ChartHeader range={range} onRange={setRange} series={series} />

      {/* The readout replaces the header's range line while a point is held,
          so the card does not change height when you tap. */}
      <View style={{ minHeight: 18, justifyContent: 'center', paddingHorizontal: 2 }}>
        {picked ? (
          <Body style={[{ fontSize: 11.5, fontFamily: font.semibold }, tnum]} color={colors.accent}>
            {formatMedium(picked.logDate)} · {u.weight(picked.weightKg)}
          </Body>
        ) : (
          <Caption style={{ fontSize: 11 }}>Tap the chart to read a day</Caption>
        )}
      </View>

      <Pressable
        onLayout={onLayout}
        onPress={(e) => onTap(e.nativeEvent.locationX)}
        accessibilityRole="image"
        accessibilityLabel={describeTrend(series, profile, u)}
        accessibilityHint="Tap to read a single day"
        style={{ height: CHART_HEIGHT, marginTop: space.xs }}
      >
        {ticks.map((t) => (
          <Caption
            key={t}
            style={[{ position: 'absolute', left: 0, top: Y(t) - 6, fontSize: 9 }, tnum]}
          >
            {u.weightValue(t)}
          </Caption>
        ))}

        <Svg width={width} height={CHART_HEIGHT}>
          {ticks.map((t) => (
            <Line key={t} x1={GUTTER} y1={Y(t)} x2={right} y2={Y(t)} stroke={colors.line} strokeWidth={1} />
          ))}

          {series.map((e, i) => (
            <Circle
              key={e.logDate}
              cx={X(i)}
              cy={Y(e.weightKg)}
              r={selected === i ? 4 : 2}
              fill={selected === i ? colors.accent : colors.neutral}
            />
          ))}

          <Path
            d={avgPath}
            fill="none"
            stroke={colors.accent}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Dashed, and visually lighter, so a projection never reads as data. */}
          {!!projectionPath && (
            <Path
              d={projectionPath}
              fill="none"
              stroke={colors.accent}
              strokeWidth={2}
              strokeDasharray="4 4"
              opacity={0.55}
              strokeLinecap="round"
            />
          )}

          {selected != null && (
            <Line
              x1={X(selected)}
              y1={PLOT_TOP}
              x2={X(selected)}
              y2={PLOT_TOP + PLOT_HEIGHT}
              stroke={colors.accent}
              strokeWidth={1}
              opacity={0.35}
            />
          )}

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
          Goal {u.weight(profile.goalWeightKg)}
          {goalBelowScale ? ' — below this scale' : ''}
        </Caption>
      </Pressable>

      <ChartLegend hasProjection={projectedKg != null} />
    </View>
  );
}

/**
 * What the chart says, in a sentence — "Weight trend, down 4.8 kg over 8
 * weeks, from 157.0 kg to 152.2 kg". A screen reader gets the finding, not a
 * description of the drawing.
 */
function describeTrend(
  series: { logDate: DateKey; weightKg: number }[],
  profile: Profile,
  u: ReturnType<typeof useUnits>,
): string {
  if (series.length < 2) return 'Weight trend chart, not enough data yet';

  const first = series[0];
  const last = series[series.length - 1];
  const change = last.weightKg - first.weightKg;
  const days = daysBetween(first.logDate, last.logDate) + 1;
  const weeks = Math.max(1, Math.round(days / 7));

  const direction =
    Math.abs(change) < 0.05 ? 'level' : change < 0 ? `down ${u.weight(-change)}` : `up ${u.weight(change)}`;

  return `Weight trend, ${direction} over ${weeks} ${weeks === 1 ? 'week' : 'weeks'}, from ${u.weight(
    first.weightKg,
  )} to ${u.weight(last.weightKg)}. Goal ${u.weight(profile.goalWeightKg)}.`;
}

function ChartHeader({
  range,
  onRange,
  series,
}: {
  range: RangeLabel;
  onRange: (r: RangeLabel) => void;
  series: { logDate: DateKey }[];
}) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 2,
        gap: space.sm,
      }}
    >
      <View style={{ flexShrink: 1 }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>Weight trend</Body>
        {series.length >= 2 && (
          <Caption style={{ fontSize: 11 }}>
            {formatShort(series[0].logDate)} – {formatShort(series[series.length - 1].logDate)}
          </Caption>
        )}
      </View>

      <View style={{ flexDirection: 'row', gap: 4 }}>
        {RANGES.map((r) => {
          const active = r.label === range;
          return (
            <Pressable
              key={r.label}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={
                r.days === Infinity ? 'Show the whole log' : `Show the last ${r.days} days`
              }
              onPress={() => onRange(r.label)}
              hitSlop={6}
              style={{
                minWidth: 40,
                minHeight: 28,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.sm,
                backgroundColor: active ? colors.tint : 'transparent',
              }}
            >
              <Caption
                style={{ fontSize: 11, fontFamily: font.semibold }}
                color={active ? colors.accent : colors.muted}
              >
                {r.label}
              </Caption>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ChartLegend({ hasProjection }: { hasProjection: boolean }) {
  const { colors } = useTheme();
  const items = [
    { label: 'Daily weigh-in', swatch: <Swatch color={colors.neutral} height={6} /> },
    { label: '7-day average', swatch: <Swatch color={colors.accent} height={3} /> },
    ...(hasProjection
      ? [{ label: 'Projection', swatch: <DashedSwatch color={colors.accent} opacity={0.55} /> }]
      : []),
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

function DashedSwatch({ color, opacity = 1 }: { color: string; opacity?: number }) {
  return (
    <Svg width={14} height={3}>
      <Line
        x1={0}
        y1={1.5}
        x2={14}
        y2={1.5}
        stroke={color}
        strokeWidth={1.4}
        strokeDasharray="4 3"
        opacity={opacity}
      />
    </Svg>
  );
}
