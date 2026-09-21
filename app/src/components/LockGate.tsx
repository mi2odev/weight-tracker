import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { useStore } from '../data/store';
import { authenticate, shouldRelock } from '../lib/lock';
import { PrimaryButton } from './Controls';
import { Icon } from './Icon';
import { Body, Title } from './Type';

/**
 * Holds the app behind a biometric prompt when the lock is on.
 *
 * Two separate covers, doing different jobs:
 *
 * - **The lock screen** appears when the grace period has expired and stays
 *   until the user authenticates.
 * - **The privacy cover** appears the moment the app becomes inactive — the
 *   window in which iOS and Android take the snapshot used for the app
 *   switcher. Without it, a thumbnail of the user's weight sits in the task
 *   list whatever the lock says.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { data, hydrated } = useStore();
  const lock = data.lock;

  const [unlocked, setUnlocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [covered, setCovered] = useState(false);
  const backgroundedAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (prompting) return;
    setPrompting(true);
    try {
      if (await authenticate()) {
        setUnlocked(true);
        backgroundedAt.current = null;
      }
    } finally {
      setPrompting(false);
    }
  }, [prompting]);

  // Ask as soon as the gate goes up, so the common case is one tap on a
  // prompt that is already open rather than a button to open one.
  useEffect(() => {
    if (!hydrated || !lock.enabled || unlocked) return;
    void tryUnlock();
    // tryUnlock is intentionally omitted: including it re-prompts on each
    // `prompting` flip, which fights the system dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, lock.enabled, unlocked]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state: AppStateStatus) => {
      // The snapshot is taken during 'inactive', so the cover has to be up
      // before 'background' arrives.
      setCovered(state !== 'active' && lock.enabled);

      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current == null) backgroundedAt.current = Date.now();
      } else if (state === 'active') {
        if (shouldRelock(lock, backgroundedAt.current)) setUnlocked(false);
        else backgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [lock]);

  // Turning the lock off should not strand someone behind it.
  useEffect(() => {
    if (!lock.enabled) setUnlocked(true);
  }, [lock.enabled]);

  const locked = hydrated && lock.enabled && !unlocked;

  return (
    <View style={{ flex: 1 }}>
      {children}

      {locked && (
        <View
          style={{
            ...StyleSheet.absoluteFill,
            backgroundColor: colors.page,
            alignItems: 'center',
            justifyContent: 'center',
            padding: space.xxl,
            gap: space.md,
          }}
        >
          <Icon name="lock" size={34} color={colors.accent} strokeWidth={1.4} />
          <Title style={{ fontSize: 22, textAlign: 'center' }}>Locked</Title>
          <Body style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }} color={colors.muted}>
            Your log is private. Unlock to carry on.
          </Body>
          <PrimaryButton
            label={prompting ? 'Waiting…' : 'Unlock'}
            onPress={tryUnlock}
            style={{ alignSelf: 'stretch', marginTop: space.sm }}
          />
        </View>
      )}

      {/* Opaque, and above everything, so the switcher thumbnail shows nothing. */}
      {covered && !locked && (
        <View
          pointerEvents="none"
          style={{
            ...StyleSheet.absoluteFill,
            backgroundColor: colors.page,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Body style={{ fontFamily: font.semibold, fontSize: 15 }} color={colors.muted}>
            Weight Tracker
          </Body>
        </View>
      )}
    </View>
  );
}
