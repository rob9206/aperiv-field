import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';

import { parseDraftStoreRaw } from './draft-store-parse';
import {
  draftCanBeVerified,
  normalizeDraftStore,
} from './walkthrough-schema';
import type { RoomScanArtifact } from './walkthrough-schema';

export { isValidDraftStore, parseDraftStoreRaw } from './draft-store-parse';
export {
  draftCanBeVerified,
  normalizeDraftStore,
  roomHasVerifiedScan,
  scanMeasuredSqft,
} from './walkthrough-schema';
export type {
  RoomScanArtifact,
  ScanMeasurementSource,
} from './walkthrough-schema';

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

/** Historical wizard phases still accepted when loading old drafts. */
export type GuidePhase =
  | 'room'
  | 'arrive'
  | 'scan'
  | 'condition'
  | 'damage'
  | 'photo'
  | 'advance';

export type VerificationStatus = 'verified' | 'unverified';

export type RoomCapture = {
  id: string;
  name: string;
  sqft: string;
  /** good=Ready, watch=Small stuff, issue=Needs fixing */
  condition: RoomCondition;
  photos: RoomPhoto[];
  notes: string;
  hasDamage?: boolean;
  /** Part chips when room is not Ready (carpet, paint, …). */
  issueParts?: string[];
  scanned?: boolean;
  skipped?: boolean;
  scanArtifact?: RoomScanArtifact;
  /** Compatibility mirror; never use as verification source. */
  measuredSqftFromScan?: number;
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
  guideRoomIndex?: number;
  guidePhase?: GuidePhase;
  measuredSqftFromScan?: number;
  verificationStatus?: VerificationStatus;
};

export type DraftStore = {
  activeDraftId: string | null;
  drafts: Record<string, ManualWalkthroughDraft>;
};

export const STORE_KEY = 'aperiv.field.walkthrough.drafts.v2';
export const LEGACY_DRAFT_KEY = 'aperiv.field.walkthrough.draft.v1';
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
    hasDamage: false,
    scanned: false,
  };
}

export function createDraft(
  property: string,
  unit: string,
  recordedSqft: string,
  roomNames: string[] = DEFAULT_ROOM_NAMES
): ManualWalkthroughDraft {
  return {
    id: newId('draft'),
    property: property.trim(),
    unit: unit.trim(),
    recordedSqft: recordedSqft.trim(),
    rooms: roomNames.map(createRoom),
    findings: [],
    createdAt: new Date().toISOString(),
    guideRoomIndex: 0,
    guidePhase: 'room',
    verificationStatus: 'unverified',
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
      hasDamage: false,
      scanned: false,
    })),
    findings: legacy.findings,
    createdAt: new Date().toISOString(),
    completedAt: legacy.completedAt,
    guideRoomIndex: 0,
    guidePhase: 'arrive',
    verificationStatus: legacy.completedAt ? 'unverified' : 'unverified',
  };
}

async function loadLegacyStore(): Promise<DraftStore | null> {
  const legacyRaw = await AsyncStorage.getItem(LEGACY_DRAFT_KEY);
  if (!legacyRaw) {
    return null;
  }
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
  return null;
}

export async function loadDraftStore(): Promise<DraftStore> {
  try {
    const raw = await AsyncStorage.getItem(STORE_KEY);
    const parsed = parseDraftStoreRaw(raw);
    const normalized = normalizeDraftStore(parsed);
    if (normalized) {
      return normalized;
    }
  } catch {
    // Corrupt or unreadable v2 — try legacy recovery next.
  }

  const legacy = await loadLegacyStore();
  if (legacy) {
    return legacy;
  }

  return { activeDraftId: null, drafts: {} };
}

let saveChain: Promise<void> = Promise.resolve();

export async function saveDraftStore(store: DraftStore): Promise<void> {
  const write = async () => {
    await AsyncStorage.setItem(STORE_KEY, JSON.stringify(store));
  };
  const next = saveChain.then(write, write);
  saveChain = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/** Persist LiDAR success onto the active room while the guide UI is unmounted. */
export async function markActiveRoomScanned(): Promise<DraftStore | null> {
  const store = await loadDraftStore();
  const activeId = store.activeDraftId;
  if (!activeId) {
    return null;
  }
  const draft = store.drafts[activeId];
  if (!draft) {
    return null;
  }
  const idx = draft.guideRoomIndex ?? 0;
  const rooms = draft.rooms.map((room, i) =>
    i === idx ? { ...room, scanned: true } : room
  );
  const next: DraftStore = {
    activeDraftId: activeId,
    drafts: {
      ...store.drafts,
      [activeId]: {
        ...draft,
        rooms,
        guidePhase: 'condition',
        completedAt: undefined,
      },
    },
  };
  await saveDraftStore(next);
  return next;
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
    const fromScan = room.measuredSqftFromScan;
    if (typeof fromScan === 'number' && Number.isFinite(fromScan)) {
      return sum + fromScan;
    }
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

export function draftHasScanMeasure(draft: ManualWalkthroughDraft): boolean {
  return draftCanBeVerified(draft);
}
