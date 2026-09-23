import { View } from 'react-native';

import { useTheme } from '../../theme/ThemeContext';
import { font, radius, space, tnum } from '../../theme/tokens';
import { UnitFormatter } from '../../lib/units';
import { bmiBands, bmiPosition, bmiScaleMax } from '../../lib/progressStats';
import { Body, Caption } from '../Type';

/**
 * Charts for the Progress page, drawn in the app's own palette: progress
 * green for distance covered, teal for "you are here", neutral for the
 * track. Where two markers share a chart they differ in *shape* (filled vs
 * hollow), not in a second colour — teal and green are too close to be told
 * apart as two series. Every mark carries its number as text too, so colour
 * is never the only signal.
 */

const pct = (v: number) => `${Math.round(Math.min(1, Math.max(0, v)) * 1000) / 10}%` as const;

/** A dot centred on a point along a track. */
function Marker({
  at,
  size,
  fill,
  ring,
  hollow = false,
}: {
  at: number;
  size: number;
  fill: string;
  ring: string;
  hollow?: boolean;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: pct(at),
        top: '50%',
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        borderRadius: size / 2,
        // A 2 px surface ring keeps the marker legible where it overlaps.
        borderWidth: 2,
        borderColor: hollow ? fill : ring,
        backgroundColor: hollow ? ring : fill,
      }}
    />
  );
}

/**
 * Start → goal as one track: green up to where you are, a tick at every
 * milestone, a filled marker for now and a hollow one for where a straight
 * 730-day plan would put you today.
 */
export function JourneyTrack({
  startKg,
  goalKg,
  currentKg,
  plannedKg,
  aheadKg,
  milestonesKg,
  u,
}: {
  startKg: number;
  goalKg: number;
  currentKg: number;
  plannedKg: number;
  aheadKg: number;
  milestonesKg: number[];
  u: UnitFormatter;
}) {
  const { colors } = useTheme();
  const span = startKg - goalKg || 1;
  const pos = (kg: number) => Math.min(1, Math.max(0, (startKg - kg) / span));
  const now = pos(currentKg);
  const plan = pos(plannedKg);
  // Keep the "now" label inside the card at either end.
  const labelAt = Math.min(0.82, Math.max(0.18, now));
  const onPlan = Math.abs(aheadKg) < 0.1;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`From ${u.weight(startKg)} to ${u.weight(goalKg)}. Now ${u.weight(currentKg)}, ${Math.round(
        now * 100,
      )}% of the way. ${onPlan ? 'On plan.' : `${u.weight(Math.abs(aheadKg))} ${aheadKg > 0 ? 'ahead of' : 'behind'} plan.`}`}
    >
      {/* the "now" label, above its marker */}
      <View style={{ height: 36, position: 'relative' }}>
        <View style={{ position: 'absolute', left: pct(labelAt), width: 120, marginLeft: -60, alignItems: 'center' }}>
          <Caption style={{ fontSize: 10.5, fontFamily: font.semibold, letterSpacing: 0.5 }}>NOW</Caption>
          <Body style={[{ fontFamily: font.bold, fontSize: 15 }, tnum]}>{u.weight(currentKg)}</Body>
        </View>
      </View>

      {/* the track */}
      <View style={{ height: 20, justifyContent: 'center', marginTop: 4 }}>
        <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.rail, overflow: 'hidden' }}>
          <View style={{ width: pct(now), height: '100%', backgroundColor: colors.green, borderRadius: radius.pill }} />
        </View>
        {milestonesKg.map((kg) => (
          <View
            key={kg}
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: pct(pos(kg)),
              width: 2,
              height: 8,
              marginLeft: -1,
              backgroundColor: colors.card,
              opacity: 0.9,
            }}
          />
        ))}
        <Marker at={plan} size={14} fill={colors.muted} ring={colors.card} hollow />
        <Marker at={now} size={18} fill={colors.accent} ring={colors.card} />
      </View>

      {/* the ends */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
        <View>
          <Caption style={{ fontSize: 10.5 }}>Start</Caption>
          <Body style={[{ fontFamily: font.semibold, fontSize: 13 }, tnum]}>{u.weight(startKg)}</Body>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Caption style={{ fontSize: 10.5 }}>Goal</Caption>
          <Body style={[{ fontFamily: font.semibold, fontSize: 13 }, tnum]}>{u.weight(goalKg)}</Body>
        </View>
      </View>

      {/* legend, and the plan comparison in words */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: space.md, marginTop: space.md }}>
        <LegendDot filled color={colors.accent} label="Now" />
        <LegendDot color={colors.muted} label="Plan for today" />
        <View style={{ flex: 1 }} />
        <Body
          style={[{ fontFamily: font.semibold, fontSize: 12.5 }, tnum]}
          color={aheadKg > 0.1 ? colors.greenText : colors.muted}
        >
          {onPlan ? 'Right on plan' : `${u.weight(Math.abs(aheadKg))} ${aheadKg > 0 ? 'ahead of' : 'behind'} plan`}
        </Body>
      </View>
    </View>
  );
}

function LegendDot({ label, color, filled = false }: { label: string; color: string; filled?: boolean }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View
        style={{
          width: 10,
          height: 10,
          borderRadius: 5,
          borderWidth: 2,
          borderColor: color,
          backgroundColor: filled ? color : colors.card,
        }}
      />
      <Caption style={{ fontSize: 11 }}>{label}</Caption>
    </View>
  );
}

/**
 * The WHO bands as one bar, the healthy band picked out, a filled marker for
 * now and a hollow one for where you started — so the distance covered
 * reads in the terms a doctor would use.
 */
export function BmiScale({ current, start }: { current: number; start: number }) {
  const { colors } = useTheme();
  const max = bmiScaleMax(current, start);
  const BMI_BANDS = bmiBands(max);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`BMI now ${current.toFixed(1)}, started at ${start.toFixed(1)}. Healthy range 18.5 to 25.`}
    >
      <View style={{ height: 22, justifyContent: 'center' }}>
        {/* 2 px surface gaps between the bands, per the spacer rule */}
        <View style={{ flexDirection: 'row', gap: 2, height: 10 }}>
          {BMI_BANDS.map((band, i) => (
            <View
              key={band.label}
              style={{
                flex: band.to - band.from,
                backgroundColor: band.label === 'Healthy' ? colors.greenTint : colors.rail,
                borderTopLeftRadius: i === 0 ? radius.pill : 0,
                borderBottomLeftRadius: i === 0 ? radius.pill : 0,
                borderTopRightRadius: i === BMI_BANDS.length - 1 ? radius.pill : 0,
                borderBottomRightRadius: i === BMI_BANDS.length - 1 ? radius.pill : 0,
              }}
            />
          ))}
        </View>
        {Math.abs(start - current) > 0.2 && (
          <Marker at={bmiPosition(start, max)} size={14} fill={colors.muted} ring={colors.card} hollow />
        )}
        <Marker at={bmiPosition(current, max)} size={18} fill={colors.accent} ring={colors.card} />
      </View>
      <View style={{ flexDirection: 'row', gap: 2, marginTop: 6 }}>
        {BMI_BANDS.map((band) => (
          <Caption
            key={band.label}
            numberOfLines={1}
            style={{
              flex: band.to - band.from,
              fontSize: 9.5,
              textAlign: 'center',
              fontFamily: band.label === 'Healthy' ? font.semibold : font.regular,
            }}
            color={band.label === 'Healthy' ? colors.greenText : colors.muted}
          >
            {band.label}
          </Caption>
        ))}
      </View>
    </View>
  );
}

/**
 * One row of "last 7 days against target": the average, the target, and a
 * meter. The meter caps at the target; going past it is said in words.
 */
export function TargetMeter({
  label,
  value,
  target,
  display,
  days,
  outOf = 7,
  over = 'good',
}: {
  label: string;
  value: number | null;
  target: number;
  /** Formats a value in this row's unit. */
  display: (v: number) => string;
  days: number;
  /** Days in the period the average covers. */
  outOf?: number;
  /** Whether going past the target is the point (steps) or a limit (calories). */
  over?: 'good' | 'limit';
}) {
  const { colors } = useTheme();
  const share = value == null || target <= 0 ? 0 : value / target;
  const reached = share >= 1;
  return (
    <View
      accessible
      accessibilityLabel={
        value == null
          ? `${label}: nothing logged in the last 7 days`
          : `${label}: average ${display(value)} against a target of ${display(target)}, ${days} of ${outOf} days logged`
      }
      style={{ gap: 5 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>{label}</Body>
        <Caption style={[{ fontSize: 12 }, tnum]}>
          <Body style={[{ fontFamily: font.semibold, fontSize: 13 }, tnum]}>{value == null ? '—' : display(value)}</Body>
          {target > 0 ? ` / ${display(target)}` : ''}
        </Caption>
      </View>
      <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: colors.rail, overflow: 'hidden' }}>
        <View
          style={{
            width: pct(share),
            height: '100%',
            borderRadius: radius.pill,
            backgroundColor: reached && over === 'good' ? colors.green : colors.accent,
          }}
        />
      </View>
      <Caption style={{ fontSize: 10.5 }}>
        {value == null
          ? 'Nothing logged in this period'
          : `${days} of ${outOf} days logged${
              reached ? (over === 'good' ? ' · target met' : ` · ${Math.round((share - 1) * 100)}% over target`) : ''
            }`}
      </Caption>
    </View>
  );
}
