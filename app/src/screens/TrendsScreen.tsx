import { useState } from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { UnitFormatter } from '../lib/units';
import { Card } from '../components/Card';
import { EmptyState, Segmented } from '../components/Controls';
import { Screen } from '../components/Screen';
import { Bar, LossBars } from '../components/charts/LossBars';
import { Body, Caption, Stat } from '../components/Type';
import { f1, int } from '../lib/calc';
import { addDays, formatShort } from '../lib/date';

const MODES = ['Week', 'Month'] as const;
type Mode = (typeof MODES)[number];

interface Chip {
  key: string;
  value: string;
}

export function TrendsScreen() {
  const { colors } = useTheme();
  const { data } = useStore();
  const d = useDerived();
  const { u } = d;
  const { profile } = data;
  const [mode, setMode] = useState<Mode>('Week');

  const weeks = d.weeks;
  const months = d.months;

  const bars: Bar[] =
    mode === 'Week'
      ? weeks.slice(-8).map((w) => ({ label: `W${w.index}`, value: w.lostKg }))
      : months.slice(-6).map((m) => ({ label: m.label.slice(0, 3), value: m.lostKg }));

  const rows =
    mode === 'Week'
      ? weeks
          .slice()
          .reverse()
          .map((w) => ({
            id: `w${w.index}`,
            title: `Week ${w.index}`,
            // The current week is still filling in; say so rather than
            // grading it against days that have not happened yet.
            range:
              w.daysElapsed < 7
                ? `${formatShort(w.start)} – ${formatShort(w.end)} · in progress`
                : `${formatShort(w.start)} – ${formatShort(w.end)}`,
            lost: w.lostKg,
            pct: w.pctChange,
            chips: [
              { key: 'Avg wt', value: u.weightValue(w.averageWeightKg) },
              { key: 'Kcal', value: int(w.avgCalories) },
              { key: 'Protein', value: w.avgProteinG == null ? '—' : `${Math.round(w.avgProteinG)}g` },
              { key: 'Steps', value: int(w.avgSteps) },
              { key: 'Sleep', value: w.avgSleepH == null ? '—' : `${f1(w.avgSleepH)}h` },
              { key: 'Water', value: u.volume(w.avgWaterL) },
              { key: 'Cardio', value: `${w.cardioMin}min` },
              { key: 'Strength', value: `${w.strengthDays}d` },
              { key: 'Logged', value: `${w.daysLogged}/${w.daysElapsed}` },
            ] as Chip[],
          }))
      : months
          .slice()
          .reverse()
          .map((m) => ({
            id: m.month,
            title: m.label,
            range: 'Calendar month',
            lost: m.lostKg,
            pct: m.pctLost == null ? null : -m.pctLost,
            chips: [
              { key: 'Start', value: u.weightValue(m.startWeightKg) },
              { key: 'End', value: u.weightValue(m.endWeightKg) },
              { key: 'Per week', value: u.weightValue(m.avgWeeklyLossKg) },
              { key: 'Logged', value: `${m.daysLogged}d` },
            ] as Chip[],
          }));

  // Hold the dashed empty state until there are two buckets to compare — a
  // one-bar chart says nothing about a trend.
  const ready = bars.length >= 2;

  return (
    <Screen title="Trends" meta="Roll-ups">
      <Segmented options={MODES} value={mode} onChange={setMode} />

      {!ready ? (
        <View style={{ marginTop: space.sm }}>
          <EmptyState
            icon="bars"
            message={
              mode === 'Week'
                ? `Weeks are 7-day buckets counted from your start date. Your first one closes on ${formatShort(
                    addDays(profile.startDate, 6),
                  )}.`
                : 'Two calendar months of weigh-ins unlock the monthly roll-up.'
            }
          />
        </View>
      ) : (
        <>
          <Card hero style={{ paddingHorizontal: 18, paddingTop: 18, paddingBottom: 14, marginTop: space.sm }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>
              {u.units === 'imperial' ? 'Pounds' : 'Kilos'} lost per {mode.toLowerCase()}
            </Body>
            <View style={{ marginTop: space.lg }}>
              <LossBars bars={bars} format={(kg) => u.weightValue(kg)} unit={u.labels.weight} />
            </View>
          </Card>

          {rows.map((row) => (
            <Card key={row.id} style={{ paddingHorizontal: 17, paddingVertical: 15, marginTop: space.sm }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}
              >
                <View style={{ gap: 1, flexShrink: 1 }}>
                  <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>{row.title}</Body>
                  <Caption style={{ fontSize: 11.5 }}>{row.range}</Caption>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 1 }}>
                  <Stat
                    style={{ fontSize: 19 }}
                    color={(row.lost ?? 0) > 0.05 ? colors.greenText : colors.text}
                  >
                    {formatLost(row.lost, u)}
                  </Stat>
                  <Caption style={[{ fontSize: 11.5 }, tnum]}>
                    {row.pct == null ? '—' : `${row.pct > 0 ? '+' : ''}${row.pct.toFixed(1)}%`}
                  </Caption>
                </View>
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: space.md }}>
                {row.chips.map((chip) => (
                  <View
                    key={chip.key}
                    style={{
                      backgroundColor: colors.tint,
                      borderRadius: radius.pill,
                      paddingHorizontal: 11,
                      paddingVertical: 6,
                      flexDirection: 'row',
                      alignItems: 'baseline',
                      gap: 5,
                    }}
                  >
                    <Caption style={{ fontSize: 10.5, letterSpacing: 0.6, textTransform: 'uppercase' }}>
                      {chip.key}
                    </Caption>
                    <Body style={[{ fontFamily: font.semibold, fontSize: 12.5 }, tnum]}>{chip.value}</Body>
                  </View>
                ))}
              </View>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}

/**
 * A flat week shows no sign at all — a bare "0.0 kg" reads better than
 * "− 0.0 kg", which the design chat called out explicitly.
 */
function formatLost(lost: number | null, u: UnitFormatter): string {
  if (lost == null) return `— ${u.labels.weight}`;
  if (Math.abs(lost) < 0.05) return `0.0 ${u.labels.weight}`;
  return `${lost > 0 ? '−' : '+'} ${u.weight(Math.abs(lost))}`;
}
