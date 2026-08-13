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

  it('uses exact bilingual save-in-progress copy', () => {
    assert.equal(t('en', 'saving'), 'Saving…');
    assert.equal(t('es', 'saving'), 'Guardando…');
  });

  it('localizes scan failures and the unverified escape hatch', () => {
    assert.equal(t('en', 'scanErrorTitle'), 'Room scan issue');
    assert.equal(t('es', 'scanErrorTitle'), 'Problema con el escaneo');
    assert.equal(
      t('en', 'scanMeasureFailed'),
      'Square footage could not be verified from this scan. Try LiDAR again or continue unverified.'
    );
    assert.equal(
      t('es', 'scanMeasureFailed'),
      'No se pudieron verificar los pies² con este escaneo. Intenta usar LiDAR de nuevo o continúa sin verificar.'
    );
    assert.equal(t('en', 'continueUnverified'), 'Continue unverified');
    assert.equal(t('es', 'continueUnverified'), 'Continuar sin verificar');
    assert.equal(t('en', 'shareScanFailed').includes('share'), true);
    assert.equal(t('es', 'shareScanFailed').includes('compartir'), true);
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
