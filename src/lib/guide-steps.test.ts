import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { canAdvanceRoom } from './guide-steps.ts';

describe('canAdvanceRoom', () => {
  const artifact = {
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft: 100,
    source: 'roomplan-floor-polygon' as const,
    capturedAt: '2026-08-12T00:00:00.000Z',
  };

  it('blocks when no photos', () => {
    assert.equal(
      canAdvanceRoom({ photos: [], scanArtifact: artifact }, true),
      'photo'
    );
  });

  it('blocks the LiDAR path until the room has a measurement', () => {
    assert.equal(
      canAdvanceRoom({ photos: [{ id: '1', uri: 'x' }] }, true),
      'scan'
    );
  });

  it('blocks skipped rooms while LiDAR verification remains enabled', () => {
    assert.equal(
      canAdvanceRoom(
        {
          photos: [{ id: '1', uri: 'x' }],
          scanArtifact: artifact,
          skipped: true,
        },
        true
      ),
      'scan'
    );
  });

  it('allows non-LiDAR capture with a photo', () => {
    assert.equal(
      canAdvanceRoom(
        { photos: [{ id: '1', uri: 'x' }], skipped: true },
        false
      ),
      'ok'
    );
  });

  it('lets the crew continue after a saved scan that has no verified sq ft', () => {
    assert.equal(
      canAdvanceRoom(
        {
          photos: [{ id: '1', uri: 'x' }],
          scanArtifact: {
            scanId: 'scan-1',
            jsonPath: '/scan/Room.json',
            usdzPath: '/scan/Room.usdz',
            source: 'export-only',
            capturedAt: '2026-08-12T00:00:00.000Z',
          },
        },
        true
      ),
      'ok'
    );
  });

  it('allows LiDAR after a verified measurement and photo', () => {
    assert.equal(
      canAdvanceRoom(
        { photos: [{ id: '1', uri: 'x' }], scanArtifact: artifact },
        true
      ),
      'ok'
    );
  });
});
