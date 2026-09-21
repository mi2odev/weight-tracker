import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { Icon, IconName } from '../components/Icon';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import { SubScreen } from '../navigation/routes';

const ITEMS: { key: SubScreen; label: string; sub: string; icon: IconName }[] = [
  { key: 'milestones', label: 'Milestones', sub: 'Every 5 kg, with rewards', icon: 'star' },
  { key: 'body', label: 'Body measurements', sub: 'Waist, chest, arms, thighs, neck', icon: 'ruler' },
  { key: 'log', label: 'Food & training log', sub: 'Meals and workouts by day', icon: 'book' },
  { key: 'settings', label: 'Settings & profile', sub: 'Targets and calculated metrics', icon: 'gear' },
  { key: 'privacy', label: 'Privacy', sub: 'App lock, crash reports, what leaves this device', icon: 'lock' },
];

export function MoreScreen({ onOpen }: { onOpen: (screen: SubScreen) => void }) {
  const { colors } = useTheme();

  return (
    <Screen title="More" meta="Everything else">
      {ITEMS.map((item) => (
        <Pressable
          key={item.key}
          accessibilityRole="button"
          onPress={() => onOpen(item.key)}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            minHeight: 64,
            paddingHorizontal: 18,
            paddingVertical: space.lg,
            borderRadius: radius.lg,
            borderWidth: 1,
            borderColor: pressed ? colors.accent : colors.line,
            backgroundColor: colors.card,
          })}
        >
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: radius.pill,
              backgroundColor: colors.tint,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name={item.icon} size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>{item.label}</Body>
            <Caption style={{ fontSize: 12, lineHeight: 16 }}>{item.sub}</Caption>
          </View>
          <Icon name="chevronRight" size={14} color={colors.accent} />
        </Pressable>
      ))}
    </Screen>
  );
}
