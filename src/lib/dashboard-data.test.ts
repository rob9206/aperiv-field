import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Unit } from './database.types.ts';
import {
  buildDashboardFromUnits,
  buildUnitsExportCsv,
} from './dashboard-data.ts';

function unit(overrides: Partial<Unit> & Pick<Unit, 'id' | 'status'>): Unit {
  return {
    property_id: 'prop-1',
    unit_number: overrides.unit_number ?? overrides.id,
    assigned_to: null,
    verified_sqft: null,
    ...overrides,
  };
}

describe('buildDashboardFromUnits', () => {
  it('returns zeroed metrics for an empty roster', () => {
    const snapshot = buildDashboardFromUnits([]);
    assert.deepEqual(snapshot.metrics, {
      progress: 0,
      awaitingReview: 0,
      totalSqft: 0,
      activeCrew: 0,
    });
    assert.equal(snapshot.columns.toDo.length, 0);
  });

  it('groups units and computes progress from approved share', () => {
    const snapshot = buildDashboardFromUnits([
      unit({ id: '1', unit_number: '101', status: 'to_do' }),
      unit({
        id: '2',
        unit_number: '204',
        status: 'in_progress',
        assigned_to: 'jose',
      }),
      unit({
        id: '3',
        unit_number: '305',
        status: 'needs_review',
        assigned_to: 'maria',
        verified_sqft: 850,
      }),
      unit({
        id: '4',
        unit_number: '410',
        status: 'approved',
        assigned_to: 'maria',
        verified_sqft: 1200,
      }),
    ]);

    assert.equal(snapshot.metrics.progress, 25);
    assert.equal(snapshot.metrics.awaitingReview, 1);
    assert.equal(snapshot.metrics.totalSqft, 2050);
    assert.equal(snapshot.metrics.activeCrew, 1);
    assert.deepEqual(
      snapshot.columns.toDo.map((item) => item.unit_number),
      ['101']
    );
    assert.deepEqual(
      snapshot.columns.inProgress.map((item) => item.unit_number),
      ['204']
    );
    assert.deepEqual(
      snapshot.columns.needsReview.map((item) => item.unit_number),
      ['305']
    );
    assert.deepEqual(
      snapshot.columns.approved.map((item) => item.unit_number),
      ['410']
    );
  });

  it('counts unique active crew only on in-progress units', () => {
    const snapshot = buildDashboardFromUnits([
      unit({
        id: '1',
        status: 'in_progress',
        assigned_to: 'jose',
      }),
      unit({
        id: '2',
        status: 'in_progress',
        assigned_to: 'jose',
      }),
      unit({
        id: '3',
        status: 'approved',
        assigned_to: 'maria',
      }),
    ]);
    assert.equal(snapshot.metrics.activeCrew, 1);
  });
});

describe('buildUnitsExportCsv', () => {
  it('writes a header and escaped unit rows', () => {
    const csv = buildUnitsExportCsv([
      unit({
        id: '1',
        unit_number: 'Unit, 305',
        status: 'needs_review',
        assigned_to: 'Maria "Lead"',
        verified_sqft: 850,
      }),
    ]);
    assert.equal(
      csv,
      'unit_number,status,assigned_to,verified_sqft\n"Unit, 305",needs_review,"Maria ""Lead""",850'
    );
  });
});
