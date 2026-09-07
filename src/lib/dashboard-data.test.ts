import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { DashboardUnit as Unit } from './dashboard-data.ts';
import {
  buildDashboardFromUnits,
  buildUnitsExportCsv,
  dashboardUnits,
} from './dashboard-data.ts';
import type { Unit as DatabaseUnit, Walkthrough } from './database.types';

describe('live roster mapping', () => {
  const roster: DatabaseUnit[] = [
    {
      id: 'unit-1',
      property_id: 'property-1',
      unit_number: '101',
      building: 'A',
      floor: 1,
      bedrooms: 1,
      bathrooms: 1,
      recorded_sqft: 999,
      status: 'active',
    },
  ];
  const captured: Walkthrough = {
    id: 'capture-1',
    unit_id: 'unit-1',
    status: 'complete',
    source_draft_id: 'draft@revision',
    verification_status: 'verified',
    captured_at: '2026-09-07T00:00:00.000Z',
    captured_by: 'crew',
    device: 'Aperiv Field',
    scan_duration_seconds: 0,
    photo_count: 0,
    measured_sqft: 200,
    condition_summary: '',
    rooms: [],
    condition_findings: [],
    total_estimated_amount: 0,
  };
  it('uses complete measured captures without treating recorded sqft or active unit status as verified', () => {
    const [empty] = dashboardUnits(
      roster,
      [{ ...captured, status: 'in_progress' }],
      []
    );
    assert.equal(empty.status, 'to_do');
    assert.equal(empty.verified_sqft, null);
    const [sent] = dashboardUnits(
      roster,
      [captured],
      [{ unit_id: 'unit-1', stage: 'ready', started_at: '2026-01-01' }]
    );
    assert.equal(sent.status, 'needs_review');
    assert.equal(sent.verified_sqft, 200);
    assert.equal(sent.assigned_to, 'crew');
  });
  it('uses the latest completed revision once and excludes Unverified totals', () => {
    const latest = {
      ...captured,
      id: 'capture-2',
      captured_at: '2026-09-07T01:00:00.000Z',
      verification_status: 'unverified' as const,
      measured_sqft: 0,
    };
    const rows = dashboardUnits(
      roster,
      [
        captured,
        latest,
        {
          ...captured,
          id: 'capture-3',
          captured_at: '2026-09-07T02:00:00.000Z',
          status: 'in_progress',
        },
      ],
      []
    );
    assert.equal(rows[0].verified_sqft, null);
    assert.equal(buildDashboardFromUnits(rows).metrics.totalSqft, 0);
  });
});

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
