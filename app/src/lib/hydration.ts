/**
 * Deciding what a storage read meant.
 *
 * The distinction this file exists to protect: **a read that throws is not an
 * empty log.** Treating the two the same is how a transient storage failure
 * turns into a wiped account — the app starts on defaults, the debounced write
 * fires, and the user's real data is gone. Only a read that *succeeded* and
 * returned nothing is a genuine first run.
 *
 * So a failure is retried a couple of times, and if it still fails the caller
 * is told `unreadable` and must not persist anything.
 *
 * No native imports: the reader is injected, so the whole policy is tested on
 * Node against fakes.
 */

/** How many times to ask storage before giving up. */
export const MAX_READ_ATTEMPTS = 3;

/**
 * Waits between attempts. Short, because the user is looking at a blank screen
 * — long enough for a device that is busy mounting storage, not long enough to
 * feel like a hang.
 */
export const READ_RETRY_DELAYS_MS = [120, 360];

/** The wait before attempt `n + 1`, or null when there should not be one. */
export function retryDelayMs(attempt: number, maxAttempts = MAX_READ_ATTEMPTS): number | null {
  if (attempt < 1 || attempt >= maxAttempts) return null;
  return READ_RETRY_DELAYS_MS[attempt - 1] ?? READ_RETRY_DELAYS_MS[READ_RETRY_DELAYS_MS.length - 1];
}

export type HydrationResult =
  /** Storage answered, and had nothing. This — and only this — is a first run. */
  | { status: 'first-run'; attempts: number }
  /** Storage answered with a payload. It still has to survive parsing. */
  | { status: 'loaded'; raw: string; attempts: number }
  /** Storage never answered. The caller must not write, or it overwrites. */
  | { status: 'unreadable'; attempts: number; error: unknown };

export interface ReadOptions {
  read: () => Promise<string | null>;
  /** Injected so tests do not actually wait. */
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads the stored payload, retrying a throwing read before giving up.
 *
 * A `null` return ends it immediately: storage answered, so retrying would
 * only delay a first run that is working exactly as it should.
 */
export async function readStoredPayload({
  read,
  sleep = realSleep,
  maxAttempts = MAX_READ_ATTEMPTS,
}: ReadOptions): Promise<HydrationResult> {
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const raw = await read();
      return raw == null
        ? { status: 'first-run', attempts: attempt }
        : { status: 'loaded', raw, attempts: attempt };
    } catch (error) {
      lastError = error;
      const delay = retryDelayMs(attempt, maxAttempts);
      if (delay == null) break;
      await sleep(delay);
    }
  }

  return { status: 'unreadable', attempts: maxAttempts, error: lastError };
}

/**
 * Whether it is safe to write to storage.
 *
 * Persisting is gated on this rather than on "did hydration finish", because
 * hydration finishing unsuccessfully is precisely the case that must not write.
 */
export function mayPersist(result: HydrationResult | null): boolean {
  return result != null && result.status !== 'unreadable';
}
