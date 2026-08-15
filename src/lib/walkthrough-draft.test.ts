import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isValidDraftStore,
  parseDraftStoreRaw,
} from './draft-store-parse.ts';
import {
  draftCanBeVerified,
  legacyCompatibilitySqft,
  roomHasVerifiedScan,
  scanMeasuredSqft,
  type RoomScanArtifact,
} from './walkthrough-schema.ts';

const createRoom = (name: string) => ({
  id: `room-${name}`,
  name,
  sqft: '',
  condition: 'good' as const,
  photos: [],
  notes: '',
  scanned: false,
});

const createDraft = (
  property: string,
  unit: string,
  recordedSqft: string,
  roomNames: string[]
) => ({
  id: 'draft-1',
  property,
  unit,
  recordedSqft,
  rooms: roomNames.map(createRoom),
  findings: [],
  createdAt: '2026-08-12T00:00:00.000Z',
});

describe('isValidDraftStore', () => {
  it('rejects drafts: null', () => {
    assert.equal(
      isValidDraftStore({ activeDraftId: null, drafts: null }),
      false
    );
  });

  it('rejects arrays and non-objects', () => {
    assert.equal(isValidDraftStore(null), false);
    assert.equal(isValidDraftStore([]), false);
    assert.equal(isValidDraftStore({ activeDraftId: null, drafts: [] }), false);
  });

  it('accepts a plain drafts object', () => {
    assert.equal(
      isValidDraftStore({ activeDraftId: null, drafts: {} }),
      true
    );
  });
});

describe('parseDraftStoreRaw', () => {
  it('returns null for corrupt JSON so callers can try legacy', () => {
    assert.equal(parseDraftStoreRaw('{'), null);
    assert.equal(parseDraftStoreRaw('not-json'), null);
  });

  it('returns null for drafts: null payloads', () => {
    assert.equal(
      parseDraftStoreRaw(JSON.stringify({ activeDraftId: 'x', drafts: null })),
      null
    );
  });

  it('returns a valid v2 store', () => {
    const store = {
      activeDraftId: 'draft-1',
      drafts: {
        'draft-1': {
          id: 'draft-1',
          property: 'Oak',
          unit: '12B',
        },
      },
    };
    assert.deepEqual(parseDraftStoreRaw(JSON.stringify(store)), store);
  });

  it('keeps stores with a missing active draft ID recoverable', () => {
    const store = { drafts: {} };
    assert.deepEqual(parseDraftStoreRaw(JSON.stringify(store)), store);
  });
});

describe('room detail edits', () => {
  it('preserves an explicit room skip across notes, condition, and part edits', async () => {
    const modulePath = './room-details.ts';
    const walkthrough = await import(modulePath).catch(() => ({}));
    const patchRoomDetails = (
      walkthrough as unknown as {
        patchRoomDetails?: (
          room: ReturnType<typeof createRoom> & {
            skipped?: boolean;
            issueParts?: string[];
            hasDamage?: boolean;
          },
          patch: Record<string, unknown>
        ) => ReturnType<typeof createRoom> & {
          skipped?: boolean;
          issueParts?: string[];
          hasDamage?: boolean;
        };
      }
    ).patchRoomDetails;
    assert.equal(typeof patchRoomDetails, 'function');
    if (!patchRoomDetails) {
      return;
    }

    const skipped = {
      ...createRoom('Living'),
      skipped: true,
      issueParts: ['paint'],
      hasDamage: true,
    };
    assert.equal(
      patchRoomDetails(skipped, { notes: 'Touch up trim' }).skipped,
      true
    );
    assert.equal(
      patchRoomDetails(skipped, {
        condition: 'watch',
        hasDamage: true,
      }).skipped,
      true
    );
    assert.equal(
      patchRoomDetails(skipped, {
        issueParts: ['paint', 'wall'],
        hasDamage: true,
      }).skipped,
      true
    );
  });
});

describe('scan verification', () => {
  const artifact = (
    measuredSqft: number,
    overrides: Partial<RoomScanArtifact> = {}
  ): RoomScanArtifact => ({
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft,
    source: 'roomplan-floor-polygon',
    capturedAt: '2026-08-12T00:00:00.000Z',
    ...overrides,
  });

  it('requires every room and rejects skipped rooms', () => {
    const draft = createDraft('Oak', '1A', '1000', ['Living', 'Kitchen']);
    draft.rooms[0].scanArtifact = artifact(100);
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[1].scanArtifact = artifact(80, {
      scanId: 'scan-2',
      jsonPath: '/scan/Kitchen.json',
      usdzPath: '/scan/Kitchen.usdz',
    });
    assert.equal(draftCanBeVerified(draft), true);
    draft.rooms[1].skipped = true;
    assert.equal(draftCanBeVerified(draft), false);
  });

  it('excludes legacy typed sqft from scan totals', () => {
    const rooms = [
      { ...createRoom('A'), sqft: '900', scanArtifact: artifact(100) },
      { ...createRoom('B'), sqft: '500' },
    ];
    assert.equal(scanMeasuredSqft(rooms), 100);
  });

  it('does not repeat a partial current scan as a legacy fallback', () => {
    const draft = {
      ...createDraft('Oak', '1A', '1000', ['Living', 'Kitchen']),
      measuredSqftFromScan: 100,
    };
    draft.rooms[0].scanArtifact = artifact(100);

    assert.equal(scanMeasuredSqft(draft.rooms), 100);
    assert.equal(legacyCompatibilitySqft(draft), 0);
  });

  it('returns a compatibility-only legacy value when no current scan exists', () => {
    const draft = {
      ...createDraft('Oak', '1A', '1000', ['Living']),
      measuredSqftFromScan: 125,
    };

    assert.equal(scanMeasuredSqft(draft.rooms), 0);
    assert.equal(legacyCompatibilitySqft(draft), 125);
  });

  it('keeps an export-only scan on the room without verifying the job', () => {
    const draft = createDraft('Oak', '1A', '', ['Living']);
    draft.rooms[0].scanArtifact = {
      scanId: 'scan-1',
      jsonPath: '/scan/Room.json',
      usdzPath: '/scan/Room.usdz',
      source: 'export-only',
      capturedAt: '2026-08-12T00:00:00.000Z',
    };
    assert.equal(roomHasVerifiedScan(draft.rooms[0]), false);
    assert.equal(draftCanBeVerified(draft), false);
    assert.equal(scanMeasuredSqft(draft.rooms), 0);
  });

  it('rejects wall estimates for verification', () => {
    const draft = createDraft('Oak', '1A', '', ['Living']);
    draft.rooms[0].scanArtifact = {
      ...artifact(100),
      source: 'wall-estimate',
    };
    assert.equal(draftCanBeVerified(draft), false);
  });

  it('rejects zero, negative, oversized, and unsafe artifacts', () => {
    const draft = createDraft('Oak', '1A', '', ['Living']);
    for (const measuredSqft of [0, -1, 2_000.01]) {
      draft.rooms[0].scanArtifact = artifact(measuredSqft);
      assert.equal(draftCanBeVerified(draft), false);
    }

    draft.rooms[0].scanArtifact = artifact(100, { scanId: ' ' });
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[0].scanArtifact = artifact(100, {
      jsonPath: '/scan/../Room.json',
    });
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[0].scanArtifact = artifact(100, {
      capturedAt: '2026-08-11T20:00:00-04:00',
    });
    assert.equal(draftCanBeVerified(draft), false);
  });

  it('rejects duplicate scan IDs and artifact paths across rooms', () => {
    const draft = createDraft('Oak', '1A', '', ['Living', 'Kitchen']);
    draft.rooms[0].scanArtifact = artifact(100);
    draft.rooms[1].scanArtifact = artifact(80, {
      scanId: 'scan-2',
      jsonPath: '/scan/Kitchen.json',
      usdzPath: '/scan/Kitchen.usdz',
    });
    assert.equal(draftCanBeVerified(draft), true);

    draft.rooms[1].scanArtifact.scanId = 'scan-1';
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[1].scanArtifact.scanId = 'scan-2';
    draft.rooms[1].scanArtifact.jsonPath = '/scan/Room.json';
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[1].scanArtifact.jsonPath = '/scan/Kitchen.json';
    draft.rooms[1].scanArtifact.usdzPath = '/scan/Room.usdz';
    assert.equal(draftCanBeVerified(draft), false);
  });
});
