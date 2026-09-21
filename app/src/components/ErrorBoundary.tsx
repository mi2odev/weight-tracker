import React from 'react';
import { Appearance, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { palettes } from '../theme/tokens';
import { STORAGE_KEY } from '../data/store';
import { shareCrashReport, shareRawStorage } from '../lib/export';
import { buildCrashReport, CrashReport, formatCrashReport } from '../lib/diagnostics';

/** Where an opted-in crash report is kept until something is built to read it. */
export const CRASH_KEY = 'wt.crash.last';

interface State {
  report: CrashReport | null;
  /** Bumped on restart so the whole tree below is rebuilt from scratch. */
  attempt: number;
  busy: boolean;
  message: string;
}

/**
 * The last thing between a crash and a blank white screen.
 *
 * It sits above every provider, so it still renders when the store, the theme
 * or a screen is the thing that broke. That constraint shapes it: no hooks, no
 * `useTheme`, no store — the palette is read straight off `Appearance`, and
 * "Export my data" goes to AsyncStorage rather than through the store it
 * cannot trust.
 *
 * Two actions, in the order a person needs them: get your log out, then try
 * again. Restart remounts rather than reloads, because a reload loses anything
 * the debounced write had not flushed.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { report: null, attempt: 0, busy: false, message: '' };

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return {
      report: buildCrashReport(error, {
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        platform: Platform.OS,
        osVersion: String(Platform.Version),
        fatal: true,
      }),
    };
  }

  componentDidCatch(error: unknown) {
    void this.record(
      buildCrashReport(error, {
        appVersion: Constants.expoConfig?.version ?? '0.0.0',
        platform: Platform.OS,
        osVersion: String(Platform.Version),
        fatal: true,
      }),
    );
  }

  /**
   * Keeps the report only if the user opted in. Read from storage rather than
   * from the store, and defaulting to *not* keeping it if anything about that
   * read fails — an unreadable preference is not consent.
   */
  private async record(report: CrashReport) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.diagnostics?.crashReports !== true) return;
      await AsyncStorage.setItem(CRASH_KEY, JSON.stringify(report));
    } catch {
      /* never let the crash handler crash */
    }
  }

  private exportData = async () => {
    if (this.state.busy) return;
    this.setState({ busy: true, message: '' });
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (!raw) {
        this.setState({ message: 'There was nothing saved to export.' });
        return;
      }
      this.setState({ message: await shareRawStorage(raw) });
    } catch {
      this.setState({ message: 'Could not export — try once more.' });
    } finally {
      this.setState({ busy: false });
    }
  };

  /**
   * Shares the report the user is already looking at.
   *
   * Deliberately theirs to start: reports are kept on the device and nothing
   * uploads by itself, so without a button nobody would ever see one. What
   * goes out is the same scrubbed text shown above it — there is no fuller
   * version held back for this.
   */
  private sendReport = async () => {
    const { report } = this.state;
    if (!report || this.state.busy) return;
    this.setState({ busy: true, message: '' });
    try {
      this.setState({ message: await shareCrashReport(formatCrashReport(report)) });
    } catch {
      this.setState({ message: 'Could not share the report — try once more.' });
    } finally {
      this.setState({ busy: false });
    }
  };

  private restart = () => {
    this.setState((prev) => ({
      report: null,
      attempt: prev.attempt + 1,
      busy: false,
      message: '',
    }));
  };

  render() {
    const { report } = this.state;
    if (!report) return <React.Fragment key={this.state.attempt}>{this.props.children}</React.Fragment>;

    const c = palettes[Appearance.getColorScheme() === 'dark' ? 'dark' : 'light'];

    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 80, gap: 14 }}>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: '700' }}>
            Something went wrong
          </Text>
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 22 }}>
            Your log is still saved on this device — nothing has been lost. Take a copy first if you
            want to be certain, then try again.
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={this.exportData}
            style={{
              minHeight: 50,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: c.accent,
              marginTop: 8,
            }}
          >
            <Text style={{ color: c.onAccent, fontSize: 16, fontWeight: '600' }}>
              {this.state.busy ? 'One moment…' : 'Export my data'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={this.sendReport}
            style={{
              minHeight: 50,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Text style={{ color: c.accent, fontSize: 15, fontWeight: '600' }}>
              Send crash report
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={this.restart}
            style={{
              minHeight: 50,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 1,
              borderColor: c.line,
            }}
          >
            <Text style={{ color: c.accent, fontSize: 15, fontWeight: '600' }}>Restart</Text>
          </Pressable>

          {!!this.state.message && (
            <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>
              {this.state.message}
            </Text>
          )}

          {/* Shown, not hidden: a privacy promise you cannot inspect is one you
              have to take on faith. This is the whole report, verbatim. */}
          <Text style={{ color: c.muted, fontSize: 12, marginTop: 18 }}>
            Technical details. No weights, dates, measurements or photos appear here, and nothing is
            sent anywhere on its own.
          </Text>
          <View style={{ backgroundColor: c.card, borderRadius: 12, padding: 14 }}>
            <Text style={{ color: c.muted, fontSize: 11, lineHeight: 17, fontFamily: mono }}>
              {formatCrashReport(report)}
            </Text>
          </View>
        </ScrollView>
      </View>
    );
  }
}

const mono = Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' });
