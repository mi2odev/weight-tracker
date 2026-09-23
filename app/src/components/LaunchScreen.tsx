import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Image, StyleSheet, View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';

import { useTheme } from '../theme/ThemeContext';

/**
 * The loading screen on open.
 *
 * It picks up exactly where the native splash leaves off — same colour, same
 * logo, same size — so the hand-over is invisible, and then the logo settles
 * in while fonts load and the log is read from storage. When both are done
 * (and it has been up long enough to register rather than flicker), it fades
 * away to reveal the app already drawn underneath.
 *
 * It is an overlay, not a gate: the app mounts behind it straight away, so
 * the fade reveals a finished screen rather than one still laying itself out.
 */

/** Matches `expo-splash-screen` in app.json. */
const BRAND = { light: '#015b5e', dark: '#01383c' } as const;

/** Long enough to read as a deliberate screen, short enough never to be in the way. */
const MIN_VISIBLE_MS = 1200;
const FADE_MS = 380;

// Keep the native splash up until this screen has drawn over it, so there is
// no blank frame between the two. Harmless where there is no native splash.
SplashScreen.preventAutoHideAsync().catch(() => {});

export function LaunchScreen({ ready }: { ready: boolean }) {
  const { mode } = useTheme();
  const [gone, setGone] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const logo = useRef(new Animated.Value(0)).current;
  const bar = useRef(new Animated.Value(0)).current;
  const cover = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then(setReduceMotion)
      .catch(() => {});
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, []);

  // Logo settles in; the bar sweeps until the app is ready.
  useEffect(() => {
    if (reduceMotion) {
      logo.setValue(1);
      return;
    }
    Animated.timing(logo, {
      toValue: 1,
      duration: 650,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
    const sweep = Animated.loop(
      Animated.timing(bar, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    sweep.start();
    return () => sweep.stop();
  }, [reduceMotion, logo, bar]);

  useEffect(() => {
    if (!ready || !minElapsed) return;
    Animated.timing(cover, {
      toValue: 0,
      duration: reduceMotion ? 0 : FADE_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => setGone(true));
  }, [ready, minElapsed, reduceMotion, cover]);

  if (gone) return null;

  return (
    <Animated.View
      // Swallows touches while it is up, so nothing underneath is tapped blind.
      pointerEvents={ready && minElapsed ? 'none' : 'auto'}
      accessibilityLabel="Weighpoint is loading"
      accessibilityRole="progressbar"
      onLayout={() => {
        SplashScreen.hideAsync().catch(() => {});
      }}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: BRAND[mode], alignItems: 'center', justifyContent: 'center', opacity: cover },
      ]}
    >
      <Animated.View
        style={{
          opacity: logo.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }),
          transform: [{ scale: logo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
        }}
      >
        {/* Same artwork and width as the native splash (imageWidth 220). */}
        <Image
          source={require('../../assets/splash-icon.png')}
          style={{ width: 220, height: 220 }}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      </Animated.View>

      <View
        style={{
          marginTop: 28,
          width: 96,
          height: 3,
          borderRadius: 2,
          backgroundColor: 'rgba(255,255,255,0.18)',
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={{
            width: 36,
            height: 3,
            borderRadius: 2,
            backgroundColor: '#6FF0C4',
            transform: [{ translateX: bar.interpolate({ inputRange: [0, 1], outputRange: [-36, 96] }) }],
          }}
        />
      </View>
    </Animated.View>
  );
}
