/**
 * The bug these tests exist to prevent: a storage read that *throws* being
 * treated as an empty log, so the app starts on defaults and the next
 * debounced write erases everything the user had.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mayPersist, MAX_READ_ATTEMPTS, readStoredPayload, retryDelayMs } from './hydration';

const noSleep = async () => {};

describe('reading the stored payload', () => {
  it('returns the payload on a clean read, without retrying', async () => {
    let calls = 0;
    const result = await readStoredPayload({
      read: async () => {
        calls++;
        return '{"schemaVersion":2}';
      },
      sleep: noSleep,
    });

    assert.equal(result.status, 'loaded');
    assert.equal(result.status === 'loaded' && result.raw, '{"schemaVersion":2}');
    assert.equal(calls, 1);
  });

  it('treats a successful empty read as a first run and stops there', async () => {
    let calls = 0;
    const result = await readStoredPayload({
      read: async () => {
        calls++;
        return null;
      },
      sleep: noSleep,
    });

    assert.equal(result.status, 'first-run');
    assert.equal(calls, 1, 'nothing to retry — storage answered');
  });

  it('retries a throwing read and uses the payload when one finally arrives', async () => {
    let calls = 0;
    const waits: number[] = [];
    const result = await readStoredPayload({
      read: async () => {
        calls++;
        if (calls < 3) throw new Error('storage busy');
        return 'recovered';
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
    });

    assert.equal(result.status, 'loaded');
    assert.equal(result.status === 'loaded' && result.raw, 'recovered');
    assert.equal(calls, 3);
    assert.deepEqual(waits, [120, 360]);
  });

  it('never calls a persistent failure a first run', async () => {
    let calls = 0;
    const result = await readStoredPayload({
      read: async () => {
        calls++;
        throw new Error('storage unavailable');
      },
      sleep: noSleep,
    });

    assert.equal(result.status, 'unreadable');
    assert.notEqual(result.status, 'first-run');
    assert.equal(calls, MAX_READ_ATTEMPTS);
    assert.equal(result.status === 'unreadable' && (result.error as Error).message, 'storage unavailable');
  });

  it('waits once between two attempts and not after the last one', async () => {
    const waits: number[] = [];
    await readStoredPayload({
      read: async () => {
        throw new Error('nope');
      },
      sleep: async (ms) => {
        waits.push(ms);
      },
      maxAttempts: 2,
    });

    assert.deepEqual(waits, [120]);
  });

  it('plans no wait after the final attempt', () => {
    assert.equal(retryDelayMs(1), 120);
    assert.equal(retryDelayMs(2), 360);
    assert.equal(retryDelayMs(3), null, 'the third attempt is the last one');
    assert.equal(retryDelayMs(0), null);
  });
});

describe('deciding whether to write', () => {
  it('refuses to write before hydration has produced a result', () => {
    assert.equal(mayPersist(null), false);
  });

  it('refuses to write when storage could not be read', () => {
    assert.equal(mayPersist({ status: 'unreadable', attempts: 3, error: new Error('x') }), false);
  });

  it('allows a write on a genuine first run and on a loaded payload', () => {
    assert.equal(mayPersist({ status: 'first-run', attempts: 1 }), true);
    assert.equal(mayPersist({ status: 'loaded', raw: '{}', attempts: 1 }), true);
  });
});
