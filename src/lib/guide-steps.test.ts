import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canAdvanceRoom } from './guide-steps.ts';

describe('canAdvanceRoom', () => {
  it('blocks when no photos', () => {
    assert.equal(
      canAdvanceRoom(
        { photos: [], scanned: true, measuredSqftFromScan: 120 },
        true
      ),
      'photo'
    );
  });

  it('blocks LiDAR path until scanned with measure', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: false }, true),
      'scan'
    );
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: true }, true),
      'scan'
    );
  });

  it('allows non-LiDAR with a photo', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: false }, false),
      'ok'
    );
  });

  it('allows LiDAR after scan measure + photo', () => {
    assert.equal(
      canAdvanceRoom(
        {
          photos: [{ id: '1', uri: 'x' }],
          scanned: true,
          measuredSqftFromScan: 140,
        },
        true
      ),
      'ok'
    );
  });
});
