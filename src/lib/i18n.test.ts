import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLocale, t } from './i18n.ts';

describe('normalizeLocale', () => {
  it('defaults invalid values to en', () => {
    assert.equal(normalizeLocale(undefined), 'en');
    assert.equal(normalizeLocale('fr'), 'en');
    assert.equal(normalizeLocale('ES'), 'es');
  });
});

describe('t', () => {
  it('returns English by default keys', () => {
    assert.equal(t('en', 'myJobs'), 'My jobs');
    assert.equal(t('en', 'takePhoto'), 'Take photo');
  });

  it('returns Spanish strings for es', () => {
    assert.equal(t('es', 'myJobs'), 'Mis trabajos');
    assert.equal(t('es', 'takePhoto'), 'Tomar foto');
    assert.equal(t('es', 'newJob'), 'Nuevo trabajo');
  });

  it('never exposes jargon in crew strings', () => {
    const keys = [
      'myJobs',
      'newJob',
      'saveJob',
      'savedOnDevice',
      'jobInProgress',
    ] as const;
    for (const key of keys) {
      for (const locale of ['en', 'es'] as const) {
        const value = t(locale, key).toLowerCase();
        assert.equal(value.includes('supabase'), false);
        assert.equal(value.includes('draft'), false);
        assert.equal(value.includes('walkthrough'), false);
      }
    }
  });
});
