/**
 * The bug these guard against: a field showing "1,250" at rest, read back as
 * 1 — a 1,250 kcal meal logged as one calorie, silently.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isPartialNumber, parseDecimalInput } from './numberInput';

describe('reading a number out of a field', () => {
  it('reads a plain number', () => {
    assert.equal(parseDecimalInput('650'), 650);
    assert.equal(parseDecimalInput('2.5'), 2.5);
    assert.equal(parseDecimalInput('0'), 0);
  });

  it('strips a grouped thousands separator instead of stopping at it', () => {
    assert.equal(parseDecimalInput('1,250'), 1250);
    assert.equal(parseDecimalInput('1,250,000'), 1250000);
    assert.equal(parseDecimalInput('12,500'), 12500);
  });

  it('still reads a lone comma as a decimal point', () => {
    // "2,5" cannot be grouping — nobody groups a single digit.
    assert.equal(parseDecimalInput('2,5'), 2.5);
    assert.equal(parseDecimalInput('0,75'), 0.75);
  });

  it('takes the last separator as the decimal point when both appear', () => {
    assert.equal(parseDecimalInput('1,250.5'), 1250.5);
    assert.equal(parseDecimalInput('1.250,5'), 1250.5);
  });

  it('ignores spaces, including the narrow no-break kind some locales group with', () => {
    assert.equal(parseDecimalInput('1 250'), 1250);
    assert.equal(parseDecimalInput('1 250'), 1250);
    assert.equal(parseDecimalInput('  42  '), 42);
  });

  it('answers null for an empty field and for nonsense alike', () => {
    assert.equal(parseDecimalInput(''), null);
    assert.equal(parseDecimalInput('   '), null);
    assert.equal(parseDecimalInput('abc'), null);
    assert.equal(parseDecimalInput('.'), null);
  });

  it('reads a negative number', () => {
    assert.equal(parseDecimalInput('-3.5'), -3.5);
  });
});

describe('text that is still being typed', () => {
  it('accepts the middle of a decimal, which is the whole point', () => {
    // A field that rejects "2." can never accept "2.5".
    assert.equal(isPartialNumber('2.'), true);
    assert.equal(isPartialNumber('2,'), true);
    assert.equal(isPartialNumber('.'), true);
    assert.equal(isPartialNumber(''), true);
  });

  it('accepts complete numbers too', () => {
    assert.equal(isPartialNumber('2.5'), true);
    assert.equal(isPartialNumber('650'), true);
  });

  it('rejects text that is going nowhere', () => {
    assert.equal(isPartialNumber('2.5.5'), false);
    assert.equal(isPartialNumber('abc'), false);
    assert.equal(isPartialNumber('2a'), false);
  });
});
