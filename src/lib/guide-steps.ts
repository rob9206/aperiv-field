import type { RoomCapture } from '@/lib/walkthrough-draft';

export type RoomAdvanceBlock = 'ok' | 'photo' | 'scan';

/** Whether the current room can advance (Next / Finish). */
export function canAdvanceRoom(
  room: Pick<RoomCapture, 'photos' | 'scanned'>,
  lidarAvailable: boolean
): RoomAdvanceBlock {
  if (room.photos.length < 1) return 'photo';
  if (lidarAvailable && !room.scanned) return 'scan';
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
