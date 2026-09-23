import { DateKey } from '../data/types';

const DAY_MS = 86400000;

/**
 * The app's clock is Algeria's, whatever the phone is set to.
 *
 * A day starts at 00:00 in Algiers and every "today", reminder time and
 * inbox nudge is read on that clock, so a phone set to another zone (or one
 * that travels) still rolls the day over at Algerian midnight. Algeria is on
 * UTC+1 all year — no daylight saving since 1981 — so a fixed offset is exact
 * and needs no time-zone database, which Hermes does not reliably ship.
 */
export const APP_UTC_OFFSET_MINUTES = 60;
const OFFSET_MS = APP_UTC_OFFSET_MINUTES * 60000;

/** Algerian wall-clock time, read through the UTC getters of the result. */
function wallClock(at: number | Date): Date {
  return new Date((typeof at === 'number' ? at : at.getTime()) + OFFSET_MS);
}

/**
 * Key for a calendar Date (local fields). Never use toISOString() here — that
 * shifts across the UTC boundary. For "what day is it now", use `dayKeyAt`.
 */
export function toKey(d: Date): DateKey {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** The Algerian date at an instant. */
export function dayKeyAt(at: number | Date): DateKey {
  const w = wallClock(at);
  const m = String(w.getUTCMonth() + 1).padStart(2, '0');
  const day = String(w.getUTCDate()).padStart(2, '0');
  return `${w.getUTCFullYear()}-${m}-${day}`;
}

export function todayKey(now: number | Date = Date.now()): DateKey {
  return dayKeyAt(now);
}

/** Minutes since Algerian midnight at an instant, 0 – 1439. */
export function minuteOfDayAt(at: number | Date): number {
  const w = wallClock(at);
  return w.getUTCHours() * 60 + w.getUTCMinutes();
}

/** The instant a given Algerian date and minute of the day falls on. */
export function instantAt(date: DateKey, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes) - OFFSET_MS);
}

/** Milliseconds until the next Algerian midnight. */
export function msUntilNextDay(now: number = Date.now()): number {
  return instantAt(addDays(dayKeyAt(now), 1), 0).getTime() - now;
}

export function addDays(key: DateKey, n: number): DateKey {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from `a` to `b`. Uses noon to sidestep DST transitions. */
export function daysBetween(a: DateKey, b: DateKey): number {
  const da = fromKey(a);
  const db = fromKey(b);
  da.setHours(12, 0, 0, 0);
  db.setHours(12, 0, 0, 0);
  return Math.round((db.getTime() - da.getTime()) / DAY_MS);
}

/** "8 Nov" */
export function formatShort(key: DateKey): string {
  return fromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "Sunday 8 November" */
export function formatLong(key: DateKey): string {
  return fromKey(key).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

/** "8 Nov 2026" */
export function formatMedium(key: DateKey): string {
  return fromKey(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "July 2028" — the granularity every projection is shown at. */
export function formatMonthYear(d: Date): string {
  return d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** Monday-first weekday index, 0–6. */
export function weekdayIndex(key: DateKey): number {
  return (fromKey(key).getDay() + 6) % 7;
}

export const WEEKDAY_INITIALS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
