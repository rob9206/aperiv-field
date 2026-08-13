import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseDraftStoreRaw } from './draft-store-parse';
import {
  normalizeDraftStore,
  roomHasVerifiedScan,
  scanMeasuredSqft,
} from './walkthrough-schema';
import type { RoomScanArtifact } from './walkthrough-schema';
import type {
  DraftStore,
  ManualWalkthroughDraft,
  RoomCondition,
  WalkthroughFinding,
} from './walkthrough-draft';

export const STORE_KEY = 'aperiv.field.walkthrough.drafts.v2';
export const STORE_BACKUP_KEY = `${STORE_KEY}.backup`;
export const LEGACY_DRAFT_KEY = 'aperiv.field.walkthrough.draft.v1';

const EMPTY_STORE: DraftStore = { activeDraftId: null, drafts: {} };

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

export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type DraftStoreMutation<T> = (
  store: DraftStore
) => { store: DraftStore; value: T } | null;

export type DraftMutation<T> = (
  draft: ManualWalkthroughDraft
) => { draft: ManualWalkthroughDraft; value: T } | null;

export type CommitRoomScanInput = {
  draftId: string;
  roomId: string;
  artifact: RoomScanArtifact;
};

export type CommitRoomScanResult = {
  store: DraftStore;
  replaced?: RoomScanArtifact;
};

export type DraftStoreRepository = {
  loadDraftStore(): Promise<DraftStore>;
  mutateDraftStore<T>(
    mutation: DraftStoreMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null>;
  mutateDraftById<T>(
    draftId: string,
    mutation: DraftMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null>;
  commitRoomScan(input: CommitRoomScanInput): Promise<CommitRoomScanResult | null>;
};

function newLegacyDraftId(): string {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function migrateLegacyDraft(legacy: LegacyDraft): ManualWalkthroughDraft {
  return {
    id: newLegacyDraftId(),
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
    verificationStatus: 'unverified',
  };
}

function hasDraft(store: DraftStore, draftId: string): boolean {
  return Object.prototype.hasOwnProperty.call(store.drafts, draftId);
}

export function createDraftStoreRepository(
  storage: KeyValueStorage
): DraftStoreRepository {
  let mutationChain: Promise<void> = Promise.resolve();

  async function preserveInvalidV2Unlocked(raw: string): Promise<void> {
    const existingBackup = await storage.getItem(STORE_BACKUP_KEY);
    if (existingBackup === null) {
      await storage.setItem(STORE_BACKUP_KEY, raw);
    }
  }

  async function migrateLegacyUnlocked(): Promise<DraftStore | null> {
    const legacyRaw = await storage.getItem(LEGACY_DRAFT_KEY);
    if (legacyRaw === null) {
      return null;
    }

    let legacy: LegacyDraft;
    try {
      legacy = JSON.parse(legacyRaw) as LegacyDraft;
    } catch {
      return null;
    }
    if (!legacy?.unit || !Array.isArray(legacy.rooms)) {
      return null;
    }

    const draft = migrateLegacyDraft(legacy);
    const normalized = normalizeDraftStore({
      activeDraftId: draft.id,
      drafts: { [draft.id]: draft },
    });
    if (normalized === null) {
      return null;
    }

    await storage.setItem(STORE_KEY, JSON.stringify(normalized));
    await storage.removeItem(LEGACY_DRAFT_KEY);
    return normalized;
  }

  async function readUnlocked(): Promise<DraftStore> {
    const raw = await storage.getItem(STORE_KEY);
    const normalized = normalizeDraftStore(parseDraftStoreRaw(raw));
    if (normalized !== null) {
      return normalized;
    }
    if (raw !== null) {
      await preserveInvalidV2Unlocked(raw);
    }

    const migrated = await migrateLegacyUnlocked();
    return migrated ?? EMPTY_STORE;
  }

  async function writeUnlocked(store: DraftStore): Promise<DraftStore> {
    const normalized = normalizeDraftStore(store);
    if (normalized === null) {
      throw new Error('Draft store mutation produced invalid state');
    }
    await storage.setItem(STORE_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function enqueue<T>(run: () => Promise<T>): Promise<T> {
    const queued = mutationChain.then(run, run);
    mutationChain = queued.then(
      () => undefined,
      () => undefined
    );
    return queued;
  }

  async function loadDraftStore(): Promise<DraftStore> {
    return enqueue(readUnlocked);
  }

  async function mutateDraftStore<T>(
    mutation: DraftStoreMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null> {
    return enqueue(async () => {
      const current = await readUnlocked();
      const next = mutation(current);
      if (next === null) {
        return null;
      }
      const committed = await writeUnlocked(next.store);
      return { store: committed, value: next.value };
    });
  }

  async function mutateDraftById<T>(
    draftId: string,
    mutation: DraftMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null> {
    return mutateDraftStore((current) => {
      if (!hasDraft(current, draftId)) {
        return null;
      }
      const next = mutation(current.drafts[draftId]);
      if (next === null) {
        return null;
      }
      return {
        store: {
          ...current,
          drafts: { ...current.drafts, [draftId]: next.draft },
        },
        value: next.value,
      };
    });
  }

  async function commitRoomScan(
    input: CommitRoomScanInput
  ): Promise<CommitRoomScanResult | null> {
    const committed = await mutateDraftById(input.draftId, (draft) => {
      const roomIndex = draft.rooms.findIndex(
        (room) => room.id === input.roomId
      );
      if (
        roomIndex < 0 ||
        !roomHasVerifiedScan({
          scanArtifact: input.artifact,
          skipped: false,
        })
      ) {
        return null;
      }

      const replaced = draft.rooms[roomIndex].scanArtifact;
      const rooms = draft.rooms.map((room, index) =>
        index === roomIndex
          ? {
              ...room,
              skipped: false,
              scanned: true,
              scanArtifact: input.artifact,
              measuredSqftFromScan: input.artifact.measuredSqft,
            }
          : room
      );
      return {
        draft: {
          ...draft,
          rooms,
          measuredSqftFromScan: scanMeasuredSqft(rooms),
          verificationStatus: 'unverified',
          completedAt: undefined,
        },
        value: replaced,
      };
    });
    if (committed === null) {
      return null;
    }
    return {
      store: committed.store,
      ...(committed.value === undefined
        ? {}
        : { replaced: committed.value }),
    };
  }

  return {
    loadDraftStore,
    mutateDraftStore,
    mutateDraftById,
    commitRoomScan,
  };
}

export const draftStoreRepository =
  createDraftStoreRepository(AsyncStorage);

export const loadDraftStore = draftStoreRepository.loadDraftStore;
export const mutateDraftStore = draftStoreRepository.mutateDraftStore;
export const mutateDraftById = draftStoreRepository.mutateDraftById;
export const commitRoomScan = draftStoreRepository.commitRoomScan;

/**
 * Transitional pre-artifact scan callback. Normalization deliberately keeps
 * the room unscanned until Task 5 commits an explicit RoomScanArtifact.
 */
export async function markActiveRoomScanned(): Promise<DraftStore | null> {
  const committed = await mutateDraftStore((current) => {
    const activeId = current.activeDraftId;
    if (!activeId || !hasDraft(current, activeId)) {
      return null;
    }
    const draft = current.drafts[activeId];
    const roomIndex = draft.guideRoomIndex ?? 0;
    if (!draft.rooms[roomIndex]) {
      return null;
    }
    const rooms = draft.rooms.map((room, index) =>
      index === roomIndex ? { ...room, scanned: true } : room
    );
    return {
      store: {
        ...current,
        drafts: {
          ...current.drafts,
          [activeId]: {
            ...draft,
            rooms,
            guidePhase: 'room',
            completedAt: undefined,
          },
        },
      },
      value: undefined,
    };
  });
  return committed?.store ?? null;
}
