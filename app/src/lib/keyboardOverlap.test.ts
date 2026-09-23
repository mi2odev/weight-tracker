import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { keyboardOverlap } from './keyboardOverlap';

describe('making room for the keyboard', () => {
  it('adds nothing while the keyboard is down', () => {
    assert.equal(keyboardOverlap(0, 800, 800), 0);
  });

  it('adds the whole keyboard when the system made no room (iOS)', () => {
    assert.equal(keyboardOverlap(300, 800, 800), 300);
  });

  it('adds nothing when the system already shrank the window (Android resize)', () => {
    // The double lift that pushed the meal sheet off the top of the screen.
    assert.equal(keyboardOverlap(300, 800, 500), 0);
  });

  it('adds only the part the system left covered', () => {
    assert.equal(keyboardOverlap(300, 800, 700), 200);
  });

  it('never goes negative when the window shrank by more than the keys', () => {
    assert.equal(keyboardOverlap(300, 800, 450), 0);
  });

  it('assumes no room was made before the first layout', () => {
    assert.equal(keyboardOverlap(300, 0, 0), 300);
  });
});
