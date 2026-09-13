import React, { useCallback, useEffect, useState } from 'react';
import { BackHandler, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { useTheme } from '../theme/ThemeContext';
import { useStore } from '../data/store';
import { TabBar, TabKey } from '../components/TabBar';
import { CelebrationModal, Toast } from '../components/Overlays';
import { HOME, Route, SubScreen } from './routes';

import { TodayScreen } from '../screens/TodayScreen';
import { ProgressScreen } from '../screens/ProgressScreen';
import { TrendsScreen } from '../screens/TrendsScreen';
import { HabitsScreen } from '../screens/HabitsScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { MilestonesScreen } from '../screens/MilestonesScreen';
import { BodyScreen } from '../screens/BodyScreen';
import { LogScreen } from '../screens/LogScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { OnboardingScreen } from '../screens/OnboardingScreen';

/**
 * A small explicit router rather than a navigation library.
 *
 * The design draws its own tab bar and its sub-screens are simple pushes over
 * a tab, so a route union keeps the chrome pixel-exact and the whole flow
 * readable in one file.
 */
export function Root() {
  const { colors, mode } = useTheme();
  const { data, hydrated, toast, celebration, dismissCelebration } = useStore();
  const [route, setRoute] = useState<Route>(HOME);

  const goTab = useCallback((tab: TabKey) => setRoute({ kind: 'tab', tab }), []);
  const goSub = useCallback(
    (screen: SubScreen, from: TabKey) => setRoute({ kind: 'sub', screen, from }),
    [],
  );
  const back = useCallback(() => {
    setRoute((prev) => (prev.kind === 'sub' ? { kind: 'tab', tab: prev.from } : prev));
  }, []);

  // Android hardware back pops a sub-screen instead of leaving the app.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (route.kind === 'sub') {
        back();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [route, back]);

  if (!hydrated) return <View style={{ flex: 1, backgroundColor: colors.page }} />;

  if (!data.onboarded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.page }}>
        <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
        <OnboardingScreen />
        <Toast message={toast} />
      </View>
    );
  }

  const activeTab = route.kind === 'tab' ? route.tab : route.from;

  return (
    <View style={{ flex: 1, backgroundColor: colors.page }}>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />

      <View style={{ flex: 1 }}>
        {route.kind === 'tab' && route.tab === 'today' && (
          <TodayScreen onOpenLog={() => goSub('log', 'today')} />
        )}
        {route.kind === 'tab' && route.tab === 'progress' && (
          <ProgressScreen onOpenMilestones={() => goSub('milestones', 'progress')} />
        )}
        {route.kind === 'tab' && route.tab === 'trends' && <TrendsScreen />}
        {route.kind === 'tab' && route.tab === 'habits' && <HabitsScreen />}
        {route.kind === 'tab' && route.tab === 'more' && (
          <MoreScreen onOpen={(screen) => goSub(screen, 'more')} />
        )}

        {route.kind === 'sub' && route.screen === 'milestones' && <MilestonesScreen onBack={back} />}
        {route.kind === 'sub' && route.screen === 'body' && <BodyScreen onBack={back} />}
        {route.kind === 'sub' && route.screen === 'log' && <LogScreen onBack={back} />}
        {route.kind === 'sub' && route.screen === 'settings' && <SettingsScreen onBack={back} />}
      </View>

      <TabBar active={activeTab} onChange={goTab} />

      <Toast message={toast} />
      <CelebrationModal celebration={celebration} onClose={dismissCelebration} />
    </View>
  );
}
