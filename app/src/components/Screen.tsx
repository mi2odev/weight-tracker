import React from 'react';
import { Platform, Pressable, ScrollView, StyleProp, useWindowDimensions, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { space } from '../theme/tokens';
import { Icon } from './Icon';
import { Meta, Title } from './Type';
import { useKeyboard } from './keyboard';
import { RevealContext, useRevealFocused } from './revealFocused';

/**
 * The design is drawn for a 390 pt phone. On a tablet the choice is to stretch
 * it — which leaves a 40-character line length and a chart the width of a
 * dinner table — or to cap it and centre. Capping keeps every proportion the
 * design specified, so that is what this does; `supportsTablet` stays true.
 */
export const MAX_CONTENT_WIDTH = 480;

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
  action,
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
  /** A button beside the title's meta line — the inbox bell on Today. */
  action?: React.ReactNode;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const wide = width > MAX_CONTENT_WIDTH;
  const keyboard = useKeyboard();
  const { reveal, scrollProps, contentRef } = useRevealFocused();

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <ScrollView
        {...scrollProps}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: insets.top,
          // Room to scroll a focused field clear of the keys. Without it the
          // last fields on Today sit permanently behind the keyboard, with
          // nothing below them to scroll into.
          paddingBottom: footerHeight + keyboard.inset,
          ...(wide ? { width: MAX_CONTENT_WIDTH, alignSelf: 'center' } : null),
        }}
        keyboardShouldPersistTaps="handled"
        // Tapping away from a field should put the keyboard down, which is
        // what people expect and the only way to reach the tab bar again.
        // Native only dismisses when the user starts a drag. The web build
        // dismisses on *any* scroll — including a layout shift from the first
        // value typed into an empty day — which blurred the field mid-word.
        keyboardDismissMode={Platform.OS === 'web' ? 'none' : 'on-drag'}
        showsVerticalScrollIndicator={false}
      >
        <View ref={contentRef} collapsable={false}>
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
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            {!!meta && <Meta numberOfLines={1}>{meta}</Meta>}
            {action}
          </View>
        </View>

        <View
          style={[
            { paddingHorizontal: space.lg, paddingTop: space.md, paddingBottom: space.xl, gap: space.sm },
            contentStyle,
          ]}
        >
          <RevealContext.Provider value={reveal}>{children}</RevealContext.Provider>
        </View>
        </View>
      </ScrollView>

      {/* Opaque band so scrolled content never shows through the status bar. */}
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: insets.top, backgroundColor: colors.page }}
      />

      {/* Hidden while the phone keyboard is up: pinned above the keys it
          covered the fields being typed in (Notes, on Today), and nothing in
          it is needed mid-typing. The weigh-in keypad is on screen, not the
          system keyboard, so it is unaffected. */}
      {footer && !keyboard.open ? (
        <View
          style={[
            wide ? { width: MAX_CONTENT_WIDTH, alignSelf: 'center' } : null,
            // The Save bar is pinned to the bottom, which is exactly where the
            // keyboard arrives. Lift it rather than let the keys bury it.
            keyboard.inset > 0 ? { marginBottom: keyboard.inset } : null,
          ]}
        >
          {footer}
        </View>
      ) : null}
    </View>
  );
}
