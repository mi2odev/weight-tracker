/**
 * Crash reports, built so they cannot carry health data.
 *
 * The rule is structural rather than a promise: a report is assembled from a
 * fixed set of fields, and the error *message* is not one of them. A message
 * is the one place a user's own numbers routinely end up — "Invalid weight
 * 152.2", "no measurement for 2026-09-13" — so only the error's class name and
 * its stack frames travel. Frames are reduced to file, function and line,
 * which is what makes a crash findable and nothing more.
 *
 * Pure: no native imports, so the scrubbing is tested on Node.
 */

export interface CrashReport {
  /** ISO timestamp, to the second. */
  at: string;
  appVersion: string;
  platform: string;
  osVersion: string;
  /** `TypeError`, `RangeError` — the class, never the message. */
  errorName: string;
  frames: string[];
  /** False for an error a screen recovered from, true for one that broke the app. */
  fatal: boolean;
}

export interface CrashContext {
  appVersion: string;
  platform: string;
  osVersion: string;
  fatal?: boolean;
  now?: Date;
}

const MAX_FRAMES = 12;

/**
 * A stack reduced to frames.
 *
 * The first line of a JS stack is `Name: message`, so it is dropped outright.
 * Paths are cut back to a basename: an absolute path leaks the device's user
 * name on some platforms, and a photo URI leaks a log date.
 */
export function crashFrames(stack: string | undefined | null, limit = MAX_FRAMES): string[] {
  if (!stack) return [];

  return stack
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '))
    .map(shortenFrame)
    .filter((line) => line.length > 0)
    .slice(0, limit);
}

/** `at save (/Users/someone/app/src/data/store.tsx:210:9)` → `at save (store.tsx:210)`. */
function shortenFrame(frame: string): string {
  return frame.replace(/\(?((?:[A-Za-z]+:\/\/)?[^\s()]*[/\\])?([^\s()/\\]+):(\d+):(\d+)\)?$/, (
    _match,
    _dir,
    file: string,
    line: string,
  ) => `(${file}:${line})`);
}

export function buildCrashReport(error: unknown, context: CrashContext): CrashReport {
  const err = error instanceof Error ? error : null;

  return {
    at: (context.now ?? new Date()).toISOString().slice(0, 19) + 'Z',
    appVersion: context.appVersion,
    platform: context.platform,
    osVersion: context.osVersion,
    errorName: err?.name || 'Error',
    frames: crashFrames(err?.stack),
    fatal: context.fatal ?? true,
  };
}

/**
 * The report as the text a user would see before it goes anywhere.
 *
 * Shown rather than summarised: a privacy promise the user cannot inspect is
 * a promise they have to take on faith.
 */
export function formatCrashReport(report: CrashReport): string {
  return [
    `${report.errorName} · ${report.fatal ? 'fatal' : 'recovered'}`,
    `${report.at} · v${report.appVersion} · ${report.platform} ${report.osVersion}`,
    '',
    ...(report.frames.length ? report.frames : ['(no stack)']),
  ].join('\n');
}
