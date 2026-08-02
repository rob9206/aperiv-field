import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  isValidDraftStore,
  parseDraftStoreRaw,
} from './draft-store-parse.ts';

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
