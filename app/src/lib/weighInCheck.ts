/**
 * A second look at a weigh-in that is probably a typo.
 *
 * Real day-to-day weight moves by a kilo or two — water, salt, a late meal —
 * not by ten. A reading far outside that is almost always a slipped digit
 * (125 for 152) and, left alone, it drags the 7-day average, the trend, the
 * projection and possibly a milestone with it. So the app asks once before
 * saving. It never refuses: the person on the scale knows best.
 *
 * Pure, so the thresholds are tested on Node.
 */

import { DateKey, WeighIn } from '../data/types';
import { daysBetween } from './date';
import { weighedEntries } from './calc';

/** Allowed swing for back-to-back days. */
const BASE_KG = 2.5;
/** Extra allowance per additional day between readings. */
const PER_DAY_KG = 0.5;
/** However long the gap, beyond this is worth a second look. */
const CAP_KG = 12;

export interface UnusualWeighIn {
  /** Signed kg against the comparison reading. Negative is a loss. */
  deltaKg: number;
  /** The reading it was compared with. */
  previousKg: number;
  previousDate: DateKey;
  daysApart: number;
}

/**
 * The nearest weigh-in *before* `date`, compared with `weightKg`. Null when
 * the change is within the plausible range for the gap, or there is nothing
 * to compare against.
 */
export function unusualWeighIn(
  entries: WeighIn[],
  date: DateKey,
  weightKg: number,
): UnusualWeighIn | null {
  const before = weighedEntries(entries).filter((e) => e.logDate < date);
  const prev = before[before.length - 1];
  if (!prev) return null;

  const daysApart = Math.max(1, daysBetween(prev.logDate, date));
  const allowed = Math.min(CAP_KG, BASE_KG + PER_DAY_KG * (daysApart - 1));
  const deltaKg = weightKg - prev.weightKg;
  if (Math.abs(deltaKg) <= allowed) return null;

  return { deltaKg, previousKg: prev.weightKg, previousDate: prev.logDate, daysApart };
}
