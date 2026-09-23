import { useMemo } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum, type } from '../theme/tokens';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Card, StatCard, StatGrid } from '../components/Card';
import { EmptyState, SectionHeading } from '../components/Controls';
import { Icon, IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Sparkline } from '../components/charts/Sparkline';
import { TrendChart } from '../components/charts/TrendChart';
import { LossBars } from '../components/charts/LossBars';
import { BmiScale, JourneyTrack, TargetMeter } from '../components/charts/ProgressVisuals';
import { Body, Caption, Hero, Label, Stat } from '../components/Type';
import { bmi, dailyChange, healthyWeightRange, isAdult } from '../lib/calc';
import {
  lastSevenDays,
  personalRecords,
  planPosition,
  TrackedField,
  WeekdayChange,
  weekdayPattern,
} from '../lib/progressStats';
import { UnitFormatter } from '../lib/units';
import { Profile } from '../data/types';
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

  const plan = planPosition(profile, d.currentKg, today);
  const pattern = useMemo(() => weekdayPattern(data.entries, today), [data.entries, today]);
  const rhythm = describeRhythm(pattern, u);
  const week = useMemo(() => lastSevenDays(data.entries, today), [data.entries, today]);
  const records = useMemo(() => personalRecords(data.entries, profile, today), [data.entries, profile, today]);
  const startBmi = bmi(profile.startWeightKg, profile.heightCm);
  const healthy = healthyWeightRange(profile.heightCm);

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
          sub={d.averageWeeklyLossKg == null ? 'Shown after your first week' : `Over ${d.weekNumber} weeks`}
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
        <Card hero style={{ paddingHorizontal: 18, paddingTop: space.lg, paddingBottom: space.lg }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: space.sm }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Your journey</Body>
            <Caption
              style={[{ fontSize: 12, fontFamily: font.semibold }, tnum]}
              color={d.completionPct > 0 ? colors.greenText : colors.muted}
            >
              {Math.round(d.completionPct)}% · {u.weightValue(Math.max(0, d.lostKg))} of{' '}
              {u.weight(profile.startWeightKg - profile.goalWeightKg)}
            </Caption>
          </View>
          <View style={{ marginTop: space.md }}>
            <JourneyTrack
              startKg={profile.startWeightKg}
              goalKg={profile.goalWeightKg}
              currentKg={d.currentKg}
              plannedKg={plan.plannedKg}
              aheadKg={plan.aheadKg}
              milestonesKg={d.milestones.map((m) => m.targetKg)}
              u={u}
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

      {/* ── patterns: how each weekday tends to move ────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Weekly rhythm" trailing="Last 8 weeks" />
      </View>
      <Card hero style={{ paddingHorizontal: 18, paddingTop: space.lg, paddingBottom: 14 }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Average overnight change by weekday</Body>
        <View style={{ flexDirection: 'row', gap: space.md, marginTop: 6 }}>
          <Swatch color={colors.green} label="Drop" />
          <Swatch color={colors.neutral} label="Rise (+)" />
        </View>
        {rhythm.ready ? (
          <>
            <View style={{ marginTop: space.lg }}>
              <LossBars
                bars={pattern.map((p, i) => ({ label: WEEKDAYS[i], value: p.avgKg == null ? null : -p.avgKg }))}
                format={(kg) => u.weightValue(kg, 2)}
                unit={u.labels.weight}
                scaleFloor={0.2}
              />
            </View>
            <Caption style={{ fontSize: 12, lineHeight: 17, marginTop: space.md }}>{rhythm.text}</Caption>
          </>
        ) : (
          <Caption style={{ fontSize: 12.5, lineHeight: 18, marginTop: space.sm }}>
            Weigh in on back-to-back days for a couple of weeks and this shows which days tend to run up or down —
            weekends often do.
          </Caption>
        )}
      </Card>

      {/* ── the last seven days against targets ─────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Last 7 days" trailing="Daily average" />
      </View>
      <Card hero style={{ paddingHorizontal: 18, paddingVertical: space.lg, gap: space.lg }}>
        {week.map((f) => (
          <TargetMeter key={f.field} {...METERS[f.field](profile, u)} value={f.avg} days={f.days} />
        ))}
      </Card>

      {/* ── BMI on the WHO scale ────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Body mass index" trailing={d.bmiBand} />
      </View>
      <Card hero style={{ paddingHorizontal: 18, paddingVertical: space.lg }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.sm }}>
          <Stat>{d.bmi.toFixed(1)}</Stat>
          <Caption style={{ fontSize: 12 }}>
            {startBmi - d.bmi > 0.05 ? `down ${(startBmi - d.bmi).toFixed(1)} from ${startBmi.toFixed(1)}` : 'BMI'}
          </Caption>
        </View>
        <View style={{ marginTop: space.md }}>
          <BmiScale current={d.bmi} start={startBmi} />
        </View>
        <Caption style={{ fontSize: 12, lineHeight: 17, marginTop: space.md }}>
          Healthy range for {u.height(profile.heightCm)}: {u.weightValue(healthy.lowKg)}–{u.weight(healthy.highKg)}. BMI
          is a population measure — it doesn't see muscle, so treat it as one signal among several.
        </Caption>
      </Card>

      {/* ── records ─────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Records" />
      </View>
      <StatGrid>
        <StatCard
          label="Lowest weight"
          value={records.lowest ? u.weightValue(records.lowest.kg) : '—'}
          unit={records.lowest ? u.labels.weight : undefined}
          sub={records.lowest ? formatShort(records.lowest.date) : 'No weigh-ins yet'}
        />
        <StatCard
          label="Best week"
          value={records.bestWeek ? u.weightValue(records.bestWeek.lostKg) : '—'}
          unit={records.bestWeek ? u.labels.weight : undefined}
          sub={records.bestWeek ? `Week ${records.bestWeek.index}` : 'Needs a week that went down'}
          valueColor={records.bestWeek ? colors.greenText : undefined}
        />
        <StatCard label="Longest streak" value={String(records.longestStreak)} unit="d" sub="Days weighed in a row" />
        <StatCard
          label="Days weighed"
          value={String(records.weighedDays)}
          unit={`/ ${records.planDays}`}
          sub={`${records.planDays ? Math.round((records.weighedDays / records.planDays) * 100) : 0}% of plan days`}
        />
      </StatGrid>

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

const WEEKDAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const WEEKDAY_NAMES = ['Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays', 'Sundays'];

/** The weekday chart's one-line reading: which day drops most, which rises most. */
function describeRhythm(pattern: WeekdayChange[], u: UnitFormatter): { ready: boolean; text: string } {
  const known = pattern.map((p, i) => ({ ...p, i })).filter((p) => p.avgKg != null) as (WeekdayChange & {
    avgKg: number;
    i: number;
  })[];
  if (known.length < 4) return { ready: false, text: '' };
  const down = known.reduce((a, b) => (b.avgKg < a.avgKg ? b : a));
  const up = known.reduce((a, b) => (b.avgKg > a.avgKg ? b : a));
  const parts: string[] = [];
  // Two decimals, the same as the bars, so the sentence and the chart agree.
  const amount = (kg: number) => `${u.weightValue(Math.abs(kg), 2)} ${u.labels.weight}`;
  if (down.avgKg < -0.005) parts.push(`${WEEKDAY_NAMES[down.i]} drop the most (−${amount(down.avgKg)})`);
  if (up.avgKg > 0.005) {
    const weekend = up.i === 0 || up.i === 6;
    parts.push(
      `${WEEKDAY_NAMES[up.i]} rise the most (+${amount(up.avgKg)})${weekend ? ' — a common weekend effect, mostly water and salt' : ''}`,
    );
  }
  return {
    ready: true,
    text: parts.length ? `${parts.join('; ')}.` : 'No weekday stands out — a steady rhythm.',
  };
}

/** How each tracked field reads against its target. */
const METERS: Record<
  TrackedField,
  (p: Profile, u: UnitFormatter) => { label: string; target: number; display: (v: number) => string; over?: 'good' | 'limit' }
> = {
  calories: (p) => ({
    label: 'Calories',
    target: isAdult(p) ? p.targetCalories : 0,
    display: (v) => `${Math.round(v).toLocaleString('en-GB')} kcal`,
    over: 'limit',
  }),
  proteinG: (p) => ({ label: 'Protein', target: p.targetProteinG, display: (v) => `${Math.round(v)} g` }),
  waterL: (p, u) => ({ label: 'Water', target: p.targetWaterL, display: (v) => u.volume(v) }),
  steps: (p) => ({ label: 'Steps', target: p.targetSteps, display: (v) => Math.round(v).toLocaleString('en-GB') }),
  sleepH: (p) => ({ label: 'Sleep', target: p.targetSleepH, display: (v) => `${v.toFixed(1)} h` }),
};

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color }} />
      <Caption style={{ fontSize: 11 }}>{label}</Caption>
    </View>
  );
}
