import React from 'react';
import { View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Card, StatCard, StatGrid } from '../components/Card';
import { SectionHeading } from '../components/Controls';
import { HABIT_META } from '../components/HabitTicks';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { HeatMap } from '../components/charts/HeatMap';
import { Body, Caption } from '../components/Type';
import { HABIT_KEYS } from '../data/types';
import { consistencyPct, habitRatePct, weighInStreaks } from '../lib/calc';
import { todayKey } from '../lib/date';

export function HabitsScreen() {
  const { colors } = useTheme();
  const { data } = useStore();
  const d = useDerived();
  const { profile, entries } = data;
  const today = todayKey();

  const streaks = d.streaks;
  const rules = { water: profile.targetWaterL, steps: profile.targetSteps, sleep: profile.targetSleepH };

  return (
    <Screen title="Habits" meta="Consistency">
      <StatGrid>
        <StatCard label="Current streak" value={`${streaks.current}`} unit="d" sub="Days with a weight logged" />
        <StatCard
          label="Longest streak"
          value={`${streaks.longest}`}
          unit="d"
          sub={streaks.longest ? 'Personal best' : 'Nothing yet'}
        />
        <StatCard
          label="7-day score"
          value={`${d.consistency7}`}
          unit="%"
          sub="Rolling average"
        />
        <StatCard
          label="30-day score"
          value={`${d.consistency30}`}
          unit="%"
          sub="Rolling average"
        />
      </StatGrid>

      <Card hero style={{ padding: 18, marginTop: space.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Daily habit score</Body>
          <Caption style={{ fontSize: 11.5 }}>Last 5 weeks</Caption>
        </View>
        <View style={{ marginTop: 14 }}>
          <HeatMap entries={entries} profile={profile} asOf={today} />
        </View>
      </Card>

      <View style={{ marginTop: space.xl }}>
        <SectionHeading title="The six daily habits" trailing="Last 30 days" />
      </View>

      <View style={{ gap: space.sm, marginTop: space.sm }}>
        {HABIT_KEYS.map((key) => {
          const meta = HABIT_META[key];
          const rate = d.habitRates[key];
          return (
            <Card
              key={key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingHorizontal: space.lg, paddingVertical: 13 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: radius.pill,
                  backgroundColor: rate ? colors.tint : colors.rail,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name={meta.icon} size={16} color={rate ? colors.accent : colors.muted} strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>{meta.label}</Body>
                <Caption style={{ fontSize: 11.5 }}>{meta.rule(rules)}</Caption>
              </View>
              <Body style={[{ fontFamily: font.semibold, fontSize: 14 }, tnum]} color={colors.muted}>
                {rate == null ? '—' : `${rate}%`}
              </Body>
            </Card>
          );
        })}
      </View>

      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: 14, paddingHorizontal: space.xs }}>
        Ticks are read from what you log — they can&apos;t be edited by hand, so the score always matches the data.
      </Caption>
    </Screen>
  );
}
