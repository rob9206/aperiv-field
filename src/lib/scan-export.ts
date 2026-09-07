import type { VerifiedScanMeasurement } from './roomplan-measure.ts';
import type { RoomScanArtifact } from './walkthrough-schema.ts';

export function buildRoomScanArtifact(
  exported: { jsonPath: string; usdzPath: string },
  scanId: string,
  measurement: VerifiedScanMeasurement | null,
  capturedAt: string
): RoomScanArtifact {
  if (measurement) {
    return {
      scanId,
      jsonPath: exported.jsonPath,
      usdzPath: exported.usdzPath,
      measuredSqft: measurement.measuredSqft,
      source: measurement.source,
      capturedAt,
    };
  }

  return {
    scanId,
    jsonPath: exported.jsonPath,
    usdzPath: exported.usdzPath,
    source: 'export-only',
    capturedAt,
  };
}
