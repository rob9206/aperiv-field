import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isValidDraftStore,
  parseDraftStoreRaw,
} from './draft-store-parse.ts';
import {
  createDraft,
  createRoom,
  draftCanBeVerified,
  scanMeasuredSqft,
  type RoomScanArtifact,
} from './walkthrough-draft.ts';

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
});

describe('scan verification', () => {
  const artifact = (measuredSqft: number): RoomScanArtifact => ({
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft,
    source: 'roomplan-floor-polygon',
    capturedAt: '2026-08-12T00:00:00.000Z',
  });

  it('requires every room and rejects skipped rooms', () => {
    const draft = createDraft('Oak', '1A', '1000', ['Living', 'Kitchen']);
    draft.rooms[0].scanArtifact = artifact(100);
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[1].scanArtifact = artifact(80);
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

  it('rejects wall estimates for verification', () => {
    const draft = createDraft('Oak', '1A', '', ['Living']);
    draft.rooms[0].scanArtifact = {
      ...artifact(100),
      source: 'wall-estimate',
    };
    assert.equal(draftCanBeVerified(draft), false);
  });
});
