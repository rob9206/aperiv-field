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
