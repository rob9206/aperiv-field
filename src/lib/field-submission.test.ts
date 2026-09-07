import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ManualWalkthroughDraft } from './walkthrough-draft';
import {
  buildSubmission,
  submitFieldDraft,
  submissionKey,
  type Asset,
  type RemoteSubmission,
  type SubmissionPayload,
  type SubmissionPorts,
} from './field-submission.ts';

const user = '11111111-1111-4111-8111-111111111111';
const unit = '22222222-2222-4222-8222-222222222222';
function draft(): ManualWalkthroughDraft {
  return {
    id: 'draft-123',
    property: 'Property',
    unit: '12B',
    recordedSqft: '9999',
    createdAt: '2026-09-07T00:00:00.000Z',
    completedAt: '2026-09-07T00:01:00.000Z',
    verificationStatus: 'verified',
    findings: [],
    rooms: [
      {
        id: 'room-1',
        name: 'Living',
        condition: 'watch',
        sqft: '9999',
        notes: 'Scuffed paint',
        issueParts: ['paint'],
        photos: [
          {
            id: 'photo-1',
            uri: 'file:///documents/walkthrough-photos/draft-123/photo-1.jpg',
          },
        ],
        scanArtifact: {
          scanId: 'scan-1',
          source: 'roomplan-floor-polygon',
          measuredSqft: 200.25,
          capturedAt: '2026-09-07T00:00:30.000Z',
          usdzPath: 'file:///documents/scans/scan-1.usdz',
          jsonPath: 'file:///documents/scans/scan-1.json',
        },
      },
    ],
  };
}
function fake() {
  const rows = new Map<string, RemoteSubmission>();
  const objects = new Map<string, Asset>();
  let finalized: SubmissionPayload | null = null;
  let failUpload = false;
  let loseAck = false;
  const ports: SubmissionPorts = {
    async begin(payload) {
      let row = rows.get(payload.source_draft_id);
      if (!row) {
        row = {
          id: '33333333-3333-4333-8333-333333333333',
          unit_id: payload.unit_id,
          status: 'in_progress',
        };
        rows.set(payload.source_draft_id, row);
      }
      return { ...row };
    },
    async upload(asset) {
      if (failUpload) throw new Error('Offline');
      objects.set(asset.path, asset);
    },
    async complete(id, payload) {
      finalized = payload;
      rows.get(payload.source_draft_id)!.status = 'complete';
      if (loseAck) throw new Error('Response lost');
    },
  };
  return {
    ports,
    rows,
    objects,
    get finalized() {
      return finalized;
    },
    fail() {
      failUpload = true;
    },
    recover() {
      failUpload = false;
    },
    loseAck() {
      loseAck = true;
    },
  };
}

test('submission uses actual scan totals, preserves findings, and never sends local URIs', async () => {
  const local = draft();
  const before = JSON.stringify(local);
  const f = fake();
  await submitFieldDraft(local, unit, user, f.ports);
  assert.equal(f.finalized!.measured_sqft, 200);
  assert.equal(f.finalized!.verification_status, 'verified');
  assert.equal(f.objects.size, 3);
  assert.equal(f.finalized!.photo_count, 1);
  assert.match(
    String(f.finalized!.condition_findings[0].body),
    /Scuffed paint/
  );
  assert.doesNotMatch(JSON.stringify(f.finalized), /file:\/\/|9999/);
  assert.equal(JSON.stringify(local), before);
});
test('failure keeps the remote row pending and retry reuses the same revision', async () => {
  const local = draft();
  const before = JSON.stringify(local);
  const f = fake();
  f.fail();
  await assert.rejects(submitFieldDraft(local, unit, user, f.ports), /Offline/);
  assert.equal(f.rows.size, 1);
  assert.equal(f.finalized, null);
  assert.equal(JSON.stringify(local), before);
  f.recover();
  await submitFieldDraft(local, unit, user, f.ports);
  assert.equal(f.rows.size, 1);
  assert.equal(f.objects.size, 3);
});
test('lost acknowledgement retries without uploading or finalizing twice', async () => {
  const f = fake();
  f.loseAck();
  await assert.rejects(submitFieldDraft(draft(), unit, user, f.ports));
  f.fail();
  await submitFieldDraft(draft(), unit, user, f.ports);
  assert.equal(f.rows.size, 1);
});
test('an existing saved revision cannot be silently reassigned to a different unit', async () => {
  const f = fake();
  await submitFieldDraft(draft(), unit, user, f.ports);
  await assert.rejects(
    submitFieldDraft(draft(), user, user, f.ports),
    /another unit/
  );
});
test('unverified, partial, skipped, wall-estimated and duplicate scans never verify the unit', () => {
  for (const change of [
    (d: ManualWalkthroughDraft) => {
      d.verificationStatus = 'unverified';
    },
    (d: ManualWalkthroughDraft) => {
      delete d.rooms[0].scanArtifact;
    },
    (d: ManualWalkthroughDraft) => {
      d.rooms[0].skipped = true;
    },
    (d: ManualWalkthroughDraft) => {
      d.rooms[0].scanArtifact!.source = 'wall-estimate';
    },
    (d: ManualWalkthroughDraft) => {
      d.rooms.push({ ...d.rooms[0], id: 'room-2' });
    },
  ]) {
    const d = draft();
    change(d);
    const { payload } = buildSubmission(d, unit, user);
    assert.equal(payload.verification_status, 'unverified');
    assert.equal(payload.measured_sqft, 0);
  }
});
test('unsaved jobs and unsafe asset identifiers are rejected', async () => {
  const d = draft();
  delete d.completedAt;
  assert.throws(() => submissionKey(d));
  const unsafe = draft();
  unsafe.rooms[0].id = '../other';
  await assert.rejects(
    submitFieldDraft(unsafe, unit, user, fake().ports),
    /asset identifier/
  );
});
test('a newly saved revision gets a new submission key', () => {
  const d = draft();
  const key = submissionKey(d);
  d.completedAt = '2026-09-07T00:02:00.000Z';
  assert.notEqual(submissionKey(d), key);
});

test('export-only scans from the shipped scan fix upload without inventing a measurement', async () => {
  const local = draft();
  local.verificationStatus = 'unverified';
  local.rooms[0].scanArtifact!.source = 'export-only';
  delete local.rooms[0].scanArtifact!.measuredSqft;
  const f = fake();
  await submitFieldDraft(local, unit, user, f.ports);
  assert.equal(f.objects.size, 3);
  assert.equal(f.finalized!.verification_status, 'unverified');
  assert.equal(f.finalized!.measured_sqft, 0);
  assert.equal(f.finalized!.rooms[0].sqft, null);
  assert.equal(f.finalized!.rooms[0].measurement_source, 'export-only');
  assert.ok(f.finalized!.rooms[0].scan_asset_path);
});
