import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canAdvanceRoom } from './guide-steps.ts';

describe('canAdvanceRoom', () => {
  it('blocks when no photos', () => {
    assert.equal(canAdvanceRoom({ photos: [], scanned: true }, true), 'photo');
  });

  it('blocks LiDAR path until scanned', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: false }, true),
      'scan'
    );
  });

  it('allows non-LiDAR with a photo', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: false }, false),
      'ok'
    );
  });

  it('allows LiDAR after scan + photo', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }], scanned: true }, true),
      'ok'
    );
  });
});
