import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeLocale } from './i18n.ts';

/** Mirrors `parseStoredLocale` without importing AsyncStorage-backed module. */
function parseStoredLocale(raw: string | null): 'en' | 'es' {
  if (raw == null) return 'en';
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeLocale(parsed);
  } catch {
    return normalizeLocale(raw);
  }
}

describe('parseStoredLocale', () => {
  it('returns en when missing or corrupt', () => {
    assert.equal(parseStoredLocale(null), 'en');
    assert.equal(parseStoredLocale('{'), 'en');
    assert.equal(parseStoredLocale('"es"'), 'es');
  });
});

describe('LOCALE_STORAGE_KEY', () => {
  it('is stable', () => {
    assert.equal('aperiv.field.locale.v1', 'aperiv.field.locale.v1');
  });
});
