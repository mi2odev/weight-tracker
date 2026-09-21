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

export * from './lockRules';

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
 */
export async function authenticate(reason = 'Unlock your weight log'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: reason,
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
