/**
 * The rules decide what reaches someone's lock screen, so the thing to get
 * right is restraint: no weigh-in nudge after the weight is in, no water nudge
 * once the pace is met, and the times the user chose rather than ours.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyData } from '../data/seed';
import { AppData, WeighIn } from '../data/types';
import { addDays, instantAt, minuteOfDayAt, todayKey } from './date';
import { minutesLabel, plannedReminders, shiftMinutes, WATER_CHECKS } from './reminderRules';

const TODAY = todayKey();
/** Algerian midnight today, so every reminder today is still ahead. */
const MIDNIGHT = instantAt(TODAY, 0);

function data(patch: Partial<AppData> = {}, entries: WeighIn[] = []): AppData {
  const base = emptyData();
  return {
    ...base,
    onboarded: true,
    profile: { ...base.profile, startDate: addDays(TODAY, -20) },
    entries,
    ...patch,
  };
}

const only = (d: AppData, flag: keyof AppData['notifications']) => ({
  ...d,
  notifications: {
    ...d.notifications,
    morningWeighIn: false,
    eveningLog: false,
    weeklySummary: false,
    water: false,
    [flag]: true,
  },
});

describe('reminder times', () => {
  it('reads minutes as a clock time', () => {
    assert.equal(minutesLabel(420), '07:00');
    assert.equal(minutesLabel(21 * 60 + 30), '21:30');
  });

  it('wraps round midnight when stepped', () => {
    assert.equal(shiftMinutes(23 * 60 + 45, 30), 15);
    assert.equal(shiftMinutes(10, -30), 23 * 60 + 40);
  });
});

describe('the morning weigh-in', () => {
  it('fires at the time the user chose', () => {
    const d = only(data(), 'morningWeighIn');
    d.notifications.morningMinutes = 6 * 60 + 30;
    const first = plannedReminders(d, MIDNIGHT)[0];
    assert.equal(minuteOfDayAt(first.date), 6 * 60 + 30);
  });

  it('is skipped on a day already weighed', () => {
    const d = only(data({}, [{ logDate: TODAY, weightKg: 90 }]), 'morningWeighIn');
    const ids = plannedReminders(d, MIDNIGHT).map((r) => r.id);
    assert.ok(!ids.includes(`weigh-${TODAY}`));
    assert.ok(ids.includes(`weigh-${addDays(TODAY, 1)}`), 'tomorrow is still on');
  });

  it('never schedules a time already past', () => {
    const d = only(data(), 'morningWeighIn');
    const late = instantAt(TODAY, 12 * 60);
    assert.ok(plannedReminders(d, late).every((r) => r.date > late));
  });
});

describe('water check-ins', () => {
  it('schedules every check-in on a day with no water', () => {
    const d = only(data(), 'water');
    const today = plannedReminders(d, MIDNIGHT).filter((r) => r.id.startsWith(`water-${TODAY}`));
    assert.equal(today.length, WATER_CHECKS.length);
  });

  it('drops the ones whose pace is already met', () => {
    // 2 L of a 3 L target: past the 30% and 60% marks, short of 80%.
    const d = only(data({}, [{ logDate: TODAY, waterL: 2 }]), 'water');
    const today = plannedReminders(d, MIDNIGHT).filter((r) => r.id.startsWith(`water-${TODAY}`));
    assert.deepEqual(today.map((r) => minuteOfDayAt(r.date)), [18 * 60]);
  });

  it('speaks the user\'s units', () => {
    const base = data();
    const d = only({ ...base, profile: { ...base.profile, units: 'imperial' } }, 'water');
    assert.match(plannedReminders(d, MIDNIGHT)[0].body, /fl oz/);
  });

  it('stays quiet when switched off', () => {
    const d = data();
    d.notifications.water = false;
    assert.ok(plannedReminders(d, MIDNIGHT).every((r) => !r.id.startsWith('water-')));
  });
});

describe('the evening nudge', () => {
  it('fires at the chosen time and is skipped once 3 habits are ticked', () => {
    const d = only(
      data({}, [{ logDate: TODAY, weightKg: 90, calories: 1800, sleepH: 8 }]),
      'eveningLog',
    );
    d.notifications.eveningMinutes = 20 * 60;
    const planned = plannedReminders(d, MIDNIGHT);
    assert.ok(!planned.some((r) => r.id === `evening-${TODAY}`));
    assert.equal(minuteOfDayAt(planned[0].date), 20 * 60);
  });
});
