/**
 * This decides which image files get deleted, so the tests lean hard on the
 * expensive direction: a photo that is still referenced must never be
 * returned as an orphan, however its URI is spelled.
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LaunchHydration,
  maySweepPhotos,
  orphanedPhotoFiles,
  photoFileName,
  SweepTrigger,
} from './photoRules';

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

describe('whether a sweep is safe at all', () => {
  const clean: LaunchHydration = {
    status: 'loaded',
    parsed: true,
    downgrade: false,
    measurementsAltered: false,
  };
  const launch = (over: Partial<LaunchHydration> = {}): SweepTrigger => ({
    kind: 'launch',
    hydration: { ...clean, ...over },
  });
  const some = { owners: 3, files: 5 };

  it('sweeps at launch when the payload loaded cleanly', () => {
    assert.deepEqual(maySweepPhotos(launch(), some), { sweep: true, blockedBy: null });
  });

  it('never sweeps when the payload was rescued rather than parsed', () => {
    // The app is running on emptyData() while wt.data.corrupt.* still
    // references every photo — this is the case that deletes the lot.
    assert.deepEqual(maySweepPhotos(launch({ parsed: false }), { owners: 0, files: 5 }), {
      sweep: false,
      blockedBy: 'payload-rescued',
    });
  });

  it('never sweeps when storage would not answer', () => {
    assert.equal(
      maySweepPhotos(launch({ status: 'unreadable', parsed: false }), some).blockedBy,
      'storage-unreadable',
    );
  });

  it('never sweeps on a first run that found files already there', () => {
    assert.equal(maySweepPhotos(launch({ status: 'first-run' }), { owners: 0, files: 5 }).blockedBy, 'nothing-loaded');
  });

  it('never sweeps a downgrade, whose stored measurements are the real ones', () => {
    assert.equal(maySweepPhotos(launch({ downgrade: true }), some).blockedBy, 'downgrade');
  });

  it('never sweeps when migration altered the measurements', () => {
    // Dropped rows may come back from the pre-migration snapshot; their
    // photos should still be there when they do.
    assert.equal(
      maySweepPhotos(launch({ measurementsAltered: true }), some).blockedBy,
      'measurements-altered',
    );
  });

  it('stops at launch when there are files but nothing claims them', () => {
    assert.equal(maySweepPhotos(launch(), { owners: 0, files: 5 }).blockedBy, 'no-owners');
  });

  it('lets an explicit reset or restore clear the last photo', () => {
    assert.deepEqual(maySweepPhotos({ kind: 'user-action' }, { owners: 0, files: 5 }), {
      sweep: true,
      blockedBy: null,
    });
  });

  it('still sweeps after a user action however the launch went', () => {
    // A user action happens long after hydration and is its own evidence.
    assert.equal(maySweepPhotos({ kind: 'user-action' }, { owners: 2, files: 9 }).sweep, true);
  });

  it('has nothing to do when the directory is empty', () => {
    assert.deepEqual(maySweepPhotos(launch(), { owners: 0, files: 0 }), {
      sweep: false,
      blockedBy: null,
    });
    assert.deepEqual(maySweepPhotos({ kind: 'user-action' }, { owners: 0, files: 0 }), {
      sweep: false,
      blockedBy: null,
    });
  });
});
