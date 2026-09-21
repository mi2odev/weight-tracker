import React from 'react';
import { Modal, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { Body, Caption, Title } from './Type';
import { Icon } from './Icon';
import { useKeyboardHeight } from './keyboard';
import { PrimaryButton } from './Controls';
import { Celebration } from '../data/store';
import { f1 } from '../lib/calc';

export function Toast({
  message,
  action,
}: {
  message: string;
  /** Renders an inline button — used for Undo after a delete. */
  action?: { label: string; run: () => void } | null;
}) {
  const { colors } = useTheme();
  if (!message) return null;

  return (
    <View
      // Only swallow touches when there is something to tap.
      pointerEvents={action ? 'box-none' : 'none'}
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        bottom: 96,
        backgroundColor: colors.text,
        borderRadius: radius.md,
        paddingVertical: action ? 10 : 14,
        paddingLeft: space.lg,
        paddingRight: action ? space.sm : space.lg,
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
      }}
    >
      <Body
        style={{
          flex: 1,
          textAlign: action ? 'left' : 'center',
          fontFamily: font.semibold,
          fontSize: 13.5,
        }}
        color={colors.page}
      >
        {message}
      </Body>

      {!!action && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={action.label}
          onPress={action.run}
          hitSlop={8}
          style={({ pressed }) => ({
            minHeight: 36,
            paddingHorizontal: 14,
            justifyContent: 'center',
            borderRadius: radius.sm,
            backgroundColor: pressed ? 'rgba(255,255,255,0.18)' : 'transparent',
          })}
        >
          <Body style={{ fontFamily: font.semibold, fontSize: 13.5 }} color={colors.accent}>
            {action.label}
          </Body>
        </Pressable>
      )}
    </View>
  );
}

/**
 * A blocking yes/no. Used only where an action cannot be undone — resetting
 * the log, which has no restore path once the store is overwritten.
 */
export function ConfirmDialog({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  /** "Not now" reads very differently from "Cancel" on an offer. */
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(28,28,26,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
        }}
      >
        <View
          style={{
            width: '100%',
            backgroundColor: colors.card,
            borderRadius: 24,
            padding: space.xl,
            gap: space.sm,
          }}
        >
          <Title style={{ fontSize: 20 }}>{title}</Title>
          <Body style={{ fontSize: 14, lineHeight: 20 }} color={colors.muted}>
            {body}
          </Body>

          <View style={{ flexDirection: 'row', gap: space.sm, marginTop: space.md }}>
            <Pressable
              accessibilityRole="button"
              onPress={onCancel}
              style={{
                flex: 1,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 15 }}>{cancelLabel}</Body>
            </Pressable>

            <Pressable
              accessibilityRole="button"
              onPress={onConfirm}
              style={({ pressed }) => ({
                flex: 1,
                minHeight: 48,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radius.md,
                backgroundColor: destructive
                  ? colors.missed
                  : pressed
                    ? colors.accentPressed
                    : colors.accent,
                opacity: pressed ? 0.85 : 1,
              })}
            >
              <Body style={{ fontFamily: font.semibold, fontSize: 15 }} color="#FFFFFF">
                {confirmLabel}
              </Body>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Fired once, the first time a milestone's achieved date is set.
 * Shows the reward the user wrote for it, or points them at where to write one.
 */
export function CelebrationModal({
  celebration,
  onClose,
}: {
  celebration: Celebration | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  if (!celebration) return null;

  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(28,28,26,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
        }}
      >
        <View
          style={{
            width: '100%',
            backgroundColor: colors.card,
            borderRadius: 28,
            paddingVertical: space.xxl,
            paddingHorizontal: 26,
            alignItems: 'center',
          }}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: radius.pill,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="star" size={34} color={colors.onAccent} strokeWidth={1.3} />
          </View>

          <Title style={{ marginTop: space.lg, fontSize: 26, textAlign: 'center' }}>
            {f1(celebration.kgFromStart)} kg down
          </Title>

          <Body style={{ marginTop: space.sm, textAlign: 'center', fontSize: 15, lineHeight: 22 }} color={colors.muted}>
            You crossed the {f1(celebration.targetKg)} kg milestone — {Math.round(celebration.pctOfGoal)}% of the way
            to your goal.
          </Body>

          <Caption
            style={{ marginTop: space.sm, fontSize: 13.5, fontFamily: font.semibold, textAlign: 'center' }}
            color={colors.accent}
          >
            {celebration.reward
              ? `Your reward: ${celebration.reward}`
              : 'Set a reward for this one on the Milestones screen.'}
          </Caption>

          <PrimaryButton label="Nice" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: space.xl }} />
        </View>
      </View>
    </Modal>
  );
}

/** The bottom sheet used by the meal, workout and measurement entry forms. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();
  const keyboard = useKeyboardHeight();

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      {/* Tapping the dimmed area behind the sheet closes it — the gesture
          everyone tries before looking for the Close button. */}
      <Pressable
        accessibilityLabel="Close"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(28,28,26,0.45)', justifyContent: 'flex-end' }}
      >
        {/* A second Pressable swallows taps inside the panel, so typing in a
            field does not dismiss the sheet under your finger. */}
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: colors.page,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            // Lifted clear of the keys. The panel is bottom-anchored, which
            // is exactly where the keyboard arrives, so without this the
            // fields and the save button sit behind it.
            marginBottom: keyboard,
            maxHeight: screenHeight - keyboard - space.xxl,
          }}
        >
          <View style={{ paddingHorizontal: space.xl, paddingTop: space.xl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Title style={{ fontSize: 22 }}>{title}</Title>
              <Body
                accessibilityRole="button"
                onPress={onClose}
                style={{ fontFamily: font.semibold, fontSize: 15, padding: 4 }}
                color={colors.accent}
              >
                Close
              </Body>
            </View>
          </View>

          {/* Scrollable, so a tall form on a short screen can still reach its
              own save button. `handled` matters: without it the first tap on
              that button only dismisses the keyboard. */}
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: space.xl,
              paddingTop: space.md,
              paddingBottom: space.xxl + space.md,
              gap: space.md,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
