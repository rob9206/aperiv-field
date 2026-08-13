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
    beforeGet?: (key: string) => Promise<void> | void;
    beforeSet?: (key: string, value: string) => Promise<void> | void;
    beforeRemove?: (key: string) => Promise<void> | void;
  } = {}
): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map(Object.entries(initial));
  return {
    values,
    async getItem(key) {
      await hooks.beforeGet?.(key);
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

  it('continues processing after a queued read rejects', async () => {
    let rejectNextRead = true;
    const storage = memoryStorage(
      { [STORE_KEY]: JSON.stringify(store(draft('a'))) },
      {
        beforeGet(key) {
          if (key === STORE_KEY && rejectNextRead) {
            rejectNextRead = false;
            throw new Error('read failed');
          }
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    await assert.rejects(repository.loadDraftStore(), /read failed/);
    const committed = await repository.mutateDraftById('a', (current) => ({
      draft: { ...current, unit: 'recovered' },
      value: 'ok',
    }));

    assert.equal(committed?.value, 'ok');
    assert.equal(committed?.store.drafts.a.unit, 'recovered');
  });

  it('continues processing after a backup write rejects', async () => {
    let rejectNextBackup = true;
    const storage = memoryStorage(
      { [STORE_KEY]: '{corrupt' },
      {
        beforeSet(key) {
          if (key === STORE_BACKUP_KEY && rejectNextBackup) {
            rejectNextBackup = false;
            throw new Error('backup failed');
          }
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    await assert.rejects(repository.loadDraftStore(), /backup failed/);
    const committed = await repository.mutateDraftStore(() => ({
      store: store(draft('recovered')),
      value: 'ok',
    }));

    assert.equal(committed?.value, 'ok');
    assert.equal(committed?.store.drafts.recovered.unit, 'recovered');
    assert.equal(storage.values.get(STORE_BACKUP_KEY), '{corrupt');
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

  it('backs up a v2 payload before a mutation writes its salvaged subset', async () => {
    const raw = JSON.stringify({
      activeDraftId: 'invalid',
      drafts: {
        valid: draft('valid'),
        invalid: { id: 'invalid', unit: '2B' },
      },
    });
    const storage = memoryStorage({ [STORE_KEY]: raw });
    const repository = createDraftStoreRepository(storage);

    const committed = await repository.mutateDraftById('valid', (current) => ({
      draft: { ...current, unit: 'saved' },
      value: undefined,
    }));

    assert.equal(storage.values.get(STORE_BACKUP_KEY), raw);
    assert.deepEqual(Object.keys(committed!.store.drafts), ['valid']);
    assert.equal(committed!.store.drafts.valid.unit, 'saved');
  });
});

describe('draft store cleanup trust state', () => {
  it('marks unreadable v2 metadata degraded and recovery-pending', async () => {
    const storage = memoryStorage({ [STORE_KEY]: '{corrupt' });
    const repository = createDraftStoreRepository(storage);

    const state = await repository.loadDraftStoreState();

    assert.equal(state.degraded, true);
    assert.equal(state.recoveryPending, true);
    assert.equal(storage.values.get(STORE_BACKUP_KEY), '{corrupt');
  });

  it('marks normalization that prunes any draft as degraded', async () => {
    const raw = JSON.stringify({
      activeDraftId: 'valid',
      drafts: {
        valid: draft('valid'),
        pruned: { id: 'pruned', unit: '2B' },
      },
    });
    const storage = memoryStorage({ [STORE_KEY]: raw });
    const repository = createDraftStoreRepository(storage);

    const state = await repository.loadDraftStoreState();

    assert.equal(state.degraded, true);
    assert.equal(state.recoveryPending, true);
    assert.deepEqual(Object.keys(state.store.drafts), ['valid']);
    assert.equal(storage.values.get(STORE_BACKUP_KEY), raw);
  });

  it('keeps cleanup recovery-pending after a later normalized mutation', async () => {
    const storage = memoryStorage({ [STORE_KEY]: '{corrupt' });
    const repository = createDraftStoreRepository(storage);

    await repository.mutateDraftStore(() => ({
      store: store(draft('replacement')),
      value: undefined,
    }));
    const state = await repository.loadDraftStoreState();

    assert.equal(state.degraded, false);
    assert.equal(state.recoveryPending, true);
    assert.equal(storage.values.get(STORE_BACKUP_KEY), '{corrupt');
  });

  it('allows cleanup only for normalized metadata with no recovery backup', async () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(draft('trusted'))),
    });
    const repository = createDraftStoreRepository(storage);

    const state = await repository.loadDraftStoreState();

    assert.equal(state.degraded, false);
    assert.equal(state.recoveryPending, false);
  });
});

describe('commitRoomScan', () => {
  it('never assigns a late scan to the newly active room', async () => {
    const initial = store(
      draft('draft-a', ['room-a']),
      draft('draft-b', ['room-b'])
    );
    initial.activeDraftId = 'draft-b';
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(initial),
    });
    const repository = createDraftStoreRepository(storage);
    const scanArtifact = artifact(100);

    const result = await repository.commitRoomScan({
      draftId: 'draft-a',
      roomId: 'room-a',
      artifact: scanArtifact,
    });

    assert.deepEqual(
      result?.store.drafts['draft-a'].rooms[0].scanArtifact,
      scanArtifact
    );
    assert.equal(
      result?.store.drafts['draft-b'].rooms[0].scanArtifact,
      undefined
    );
  });

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

  it('does not replace live files when the same artifact paths are recommitted', async () => {
    const existing = draft('a', ['living']);
    existing.rooms[0] = {
      ...existing.rooms[0],
      scanned: true,
      scanArtifact: artifact(100),
      measuredSqftFromScan: 100,
    };
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(existing)),
    });
    const repository = createDraftStoreRepository(storage);

    const committed = await repository.commitRoomScan({
      draftId: 'a',
      roomId: 'living',
      artifact: artifact(100),
    });

    assert.ok(committed);
    assert.equal(committed.replaced, undefined);
    assert.deepEqual(
      committed.store.drafts.a.rooms[0].scanArtifact,
      artifact(100)
    );
  });

  it('rejects artifacts that cannot safely verify the room', async () => {
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(draft('a', ['room-a']))),
    });
    const repository = createDraftStoreRepository(storage);
    const invalidArtifacts: {
      caseName: string;
      artifact: RoomScanArtifact;
    }[] = [
      { caseName: 'zero square feet', artifact: artifact(0) },
      { caseName: 'over 2,000 square feet', artifact: artifact(2_000.01) },
      {
        caseName: 'unsafe scan ID',
        artifact: artifact(100, { scanId: '../unsafe' }),
      },
      {
        caseName: 'unsafe JSON path',
        artifact: artifact(100, { jsonPath: '/scan/../Room.json' }),
      },
      {
        caseName: 'unsafe USDZ path',
        artifact: artifact(100, { usdzPath: '/scan/../Room.usdz' }),
      },
      {
        caseName: 'noncanonical capture time',
        artifact: artifact(100, {
          capturedAt: '2026-08-11T20:00:00-04:00',
        }),
      },
      {
        caseName: 'non-verifying source',
        artifact: artifact(100, { source: 'wall-estimate' }),
      },
    ];

    for (const invalidArtifact of invalidArtifacts) {
      assert.equal(
        await repository.commitRoomScan({
          draftId: 'a',
          roomId: 'room-a',
          artifact: invalidArtifact.artifact,
        }),
        null,
        invalidArtifact.caseName
      );
    }

    const saved = await repository.loadDraftStore();
    assert.equal(saved.drafts.a.rooms[0].scanArtifact, undefined);
    assert.equal(saved.drafts.a.rooms[0].scanned, false);
  });

  it('rejects artifact identities already committed to another room', async () => {
    const existing = draft('a', ['living', 'kitchen']);
    existing.rooms[0] = {
      ...existing.rooms[0],
      scanned: true,
      scanArtifact: artifact(100),
      measuredSqftFromScan: 100,
    };
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(existing)),
    });
    const repository = createDraftStoreRepository(storage);

    assert.equal(
      await repository.commitRoomScan({
        draftId: 'a',
        roomId: 'kitchen',
        artifact: artifact(80, {
          jsonPath: '/scan/Kitchen.json',
          usdzPath: '/scan/Kitchen.usdz',
        }),
      }),
      null
    );
    assert.equal(
      await repository.commitRoomScan({
        draftId: 'a',
        roomId: 'kitchen',
        artifact: artifact(80, {
          scanId: 'scan-2',
          usdzPath: '/scan/Kitchen.usdz',
        }),
      }),
      null
    );
    assert.equal(
      await repository.commitRoomScan({
        draftId: 'a',
        roomId: 'kitchen',
        artifact: artifact(80, {
          scanId: 'scan-2',
          jsonPath: '/scan/Kitchen.json',
        }),
      }),
      null
    );

    const saved = await repository.loadDraftStore();
    assert.equal(saved.drafts.a.rooms[1].scanArtifact, undefined);
  });
});

describe('completeDraft', () => {
  it('persists completion before returning the committed store', async () => {
    const current = draft('a', ['living']);
    current.rooms[0] = {
      ...current.rooms[0],
      scanned: true,
      scanArtifact: artifact(100),
      measuredSqftFromScan: 100,
    };
    const storage = memoryStorage({
      [STORE_KEY]: JSON.stringify(store(current)),
    });
    const repository = createDraftStoreRepository(storage);

    const committed = await repository.completeDraft({
      draftId: 'a',
      requestedStatus: 'verified',
    });

    assert.ok(committed);
    assert.equal(committed.store.drafts.a.verificationStatus, 'verified');
    assert.ok(committed.store.drafts.a.completedAt);
    assert.equal(committed.store.drafts.a.measuredSqftFromScan, 100);
    assert.deepEqual(
      JSON.parse(storage.values.get(STORE_KEY)!),
      committed.store
    );
  });

  it('does not expose saved completion when persistence rejects', async () => {
    const current = draft('a');
    const storage = memoryStorage(
      { [STORE_KEY]: JSON.stringify(store(current)) },
      {
        beforeSet() {
          throw new Error('write failed');
        },
      }
    );
    const repository = createDraftStoreRepository(storage);

    await assert.rejects(
      repository.completeDraft({
        draftId: 'a',
        requestedStatus: 'unverified',
      }),
      /write failed/
    );
    assert.equal(
      JSON.parse(storage.values.get(STORE_KEY)!).drafts.a.completedAt,
      undefined
    );
  });
});
