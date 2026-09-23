import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { WeighIn } from '../data/types';
import { unusualWeighIn } from './weighInCheck';

const log: WeighIn[] = [
  { logDate: '2026-09-20', weightKg: 152.8 },
  { logDate: '2026-09-22', weightKg: 152.5 },
];

describe('spotting a likely typo', () => {
  it('lets a normal day through', () => {
    assert.equal(unusualWeighIn(log, '2026-09-23', 151.4), null);
    assert.equal(unusualWeighIn(log, '2026-09-23', 154.5), null, 'a salty dinner is not a typo');
  });

  it('flags a swapped digit', () => {
    const hit = unusualWeighIn(log, '2026-09-23', 125.2);
    assert.ok(hit);
    assert.equal(hit.previousDate, '2026-09-22');
    assert.equal(hit.deltaKg.toFixed(1), '-27.3');
  });

  it('allows more room after a gap', () => {
    // 10 days after the last reading, 5 kg down is plausible.
    assert.equal(unusualWeighIn(log, '2026-10-02', 147.5), null);
    assert.ok(unusualWeighIn(log, '2026-09-23', 147.5), 'but not overnight');
  });

  it('still flags a huge change however long the gap', () => {
    assert.ok(unusualWeighIn(log, '2027-09-23', 130));
  });

  it('compares with the reading before the day, not the day itself', () => {
    const withToday = [...log, { logDate: '2026-09-23', weightKg: 125 }];
    assert.equal(unusualWeighIn(withToday, '2026-09-23', 152.4), null, 'correcting the typo is fine');
  });

  it('has nothing to say on the first weigh-in', () => {
    assert.equal(unusualWeighIn([], '2026-09-23', 90), null);
  });
});
