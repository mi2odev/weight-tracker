/**
 * The promise these tests defend is the one on the Privacy screen: a crash
 * report carries no health data. Every case here feeds a stack that is full
 * of the user's own numbers and checks that none of them survive.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCrashReport, crashFrames, formatCrashReport } from './diagnostics';

const context = { appVersion: '1.0.0', platform: 'ios', osVersion: '18.2' };

describe('crash reports', () => {
  it('drops the error message, which is where user values end up', () => {
    const error = new RangeError('Weight 152.4 kg is out of range for 2026-09-13');
    const report = buildCrashReport(error, context);

    assert.equal(report.errorName, 'RangeError');
    const text = formatCrashReport(report);
    assert.equal(text.includes('152.4'), false);
    assert.equal(text.includes('2026-09-13'), false);
  });

  it('keeps the frames that make a crash findable', () => {
    const frames = crashFrames(
      [
        'RangeError: Weight 152.4 kg is out of range',
        '    at saveWeighIn (/home/someone/weight-tracker/src/data/store.tsx:210:9)',
        '    at onPress (/home/someone/weight-tracker/src/screens/TodayScreen.tsx:88:5)',
      ].join('\n'),
    );

    assert.deepEqual(frames, ['at saveWeighIn (store.tsx:210)', 'at onPress (TodayScreen.tsx:88)']);
  });

  it('cuts absolute paths back to a basename, so no device path travels', () => {
    const frames = crashFrames(
      'Error: x\n    at read (file:///var/mobile/Containers/Data/Application/ABC/Documents/progress-photos/2026-09-13.jpg:1:1)',
    );

    assert.equal(frames.length, 1);
    assert.equal(frames[0].includes('/var/mobile'), false);
    assert.equal(frames[0].includes('Containers'), false);
    assert.equal(frames[0], 'at read (2026-09-13.jpg:1)');
  });

  it('caps how much stack travels', () => {
    const stack = ['Error: x', ...Array.from({ length: 40 }, (_, i) => `    at f${i} (a.ts:${i}:1)`)].join('\n');
    assert.equal(crashFrames(stack).length, 12);
    assert.equal(crashFrames(stack, 3).length, 3);
  });

  it('survives a thrown non-error and a missing stack', () => {
    const report = buildCrashReport('just a string', context);
    assert.equal(report.errorName, 'Error');
    assert.deepEqual(report.frames, []);
    assert.equal(formatCrashReport(report).includes('(no stack)'), true);
    assert.equal(crashFrames(undefined).length, 0);
  });

  it('stamps only the fixed set of fields', () => {
    const report = buildCrashReport(new Error('boom'), {
      ...context,
      now: new Date('2026-09-21T10:30:15.500Z'),
    });

    assert.deepEqual(Object.keys(report).sort(), [
      'appVersion',
      'at',
      'errorName',
      'fatal',
      'frames',
      'osVersion',
      'platform',
    ]);
    assert.equal(report.at, '2026-09-21T10:30:15Z');
    assert.equal(report.fatal, true);
  });
});
