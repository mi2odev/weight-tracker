/**
 * The inbox is derived, so the tests pin two things: it says the right thing
 * at the right hour, and its ids stay stable so something already read does
 * not come back unread.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyData } from '../data/seed';
import { AppData, WeighIn } from '../data/types';
import { addDays, instantAt } from './date';
import { inboxItems, inboxWhen, unreadCount } from './inbox';

const DAY = '2026-09-23';
const measured = (logDate: string) => ({
  id: 'm',
  logDate,
  waistCm: 100,
  chestCm: 100,
  armsCm: 35,
  thighsCm: 60,
  neckCm: 40,
});

/** An instant at an Algerian wall-clock time. */
const at = (hour: number, minute = 0, date = DAY) => instantAt(date, hour * 60 + minute);

function data(entries: WeighIn[] = [], patch: Partial<AppData> = {}): AppData {
  const base = emptyData();
  return {
    ...base,
    onboarded: true,
    profile: { ...base.profile, startDate: addDays(DAY, -3), startWeightKg: 100, goalWeightKg: 80 },
    // Measured recently, so the measurement nudge stays out of unrelated tests.
    measurements: [measured(addDays(DAY, -1))],
    entries,
    ...patch,
  };
}

const kinds = (d: AppData, now: Date) => inboxItems(d, now).map((i) => i.kind);

describe('the weigh-in nudge', () => {
  it('is not there before the morning reminder time', () => {
    assert.ok(!kinds(data(), at(6, 59)).includes('weigh'));
  });

  it('appears after it, and goes once the weight is in', () => {
    assert.ok(kinds(data(), at(7)).includes('weigh'));
    assert.ok(!kinds(data([{ logDate: DAY, weightKg: 99 }]), at(9)).includes('weigh'));
  });

  it('follows a moved reminder time', () => {
    const d = data();
    d.notifications.morningMinutes = 10 * 60;
    assert.ok(!kinds(d, at(9)).includes('weigh'));
  });

  it('stays quiet when its switch is off', () => {
    const d = data();
    d.notifications.morningWeighIn = false;
    assert.ok(!kinds(d, at(12)).includes('weigh'));
  });
});

describe('water', () => {
  it('shows only the latest reminder time that has passed', () => {
    const water = inboxItems(data(), at(16)).filter((i) => i.kind === 'water');
    assert.equal(water.length, 1);
    assert.equal(water[0].id, `water-${DAY}-900`, '15:00, the last 2-hourly time before 16:00');
  });

  it('follows an hourly interval', () => {
    const d = data();
    d.notifications.waterEveryMinutes = 60;
    assert.equal(inboxItems(d, at(16, 5)).find((i) => i.kind === 'water')?.id, `water-${DAY}-960`);
  });

  it('is gone once the day\'s target is reached', () => {
    assert.ok(!kinds(data([{ logDate: DAY, waterL: 3 }]), at(16)).includes('water'));
  });

  it('is not there before the window opens', () => {
    assert.ok(!kinds(data(), at(8, 59)).includes('water'));
  });
});

describe('the evening check-in', () => {
  it('appears after the evening time with under 3 habits', () => {
    assert.ok(kinds(data(), at(21)).includes('evening'));
    assert.ok(!kinds(data(), at(20, 59)).includes('evening'));
  });
});

describe('milestones', () => {
  it('shows one reached in the last two weeks, with the reward', () => {
    const d = data([], { achieved: { '95': addDays(DAY, -2) }, rewards: { '95': 'New shoes' } });
    const item = inboxItems(d, at(12)).find((i) => i.kind === 'milestone');
    assert.equal(item?.title, '5.0 kg down');
    assert.match(item!.body, /New shoes/);
    assert.equal(item?.target, 'milestones');
  });

  it('lets an old one drop off', () => {
    const d = data([], { achieved: { '95': addDays(DAY, -30) } });
    assert.ok(!kinds(d, at(12)).includes('milestone'));
  });
});

describe('the weekly summary', () => {
  it('reports the week just finished, plainly when weight went up', () => {
    const start = addDays(DAY, -8);
    const entries: WeighIn[] = Array.from({ length: 7 }, (_, i) => ({
      logDate: addDays(start, i),
      weightKg: 101,
    }));
    const d = data(entries, {
      profile: { ...emptyData().profile, startDate: start, startWeightKg: 100, goalWeightKg: 80 },
    });
    const week = inboxItems(d, at(12)).find((i) => i.kind === 'week');
    assert.equal(week?.id, 'week-1');
    assert.match(week!.body, /^Up 1\.0 kg/);
    assert.match(week!.body, /Logged 7 of 7/);
  });
});

describe('measurements', () => {
  it('asks for a re-measure after two weeks', () => {
    const d = data([], { measurements: [measured(addDays(DAY, -15))] });
    const item = inboxItems(d, at(12)).find((i) => i.kind === 'measure');
    assert.equal(item?.title, 'Time to re-measure');
    assert.equal(item?.target, 'body');
  });
});

describe('ids and ordering', () => {
  it('gives the same id for the same situation, so read stays read', () => {
    const a = inboxItems(data(), at(8)).map((i) => i.id);
    const b = inboxItems(data(), at(8, 30)).map((i) => i.id);
    assert.deepEqual(a, b);
  });

  it('counts only what has not been opened', () => {
    const items = inboxItems(data(), at(21));
    assert.equal(unreadCount(items, [items[0].id]), items.length - 1);
  });

  it('puts the newest first', () => {
    const d = data([], { achieved: { '95': addDays(DAY, -3) } });
    const items = inboxItems(d, at(21));
    assert.equal(items[items.length - 1].kind, 'milestone');
  });

  it('says when, in words', () => {
    assert.equal(inboxWhen(DAY, DAY), 'Today');
    assert.equal(inboxWhen(addDays(DAY, -1), DAY), 'Yesterday');
    assert.equal(inboxWhen(addDays(DAY, -4), DAY), '4 days ago');
  });
});
