import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  capturePathsForDraft,
  createCaptureFileLifecycle,
  createCaptureFileService,
  planOrphanSweep,
  planUnreferencedCapturePaths,
  scanPathsForDraft,
  type CaptureFileAdapter,
  type CaptureFileEntry,
} from './capture-files.ts';
import {
  STORE_BACKUP_KEY,
  STORE_KEY,
  createDraftStoreRepository,
  type KeyValueStorage,
} from './draft-store.ts';
import type {
  DraftStore,
  ManualWalkthroughDraft,
  RoomPhoto,
  RoomScanArtifact,
} from './walkthrough-draft.ts';

const capturedAt = '2026-08-12T00:00:00.000Z';
const scansRoot = 'file:///documents/scans';
const photosRoot = 'file:///documents/walkthrough-photos';

function artifact(
  scanId: string,
  overrides: Partial<RoomScanArtifact> = {}
): RoomScanArtifact {
  return {
    scanId,
    jsonPath: `/documents/scans/${scanId}/Room.json`,
    usdzPath: `/documents/scans/${scanId}/Room.usdz`,
    measuredSqft: 100,
    source: 'roomplan-floor-polygon',
    capturedAt,
    ...overrides,
  };
}

function photo(id: string, uri = `${photosRoot}/draft-a/${id}.jpg`): RoomPhoto {
  return { id, uri };
}

function draft(id = 'draft-a'): ManualWalkthroughDraft {
  return {
    id,
    property: 'Oak',
    unit: '1A',
    recordedSqft: '1000',
    rooms: [
      {
        id: 'living',
        name: 'Living',
        sqft: '',
        condition: 'good',
        photos: [],
        notes: '',
        scanned: false,
      },
      {
        id: 'kitchen',
        name: 'Kitchen',
        sqft: '',
        condition: 'good',
        photos: [],
        notes: '',
        scanned: false,
      },
    ],
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

describe('saved files after an iOS app update', () => {
  it('keeps referenced scans and photos when the container UUID changes', () => {
    const oldDocuments = '/var/mobile/Containers/Data/Application/11111111-1111-1111-1111-111111111111/Documents';
    const currentDocuments = 'file:///var/mobile/Containers/Data/Application/22222222-2222-2222-2222-222222222222/Documents';
    const saved = draft();
    saved.rooms[0].scanArtifact = artifact('saved-scan', {
      jsonPath: `${oldDocuments}/scans/saved-scan/Room.json`,
      usdzPath: `${oldDocuments}/scans/saved-scan/Room.usdz`,
    });
    saved.rooms[0].photos = [photo('saved-photo', `file://${oldDocuments}/walkthrough-photos/draft-a/saved-photo.jpg`)];
    const roots = { scans: `${currentDocuments}/scans`, photos: `${currentDocuments}/walkthrough-photos` };
    const actual: CaptureFileEntry[] = [
      { kind: 'directory', uri: `${roots.scans}/saved-scan` },
      { kind: 'file', uri: `${roots.scans}/saved-scan/Room.json` },
      { kind: 'file', uri: `${roots.scans}/saved-scan/Room.usdz` },
      { kind: 'directory', uri: `${roots.photos}/draft-a` },
      { kind: 'file', uri: `${roots.photos}/draft-a/saved-photo.jpg` },
    ];
    assert.deepEqual(planOrphanSweep(store(saved), roots, actual), {
      deleteFiles: [], deleteDirectories: [],
    });
    assert.deepEqual(planUnreferencedCapturePaths(actual.filter(x => x.kind === 'file').map(x => x.uri), store(saved), roots), []);
  });
});

function memoryStorage(
  initial: DraftStore,
  hooks: { beforeSet?: () => void } = {}
): KeyValueStorage & { values: Map<string, string> } {
  const values = new Map([[STORE_KEY, JSON.stringify(initial)]]);
  return {
    values,
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      hooks.beforeSet?.();
      values.set(key, value);
    },
    async removeItem(key) {
      values.delete(key);
    },
  };
}

function fakeAdapter(options: {
  enabled?: boolean;
  events?: string[];
  entries?: Partial<Record<'scans' | 'photos', CaptureFileEntry[]>>;
  rootTouches?: string[];
  listTouches?: string[];
  throwOnCopyNumber?: number;
  throwOnDelete?: boolean;
} = {}): CaptureFileAdapter {
  let photoNumber = 0;
  return {
    enabled: options.enabled ?? true,
    getRoots() {
      options.rootTouches?.push('roots');
      return { scans: scansRoot, photos: photosRoot };
    },
    copyPhoto(draftId, sourceUri) {
      photoNumber += 1;
      if (photoNumber === options.throwOnCopyNumber) {
        throw new Error('copy failed');
      }
      const copied = {
        id: `copied-${photoNumber}`,
        uri: `${photosRoot}/${draftId}/copied-${photoNumber}.jpg`,
      };
      options.events?.push(`copy:${sourceUri}->${copied.uri}`);
      return copied;
    },
    deleteFile(uri) {
      options.events?.push(`delete-file:${uri}`);
      if (options.throwOnDelete) {
        throw new Error('delete failed');
      }
    },
    deleteDirectory(uri) {
      options.events?.push(`delete-directory:${uri}`);
      if (options.throwOnDelete) {
        throw new Error('delete failed');
      }
    },
    listEntries(root) {
      options.listTouches?.push(root);
      return root === scansRoot
        ? (options.entries?.scans ?? [])
        : (options.entries?.photos ?? []);
    },
  };
}

describe('capture path planning', () => {
  it('collects both files from every room scan artifact', () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('scan-1');
    current.rooms[1].scanArtifact = artifact('scan-2');

    assert.deepEqual(scanPathsForDraft(current), [
      '/documents/scans/scan-1/Room.json',
      '/documents/scans/scan-1/Room.usdz',
      '/documents/scans/scan-2/Room.json',
      '/documents/scans/scan-2/Room.usdz',
    ]);
  });

  it('collects photos and scan files without dropping re-keyed photo paths', () => {
    const current = draft();
    current.rooms[0].photos = [
      photo('one', `${photosRoot}/old-draft-key/one.jpg`),
    ];
    current.rooms[0].scanArtifact = artifact('scan-1');

    assert.deepEqual(capturePathsForDraft(current), [
      `${photosRoot}/old-draft-key/one.jpg`,
      '/documents/scans/scan-1/Room.json',
      '/documents/scans/scan-1/Room.usdz',
    ]);
  });

  it('plans failed-export cleanup only for unreferenced owned paths', () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('live');
    const committed = store(current);

    assert.deepEqual(
      planUnreferencedCapturePaths(
        [
          '/documents/scans/live/Room.json',
          'file:///documents/scans/orphan/Room.json',
          'file:///documents/scans/%2e%2e/outside.txt',
          'file:///private/not-owned.txt',
        ],
        committed,
        { scans: scansRoot, photos: photosRoot }
      ),
      ['file:///documents/scans/orphan/Room.json']
    );
  });

  it('retains same-path and cross-room references after replacement', () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('new', {
      jsonPath: '/documents/scans/old/Room.json',
    });
    current.rooms[1].scanArtifact = artifact('shared', {
      jsonPath: '/documents/scans/shared/Room.json',
      usdzPath: '/documents/scans/old/Room.usdz',
    });

    assert.deepEqual(
      planUnreferencedCapturePaths(
        [
          'file:///documents/scans/old/Room.json',
          '/documents/scans/old/Room.usdz',
          '/documents/scans/old/Preview.png',
        ],
        store(current),
        { scans: scansRoot, photos: photosRoot }
      ),
      ['/documents/scans/old/Preview.png']
    );
  });
});

describe('capture service runtime safety', () => {
  it('never constructs roots, lists, or deletes when disabled on web', () => {
    const rootTouches: string[] = [];
    const listTouches: string[] = [];
    const events: string[] = [];
    const service = createCaptureFileService(
      fakeAdapter({
        enabled: false,
        events,
        rootTouches,
        listTouches,
      })
    );

    service.deleteUnreferenced(
      [`${scansRoot}/legacy/Room.json`],
      store()
    );
    service.sweepOrphans(store());

    assert.deepEqual(rootTouches, []);
    assert.deepEqual(listTouches, []);
    assert.deepEqual(events, []);
  });

  it('does not expose direct-delete methods that bypass committed truth', () => {
    const service = createCaptureFileService(fakeAdapter());

    assert.equal('deleteLocalFile' in service, false);
    assert.equal('deleteScanArtifactFiles' in service, false);
    assert.equal('deleteDraftCaptureFiles' in service, false);
  });
});

describe('transactional photo lifecycle', () => {
  it('reloads committed truth before compensating a partial copy failure', async () => {
    const current = draft();
    current.rooms[1].photos = [
      photo('shared-copy', `${photosRoot}/draft-a/copied-1.jpg`),
    ];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(
        fakeAdapter({ events, throwOnCopyNumber: 2 })
      )
    );

    await assert.rejects(
      lifecycle.addPhotos({
        draftId: current.id,
        roomId: 'living',
        sourceUris: [
          'file:///picker/first.jpg',
          'file:///picker/second.jpg',
        ],
      }),
      /copy failed/
    );

    assert.deepEqual(events, [
      `copy:file:///picker/first.jpg->${photosRoot}/draft-a/copied-1.jpg`,
    ]);
  });

  it('deletes copied photos when the metadata commit rejects', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('existing')];
    let failNextWrite = true;
    const storage = memoryStorage(store(current), {
      beforeSet() {
        if (failNextWrite) {
          failNextWrite = false;
          throw new Error('disk full');
        }
      },
    });
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(fakeAdapter({ events }))
    );

    await assert.rejects(
      lifecycle.addPhotos({
        draftId: current.id,
        roomId: 'living',
        sourceUris: ['file:///picker/new.jpg'],
      }),
      /disk full/
    );

    const saved = await lifecycle.loadDraftStore();
    assert.deepEqual(saved.drafts[current.id].rooms[0].photos, [
      photo('existing'),
    ]);
    assert.deepEqual(events, [
      `copy:file:///picker/new.jpg->${photosRoot}/draft-a/copied-1.jpg`,
      `delete-file:${photosRoot}/draft-a/copied-1.jpg`,
    ]);
  });

  it('deletes copied photos when a missing room makes the commit null', async () => {
    const current = draft();
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(fakeAdapter({ events }))
    );

    const committed = await lifecycle.addPhotos({
      draftId: current.id,
      roomId: 'missing',
      sourceUris: ['file:///picker/new.jpg'],
    });

    assert.equal(committed, null);
    assert.deepEqual(events.slice(-1), [
      `delete-file:${photosRoot}/draft-a/copied-1.jpg`,
    ]);
  });

  it('commits photo removal before deleting the removed file', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    const events: string[] = [];
    const storage = memoryStorage(store(current), {
      beforeSet() {
        events.push('commit');
      },
    });
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(fakeAdapter({ events }))
    );

    const committed = await lifecycle.removePhoto({
      draftId: current.id,
      roomId: 'living',
      photoId: 'one',
    });

    assert.ok(committed);
    assert.deepEqual(events, [
      'commit',
      `delete-file:${photosRoot}/draft-a/one.jpg`,
    ]);
    assert.equal(committed.store.drafts[current.id].rooms[0].photos.length, 0);
  });

  it('keeps metadata and the file when a photo removal commit fails', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(
        memoryStorage(store(current), {
          beforeSet() {
            events.push('commit');
            throw new Error('write failed');
          },
        })
      ),
      createCaptureFileService(fakeAdapter({ events }))
    );

    await assert.rejects(
      lifecycle.removePhoto({
        draftId: current.id,
        roomId: 'living',
        photoId: 'one',
      }),
      /write failed/
    );

    const saved = JSON.parse(
      (
        await lifecycle.loadDraftStore()
      ).drafts[current.id].rooms[0].photos.length.toString()
    );
    assert.equal(saved, 1);
    assert.deepEqual(events, ['commit']);
  });

  it('does not fail committed metadata when post-commit deletion throws', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(fakeAdapter({ throwOnDelete: true }))
    );

    const committed = await lifecycle.removePhoto({
      draftId: current.id,
      roomId: 'living',
      photoId: 'one',
    });

    assert.ok(committed);
    assert.equal(committed.store.drafts[current.id].rooms[0].photos.length, 0);
  });
});

describe('transactional draft and scan lifecycle', () => {
  it('commits draft deletion, returns the draft, then deletes its captures', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    current.rooms[0].scanArtifact = artifact('scan-1');
    const events: string[] = [];
    const storage = memoryStorage(store(current), {
      beforeSet() {
        events.push('commit');
      },
    });
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(fakeAdapter({ events }))
    );

    const committed = await lifecycle.deleteDraft(current.id);

    assert.equal(committed?.deleted.id, current.id);
    assert.deepEqual(events, [
      'commit',
      `delete-file:${photosRoot}/draft-a/one.jpg`,
      'delete-file:/documents/scans/scan-1/Room.json',
      'delete-file:/documents/scans/scan-1/Room.usdz',
    ]);
    assert.deepEqual(committed?.store.drafts, {});
  });

  it('keeps all files when draft deletion does not commit', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(
        memoryStorage(store(current), {
          beforeSet() {
            events.push('commit');
            throw new Error('write failed');
          },
        })
      ),
      createCaptureFileService(fakeAdapter({ events }))
    );

    await assert.rejects(lifecycle.deleteDraft(current.id), /write failed/);
    assert.deepEqual(events, ['commit']);
  });

  it('deletes replaced scan paths only after replacement metadata commits', async () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('old');
    current.rooms[0].scanned = true;
    const events: string[] = [];
    const storage = memoryStorage(store(current), {
      beforeSet() {
        events.push('commit');
      },
    });
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(fakeAdapter({ events }))
    );

    const committed = await lifecycle.commitRoomScan({
      draftId: current.id,
      roomId: 'living',
      artifact: artifact('new'),
    });

    assert.ok(committed);
    assert.deepEqual(events, [
      'commit',
      'delete-file:/documents/scans/old/Room.json',
      'delete-file:/documents/scans/old/Room.usdz',
    ]);
    assert.equal(
      committed.store.drafts[current.id].rooms[0].scanArtifact?.scanId,
      'new'
    );
  });

  it('cleans a rejected scan commit but retains any path metadata references', async () => {
    const current = draft();
    current.rooms[1].scanArtifact = artifact('existing', {
      jsonPath: '/documents/scans/new/Room.json',
    });
    current.rooms[1].scanned = true;
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(fakeAdapter({ events }))
    );

    const committed = await lifecycle.commitRoomScan({
      draftId: current.id,
      roomId: 'missing',
      artifact: artifact('new'),
    });

    assert.equal(committed, null);
    assert.deepEqual(events, [
      'delete-file:/documents/scans/new/Room.usdz',
    ]);
  });

  it('cleans newly exported paths when scan persistence throws', async () => {
    const current = draft();
    let failNextWrite = true;
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(
        memoryStorage(store(current), {
          beforeSet() {
            if (failNextWrite) {
              failNextWrite = false;
              throw new Error('disk full');
            }
          },
        })
      ),
      createCaptureFileService(fakeAdapter({ events }))
    );

    await assert.rejects(
      lifecycle.commitRoomScan({
        draftId: current.id,
        roomId: 'living',
        artifact: artifact('new'),
      }),
      /disk full/
    );

    assert.deepEqual(events, [
      'delete-file:/documents/scans/new/Room.json',
      'delete-file:/documents/scans/new/Room.usdz',
    ]);
  });

  it('plans parse and route-unmount export cleanup from committed truth', async () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('live');
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(fakeAdapter({ events }))
    );

    await lifecycle.cleanupExportedScanPaths({
      jsonPath: '/documents/scans/live/Room.json',
      usdzPath: '/documents/scans/orphan/Room.usdz',
    });
    await lifecycle.cleanupExportedScanPaths({
      jsonPath: '/documents/scans/orphan/Room.usdz',
      usdzPath: '/documents/scans/orphan/Room.usdz',
    });

    assert.deepEqual(events, [
      'delete-file:/documents/scans/orphan/Room.usdz',
      'delete-file:/documents/scans/orphan/Room.usdz',
      'delete-file:/documents/scans/orphan/Room.usdz',
    ]);
  });
});

describe('directory orphan recovery', () => {
  it('sweeps every unreferenced scan and re-keyed photo directory', () => {
    const current = draft();
    current.rooms[0].scanArtifact = artifact('live');
    current.rooms[0].photos = [
      photo('live', `${photosRoot}/old-draft-key/live.jpg`),
    ];
    const actual: CaptureFileEntry[] = [
      { kind: 'directory', uri: `${scansRoot}/live` },
      { kind: 'file', uri: `${scansRoot}/live/Room.json` },
      { kind: 'file', uri: `${scansRoot}/live/Room.usdz` },
      { kind: 'file', uri: `${scansRoot}/live/untracked.tmp` },
      { kind: 'directory', uri: `${scansRoot}/abandoned` },
      { kind: 'file', uri: `${scansRoot}/abandoned/Room.json` },
      { kind: 'file', uri: `${scansRoot}/abandoned/Room.usdz` },
      { kind: 'directory', uri: `${photosRoot}/old-draft-key` },
      { kind: 'file', uri: `${photosRoot}/old-draft-key/live.jpg` },
      { kind: 'directory', uri: `${photosRoot}/re-keyed-orphan` },
      { kind: 'file', uri: `${photosRoot}/re-keyed-orphan/lost.jpg` },
    ];

    assert.deepEqual(
      planOrphanSweep(
        store(current),
        { scans: scansRoot, photos: photosRoot },
        actual
      ),
      {
        deleteFiles: [
          `${scansRoot}/live/untracked.tmp`,
          `${scansRoot}/abandoned/Room.json`,
          `${scansRoot}/abandoned/Room.usdz`,
          `${photosRoot}/re-keyed-orphan/lost.jpg`,
        ],
        deleteDirectories: [
          `${scansRoot}/abandoned`,
          `${photosRoot}/re-keyed-orphan`,
        ],
      }
    );
  });

  it('never plans deletion outside owned roots or of an owned root itself', () => {
    const actual: CaptureFileEntry[] = [
      { kind: 'directory', uri: scansRoot },
      { kind: 'directory', uri: photosRoot },
      { kind: 'file', uri: 'file:///documents/scans-archive/Room.json' },
      { kind: 'file', uri: 'file:///documents/private/photo.jpg' },
      { kind: 'file', uri: 'file:///documents/scans/%2e%2e/private.txt' },
      { kind: 'file', uri: 'https://example.com/not-local.jpg' },
    ];

    assert.deepEqual(
      planOrphanSweep(
        store(),
        { scans: scansRoot, photos: photosRoot },
        actual
      ),
      { deleteFiles: [], deleteDirectories: [] }
    );
  });

  it('policy B deletes pre-existing unlinked files on the first trusted sweep', async () => {
    const events: string[] = [];
    const listTouches: string[] = [];
    const adapter = fakeAdapter({
      events,
      listTouches,
      entries: {
        scans: [
          { kind: 'directory', uri: `${scansRoot}/lost` },
          { kind: 'file', uri: `${scansRoot}/lost/Room.json` },
        ],
        photos: [
          { kind: 'directory', uri: `${photosRoot}/lost` },
          { kind: 'file', uri: `${photosRoot}/lost/photo.jpg` },
        ],
      },
    });
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store())),
      createCaptureFileService(adapter)
    );

    await lifecycle.sweepOrphans();
    await lifecycle.sweepOrphans();

    assert.deepEqual(events, [
      `delete-file:${scansRoot}/lost/Room.json`,
      `delete-file:${photosRoot}/lost/photo.jpg`,
      `delete-directory:${scansRoot}/lost`,
      `delete-directory:${photosRoot}/lost`,
    ]);
    assert.deepEqual(listTouches, [scansRoot, photosRoot]);
  });

  it('does not construct roots or list files while recovery is pending', async () => {
    const storage = memoryStorage(store());
    storage.values.set(STORE_BACKUP_KEY, '{"drafts":{"held":{}}}');
    const rootTouches: string[] = [];
    const listTouches: string[] = [];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(
        fakeAdapter({ events, rootTouches, listTouches })
      )
    );

    await lifecycle.sweepOrphans({ force: true });

    assert.deepEqual(rootTouches, []);
    assert.deepEqual(listTouches, []);
    assert.deepEqual(events, []);
  });

  it('blocks targeted cleanup and orphan sweeping for a degraded current read', async () => {
    const storage = memoryStorage(store());
    storage.values.set(STORE_KEY, '{corrupt');
    const rootTouches: string[] = [];
    const listTouches: string[] = [];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(
        fakeAdapter({ events, rootTouches, listTouches })
      )
    );

    await lifecycle.cleanupExportedScanPaths({
      jsonPath: `${scansRoot}/failed/Room.json`,
      usdzPath: `${scansRoot}/failed/Room.usdz`,
    });
    const swept = await lifecycle.sweepOrphans({ force: true });

    assert.equal(swept, false);
    assert.deepEqual(rootTouches, []);
    assert.deepEqual(listTouches, []);
    assert.deepEqual(events, []);
  });

  it('allows targeted cleanup but blocks broad sweeping for historical recovery', async () => {
    const storage = memoryStorage(store());
    storage.values.set(STORE_BACKUP_KEY, '{"drafts":{"held":{}}}');
    const rootTouches: string[] = [];
    const listTouches: string[] = [];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(storage),
      createCaptureFileService(
        fakeAdapter({ events, rootTouches, listTouches })
      )
    );

    await lifecycle.cleanupExportedScanPaths({
      jsonPath: `${scansRoot}/failed/Room.json`,
      usdzPath: `${scansRoot}/failed/Room.usdz`,
    });
    const swept = await lifecycle.sweepOrphans({ force: true });

    assert.equal(swept, false);
    assert.deepEqual(rootTouches, ['roots']);
    assert.deepEqual(listTouches, []);
    assert.deepEqual(events, [
      `delete-file:${scansRoot}/failed/Room.json`,
      `delete-file:${scansRoot}/failed/Room.usdz`,
    ]);
  });

  it('forces a trusted sweep after deletion to remove empty owned directories', async () => {
    const current = draft();
    current.rooms[0].photos = [photo('one')];
    current.rooms[0].scanArtifact = artifact('scan-1');
    const listTouches: string[] = [];
    const events: string[] = [];
    const lifecycle = createCaptureFileLifecycle(
      createDraftStoreRepository(memoryStorage(store(current))),
      createCaptureFileService(
        fakeAdapter({
          events,
          listTouches,
          entries: {
            scans: [
              { kind: 'directory', uri: `${scansRoot}/scan-1` },
              { kind: 'file', uri: `${scansRoot}/scan-1/Room.json` },
              { kind: 'file', uri: `${scansRoot}/scan-1/Room.usdz` },
            ],
            photos: [
              { kind: 'directory', uri: `${photosRoot}/draft-a` },
              { kind: 'file', uri: `${photosRoot}/draft-a/one.jpg` },
            ],
          },
        })
      )
    );

    await lifecycle.sweepOrphans();
    const committed = await lifecycle.deleteDraft(current.id);

    assert.ok(committed);
    assert.deepEqual(listTouches, [
      scansRoot,
      photosRoot,
      scansRoot,
      photosRoot,
    ]);
    assert.equal(
      events.includes(`delete-directory:${scansRoot}/scan-1`),
      true
    );
    assert.equal(
      events.includes(`delete-directory:${photosRoot}/draft-a`),
      true
    );
  });
});
