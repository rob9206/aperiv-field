import type { RoomCapture } from './walkthrough-draft';

export type RoomDetailPatch = Partial<
  Pick<
    RoomCapture,
    'name' | 'sqft' | 'condition' | 'notes' | 'hasDamage' | 'issueParts'
  >
>;

export function patchRoomDetails(
  room: RoomCapture,
  patch: RoomDetailPatch
): RoomCapture {
  return {
    ...room,
    ...patch,
    skipped: room.skipped,
  };
}
