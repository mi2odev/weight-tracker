import { Pressable, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { Icon, IconName } from './Icon';
import { MAX_CONTENT_WIDTH } from './Screen';
import { useKeyboard } from './keyboard';
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
  const keyboard = useKeyboard();

  // Out of the way while typing: above the keys it only takes room, and its
  // navigation-bar padding showed as an empty band between app and keyboard.
  if (keyboard.open) return null;

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
        const color = on ? colors.accent : colors.muted;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            accessibilityLabel={tab.label}
            onPress={() => onChange(tab.key)}
            style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            {/* The active tab sits in a pill, so the selection reads at a glance
                rather than by colour alone. */}
            <View
              style={{
                width: 54,
                height: 28,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: on ? colors.tint : 'transparent',
              }}
            >
              <Icon name={tab.icon} size={20} color={color} strokeWidth={on ? 1.9 : 1.6} />
            </View>
            <Body
              style={{ fontFamily: on ? font.semibold : font.medium, fontSize: 10.5 }}
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
