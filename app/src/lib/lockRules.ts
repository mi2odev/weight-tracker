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

// ── lockout ──────────────────────────────────────────────────────────────────

/**
 * What the device can currently offer. Mirrors `lock.ts`'s `LockCapability`,
 * declared here so the rules can be reasoned about without the native module.
 */
export interface LockReadiness {
  available: boolean;
  enrolled: boolean;
}

/**
 * Errors that mean the device can no longer satisfy the lock *at all* —
 * as opposed to one failed attempt.
 *
 * Someone who removes their passcode while the app is locked would otherwise
 * be shut out of their own log permanently, with a prompt that can never
 * succeed. These are the results that must offer a way back in.
 */
export const SECURITY_REMOVED_ERRORS = ['passcode_not_set', 'not_enrolled', 'not_available'];

export type AuthOutcome =
  /** They proved who they are. */
  | 'unlocked'
  /** Cancelled, mis-read, temporarily locked out — trying again can work. */
  | 'retry'
  /** The device has no passcode or biometric any more. Trying again cannot work. */
  | 'security-removed';

export function classifyAuthResult(result: { success: boolean; error?: string }): AuthOutcome {
  if (result.success) return 'unlocked';
  return result.error && SECURITY_REMOVED_ERRORS.includes(result.error)
    ? 'security-removed'
    : 'retry';
}

/**
 * Whether the lock may be switched on.
 *
 * Hardware alone is not enough: a phone with a fingerprint reader and nothing
 * enrolled cannot authenticate anyone, so enabling the lock there would build
 * a door with no key.
 */
export function canEnableLock(readiness: LockReadiness | null): boolean {
  return !!readiness && readiness.available && readiness.enrolled;
}

/**
 * True when the gate is up and the device cannot open it.
 *
 * Either signal is enough: the capability check says the enrolment is gone,
 * or an attempt came back with an error that says the same thing.
 */
export function isLockedOut(
  readiness: LockReadiness | null,
  lastOutcome: AuthOutcome | null,
): boolean {
  if (lastOutcome === 'security-removed') return true;
  // Null means "not checked yet" — not knowing is not the same as locked out.
  return readiness != null && !canEnableLock(readiness);
}
