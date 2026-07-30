export type RoomCondition = 'good' | 'watch' | 'issue';

export type DemoRoom = {
  id: string;
  name: string;
  suggestedSqft: number;
};

export type DemoUnit = {
  id: string;
  unit: string;
  property: string;
  recordedSqft: number;
  rooms: DemoRoom[];
};

/** Portfolio units matching the web demo path (Unit 12B is the golden path). */
export const DEMO_UNITS: DemoUnit[] = [
  {
    id: '12B',
    unit: '12B',
    property: 'Brookhaven Apts',
    recordedSqft: 1210,
    rooms: [
      { id: 'living', name: 'Living', suggestedSqft: 310 },
      { id: 'kitchen', name: 'Kitchen', suggestedSqft: 180 },
      { id: 'bed1', name: 'Bed 1', suggestedSqft: 220 },
      { id: 'bed2', name: 'Bed 2', suggestedSqft: 190 },
      { id: 'bath', name: 'Bath / Hall', suggestedSqft: 147 },
    ],
  },
  {
    id: '4A',
    unit: '4A',
    property: 'Sunset Plaza',
    recordedSqft: 890,
    rooms: [
      { id: 'living', name: 'Living', suggestedSqft: 280 },
      { id: 'kitchen', name: 'Kitchen', suggestedSqft: 140 },
      { id: 'bed1', name: 'Bedroom', suggestedSqft: 210 },
      { id: 'bath', name: 'Bath', suggestedSqft: 90 },
    ],
  },
  {
    id: '9C',
    unit: '9C',
    property: 'Harbor View',
    recordedSqft: 1050,
    rooms: [
      { id: 'living', name: 'Living', suggestedSqft: 300 },
      { id: 'kitchen', name: 'Kitchen', suggestedSqft: 160 },
      { id: 'bed1', name: 'Bed 1', suggestedSqft: 200 },
      { id: 'bed2', name: 'Bed 2', suggestedSqft: 175 },
      { id: 'bath', name: 'Bath', suggestedSqft: 110 },
    ],
  },
];

export type FindingSeverity = 'low' | 'medium' | 'high';

export type WalkthroughFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  body: string;
};

export type RoomCapture = {
  id: string;
  name: string;
  sqft: string;
  condition: RoomCondition;
  photoCount: string;
  notes: string;
};

export type ManualWalkthroughDraft = {
  unitId: string;
  unit: string;
  property: string;
  recordedSqft: number;
  rooms: RoomCapture[];
  findings: WalkthroughFinding[];
  completedAt?: string;
};

export function createDraftFromUnit(unit: DemoUnit): ManualWalkthroughDraft {
  return {
    unitId: unit.id,
    unit: unit.unit,
    property: unit.property,
    recordedSqft: unit.recordedSqft,
    rooms: unit.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      sqft: String(room.suggestedSqft),
      condition: 'good',
      photoCount: '0',
      notes: '',
    })),
    findings: [],
  };
}

export function measuredSqft(rooms: RoomCapture[]): number {
  return rooms.reduce((sum, room) => {
    const value = Number.parseFloat(room.sqft);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function totalPhotos(rooms: RoomCapture[]): number {
  return rooms.reduce((sum, room) => {
    const value = Number.parseInt(room.photoCount, 10);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}
