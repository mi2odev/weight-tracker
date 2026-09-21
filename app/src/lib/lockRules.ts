/**
 * App-lock rules, with no native imports so they can be tested on Node.
 * The calls into the biometric hardware live in `lock.ts`.
 */

export interface LockSettings {
  enabled: boolean;
  /**
   * How long the app may sit in the background before it locks again.
   * Zero means immediately.
   */
  graceSeconds: number;
}

/**
 * Off by default: a tracker that demands a fingerprint before you can write
 * down a number is a tracker people stop using.
 */
export const DEFAULT_LOCK: LockSettings = { enabled: false, graceSeconds: 60 };

export const GRACE_OPTIONS = [
  { label: 'Immediately', seconds: 0 },
  { label: 'After 1 min', seconds: 60 },
  { label: 'After 5 min', seconds: 300 },
] as const;

/** True when the app has been away long enough to need unlocking again. */
export function shouldRelock(
  settings: LockSettings,
  backgroundedAt: number | null,
  now = Date.now(),
): boolean {
  if (!settings.enabled) return false;
  if (backgroundedAt == null) return true; // cold start
  return now - backgroundedAt >= settings.graceSeconds * 1000;
}
