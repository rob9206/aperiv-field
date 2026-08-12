import type { RoomCapture } from '@/lib/walkthrough-draft';

export type RoomAdvanceBlock = 'ok' | 'photo' | 'scan';

function roomHasScanMeasure(
  room: Pick<RoomCapture, 'scanned' | 'measuredSqftFromScan'>
): boolean {
  return (
    typeof room.measuredSqftFromScan === 'number' &&
    Number.isFinite(room.measuredSqftFromScan) &&
    room.measuredSqftFromScan > 0
  );
}

/** Whether the current room can advance (Next / Finish). */
export function canAdvanceRoom(
  room: Pick<RoomCapture, 'photos' | 'scanned' | 'measuredSqftFromScan'>,
  lidarAvailable: boolean
): RoomAdvanceBlock {
  if (room.photos.length < 1) return 'photo';
  // LiDAR path needs a real measured sq ft, not only a scanned checkmark.
  if (lidarAvailable && !(room.scanned && roomHasScanMeasure(room))) {
    return 'scan';
  }
  return 'ok';
}

export const ISSUE_PART_KEYS = [
  'partCarpet',
  'partPaint',
  'partWall',
  'partAppliance',
  'partPlumbing',
  'partClean',
  'partOther',
] as const;

export type IssuePartKey = (typeof ISSUE_PART_KEYS)[number];
