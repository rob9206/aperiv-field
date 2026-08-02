import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

export type RoomCondition = 'good' | 'watch' | 'issue';

export type FindingSeverity = 'low' | 'medium' | 'high';

export type WalkthroughFinding = {
  id: string;
  severity: FindingSeverity;
  title: string;
  body: string;
};

export type RoomPhoto = {
  id: string;
  uri: string;
};

export type RoomCapture = {
  id: string;
  name: string;
  sqft: string;
  condition: RoomCondition;
  photos: RoomPhoto[];
  notes: string;
};

export type ManualWalkthroughDraft = {
  id: string;
  property: string;
  unit: string;
  recordedSqft: string;
  rooms: RoomCapture[];
  findings: WalkthroughFinding[];
  createdAt: string;
  completedAt?: string;
};

export type DraftStore = {
  activeDraftId: string | null;
  drafts: Record<string, ManualWalkthroughDraft>;
};

const STORE_KEY = 'aperiv.field.walkthrough.drafts.v2';
const LEGACY_DRAFT_KEY = 'aperiv.field.walkthrough.draft.v1';
const PHOTOS_DIR = 'walkthrough-photos';

export const DEFAULT_ROOM_NAMES = ['Living', 'Kitchen', 'Bedroom', 'Bathroom'];

export function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function createRoom(name: string): RoomCapture {
  return {
    id: newId('room'),
    name,
    sqft: '',
    condition: 'good',
    photos: [],
    notes: '',
  };
}

export function createDraft(property: string, unit: string, recordedSqft: string): ManualWalkthroughDraft {
  return {
    id: newId('draft'),
    property: property.trim(),
    unit: unit.trim(),
    recordedSqft: recordedSqft.trim(),
    rooms: DEFAULT_ROOM_NAMES.map(createRoom),
    findings: [],
    createdAt: new Date().toISOString(),
  };
}

type LegacyRoom = {
  id: string;
  name: string;
  sqft: string;
  condition: RoomCondition;
  notes: string;
};

type LegacyDraft = {
  unitId: string;
  unit: string;
  property: string;
  recordedSqft: number;
  rooms: LegacyRoom[];
  findings: WalkthroughFinding[];
  completedAt?: string;
};

function migrateLegacyDraft(legacy: LegacyDraft): ManualWalkthroughDraft {
  return {
    id: newId('draft'),
    property: legacy.property,
    unit: legacy.unit,
    recordedSqft: String(legacy.recordedSqft),
    rooms: legacy.rooms.map((room) => ({
      id: room.id,
      name: room.name,
      sqft: room.sqft,
      condition: room.condition,
      photos: [],
      notes: room.notes,
    })),
    findings: legacy.findings,
    createdAt: new Date().toISOString(),
    completedAt: legacy.completedAt,
  };
}

export async function loadDraftStore(): Promise<DraftStore> {
  const raw = await AsyncStorage.getItem(STORE_KEY);
  if (raw) {
    const parsed = JSON.parse(raw) as DraftStore;
    if (parsed && typeof parsed.drafts === 'object') {
      return parsed;
    }
  }

  const legacyRaw = await AsyncStorage.getItem(LEGACY_DRAFT_KEY);
  if (legacyRaw) {
    try {
      const legacy = JSON.parse(legacyRaw) as LegacyDraft;
      if (legacy?.unit && Array.isArray(legacy.rooms)) {
        const draft = migrateLegacyDraft(legacy);
        const store: DraftStore = {
          activeDraftId: draft.id,
          drafts: { [draft.id]: draft },
        };
        await saveDraftStore(store);
        await AsyncStorage.removeItem(LEGACY_DRAFT_KEY);
        return store;
      }
    } catch {
      // Unreadable legacy draft — fall through to an empty store.
    }
  }

  return { activeDraftId: null, drafts: {} };
}

export async function saveDraftStore(store: DraftStore): Promise<void> {
  await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
}

function draftPhotosDirectory(draftId: string): Directory {
  return new Directory(Paths.document, PHOTOS_DIR, draftId);
}

export function persistPhoto(draftId: string, sourceUri: string): RoomPhoto {
  const root = new Directory(Paths.document, PHOTOS_DIR);
  if (!root.exists) {
    root.create();
  }
  const dir = draftPhotosDirectory(draftId);
  if (!dir.exists) {
    dir.create();
  }
  const id = newId('photo');
  const extension = /\.(\w+)$/.exec(sourceUri)?.[1] ?? 'jpg';
  const destination = new File(dir, `${id}.${extension}`);
  new File(sourceUri).copy(destination);
  return { id, uri: destination.uri };
}

export function deletePhotoFile(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // A missing photo file should never block editing the draft.
  }
}

export function deleteDraftPhotos(draftId: string): void {
  try {
    const dir = draftPhotosDirectory(draftId);
    if (dir.exists) {
      dir.delete();
    }
  } catch {
    // Orphaned photo files are preferable to a failed draft delete.
  }
}

export function measuredSqft(rooms: RoomCapture[]): number {
  return rooms.reduce((sum, room) => {
    const value = Number.parseFloat(room.sqft);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);
}

export function totalPhotos(rooms: RoomCapture[]): number {
  return rooms.reduce((sum, room) => sum + room.photos.length, 0);
}

export function recordedSqftValue(draft: ManualWalkthroughDraft): number | null {
  const value = Number.parseFloat(draft.recordedSqft);
  return Number.isFinite(value) ? value : null;
}
