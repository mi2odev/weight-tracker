/**
 * The day turns over at midnight in Algeria (UTC+1, no daylight saving),
 * whatever the phone's own zone is. These run under several TZ settings in
 * `npm test`'s environment and must pass under all of them.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addDays, dayKeyAt, daysBetween, instantAt, minuteOfDayAt, msUntilNextDay, todayKey } from './date';

const utc = (iso: string) => new Date(`${iso}Z`).getTime();

describe('the app day follows Algerian midnight', () => {
  it('is already tomorrow at 23:00 UTC, which is 00:00 in Algiers', () => {
    assert.equal(dayKeyAt(utc('2026-09-23T22:59:59')), '2026-09-23');
    assert.equal(dayKeyAt(utc('2026-09-23T23:00:00')), '2026-09-24');
  });

  it('rolls over the year the same way', () => {
    assert.equal(dayKeyAt(utc('2026-12-31T23:30:00')), '2027-01-01');
  });

  it('has no daylight-saving jump in summer or winter', () => {
    assert.equal(minuteOfDayAt(utc('2026-07-01T06:00:00')), 7 * 60);
    assert.equal(minuteOfDayAt(utc('2026-01-15T06:00:00')), 7 * 60);
  });

  it('todayKey reads the same clock', () => {
    const t = utc('2026-09-23T23:15:00');
    assert.equal(todayKey(t), '2026-09-24');
  });
});

describe('Algerian wall-clock times as instants', () => {
  it('puts 00:00 in Algiers at 23:00 UTC the day before', () => {
    assert.equal(instantAt('2026-09-24', 0).toISOString(), '2026-09-23T23:00:00.000Z');
  });

  it('round-trips a reminder time', () => {
    const at = instantAt('2026-09-24', 7 * 60 + 30);
    assert.equal(dayKeyAt(at), '2026-09-24');
    assert.equal(minuteOfDayAt(at), 7 * 60 + 30);
  });

  it('counts down to the next Algerian midnight', () => {
    assert.equal(msUntilNextDay(utc('2026-09-23T22:00:00')), 60 * 60 * 1000);
    assert.equal(msUntilNextDay(utc('2026-09-23T23:00:00')), 24 * 60 * 60 * 1000);
  });
});

describe('date arithmetic is unaffected', () => {
  it('adds and counts days across month ends', () => {
    assert.equal(addDays('2026-09-30', 1), '2026-10-01');
    assert.equal(daysBetween('2026-09-23', '2026-10-01'), 8);
  });
});
