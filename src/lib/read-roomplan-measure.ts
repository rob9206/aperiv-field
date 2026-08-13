import { File } from 'expo-file-system';

import type { RoomScanExportResult } from '../../modules/expo-room-scan';
import {
  parseVerifiedRoomPlanMeasurement,
  type VerifiedScanMeasurement,
} from './roomplan-measure';

export async function readVerifiedMeasurementFromExport(
  result: RoomScanExportResult
): Promise<VerifiedScanMeasurement | null> {
  try {
    const uri = result.jsonPath.startsWith('file://')
      ? result.jsonPath
      : `file://${result.jsonPath}`;
    const file = new File(uri);
    if (!file.exists) return null;
    return parseVerifiedRoomPlanMeasurement(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
