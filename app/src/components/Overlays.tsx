import React from 'react';
import { Modal, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { font, radius, space } from '../theme/tokens';
import { Body, Caption, Title } from './Type';
import { Icon } from './Icon';
import { PrimaryButton } from './Controls';
import { Celebration } from '../data/store';
import { f1 } from '../lib/calc';

export function Toast({ message }: { message: string }) {
  const { colors } = useTheme();
  if (!message) return null;
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        left: space.lg,
        right: space.lg,
        bottom: 96,
        backgroundColor: colors.text,
        borderRadius: radius.md,
        paddingVertical: 14,
        paddingHorizontal: space.lg,
      }}
    >
      <Body
        style={{ textAlign: 'center', fontFamily: font.semibold, fontSize: 13.5 }}
        color={colors.page}
      >
        {message}
      </Body>
    </View>
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
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(28,28,26,0.45)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: colors.page,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            padding: space.xl,
            paddingBottom: space.xxl + space.md,
            gap: space.md,
          }}
        >
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
          {children}
        </View>
      </View>
    </Modal>
  );
}
