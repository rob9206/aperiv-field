import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { normalizeDraftStore } from './walkthrough-schema.ts';

const capturedAt = '2026-08-12T00:00:00.000Z';

function artifact(measuredSqft = 100) {
  return {
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft,
    source: 'roomplan-floor-polygon' as const,
    capturedAt,
  };
}

function room(id = 'room-1') {
  return {
    id,
    name: 'Living',
    sqft: '900',
    condition: 'watch' as const,
    photos: [{ id: 'photo-1', uri: 'file:///photo.jpg' }],
    notes: 'Touch up the trim',
    hasDamage: true,
    issueParts: ['paint', 'wall'],
    scanned: true,
    scanArtifact: artifact(),
    measuredSqftFromScan: 100,
  };
}

function draft(id = 'draft-1') {
  return {
    id,
    property: 'Oak',
    unit: '1A',
    recordedSqft: '1000',
    rooms: [room()],
    findings: [
      {
        id: 'finding-1',
        severity: 'medium' as const,
        title: 'Trim',
        body: 'Touch up needed',
      },
    ],
    createdAt: capturedAt,
    completedAt: '2026-08-12T01:00:00.000Z',
    guideRoomIndex: 0,
    guidePhase: 'room' as const,
    measuredSqftFromScan: 100,
    verificationStatus: 'verified' as const,
  };
}

describe('normalizeDraftStore', () => {
  it('rejects missing stores and stores with no recoverable drafts', () => {
    assert.equal(normalizeDraftStore(null), null);
    assert.equal(
      normalizeDraftStore({ activeDraftId: 'x', drafts: { x: {} } }),
      null
    );
  });

  it('normalizes stale guide and verification state without promoting legacy totals', () => {
    const legacyDraft = draft();
    delete legacyDraft.rooms[0].scanArtifact;
    legacyDraft.rooms[0].scanned = true;
    legacyDraft.rooms[0].measuredSqftFromScan = 125;
    legacyDraft.measuredSqftFromScan = 125;
    legacyDraft.guideRoomIndex = 99;
    legacyDraft.verificationStatus = 'verified';

    const normalized = normalizeDraftStore({
      activeDraftId: legacyDraft.id,
      drafts: { [legacyDraft.id]: legacyDraft },
    });

    assert.ok(normalized);
    const saved = normalized.drafts[legacyDraft.id];
    assert.equal(saved.guideRoomIndex, 0);
    assert.equal(saved.rooms[0].scanned, false);
    assert.equal(saved.rooms[0].measuredSqftFromScan, 125);
    assert.equal(saved.rooms[0].scanArtifact, undefined);
    assert.equal(saved.verificationStatus, 'unverified');
  });

  it('preserves valid nested capture data and complete verification', () => {
    const validDraft = draft();
    const normalized = normalizeDraftStore({
      activeDraftId: validDraft.id,
      drafts: { [validDraft.id]: validDraft },
    });

    assert.ok(normalized);
    const saved = normalized.drafts[validDraft.id];
    assert.deepEqual(saved.rooms[0].photos, validDraft.rooms[0].photos);
    assert.equal(saved.rooms[0].condition, 'watch');
    assert.equal(saved.rooms[0].notes, 'Touch up the trim');
    assert.deepEqual(saved.rooms[0].issueParts, ['paint', 'wall']);
    assert.deepEqual(saved.findings, validDraft.findings);
    assert.deepEqual(saved.rooms[0].scanArtifact, validDraft.rooms[0].scanArtifact);
    assert.equal(saved.verificationStatus, 'verified');
  });

  it('drops malformed drafts while retaining valid siblings', () => {
    const invalidValues: Array<(value: ReturnType<typeof draft>) => void> = [
      (value) => {
        value.createdAt = 'not-a-date';
      },
      (value) => {
        value.rooms[0].condition = 'broken' as 'watch';
      },
      (value) => {
        value.rooms[0].photos[0].uri = 42 as unknown as string;
      },
      (value) => {
        value.findings[0].severity = 'urgent' as 'medium';
      },
      (value) => {
        value.rooms[0].scanArtifact!.measuredSqft = Number.NaN;
      },
    ];

    for (const invalidate of invalidValues) {
      const validDraft = draft('valid');
      const invalidDraft = draft('invalid');
      invalidate(invalidDraft);
      const normalized = normalizeDraftStore({
        activeDraftId: 'invalid',
        drafts: { valid: validDraft, invalid: invalidDraft },
      });

      assert.ok(normalized);
      assert.deepEqual(Object.keys(normalized.drafts), ['valid']);
      assert.equal(normalized.activeDraftId, null);
    }
  });
});
