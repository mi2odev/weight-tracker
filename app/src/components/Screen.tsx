import React from 'react';
import { Pressable, ScrollView, StyleProp, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { space } from '../theme/tokens';
import { Icon } from './Icon';
import { Meta, Title } from './Type';

/**
 * Page scaffold.
 *
 * The large title scrolls with the body — as it does in artboards 1c/1d —
 * behind a pinned opaque band the height of the status bar, so nothing ever
 * runs under the clock.
 */
export function Screen({
  title,
  meta,
  onBack,
  children,
  contentStyle,
  footer,
  footerHeight = 0,
}: {
  title: string;
  meta?: string;
  onBack?: () => void;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** Pinned below the scroll area — the Save bar on Today. */
  footer?: React.ReactNode;
  /** Reserved at the foot of the scroll so `footer` never covers content. */
  footerHeight?: number;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top, paddingBottom: footerHeight }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: space.xs,
            flexDirection: 'row',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: space.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, flex: 1 }}>
            {!!onBack && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={12}
                onPress={onBack}
                style={{ marginLeft: -4 }}
              >
                <Icon name="chevronLeft" size={18} color={colors.accent} strokeWidth={2} />
              </Pressable>
            )}
            <Title numberOfLines={1} style={{ flex: 1 }}>
              {title}
            </Title>
          </View>
          {!!meta && <Meta numberOfLines={1}>{meta}</Meta>}
        </View>

        <View
          style={[
            { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
            contentStyle,
          ]}
        >
          {children}
        </View>
      </ScrollView>

      {/* Opaque band so scrolled content never shows through the status bar. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.page }}
      />

      {footer}
    </View>
  );
}
