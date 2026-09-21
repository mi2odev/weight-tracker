import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { useStore } from '../data/store';
import {
  authenticate,
  AuthOutcome,
  isLockedOut,
  lockCapability,
  LockCapability,
  setScreenCaptureBlocked,
  shouldRelock,
} from '../lib/lock';
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
 *
 * The case this has to get right is the one where the device's security is
 * removed *after* the lock was turned on. Someone who deletes their passcode
 * would otherwise face a prompt that can never succeed, with their entire log
 * behind it. So the gate checks what the device can still do, and when the
 * answer is "nothing", it says so and offers a way in.
 */
export function LockGate({ children }: { children: React.ReactNode }) {
  const { colors } = useTheme();
  const { data, hydrated, setLock, showToast } = useStore();
  const lock = data.lock;

  const [unlocked, setUnlocked] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const [covered, setCovered] = useState(false);
  const [capability, setCapability] = useState<LockCapability | null>(null);
  const [lastOutcome, setLastOutcome] = useState<AuthOutcome | null>(null);
  const backgroundedAt = useRef<number | null>(null);

  const tryUnlock = useCallback(async () => {
    if (prompting) return;
    setPrompting(true);
    try {
      const outcome = await authenticate();
      setLastOutcome(outcome);
      if (outcome === 'unlocked') {
        setUnlocked(true);
        backgroundedAt.current = null;
      }
    } finally {
      setPrompting(false);
    }
  }, [prompting]);

  const locked = hydrated && lock.enabled && !unlocked;
  const lockedOut = isLockedOut(capability, lastOutcome);

  // Ask what the device can still do whenever the gate goes up — the answer
  // can have changed since the lock was switched on.
  useEffect(() => {
    if (!locked) return;
    let alive = true;
    void lockCapability().then((c) => {
      if (alive) setCapability(c);
    });
    return () => {
      alive = false;
    };
  }, [locked]);

  // Ask as soon as the gate goes up, so the common case is one tap on a
  // prompt that is already open rather than a button to open one.
  useEffect(() => {
    if (!hydrated || !lock.enabled || unlocked || lockedOut) return;
    void tryUnlock();
    // tryUnlock is intentionally omitted: including it re-prompts on each
    // `prompting` flip, which fights the system dialog.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, lock.enabled, unlocked, lockedOut]);

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

  /**
   * Ask the OS to refuse screenshots while the lock is on.
   *
   * The in-app cover cannot reach the Android recent-apps thumbnail — that
   * image is the system's, and only the system can be told not to keep it.
   * Released on unmount so the block never outlives the gate.
   */
  useEffect(() => {
    void setScreenCaptureBlocked(lock.enabled);
    return () => {
      void setScreenCaptureBlocked(false);
    };
  }, [lock.enabled]);

  /** The way back in when the device can no longer satisfy the lock. */
  const turnOffAndContinue = () => {
    setLock({ enabled: false });
    setUnlocked(true);
    setLastOutcome(null);
    showToast('App lock turned off — your log is open again');
  };

  return (
    <View style={{ flex: 1 }}>
      {/* A cover that only works visually is not a cover. Without this,
          VoiceOver and TalkBack read out the weights behind the lock screen.
          Tied to `locked` rather than `covered`: the privacy cover exists for
          the app-switcher snapshot, and hiding the tree during a brief
          'inactive' — a pulled-down control centre — would yank a screen
          reader out of whatever the user was reading. */}
      <View
        style={{ flex: 1 }}
        accessibilityElementsHidden={locked}
        importantForAccessibility={locked ? 'no-hide-descendants' : 'auto'}
      >
        {children}
      </View>

      {locked && (
        <View
          accessibilityViewIsModal
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
          <Title style={{ fontSize: 22, textAlign: 'center' }}>
            {lockedOut ? 'This phone’s lock was removed' : 'Locked'}
          </Title>
          <Body style={{ textAlign: 'center', fontSize: 14, lineHeight: 21 }} color={colors.muted}>
            {lockedOut
              ? 'The passcode or fingerprint this app was locked with is no longer set up on this phone, so there is nothing left to unlock it with. Your log is safe — turn the lock off to get back in, and switch it on again once the phone has a passcode.'
              : 'Your log is private. Unlock to carry on.'}
          </Body>

          {lockedOut ? (
            <PrimaryButton
              label="Turn the lock off and continue"
              onPress={turnOffAndContinue}
              style={{ alignSelf: 'stretch', marginTop: space.sm }}
            />
          ) : (
            // No "turn it off instead" here on purpose: an escape hatch
            // after a plain cancel would let anyone holding the phone walk
            // straight past the lock.
            <PrimaryButton
              label={prompting ? 'Waiting…' : 'Unlock'}
              onPress={tryUnlock}
              style={{ alignSelf: 'stretch', marginTop: space.sm }}
            />
          )}
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
            Weighpoint
          </Body>
        </View>
      )}
    </View>
  );
}
