/**
 * This decides which image files get deleted, so the tests lean hard on the
 * expensive direction: a photo that is still referenced must never be
 * returned as an orphan, however its URI is spelled.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { orphanedPhotoFiles, photoFileName } from './photoRules';

const DIR = 'file:///data/app/Documents/progress-photos';

describe('reading a photo file name', () => {
  it('takes the last segment', () => {
    assert.equal(photoFileName(`${DIR}/2026-09-13.jpg`), '2026-09-13.jpg');
    assert.equal(photoFileName('/var/mobile/x/restored-m-1.jpg'), 'restored-m-1.jpg');
  });

  it('ignores a query string or fragment', () => {
    assert.equal(photoFileName(`${DIR}/a.jpg?width=100`), 'a.jpg');
    assert.equal(photoFileName(`${DIR}/a.jpg#top`), 'a.jpg');
  });

  it('decodes percent-encoding, so one file is not mistaken for two', () => {
    assert.equal(photoFileName(`${DIR}/my%20photo.jpg`), 'my photo.jpg');
  });

  it('survives a stray percent rather than throwing', () => {
    assert.equal(photoFileName(`${DIR}/100%.jpg`), '100%.jpg');
  });

  it('has nothing to say about an absent photo', () => {
    assert.equal(photoFileName(null), null);
    assert.equal(photoFileName(undefined), null);
    assert.equal(photoFileName(''), null);
  });
});

describe('finding orphaned photos', () => {
  it('returns the files no measurement points at', () => {
    const orphans = orphanedPhotoFiles(
      [`${DIR}/a.jpg`, `${DIR}/b.jpg`, `${DIR}/c.jpg`],
      [{ photo: `${DIR}/b.jpg` }],
    );
    assert.deepEqual(orphans, [`${DIR}/a.jpg`, `${DIR}/c.jpg`]);
  });

  it('keeps a referenced file however its URI is spelled', () => {
    const orphans = orphanedPhotoFiles(
      [`${DIR}/my%20photo.jpg`],
      [{ photo: '/data/app/Documents/progress-photos/my photo.jpg' }],
    );
    assert.deepEqual(orphans, [], 'the same file, written two ways');
  });

  it('ignores rows with no photo without treating their file as claimed', () => {
    const orphans = orphanedPhotoFiles(
      [`${DIR}/a.jpg`],
      [{ photo: null }, { photo: undefined }, {}],
    );
    assert.deepEqual(orphans, [`${DIR}/a.jpg`]);
  });

  it('sweeps everything when there are no measurements left', () => {
    const files = [`${DIR}/a.jpg`, `${DIR}/b.jpg`];
    assert.deepEqual(orphanedPhotoFiles(files, []), files);
  });

  it('deletes nothing from an empty directory', () => {
    assert.deepEqual(orphanedPhotoFiles([], [{ photo: `${DIR}/a.jpg` }]), []);
  });

  it('leaves a file alone when its name cannot be read', () => {
    assert.deepEqual(orphanedPhotoFiles([`${DIR}/`], []), [], 'unreadable is not unclaimed');
  });
});
