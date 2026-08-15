import AsyncStorage from '@react-native-async-storage/async-storage';

import { parseDraftStoreRaw } from './draft-store-parse.ts';
import {
  draftCanBeVerified,
  normalizeDraftStore,
  isPersistableScanArtifact,
  roomHasVerifiedScan,
  scanMeasuredSqft,
} from './walkthrough-schema.ts';
import type { RoomScanArtifact } from './walkthrough-schema.ts';
import type {
  DraftStore,
  ManualWalkthroughDraft,
  RoomCondition,
  VerificationStatus,
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

export type CompleteDraftInput = {
  draftId: string;
  requestedStatus: VerificationStatus;
};

export type CompleteDraftResult = {
  store: DraftStore;
};

export type DraftStoreLoadState = {
  store: DraftStore;
  degraded: boolean;
  recoveryPending: boolean;
};

export type DraftStoreRepository = {
  loadDraftStore(): Promise<DraftStore>;
  loadDraftStoreState(): Promise<DraftStoreLoadState>;
  mutateDraftStore<T>(
    mutation: DraftStoreMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null>;
  mutateDraftById<T>(
    draftId: string,
    mutation: DraftMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null>;
  commitRoomScan(input: CommitRoomScanInput): Promise<CommitRoomScanResult | null>;
  completeDraft(input: CompleteDraftInput): Promise<CompleteDraftResult | null>;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function droppedNestedCaptureReference(
  parsed: NonNullable<ReturnType<typeof parseDraftStoreRaw>>,
  normalized: DraftStore
): boolean {
  for (const [draftId, rawDraft] of Object.entries(parsed.drafts)) {
    const currentDraft = normalized.drafts[draftId];
    if (
      !currentDraft ||
      !isRecord(rawDraft) ||
      !Array.isArray(rawDraft.rooms)
    ) {
      continue;
    }

    for (let index = 0; index < rawDraft.rooms.length; index += 1) {
      const rawRoom = rawDraft.rooms[index];
      const currentRoom = currentDraft.rooms[index];
      if (!currentRoom || !isRecord(rawRoom)) {
        continue;
      }

      if (
        isRecord(rawRoom.scanArtifact) &&
        currentRoom.scanArtifact === undefined
      ) {
        return true;
      }

      if (!Array.isArray(rawRoom.photos)) {
        continue;
      }
      const currentPhotoUris = new Set(
        currentRoom.photos.map((photo) => photo.uri)
      );
      const droppedPhotoUri = rawRoom.photos.some(
        (photo) =>
          isRecord(photo) &&
          typeof photo.uri === 'string' &&
          !currentPhotoUris.has(photo.uri)
      );
      if (droppedPhotoUri) {
        return true;
      }
    }
  }
  return false;
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

  async function readStateUnlocked(): Promise<DraftStoreLoadState> {
    const backupAlreadyExists =
      (await storage.getItem(STORE_BACKUP_KEY)) !== null;
    const raw = await storage.getItem(STORE_KEY);
    const parsed = parseDraftStoreRaw(raw);
    const normalized = normalizeDraftStore(parsed);
    if (normalized !== null) {
      const degraded =
        raw !== null &&
        parsed !== null &&
        (Object.keys(parsed.drafts).length >
          Object.keys(normalized.drafts).length ||
          droppedNestedCaptureReference(parsed, normalized));
      if (degraded) {
        await preserveInvalidV2Unlocked(raw);
      }
      return {
        store: normalized,
        degraded,
        recoveryPending: backupAlreadyExists || degraded,
      };
    }
    if (raw !== null) {
      await preserveInvalidV2Unlocked(raw);
    }

    const migrated = await migrateLegacyUnlocked();
    return {
      store: migrated ?? EMPTY_STORE,
      degraded: raw !== null,
      recoveryPending: backupAlreadyExists || raw !== null,
    };
  }

  async function readUnlocked(): Promise<DraftStore> {
    return (await readStateUnlocked()).store;
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

  async function loadDraftStoreState(): Promise<DraftStoreLoadState> {
    return enqueue(readStateUnlocked);
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
      const artifactAlreadyUsed = draft.rooms.some(
        (room, index) =>
          index !== roomIndex &&
          (room.scanArtifact?.scanId === input.artifact.scanId ||
            room.scanArtifact?.jsonPath === input.artifact.jsonPath ||
            room.scanArtifact?.usdzPath === input.artifact.usdzPath)
      );
      if (
        roomIndex < 0 ||
        artifactAlreadyUsed ||
        !isPersistableScanArtifact(input.artifact)
      ) {
        return null;
      }

      const existingArtifact = draft.rooms[roomIndex].scanArtifact;
      const replaced =
        existingArtifact?.jsonPath === input.artifact.jsonPath &&
        existingArtifact.usdzPath === input.artifact.usdzPath
          ? undefined
          : existingArtifact;
      const rooms = draft.rooms.map((room, index) =>
        index === roomIndex
          ? {
              ...room,
              skipped: false,
              scanned: true,
              scanArtifact: input.artifact,
              ...(roomHasVerifiedScan({
                scanArtifact: input.artifact,
                skipped: false,
              })
                ? { measuredSqftFromScan: input.artifact.measuredSqft }
                : { measuredSqftFromScan: undefined }),
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

  async function completeDraft(
    input: CompleteDraftInput
  ): Promise<CompleteDraftResult | null> {
    const committed = await mutateDraftById(input.draftId, (draft) => {
      const measuredSqft = scanMeasuredSqft(draft.rooms);
      return {
        draft: {
          ...draft,
          completedAt: new Date().toISOString(),
          verificationStatus:
            input.requestedStatus === 'verified' &&
            draftCanBeVerified(draft)
              ? 'verified'
              : 'unverified',
          measuredSqftFromScan:
            measuredSqft > 0 ? measuredSqft : undefined,
        },
        value: undefined,
      };
    });
    return committed === null ? null : { store: committed.store };
  }

  return {
    loadDraftStore,
    loadDraftStoreState,
    mutateDraftStore,
    mutateDraftById,
    commitRoomScan,
    completeDraft,
  };
}

export const draftStoreRepository =
  createDraftStoreRepository(AsyncStorage);

export const loadDraftStore = draftStoreRepository.loadDraftStore;
export const loadDraftStoreState =
  draftStoreRepository.loadDraftStoreState;
export const mutateDraftStore = draftStoreRepository.mutateDraftStore;
export const mutateDraftById = draftStoreRepository.mutateDraftById;
export const commitRoomScan = draftStoreRepository.commitRoomScan;
export const completeDraft = draftStoreRepository.completeDraft;
