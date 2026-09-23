import { TextInput, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space, tnum } from '../theme/tokens';
import { useStore } from '../data/store';
import { useDerived } from '../data/derived';
import { Card } from '../components/Card';
import { Icon } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import { MilestoneStatus } from '../lib/calc';
import { formatMedium, toKey } from '../lib/date';

export function MilestonesScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { setReward } = useStore();
  const d = useDerived();
  const { u } = d;

  const list = d.milestones;

  const badge = (status: MilestoneStatus) => {
    if (status === 'Achieved') return { bg: colors.tint, fg: colors.accent };
    if (status === 'Overdue') return { bg: colors.rail, fg: colors.caution };
    return { bg: colors.rail, fg: colors.muted };
  };

  return (
    <Screen title="Milestones" meta={`Every ${u.weight(5).replace(/\.0(?=\s)/, '')}`} onBack={onBack}>
      {list.map((m) => {
        const achieved = m.status === 'Achieved';
        const tone = badge(m.status);
        return (
          <Card
            key={m.targetKg}
            style={{
              paddingHorizontal: 17,
              paddingVertical: 15,
              borderColor: achieved ? colors.accent : colors.line,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 13 }}>
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: radius.pill,
                  backgroundColor: achieved ? colors.accent : colors.rail,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Body
                  style={[{ fontFamily: font.bold, fontSize: 13 }, tnum]}
                  color={achieved ? colors.onAccent : colors.muted}
                >
                  {u.weightValue(m.targetKg, 0)}
                </Body>
              </View>

              <View style={{ flex: 1, gap: 2 }}>
                <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>
                  {u.weight(m.kgFromStart)} lost · {u.weight(m.targetKg)}
                </Body>
                {/* Estimates run years out, so they carry a year. */}
                <Caption style={{ fontSize: 11.5 }}>
                  {m.achievedDate
                    ? `Reached ${formatMedium(m.achievedDate)} · ${m.daysTaken} days`
                    : m.targetDate
                      ? `Estimated ${formatMedium(toKey(m.targetDate))}`
                      : 'No estimated date — this app sets no pace for under-18s'}
                </Caption>
                <Caption style={{ fontSize: 11.5 }}>{Math.round(m.pctOfGoal)}% of goal</Caption>
              </View>

              <View
                style={{
                  paddingHorizontal: 11,
                  paddingVertical: 6,
                  borderRadius: radius.pill,
                  backgroundColor: tone.bg,
                }}
              >
                <Caption style={{ fontSize: 10.5, letterSpacing: 0.84, textTransform: 'uppercase', fontFamily: font.semibold }} color={tone.fg}>
                  {m.status}
                </Caption>
              </View>
            </View>

            {/* The only user input on this screen. */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: space.sm,
                marginTop: space.md,
                backgroundColor: colors.rail,
                borderRadius: radius.md,
                paddingHorizontal: 13,
                paddingVertical: 10,
              }}
            >
              <Icon name="star" size={14} color={colors.muted} strokeWidth={1.4} />
              <TextInput
                value={m.reward}
                onChangeText={(text) => setReward(m.targetKg, text)}
                placeholder="Reward yourself with…"
                placeholderTextColor={colors.disabled}
                accessibilityLabel={`Reward for the ${m.targetKg} kg milestone`}
                style={{
                  flex: 1,
                  padding: 0,
                  fontFamily: font.medium,
                  fontSize: 13,
                  color: colors.text,
                }}
              />
            </View>
          </Card>
        );
      })}

      <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.md, paddingHorizontal: space.xs }}>
        An achieved date is stamped the first time you cross a milestone and never moves again — even if the number
        goes back up for a while.
      </Caption>
    </Screen>
  );
}
