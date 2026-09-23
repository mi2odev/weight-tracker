import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
// Imported per weight, not from the package root — the root re-exports all
// fourteen faces and Metro would bundle every one of them (~3 MB of TTF).
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular';
import { IBMPlexSans_500Medium } from '@expo-google-fonts/ibm-plex-sans/500Medium';
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold';
import { IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans/700Bold';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import { StoreProvider, useStore } from './src/data/store';
import { DerivedProvider } from './src/data/derived';
import { Root } from './src/navigation/Root';
import { LockGate } from './src/components/LockGate';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { LaunchScreen } from './src/components/LaunchScreen';

export default function App() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
  });

  return (
    <SafeAreaProvider>
      {/* Outside every provider on purpose — it has to render when the store
          or the theme is the thing that threw. */}
      <ErrorBoundary>
        <ThemeProvider>
          <StoreProvider>
            <DerivedProvider>
              <View style={{ flex: 1 }}>
                <LockGate>{fontsLoaded ? <Root /> : <Splash />}</LockGate>
                <Launch fontsLoaded={fontsLoaded} />
              </View>
            </DerivedProvider>
          </StoreProvider>
        </ThemeProvider>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

/** Plain page colour while IBM Plex loads — no flash of a fallback face. */
function Splash() {
  const { colors } = useTheme();
  return <View style={{ flex: 1, backgroundColor: colors.page }} />;
}

/** The loading screen stays up until the fonts are in and the log has been read. */
function Launch({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { hydrated, storageUnreadable } = useStore();
  // An unreadable store is "ready" too: the error screen underneath has to be
  // seen, not hidden behind a loader that never finishes.
  return <LaunchScreen ready={fontsLoaded && (hydrated || storageUnreadable)} />;
}
