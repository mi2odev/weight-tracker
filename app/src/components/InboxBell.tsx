import React from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font } from '../theme/tokens';
import { Icon } from './Icon';
import { Body } from './Type';

/** The bell on Today, with an unread count when there is one. */
export function InboxBell({ unread, onPress }: { unread: number; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `Notifications, ${unread} unread` : 'Notifications'}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: pressed ? colors.line : colors.card,
        borderWidth: 1,
        borderColor: colors.line,
      })}
    >
      <Icon name="bell" size={18} color={unread ? colors.accent : colors.muted} />
      {unread > 0 && (
        <View
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: colors.accent,
            borderWidth: 2,
            borderColor: colors.page,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body style={{ fontFamily: font.bold, fontSize: 9.5, lineHeight: 11 }} color={colors.onAccent}>
            {unread > 9 ? '9+' : String(unread)}
          </Body>
        </View>
      )}
    </Pressable>
  );
}
