/**
 * The grace-period rule decides whether someone who glanced at a message and
 * came back has to authenticate again. Getting it wrong either nags
 * constantly or leaves the log open — both worth pinning down.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DEFAULT_LOCK, shouldRelock } from './lockRules';

const enabled = { enabled: true, graceSeconds: 60 };

describe('relocking', () => {
  it('never locks while the feature is off', () => {
    assert.equal(shouldRelock(DEFAULT_LOCK, Date.now()), false);
    assert.equal(shouldRelock(DEFAULT_LOCK, null), false);
  });

  it('locks on a cold start, when there is no backgrounded time to compare', () => {
    assert.equal(shouldRelock(enabled, null), true);
  });

  it('stays unlocked inside the grace period', () => {
    const now = 1_000_000;
    assert.equal(shouldRelock(enabled, now - 30_000, now), false);
  });

  it('locks once the grace period has passed', () => {
    const now = 1_000_000;
    assert.equal(shouldRelock(enabled, now - 61_000, now), true);
  });

  it('locks exactly at the boundary rather than a moment after', () => {
    const now = 1_000_000;
    assert.equal(shouldRelock(enabled, now - 60_000, now), true);
  });

  it('locks immediately at a zero grace period', () => {
    const now = 1_000_000;
    assert.equal(shouldRelock({ enabled: true, graceSeconds: 0 }, now, now), true);
  });

  it('is off by default — a tracker that nags is a tracker people abandon', () => {
    assert.equal(DEFAULT_LOCK.enabled, false);
  });
});
