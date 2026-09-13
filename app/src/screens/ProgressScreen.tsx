import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum, type } from '../theme/tokens';
import { useStore } from '../data/store';
import { Card, StatCard, StatGrid } from '../components/Card';
import { EmptyState } from '../components/Controls';
import { Icon, IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Sparkline } from '../components/charts/Sparkline';
import { TrendChart } from '../components/charts/TrendChart';
import { Body, Caption, Hero, Label } from '../components/Type';
import {
  averageOverLastDays,
  averageWeeklyLossKg,
  bmi,
  bmiBand,
  consistencyPct,
  currentWeight,
  dailyChange,
  estimatedGoalDate,
  f1,
  goalCompletionPct,
  milestones,
  remainingKg,
  totalLostKg,
  weighedEntries,
  weighInStreaks,
} from '../lib/calc';
import { buildInsights, chartIsReady, Insight } from '../lib/insights';
import { daysBetween, formatMedium, formatShort, todayKey } from '../lib/date';

const INSIGHT_ICONS: Record<Insight['icon'], IconName> = {
  down: 'down',
  up: 'up',
  rate: 'rate',
  goal: 'goal',
  steady: 'steady',
  habit: 'habit',
  lock: 'lock',
};

export function ProgressScreen({ onOpenMilestones }: { onOpenMilestones: () => void }) {
  const { colors } = useTheme();
  const { data } = useStore();
  const { profile, entries } = data;
  const today = todayKey();

  const current = currentWeight(entries, profile);
  const weighed = weighedEntries(entries);
  const lost = totalLostKg(entries, profile);
  const remaining = remainingKg(entries, profile);
  const averageWeekly = averageWeeklyLossKg(entries, profile);
  const completion = goalCompletionPct(entries, profile);
  const bmiValue = bmi(current, profile.heightCm);
  const goalDate = estimatedGoalDate(entries, profile);
  const streaks = weighInStreaks(entries, profile);
  const sinceYesterday = dailyChange(entries, profile, today);
  const weekNumber = Math.max(1, Math.ceil((daysBetween(profile.startDate, today) + 1) / 7));

  const insights = buildInsights(entries, profile, today);
  const hasChart = chartIsReady(entries, today);
  const nextMilestone = milestones(entries, profile, data.rewards, data.achieved, today).find(
    (m) => m.status !== 'Achieved',
  );

  return (
    <Screen title="Progress" meta={`Week ${weekNumber} · ${formatMedium(today)}`}>
      {/* ── hero ────────────────────────────────────────────────────────── */}
      <Card
        hero
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: space.md,
          paddingHorizontal: 18,
          paddingVertical: space.lg,
        }}
      >
        <View style={{ flexShrink: 1 }}>
          <Label style={type.eyebrow}>Current weight</Label>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7, marginTop: 2 }}>
            <Hero>{f1(current)}</Hero>
            <Body style={{ fontFamily: font.medium, fontSize: 18 }} color={colors.muted}>
              kg
            </Body>
          </View>
          <Body
            style={{ fontFamily: font.medium, fontSize: 14 }}
            color={sinceYesterday != null && sinceYesterday < -0.05 ? colors.greenText : colors.muted}
          >
            {sinceYesterday == null
              ? weighed.length
                ? `Last weighed ${formatShort(weighed[weighed.length - 1].logDate)}`
                : 'Nothing logged yet'
              : Math.abs(sinceYesterday) < 0.05
                ? 'No change since yesterday'
                : `${sinceYesterday < 0 ? '↓' : '↑'} ${Math.abs(sinceYesterday).toFixed(1)} kg since yesterday`}
          </Body>
        </View>

        <View style={{ marginBottom: space.xs }}>
          <Sparkline values={weighed.slice(-14).map((e) => e.weightKg)} />
        </View>
      </Card>

      {/* ── the six stats ───────────────────────────────────────────────── */}
      <StatGrid>
        <StatCard
          label="Total lost"
          value={f1(Math.max(0, lost))}
          unit="kg"
          sub={
            lost > 0.05
              ? `↓ since ${formatShort(profile.startDate)}`
              : weighed.length
                ? `Baseline logged ${formatShort(weighed[0].logDate)}`
                : 'Nothing logged yet'
          }
          valueColor={lost > 0.05 ? colors.greenText : colors.text}
        />
        <StatCard label="Remaining" value={f1(remaining)} unit="kg" sub={`To ${f1(profile.goalWeightKg)} kg`} />
        <StatCard
          label="Avg weekly loss"
          value={averageWeekly == null ? '—' : f1(averageWeekly)}
          unit={averageWeekly == null ? undefined : 'kg'}
          sub={averageWeekly == null ? 'Needs two weigh-ins' : `Over ${weekNumber} weeks`}
        />
        <StatCard label="BMI" value={bmiValue.toFixed(1)} sub={bmiBand(bmiValue)} />
        <StatCard
          label="Est. goal date"
          value={goalDate ? goalDate.toLocaleDateString('en-GB', { month: 'long' }) : '—'}
          unit={goalDate ? String(goalDate.getFullYear()) : undefined}
          sub={goalDate ? 'At the current rate' : 'Needs a downward trend'}
        />
        <StatCard
          label="7-day consistency"
          value={String(consistencyPct(entries, profile, 7))}
          unit="%"
          sub={`${streaks.current}-day weigh-in streak`}
        />
      </StatGrid>

      {/* ── goal completion ─────────────────────────────────────────────── */}
      <Card style={{ paddingHorizontal: 13, paddingTop: space.md, paddingBottom: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
          <Label>Goal completion</Label>
          <Caption
            style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
            color={completion > 0 ? colors.greenText : colors.muted}
          >
            {Math.round(completion)}% · {f1(Math.max(0, lost))} of{' '}
            {f1(profile.startWeightKg - profile.goalWeightKg)} kg
          </Caption>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(completion) }}
          style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.rail, marginTop: 9, overflow: 'hidden' }}
        >
          <View
            style={{
              height: '100%',
              width: `${Math.max(completion > 0 ? 1.5 : 0, completion)}%`,
              borderRadius: radius.pill,
              backgroundColor: colors.green,
            }}
          />
        </View>
      </Card>

      {/* ── the trend chart ─────────────────────────────────────────────── */}
      <Card hero style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: space.md }}>
        {hasChart ? (
          <TrendChart entries={entries} profile={profile} asOf={today} />
        ) : (
          <EmptyState
            icon="rate"
            message="Two weigh-ins draw the first line. Log one today and the trend starts tomorrow."
          />
        )}
      </Card>

      {/* ── insight messages ────────────────────────────────────────────── */}
      <View style={{ marginTop: space.md, paddingHorizontal: 2 }}>
        {insights.map((insight, i) => {
          const locked = insight.tone === 'locked';
          const good = insight.tone === 'good';
          return (
            <View
              key={insight.id}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 11,
                paddingVertical: 11,
                borderBottomWidth: i === insights.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: radius.pill,
                  backgroundColor: locked ? colors.rail : good ? colors.greenTint : colors.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Icon
                  name={INSIGHT_ICONS[insight.icon]}
                  size={13}
                  color={locked ? colors.disabled : good ? colors.greenText : colors.accent}
                />
              </View>
              <Body style={{ flex: 1, lineHeight: 19 }} color={locked ? colors.muted : colors.text}>
                {insight.text}
              </Body>
            </View>
          );
        })}
      </View>

      {/* ── next milestone ──────────────────────────────────────────────── */}
      <Pressable
        accessibilityRole="button"
        onPress={onOpenMilestones}
        style={{
          marginTop: space.md,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          minHeight: 50,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.card,
        }}
      >
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>
          Next milestone · {nextMilestone ? `${f1(nextMilestone.targetKg)} kg` : 'Goal reached'}
        </Body>
        <Icon name="chevronRight" size={13} color={colors.accent} />
      </Pressable>
    </Screen>
  );
}

/** Exposed for the Trends and Settings screens, which show the same figure. */
export function sevenDayAverageLabel(entries: Parameters<typeof averageOverLastDays>[0]): string {
  return f1(averageOverLastDays(entries, 7));
}
