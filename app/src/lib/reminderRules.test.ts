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
import { minutesLabel, plannedReminders, shiftMinutes, waterCheckTimes, waterDueBy } from './reminderRules';

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

describe('water reminders', () => {
  const todays = (d: AppData) => plannedReminders(d, MIDNIGHT).filter((r) => r.id.startsWith(`water-${TODAY}`));

  it('repeat every 2 hours from 09:00 to 21:00 by default', () => {
    const d = only(data(), 'water');
    assert.deepEqual(todays(d).map((r) => minuteOfDayAt(r.date) / 60), [9, 11, 13, 15, 17, 19, 21]);
  });

  it('follow the interval and window the user picks — every hour, 08:00 to 12:00', () => {
    const d = only(data(), 'water');
    Object.assign(d.notifications, { waterEveryMinutes: 60, waterStartMinutes: 8 * 60, waterEndMinutes: 12 * 60 });
    assert.deepEqual(todays(d).map((r) => minuteOfDayAt(r.date) / 60), [8, 9, 10, 11, 12]);
  });

  it('stop for the day once the target is reached', () => {
    const d = only(data({}, [{ logDate: TODAY, waterL: 3 }]), 'water');
    assert.equal(todays(d).length, 0);
    assert.ok(plannedReminders(d, MIDNIGHT).some((r) => r.id.startsWith(`water-${addDays(TODAY, 1)}`)), 'tomorrow still on');
  });

  it('can skip the times the day is already on pace', () => {
    // 1.5 L of 3 L: on pace until the halfway point of 09:00–21:00 (15:00).
    const d = only(data({}, [{ logDate: TODAY, waterL: 1.5 }]), 'water');
    d.notifications.waterOnlyBehind = true;
    assert.deepEqual(todays(d).map((r) => minuteOfDayAt(r.date) / 60), [17, 19, 21]);
  });

  it('stay inside the phone\'s limit on pending notifications', () => {
    const d = only(data(), 'water');
    d.notifications.waterEveryMinutes = 30;
    const water = plannedReminders(d, MIDNIGHT).filter((r) => r.id.startsWith('water-'));
    assert.ok(water.length <= 40, `${water.length} scheduled`);
  });

  it('say how much is in so far, in the user\'s units', () => {
    const base = data({}, [{ logDate: TODAY, waterL: 1 }]);
    const d = only({ ...base, profile: { ...base.profile, units: 'imperial' } }, 'water');
    assert.match(todays(d)[0].body, /fl oz/);
    assert.match(todays(d)[0].body, /so far/);
  });

  it('stay quiet when switched off', () => {
    const d = data();
    d.notifications.water = false;
    assert.ok(plannedReminders(d, MIDNIGHT).every((r) => !r.id.startsWith('water-')));
  });

  it('pace the target in a straight line across the window', () => {
    const n = data().notifications;
    assert.equal(waterCheckTimes(n).length, 7);
    assert.equal(waterDueBy(n, 3, 15 * 60), 1.5);
    assert.equal(waterDueBy(n, 3, 7 * 60), 0);
    assert.equal(waterDueBy(n, 3, 23 * 60), 3);
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
