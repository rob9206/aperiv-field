import { File } from 'expo-file-system';

import type { RoomScanExportResult } from '../../modules/expo-room-scan';
import {
  measuredSqftFromExportFields,
  measuredSqftFromRoomPlanJson,
} from './roomplan-measure';

function fileFromPath(path: string): File {
  if (path.startsWith('file://')) {
    return new File(path);
  }
  return new File(`file://${path}`);
}

/**
 * Resolve measured floor area (sq ft) from a RoomPlan export.
 * Prefers native area fields; falls back to parsing Room.json (OTA-safe).
 */
export async function readMeasuredSqftFromExport(
  results: RoomScanExportResult
): Promise<number | null> {
  const fromFields = measuredSqftFromExportFields({
    areaSquareFeet: results.areaSquareFeet,
    areaSquareMeters: results.areaSquareMeters,
  });
  if (fromFields != null) {
    return fromFields;
  }

  try {
    const file = fileFromPath(results.jsonPath);
    if (!file.exists) {
      return null;
    }
    const text = await file.text();
    const json: unknown = JSON.parse(text);
    return measuredSqftFromRoomPlanJson(json);
  } catch (error) {
    console.warn('Failed to read RoomPlan floor area from export', error);
    return null;
  }
}
