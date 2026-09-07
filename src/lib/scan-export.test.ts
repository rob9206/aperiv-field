import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildRoomScanArtifact } from './scan-export.ts';

const capturedAt = '2026-08-15T00:00:00.000Z';

describe('buildRoomScanArtifact', () => {
  it('keeps export files when RoomPlan has no verified floor measure', () => {
    const artifact = buildRoomScanArtifact(
      {
        jsonPath: '/var/mobile/Documents/scans/scan-1/Room.json',
        usdzPath: '/var/mobile/Documents/scans/scan-1/Room.usdz',
      },
      'scan-1',
      null,
      capturedAt
    );

    assert.equal(artifact.scanId, 'scan-1');
    assert.equal(artifact.jsonPath, '/var/mobile/Documents/scans/scan-1/Room.json');
    assert.equal(artifact.usdzPath, '/var/mobile/Documents/scans/scan-1/Room.usdz');
    assert.equal(artifact.source, 'export-only');
    assert.equal(artifact.measuredSqft, undefined);
    assert.equal(artifact.capturedAt, capturedAt);
  });

  it('stores a verified floor measure when the parser succeeds', () => {
    const artifact = buildRoomScanArtifact(
      { jsonPath: '/scan/Room.json', usdzPath: '/scan/Room.usdz' },
      'scan-2',
      { measuredSqft: 215.27, source: 'roomplan-floor-polygon' },
      capturedAt
    );

    assert.equal(artifact.source, 'roomplan-floor-polygon');
    assert.equal(artifact.measuredSqft, 215.27);
  });
});
