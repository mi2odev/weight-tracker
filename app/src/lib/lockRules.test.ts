/**
 * The grace-period rule decides whether someone who glanced at a message and
 * came back has to authenticate again. Getting it wrong either nags
 * constantly or leaves the log open — both worth pinning down.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canEnableLock,
  classifyAuthResult,
  DEFAULT_LOCK,
  isLockedOut,
  SECURITY_REMOVED_ERRORS,
  shouldRelock,
} from './lockRules';

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

describe('lockout', () => {
  it('reads a successful attempt as unlocked', () => {
    assert.equal(classifyAuthResult({ success: true }), 'unlocked');
  });

  it('treats a cancel or a bad read as worth trying again', () => {
    assert.equal(classifyAuthResult({ success: false, error: 'user_cancel' }), 'retry');
    assert.equal(classifyAuthResult({ success: false, error: 'authentication_failed' }), 'retry');
    assert.equal(classifyAuthResult({ success: false, error: 'lockout' }), 'retry');
    assert.equal(classifyAuthResult({ success: false }), 'retry');
  });

  it('spots the errors that mean retrying can never work', () => {
    for (const error of SECURITY_REMOVED_ERRORS) {
      assert.equal(
        classifyAuthResult({ success: false, error }),
        'security-removed',
        `${error} should offer a way back in`,
      );
    }
  });

  it('will not enable a lock the device cannot open', () => {
    assert.equal(canEnableLock({ available: true, enrolled: true }), true);
    assert.equal(canEnableLock({ available: true, enrolled: false }), false, 'a reader with nothing enrolled is a door with no key');
    assert.equal(canEnableLock({ available: false, enrolled: false }), false);
    assert.equal(canEnableLock(null), false);
  });

  it('calls it a lockout when the enrolment is gone', () => {
    assert.equal(isLockedOut({ available: true, enrolled: false }, null), true);
    assert.equal(isLockedOut({ available: false, enrolled: false }, null), true);
  });

  it('calls it a lockout when an attempt said the security was removed', () => {
    assert.equal(isLockedOut({ available: true, enrolled: true }, 'security-removed'), true);
  });

  it('does not call a cancelled prompt a lockout', () => {
    assert.equal(isLockedOut({ available: true, enrolled: true }, 'retry'), false);
    assert.equal(isLockedOut({ available: true, enrolled: true }, null), false);
  });

  it('does not guess before the device has been checked', () => {
    assert.equal(isLockedOut(null, null), false, 'not knowing is not the same as locked out');
  });
});
