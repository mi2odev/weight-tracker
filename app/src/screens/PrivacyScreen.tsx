import { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../theme/ThemeContext';
import { font, space } from '../theme/tokens';
import { useStore } from '../data/store';
import { Card } from '../components/Card';
import { CRASH_KEY } from '../components/ErrorBoundary';
import { GhostButton, SectionHeading, Segmented, Toggle } from '../components/Controls';
import { Screen } from '../components/Screen';
import { Body, Caption } from '../components/Type';
import {
  authenticate,
  canEnableLock,
  GRACE_OPTIONS,
  LockCapability,
  lockCapability,
} from '../lib/lock';
import { CrashReport, formatCrashReport } from '../lib/diagnostics';
import { shareCrashReport } from '../lib/export';

/**
 * What the app knows, where it keeps it, and what can be turned on.
 *
 * A screen rather than a paragraph in Settings, because the honest version of
 * this is longer than a paragraph: the lock is worth explaining the limits of,
 * and crash reporting is worth showing before asking someone to agree to it.
 */
export function PrivacyScreen({ onBack }: { onBack: () => void }) {
  const { colors } = useTheme();
  const { data, setLock, setDiagnostics, showToast } = useStore();
  const [capability, setCapability] = useState<LockCapability | null>(null);
  const [report, setReport] = useState<CrashReport | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    void lockCapability().then((c) => {
      if (alive) setCapability(c);
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * Turning the lock on asks for the face or finger first. Enabling a gate you
   * cannot open is the one failure that costs someone their whole log, so the
   * switch is refused outright unless something is actually enrolled — having
   * the hardware is not the same as having a key for it.
   */
  const toggleLock = async (next: boolean) => {
    if (!next) {
      setLock({ enabled: false });
      return;
    }
    if (!canEnableLock(capability)) {
      showToast(
        capability?.available
          ? `Set up ${capability.label} in your device settings first`
          : 'This device has no biometrics or passcode to lock with',
      );
      return;
    }

    const outcome = await authenticate('Confirm it is you before locking the app');
    if (outcome === 'unlocked') {
      setLock({ enabled: true });
      showToast('App lock on');
    } else if (outcome === 'security-removed') {
      showToast('This phone no longer has a passcode set up');
    }
  };

  /**
   * The most recent kept report, if there is one.
   *
   * Only ever read while the switch is on — turning it off should stop this
   * screen offering to send anything, not just stop new ones being kept.
   */
  const loadReport = useCallback(async () => {
    if (!data.diagnostics.crashReports) {
      setReport(null);
      return;
    }
    try {
      const raw = await AsyncStorage.getItem(CRASH_KEY);
      setReport(raw ? (JSON.parse(raw) as CrashReport) : null);
    } catch {
      setReport(null);
    }
  }, [data.diagnostics.crashReports]);

  useEffect(() => {
    void loadReport();
  }, [loadReport]);

  const sendReport = async () => {
    if (!report || busy) return;
    setBusy(true);
    try {
      showToast(await shareCrashReport(formatCrashReport(report)));
    } catch {
      showToast('Could not share the report — try once more');
    } finally {
      setBusy(false);
    }
  };

  const graceLabel = (
    GRACE_OPTIONS.find((o) => o.seconds === data.lock.graceSeconds) ?? GRACE_OPTIONS[1]
  ).label;

  return (
    <Screen title="Privacy" meta="Your data" onBack={onBack}>
      <Card hero style={{ padding: 18, gap: space.sm }}>
        <Body style={{ fontFamily: font.semibold, fontSize: 14 }}>Everything stays here</Body>
        <Body style={{ fontSize: 13.5, lineHeight: 20 }} color={colors.muted}>
          There is no account, no sign-in and no server. Your weigh-ins, meals, workouts,
          measurements and progress photos are written to this device's own storage and read back
          from it. The only way any of it leaves is when you export or back it up yourself, and then
          it goes wherever you send it.
        </Body>
      </Card>

      {/* ── app lock ─────────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="App lock" />
      </View>
      <Card style={{ padding: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: 14,
            paddingVertical: 13,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14.5 }}>Lock the app</Body>
            <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
              {capability == null
                ? 'Checking this device…'
                : capability.enrolled
                  ? `${capability.label} before your log opens`
                  : capability.available
                    ? `Set up ${capability.label} on this device first`
                    : 'This device has no biometrics or passcode set up'}
            </Caption>
          </View>
          <Toggle
            value={data.lock.enabled}
            disabled={!data.lock.enabled && !canEnableLock(capability)}
            accessibilityLabel="Lock the app"
            onChange={(next) => void toggleLock(next)}
          />
        </View>

        {data.lock.enabled && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: space.sm }}>
            <Caption style={{ fontSize: 11.5 }}>Lock again when you leave</Caption>
            <Segmented
              options={GRACE_OPTIONS.map((o) => o.label)}
              value={graceLabel}
              onChange={(label) => {
                const chosen = GRACE_OPTIONS.find((o) => o.label === label);
                if (chosen) setLock({ graceSeconds: chosen.seconds });
              }}
            />
          </View>
        )}
      </Card>
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        The lock keeps a passing glance out. It is a gate in front of the screen, not encryption —
        it will not protect a phone someone else has already unlocked, and the Privacy screen would
        rather say so than imply more.
      </Caption>
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        While the lock is on, screenshots and screen recordings of this app are blocked, and your
        weight will not appear in the app switcher. Turning the lock off allows them again.
      </Caption>

      {/* ── crash reports ────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="Crash reports" />
      </View>
      <Card style={{ padding: 4 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.md,
            paddingHorizontal: 14,
            paddingVertical: 13,
          }}
        >
          <View style={{ flex: 1, gap: 2 }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 14.5 }}>Keep crash reports</Body>
            <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>
              Off unless you turn it on
            </Caption>
          </View>
          <Toggle
            value={data.diagnostics.crashReports}
            accessibilityLabel="Keep crash reports"
            onChange={(next) => {
              setDiagnostics({ crashReports: next });
              showToast(next ? 'Crash reports on' : 'Crash reports off');
            }}
          />
        </View>
      </Card>
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        A report holds the app version, your phone's OS version, the kind of error and the lines of
        code it came from. It never holds a weight, a date, a measurement, a meal or a photo — the
        error's own message is thrown away, because that is where those values end up. When the app
        crashes you are shown the whole report, exactly as it was recorded, before anything is kept.
      </Caption>
      <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
        Nothing is uploaded on its own. A kept report sits on this device until you send it, and
        sending is a share sheet — it goes wherever you choose and nowhere else.
      </Caption>

      {data.diagnostics.crashReports && (
        <>
          <GhostButton
            label={busy ? 'One moment…' : 'Send the last crash report'}
            onPress={() => void sendReport()}
            tone={report ? 'accent' : 'muted'}
            style={{ opacity: report ? 1 : 0.5 }}
          />
          <Caption style={{ fontSize: 11.5, lineHeight: 17, paddingHorizontal: space.xs }}>
            {report
              ? `Recorded ${report.at.slice(0, 10)} · ${report.errorName}. You will see the whole thing in the share sheet before it goes anywhere.`
              : 'Nothing to send — the app has not crashed since you turned this on.'}
          </Caption>
        </>
      )}

      {/* ── what leaves ──────────────────────────────────────────────────── */}
      <View style={{ marginTop: space.lg }}>
        <SectionHeading title="When data leaves" />
      </View>
      <Card style={{ padding: 18, gap: space.sm }}>
        {[
          ['Export as CSV', 'Four spreadsheets, shared wherever you choose to send them.'],
          ['Back up as JSON', 'Everything in one file. Photos only if you ask for them.'],
          ['Export from a crash', 'The saved file as-is, so you can rescue it if the app breaks.'],
        ].map(([label, detail]) => (
          <View key={label} style={{ gap: 2 }}>
            <Body style={{ fontFamily: font.semibold, fontSize: 13.5 }}>{label}</Body>
            <Caption style={{ fontSize: 11.5, lineHeight: 17 }}>{detail}</Caption>
          </View>
        ))}
        <Caption style={{ fontSize: 11.5, lineHeight: 17, marginTop: space.xs }}>
          All three are things you start. Nothing happens in the background.
        </Caption>
      </Card>
    </Screen>
  );
}
