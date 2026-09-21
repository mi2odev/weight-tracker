/**
 * A migration rewrites the user's data in place, so these tests pin down when
 * the replaced bytes are kept, how many survive, and — the one that matters
 * most — that pruning can never reach a key that is not a snapshot.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isDowngrade,
  isPremigrationKey,
  KEEP_SNAPSHOTS,
  premigrationKey,
  PREMIGRATION_PREFIX,
  shouldSnapshot,
  snapshotsToPrune,
  snapshotTimestamp,
} from './snapshots';
import { CURRENT_SCHEMA_VERSION } from '../data/types';

describe('snapshot keys', () => {
  it('carries the version it came from and when it was taken', () => {
    const key = premigrationKey(1, 1_700_000_000_000);
    assert.equal(key, `${PREMIGRATION_PREFIX}1.1700000000000`);
    assert.equal(snapshotTimestamp(key), 1_700_000_000_000);
    assert.equal(isPremigrationKey(key), true);
  });

  it('accepts a Date as readily as a number', () => {
    const at = new Date('2026-09-21T10:00:00Z');
    assert.equal(snapshotTimestamp(premigrationKey(2, at)), at.getTime());
  });

  it('does not claim the app data key or a corrupt rescue', () => {
    assert.equal(isPremigrationKey('wt.data.v1'), false);
    assert.equal(isPremigrationKey('wt.data.corrupt.1700000000000'), false);
    assert.equal(snapshotTimestamp('wt.data.v1'), null);
  });
});

describe('pruning', () => {
  const keys = [
    premigrationKey(1, 1000),
    premigrationKey(1, 3000),
    premigrationKey(2, 2000),
    premigrationKey(2, 4000),
  ];

  it('keeps the two newest and prunes the rest', () => {
    const pruned = snapshotsToPrune(keys);
    assert.equal(KEEP_SNAPSHOTS, 2);
    assert.deepEqual(pruned.sort(), [premigrationKey(1, 1000), premigrationKey(2, 2000)].sort());
  });

  it('never returns a key that is not a snapshot', () => {
    const pruned = snapshotsToPrune([
      'wt.data.v1',
      'wt.data.corrupt.9999',
      'wt.crash.last',
      ...keys,
    ]);

    assert.equal(pruned.includes('wt.data.v1'), false);
    assert.equal(pruned.includes('wt.data.corrupt.9999'), false);
    assert.equal(pruned.includes('wt.crash.last'), false);
    assert.equal(pruned.length, 2);
  });

  it('prunes nothing when there is nothing spare', () => {
    assert.deepEqual(snapshotsToPrune([keys[0]]), []);
    assert.deepEqual(snapshotsToPrune([]), []);
  });

  it('prunes a malformed key before a readable one', () => {
    const malformed = `${PREMIGRATION_PREFIX}1.not-a-number`;
    const pruned = snapshotsToPrune([malformed, premigrationKey(1, 5000), premigrationKey(1, 6000)]);
    assert.deepEqual(pruned, [malformed]);
  });
});

describe('when to snapshot', () => {
  it('keeps a copy whenever the payload was rewritten', () => {
    assert.equal(shouldSnapshot({ fromVersion: 1, changed: true, notes: [] }), true);
    assert.equal(shouldSnapshot({ fromVersion: 2, changed: false, notes: ['dropped a row'] }), true);
  });

  it('keeps nothing when the payload was already current and clean', () => {
    assert.equal(shouldSnapshot({ fromVersion: CURRENT_SCHEMA_VERSION, changed: false, notes: [] }), false);
  });
});

describe('downgrades', () => {
  it('spots data written by a newer build', () => {
    assert.equal(isDowngrade(CURRENT_SCHEMA_VERSION + 1), true);
    assert.equal(isDowngrade(CURRENT_SCHEMA_VERSION), false);
    assert.equal(isDowngrade(1), false);
    assert.equal(isDowngrade(0), false, 'an absent version is old, not new');
  });
});
