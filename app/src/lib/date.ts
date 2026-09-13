import { DateKey } from '../data/types';

export const DAY_MS = 86400000;

/** Local-day key. Never use toISOString() here — that shifts across the UTC boundary. */
export function toKey(d: Date): DateKey {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromKey(key: DateKey): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(): DateKey {
  return toKey(new Date());
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
