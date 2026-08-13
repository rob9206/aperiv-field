import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LEGACY_DRAFT_KEY,
  STORE_KEY,
  STORE_BACKUP_KEY,
  createDraftStoreRepository,
  type KeyValueStorage,
} from './draft-store.ts';
import type {
  DraftStore,
  ManualWalkthroughDraft,
  RoomCapture,
  RoomScanArtifact,
} from './walkthrough-draft.ts';

const capturedAt = '2026-08-12T00:00:00.000Z';

function room(id: string, name = id): RoomCapture {
  return {
    id,
    name,
    sqft: '',
    condition: 'good',
    photos: [],
    notes: '',
    scanned: false,
  };
}

function draft(id: string, roomIds = [`${id}-room`]): ManualWalkthroughDraft {
  return {
    id,
    property: 'Oak',
    unit: id,
    recordedSqft: '1000',
    rooms: roomIds.map((roomId) => room(roomId)),
    findings: [],
    createdAt: capturedAt,
    guideRoomIndex: 0,
    guidePhase: 'room',
    verificationStatus: 'unverified',
  };
}

function store(...drafts: ManualWalkthroughDraft[]): DraftStore {
  return {
    activeDraftId: drafts[0]?.id ?? null,
    drafts: Object.fromEntries(drafts.map((item) => [item.id, item])),
  };
}

function artifact(
  measuredSqft: number,
  overrides: Partial<RoomScanArtifact> = {}
): RoomScanArtifact {
  return {
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft,
    source: 'roomplan-floor-polygon',
    capturedAt,
    ...overrides,
  };
}

function memoryStorage(
  initial: Record<string, string> = {},
  hooks: {
    beforeSet?: (key: string, value: string) => Promise<void> | void;
    beforeRemove?: (key: string) => Promise<void> | void;
  } = {}
): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      await hooks.beforeSet?.(key, value);
      values.set(key, value);
    },
    async removeItem(key) {
      await hooks.beforeRemove?.(key);
      values.delete(key);
    },
  };
}

describe('draft store mutation queue', () => {
  it('rebases concurrent mutations on the latest committed store', async () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(draft('a'), draft('b'))),
    });
    const repository = createDraftStoreRepository(storage);

    const first = repository.mutateDraftById('a', (current) => ({
      draft: { ...current, unit: '2A' },
      value: undefined,
    }));
    const second = repository.mutateDraftById('b', (current) => ({
      draft: { ...current, unit: '3B' },
      value: undefined,
    }));

    await Promise.all([first, second]);
    const saved = await repository.loadDraftStore();
    assert.equal(saved.drafts.a.unit, '2A');
    assert.equal(saved.drafts.b.unit, '3B');
  });

  it('continues processing after a rejected queued write', async () => {
    let rejectNextWrite = true;
    const storage = memoryStorage(
      { [STORE_KEY]: JSON.stringify(store(draft('a'))) },
      {
        beforeSet() {
          if (rejectNextWrite) {
            rejectNextWrite = false;
            throw new Error('disk full');
          }
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    await assert.rejects(
      repository.mutateDraftById('a', (current) => ({
        draft: { ...current, unit: 'failed' },
        value: undefined,
      })),
      /disk full/
    );
    const committed = await repository.mutateDraftById('a', (current) => ({
      draft: { ...current, unit: 'saved' },
      value: 'ok',
    }));

    assert.equal(committed?.value, 'ok');
    assert.equal(committed?.store.drafts.a.unit, 'saved');
  });

  it('normalizes and recomputes verification on every write', async () => {
    const scanned = draft('a');
    scanned.verificationStatus = 'verified';
    scanned.rooms[0].scanned = true;
    scanned.rooms[0].measuredSqftFromScan = 125;
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(scanned)),
    });
    const repository = createDraftStoreRepository(storage);

    const committed = await repository.mutateDraftById('a', (current) => ({
      draft: {
        ...current,
        verificationStatus: 'verified',
        rooms: current.rooms.map((item) => ({ ...item, scanned: true })),
      },
      value: undefined,
    }));

    assert.ok(committed);
    assert.equal(committed.store.drafts.a.verificationStatus, 'unverified');
    assert.equal(committed.store.drafts.a.rooms[0].scanned, false);
    assert.deepEqual(
      JSON.parse(storage.values.get(STORE_KEY)!),
      committed.store
    );
  });
});

describe('draft store recovery', () => {
  it('migrates and normalizes legacy data inside the queue without deadlocking', async () => {
    const operations: string[] = [];
    const storage = memoryStorage(
      {
        [LEGACY_DRAFT_KEY]: JSON.stringify({
          unitId: 'legacy-unit',
          unit: '1A',
          property: 'Oak',
          recordedSqft: 900,
          rooms: [
            {
              id: 'legacy-room',
              name: 'Living',
              sqft: '900',
              condition: 'good',
              notes: '',
            },
          ],
          findings: [],
        }),
      },
      {
        beforeSet(key) {
          operations.push(`set:${key}`);
        },
        beforeRemove(key) {
          operations.push(`remove:${key}`);
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    const committed = await Promise.race([
      repository.mutateDraftStore((current) => ({
        store: {
          ...current,
          activeDraftId: Object.keys(current.drafts)[0] ?? null,
        },
        value: 'migrated',
      })),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('migration deadlocked')), 250)
      ),
    ]);

    assert.equal(committed?.value, 'migrated');
    const migrated = Object.values(committed!.store.drafts)[0];
    assert.ok(migrated);
    assert.equal(migrated.rooms[0].scanned, false);
    assert.equal(
      operations.indexOf(`set:${STORE_KEY}`) <
        operations.indexOf(`remove:${LEGACY_DRAFT_KEY}`),
      true
    );
    assert.equal(storage.values.has(LEGACY_DRAFT_KEY), false);
  });

  it('keeps legacy data when normalized v2 persistence fails', async () => {
    const storage = memoryStorage(
      {
        [LEGACY_DRAFT_KEY]: JSON.stringify({
          unitId: 'legacy-unit',
          unit: '1A',
          property: 'Oak',
          recordedSqft: 900,
          rooms: [
            {
              id: 'legacy-room',
              name: 'Living',
              sqft: '900',
              condition: 'good',
              notes: '',
            },
          ],
          findings: [],
        }),
      },
      {
        beforeSet(key) {
          if (key === STORE_KEY) {
            throw new Error('write failed');
          }
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    await assert.rejects(repository.loadDraftStore(), /write failed/);
    assert.equal(storage.values.has(LEGACY_DRAFT_KEY), true);
  });

  it('backs up an unreadable v2 payload once before replacing it', async () => {
    const storage = memoryStorage({ [STORE_KEY]: '{first-corrupt' });
    const repository = createDraftStoreRepository(storage);

    await repository.mutateDraftStore(() => ({
      store: store(draft('recovered')),
      value: undefined,
    }));
    assert.equal(storage.values.get(STORE_BACKUP_KEY), '{first-corrupt');

    storage.values.set(STORE_KEY, '{second-corrupt');
    const secondRepository = createDraftStoreRepository(storage);
    await secondRepository.mutateDraftStore(() => ({
      store: store(draft('recovered-again')),
      value: undefined,
    }));

    assert.equal(storage.values.get(STORE_BACKUP_KEY), '{first-corrupt');
  });
});

describe('commitRoomScan', () => {
  it('returns null for missing draft and room IDs', async () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(draft('a', ['room-a']))),
    });
    const repository = createDraftStoreRepository(storage);

    assert.equal(
      await repository.commitRoomScan({
        draftId: 'missing',
        roomId: 'room-a',
        artifact: artifact(100),
      }),
      null
    );
    assert.equal(
      await repository.commitRoomScan({
        draftId: 'a',
        roomId: 'missing',
        artifact: artifact(100),
      }),
      null
    );
  });

  it('replaces a rescan and does not double-count its measurement', async () => {
    const existing = draft('a', ['living', 'kitchen']);
    existing.rooms[0] = {
      ...existing.rooms[0],
      scanned: true,
      scanArtifact: artifact(100),
      measuredSqftFromScan: 100,
    };
    existing.rooms[1] = {
      ...existing.rooms[1],
      scanned: true,
      scanArtifact: artifact(80, {
        scanId: 'scan-2',
        jsonPath: '/scan/Kitchen.json',
        usdzPath: '/scan/Kitchen.usdz',
      }),
      measuredSqftFromScan: 80,
    };
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(existing)),
    });
    const repository = createDraftStoreRepository(storage);
    const replacement = artifact(120, {
      scanId: 'scan-3',
      jsonPath: '/scan/Living-2.json',
      usdzPath: '/scan/Living-2.usdz',
    });

    const committed = await repository.commitRoomScan({
      draftId: 'a',
      roomId: 'living',
      artifact: replacement,
    });

    assert.deepEqual(committed?.replaced, artifact(100));
    assert.deepEqual(
      committed?.store.drafts.a.rooms[0].scanArtifact,
      replacement
    );
    assert.equal(committed?.store.drafts.a.measuredSqftFromScan, 200);
    assert.equal(committed?.store.drafts.a.verificationStatus, 'unverified');
    assert.equal(committed?.store.drafts.a.completedAt, undefined);
  });

  it('rejects artifacts that cannot safely verify the room', async () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(draft('a', ['room-a']))),
    });
    const repository = createDraftStoreRepository(storage);
    const invalidArtifacts: RoomScanArtifact[] = [
      artifact(0),
      artifact(2_000.01),
      artifact(100, { scanId: '../unsafe' }),
      artifact(100, { jsonPath: '/scan/../Room.json' }),
      artifact(100, { usdzPath: '/scan/../Room.usdz' }),
      artifact(100, { capturedAt: '2026-08-11T20:00:00-04:00' }),
      artifact(100, { source: 'wall-estimate' }),
    ];

    for (const invalidArtifact of invalidArtifacts) {
      assert.equal(
        await repository.commitRoomScan({
          draftId: 'a',
          roomId: 'room-a',
          artifact: invalidArtifact,
        }),
        null
      );
    }

    const saved = await repository.loadDraftStore();
    assert.equal(saved.drafts.a.rooms[0].scanArtifact, undefined);
    assert.equal(saved.drafts.a.rooms[0].scanned, false);
  });
});
