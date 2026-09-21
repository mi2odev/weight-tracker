/**
 * Biometric app lock.
 *
 * Body weight and measurements are health data, so the spec lists a lock
 * under privacy. It is off by default: a tracker that demands a fingerprint
 * before you can write down a number is a tracker people stop using.
 *
 * The lock is a gate in front of the UI, not encryption. It keeps a passing
 * glance out; it does not defend a device someone else already has unlocked,
 * and the Privacy screen says so rather than implying more.
 */

import * as LocalAuthentication from 'expo-local-authentication';
import * as ScreenCapture from 'expo-screen-capture';

export * from './lockRules';
import { AuthOutcome, classifyAuthResult } from './lockRules';

/**
 * Scopes the screenshot block to this app's lock.
 *
 * `expo-screen-capture` is process-wide, so a key keeps our prevent/allow
 * pair from fighting anything else that might call it.
 */
const CAPTURE_KEY = 'weighpoint-lock';

/**
 * Asks the OS to refuse screenshots and screen recordings while the lock is
 * on, and to stop refusing when it is off.
 *
 * This is what the in-app privacy cover cannot do. The cover hides the UI
 * *inside* the app, but on Android the recent-apps thumbnail is taken by the
 * system, and only the system can be told not to keep it. The cover stays —
 * it is the fallback when this is unavailable, and it also handles the moment
 * before this call resolves.
 *
 * Tied to `lock.enabled` rather than to being locked: someone who has turned
 * the lock on has said their log is private, and a screenshot taken while
 * they are looking at it is exactly as revealing as the thumbnail.
 */
export async function setScreenCaptureBlocked(blocked: boolean): Promise<void> {
  try {
    if (blocked) await ScreenCapture.preventScreenCaptureAsync(CAPTURE_KEY);
    else await ScreenCapture.allowScreenCaptureAsync(CAPTURE_KEY);
  } catch {
    /* Unsupported here — the in-app cover is still up, so this is a downgrade
       in protection rather than a failure worth interrupting anyone over. */
  }
}

export interface LockCapability {
  /** The device has the hardware. */
  available: boolean;
  /** The user has actually enrolled a face or fingerprint. */
  enrolled: boolean;
  /** "Face ID", "Touch ID", "Fingerprint" — whatever this device offers. */
  label: string;
}

export async function lockCapability(): Promise<LockCapability> {
  try {
    const [available, enrolled, types] = await Promise.all([
      LocalAuthentication.hasHardwareAsync(),
      LocalAuthentication.isEnrolledAsync(),
      LocalAuthentication.supportedAuthenticationTypesAsync(),
    ]);

    const label = types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)
      ? 'Face ID'
      : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
        ? 'Fingerprint'
        : 'Device passcode';

    return { available, enrolled, label };
  } catch {
    return { available: false, enrolled: false, label: 'Device passcode' };
  }
}

/**
 * Asks for the user's face, finger or passcode.
 *
 * `disableDeviceFallback` is deliberately false: someone whose fingerprint
 * fails to read should be able to fall back to their passcode rather than be
 * locked out of their own log.
 *
 * Returns *why* it failed, not just that it did. The difference between "you
 * cancelled" and "this phone no longer has a passcode" is the difference
 * between a prompt worth retrying and one that can never succeed — and
 * getting that wrong shuts someone out of their own data for good.
 */
export async function authenticate(reason = 'Unlock your weight log'): Promise<AuthOutcome> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return classifyAuthResult(result);
  } catch {
    // A throwing prompt is not evidence the enrolment is gone, so this stays
    // retryable — `lockCapability` is what settles that question.
    return 'retry';
  }
}
