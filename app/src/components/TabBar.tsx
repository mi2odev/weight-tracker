import React from 'react';
import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { Icon, IconName } from './Icon';
import { MAX_CONTENT_WIDTH } from './Screen';
import { Body } from './Type';

export type TabKey = 'today' | 'progress' | 'trends' | 'habits' | 'more';

const TABS: { key: TabKey; label: string; icon: IconName }[] = [
  { key: 'today', label: 'Today', icon: 'tabToday' },
  { key: 'progress', label: 'Progress', icon: 'tabProgress' },
  { key: 'trends', label: 'Trends', icon: 'tabTrends' },
  { key: 'habits', label: 'Habits', icon: 'tabHabits' },
  { key: 'more', label: 'More', icon: 'tabMore' },
];

export function TabBar({ active, onChange }: { active: TabKey; onChange: (t: TabKey) => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  return (
    <View
      style={{
        flexDirection: 'row',
        ...(width > MAX_CONTENT_WIDTH ? { width: MAX_CONTENT_WIDTH, alignSelf: 'center' } : null),
        backgroundColor: colors.card,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingTop: 6,
        paddingHorizontal: space.xs,
        paddingBottom: Math.max(insets.bottom, 8),
      }}
    >
      {TABS.map((tab) => {
        const on = tab.key === active;
        const color = on ? colors.accent : colors.disabled;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={{ flex: 1, minHeight: 46, alignItems: 'center', justifyContent: 'center', gap: 3 }}
          >
            <Icon name={tab.icon} size={20} color={color} strokeWidth={1.6} />
            <Body
              style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 10 }}
              color={color}
            >
              {tab.label}
            </Body>
          </Pressable>
        );
      })}
    </View>
  );
}
