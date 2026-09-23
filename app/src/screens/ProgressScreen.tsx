import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum, type } from '../theme/tokens';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Card, StatCard, StatGrid } from '../components/Card';
import { EmptyState } from '../components/Controls';
import { Icon, IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Sparkline } from '../components/charts/Sparkline';
import { TrendChart } from '../components/charts/TrendChart';
import { Body, Caption, Hero, Label, Stat } from '../components/Type';
import { dailyChange } from '../lib/calc';
import { chartIsReady, Insight } from '../lib/insights';
import { formatMedium, formatShort } from '../lib/date';

const INSIGHT_ICONS: Record<Insight['icon'], IconName> = {
  down: 'down',
  up: 'up',
  rate: 'rate',
  goal: 'goal',
  steady: 'steady',
  habit: 'habit',
  lock: 'lock',
  caution: 'caution',
};

export function ProgressScreen({ onOpenMilestones }: { onOpenMilestones: () => void }) {
  const { colors } = useTheme();
  const { data } = useStore();
  const d = useDerived();
  const { u, profile, today } = d;

  const sinceYesterday = dailyChange(data.entries, profile, today);
  const hasChart = chartIsReady(data.entries, today);

  return (
    <Screen title="Progress" meta={`Week ${d.weekNumber} · ${formatMedium(today)}`}>
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
            <Hero>{u.weightValue(d.currentKg)}</Hero>
            <Body style={{ fontFamily: font.medium, fontSize: 18 }} color={colors.muted}>
              {u.labels.weight}
            </Body>
          </View>
          <Body
            style={{ fontFamily: font.medium, fontSize: 14 }}
            color={sinceYesterday != null && sinceYesterday < -0.05 ? colors.greenText : colors.muted}
          >
            {sinceYesterday == null
              ? d.weighed.length
                ? `Last weighed ${formatShort(d.weighed[d.weighed.length - 1].logDate)}`
                : 'Nothing logged yet'
              : `${u.weightDelta(sinceYesterday)} since yesterday`}
          </Body>
        </View>

        <View style={{ marginBottom: space.xs }}>
          <Sparkline values={d.weighed.slice(-14).map((e) => e.weightKg)} />
        </View>
      </Card>

      {/* ── the six stats ───────────────────────────────────────────────── */}
      <StatGrid>
        <StatCard
          label="Total lost"
          value={u.weightValue(Math.max(0, d.lostKg))}
          unit={u.labels.weight}
          sub={
            d.lostKg > 0.05
              ? `↓ since ${formatShort(profile.startDate)}`
              : d.weighed.length
                ? `Baseline logged ${formatShort(d.weighed[0].logDate)}`
                : 'Nothing logged yet'
          }
          valueColor={d.lostKg > 0.05 ? colors.greenText : colors.text}
        />
        {d.isCountdown ? (
          <StatCard
            label="Remaining"
            value={u.weightValue(d.remainingKg)}
            unit={u.labels.weight}
            sub={`To ${u.weight(profile.goalWeightKg)}`}
          />
        ) : (
          <StatCard
            label="From target"
            value={u.weightValue(Math.abs(d.maintain.deltaKg))}
            unit={u.labels.weight}
            sub={d.maintain.state === 'in-range' ? 'Inside the band' : `Target ${u.weight(profile.goalWeightKg)}`}
            valueColor={d.maintain.state === 'in-range' ? colors.greenText : colors.text}
          />
        )}
        <StatCard
          label="Avg weekly loss"
          value={u.weightValue(d.averageWeeklyLossKg)}
          unit={d.averageWeeklyLossKg == null ? undefined : u.labels.weight}
          sub={d.averageWeeklyLossKg == null ? 'Needs two weigh-ins' : `Over ${d.weekNumber} weeks`}
        />
        <StatCard label="BMI" value={d.bmi.toFixed(1)} sub={d.bmiBand} />
        {d.isCountdown ? (
          <StatCard
            label="Est. goal date"
            value={d.goalDate ? d.goalDate.toLocaleDateString('en-GB', { month: 'long' }) : '—'}
            unit={d.goalDate ? String(d.goalDate.getFullYear()) : undefined}
            sub={d.goalDate ? 'At the current rate' : 'Needs a downward trend'}
          />
        ) : (
          <StatCard
            label="Days in range"
            value={d.maintain.daysInRangePct == null ? '—' : String(d.maintain.daysInRangePct)}
            unit={d.maintain.daysInRangePct == null ? undefined : '%'}
            sub="Of the last month's weigh-ins"
          />
        )}
        <StatCard
          label="7-day consistency"
          value={String(d.consistency7)}
          unit="%"
          sub={`${d.streaks.current}-day weigh-in streak`}
        />
      </StatGrid>

      {/* ── goal completion, or the maintenance band ────────────────────── */}
      {!d.isCountdown ? (
        <Card style={{ paddingHorizontal: 13, paddingTop: space.md, paddingBottom: 13, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
            <Label>Holding steady</Label>
            <Caption
              style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
              color={d.maintain.state === 'in-range' ? colors.greenText : colors.text}
            >
              {d.maintain.state === 'in-range'
                ? 'In range'
                : `${u.weightDelta(d.maintain.deltaKg)} ${d.maintain.state === 'above' ? 'above' : 'below'}`}
            </Caption>
          </View>
          <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
            Target band {u.weightValue(d.maintain.lowKg)}–{u.weight(d.maintain.highKg)}
            {d.maintain.daysInRangePct != null
              ? ` · in range on ${d.maintain.daysInRangePct}% of the last month's weigh-ins`
              : ''}
          </Caption>
        </Card>
      ) : (
      <Card style={{ paddingHorizontal: 13, paddingTop: space.md, paddingBottom: 13 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
          <Label>Goal completion</Label>
          <Caption
            style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
            color={d.completionPct > 0 ? colors.greenText : colors.muted}
          >
            {Math.round(d.completionPct)}% · {u.weightValue(Math.max(0, d.lostKg))} of{' '}
            {u.weight(profile.startWeightKg - profile.goalWeightKg)}
          </Caption>
        </View>
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: Math.round(d.completionPct) }}
          style={{ height: 8, borderRadius: radius.pill, backgroundColor: colors.rail, marginTop: 9, overflow: 'hidden' }}
        >
          <View
            style={{
              height: '100%',
              width: `${Math.max(d.completionPct > 0 ? 1.5 : 0, d.completionPct)}%`,
              borderRadius: radius.pill,
              backgroundColor: colors.green,
            }}
          />
        </View>
      </Card>
      )}

      {/* ── the trend chart ─────────────────────────────────────────────── */}
      <Card hero style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: space.md }}>
        {hasChart ? (
          <TrendChart entries={data.entries} profile={profile} asOf={today} />
        ) : (
          <EmptyState
            icon="rate"
            message="Two weigh-ins draw the first line. Log one today and the trend starts tomorrow."
          />
        )}
      </Card>

      {/* ── projections ─────────────────────────────────────────────────── */}
      {d.isCountdown && <ProjectionCard />}

      {/* ── insight messages ────────────────────────────────────────────── */}
      <View style={{ marginTop: space.md, paddingHorizontal: 2 }}>
        {d.insights.map((insight, i) => {
          const locked = insight.tone === 'locked';
          const good = insight.tone === 'good';
          // Amber, not the missed-habit red: this is a "worth a check-up",
          // not a failure, and red here would read as alarm.
          const caution = insight.tone === 'caution';
          return (
            <View
              key={insight.id}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 11,
                paddingVertical: 11,
                borderBottomWidth: i === d.insights.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
              }}
            >
              <View
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: radius.pill,
                  backgroundColor: locked
                    ? colors.rail
                    : good
                      ? colors.greenTint
                      : caution
                        ? colors.tint
                        : colors.tint,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginTop: 1,
                }}
              >
                <Icon
                  name={INSIGHT_ICONS[insight.icon]}
                  size={13}
                  color={
                    locked ? colors.disabled : good ? colors.greenText : caution ? colors.caution : colors.accent
                  }
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
      {d.isCountdown && (
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
          Next milestone · {d.nextMilestone ? u.weight(d.nextMilestone.targetKg) : 'Goal reached'}
        </Body>
        <Icon name="chevronRight" size={13} color={colors.accent} />
      </Pressable>
      )}
    </Screen>
  );
}

/**
 * Projected weight at +1 week, +1 month and +3 months — spec §4.
 *
 * Carried forward from the 7-day average at the current trend and floored at
 * the goal, so a projection never shows the user overshooting. Locked as a
 * whole while the trend is unknown or not downward: the spec is explicit that
 * a hidden projection beats a guessed one.
 */
function ProjectionCard() {
  const { colors } = useTheme();
  const d = useDerived();
  const { u } = d;

  const locked = d.projections.every((p) => p.weightKg == null);

  return (
    <Card hero style={{ paddingHorizontal: 18, paddingVertical: space.lg, marginTop: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 13 }}>If this pace holds</Body>
        {!locked && <Caption style={{ fontSize: 11 }}>From the 7-day average</Caption>}
      </View>

      {locked ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: space.md }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: radius.pill,
              backgroundColor: colors.rail,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 1,
            }}
          >
            <Icon name="lock" size={13} color={colors.disabled} />
          </View>
          <Body style={{ flex: 1, lineHeight: 19 }} color={colors.muted}>
            Projections appear once two weeks of weigh-ins show a downward trend.
          </Body>
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: space.sm, marginTop: 14 }}>
          {d.projections.map((p) => {
            const atGoal = p.weightKg != null && p.weightKg <= d.profile.goalWeightKg + 1e-9;
            return (
              <View
                key={p.label}
                style={{
                  flex: 1,
                  gap: 3,
                  paddingVertical: space.md,
                  paddingHorizontal: space.md,
                  borderRadius: radius.md,
                  backgroundColor: colors.tint,
                }}
              >
                <Caption style={{ fontSize: 10.5, fontFamily: font.semibold }} color={colors.accent}>
                  {p.label}
                </Caption>
                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 3 }}>
                  <Stat style={{ fontSize: 19 }} color={colors.text}>
                    {u.weightValue(p.weightKg)}
                  </Stat>
                  <Caption style={{ fontSize: 10.5 }}>{u.labels.weight}</Caption>
                </View>
                {atGoal && (
                  <Caption style={{ fontSize: 10 }} color={colors.greenText}>
                    Goal reached
                  </Caption>
                )}
              </View>
            );
          })}
        </View>
      )}
    </Card>
  );
}
