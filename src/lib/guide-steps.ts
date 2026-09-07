import type { RoomCapture } from '@/lib/walkthrough-draft';
import { roomHasSavedScan } from './walkthrough-schema.ts';

export type RoomAdvanceBlock = 'ok' | 'photo' | 'scan';

/** Whether the current room can advance (Next / Finish). */
export function canAdvanceRoom(
  room: Pick<RoomCapture, 'photos' | 'scanArtifact' | 'skipped'>,
  lidarRequired: boolean
): RoomAdvanceBlock {
  if (room.photos.length < 1) return 'photo';
  if (lidarRequired && !roomHasSavedScan(room)) return 'scan';
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
