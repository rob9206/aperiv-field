import type { GuidePhase } from '@/lib/walkthrough-draft';

export type GuideStepContext = {
  lidarAvailable: boolean;
  roomIndex: number;
  roomCount: number;
  phase: GuidePhase;
};

/** Advance guide phase after the current prompt is completed. */
export function nextGuidePhase(
  phase: GuidePhase,
  lidarAvailable: boolean
): GuidePhase | 'doneRoom' {
  switch (phase) {
    case 'arrive':
      return lidarAvailable ? 'scan' : 'condition';
    case 'scan':
      return 'condition';
    case 'condition':
      return 'damage';
    case 'damage':
      return 'photo';
    case 'photo':
      return 'advance';
    case 'advance':
      return 'doneRoom';
    default:
      return 'arrive';
  }
}

/** Step backward one prompt; `leaveRoom` means leave this room index. */
export function previousGuidePhase(
  phase: GuidePhase,
  lidarAvailable: boolean
): GuidePhase | 'leaveRoom' {
  switch (phase) {
    case 'arrive':
      return 'leaveRoom';
    case 'scan':
      return 'arrive';
    case 'condition':
      return lidarAvailable ? 'scan' : 'arrive';
    case 'damage':
      return 'condition';
    case 'photo':
      return 'damage';
    case 'advance':
      return 'photo';
    default:
      return 'arrive';
  }
}
