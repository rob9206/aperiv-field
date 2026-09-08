import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isJobSent, matchJobDestination } from './crew-workflow.ts';
import { normalizeDraftStore } from './walkthrough-schema.ts';
import type { ManualWalkthroughDraft } from './walkthrough-draft';

const completedAt = '2026-09-08T16:00:00.000Z';
const draft: ManualWalkthroughDraft = {
  id: 'job', property: 'Thunderhorse', unit: 'Garage', recordedSqft: '',
  rooms: [], findings: [], createdAt: completedAt, completedAt,
  verificationStatus: 'unverified',
  submissionReceipt: {
    captureId: 'capture', userId: 'crew', unitId: 'garage',
    completedAt, sentAt: '2026-09-08T16:01:00.000Z',
  },
};

describe('crew submission status', () => {
  it('survives saving and reopening a local job without promoting verification', () => {
    const restored = normalizeDraftStore(JSON.parse(JSON.stringify({ activeDraftId: 'job', drafts: { job: draft } })))!;
    assert.equal(isJobSent(restored.drafts.job, 'crew'), true);
    assert.equal(restored.drafts.job.verificationStatus, 'unverified');
  });
  it('never treats another crew member’s acknowledgement as this user’s send', () => {
    assert.equal(isJobSent(draft, 'another-user'), false);
    assert.equal(isJobSent(draft, undefined), false);
  });
  it('marks a changed or unfinished revision as needing attention again', () => {
    assert.equal(isJobSent({ ...draft, completedAt: undefined }, 'crew'), false);
    assert.equal(isJobSent({ ...draft, completedAt: '2026-09-08T17:00:00.000Z' }, 'crew'), false);
    assert.equal(isJobSent({ ...draft, submissionReceipt: undefined }, 'crew'), false);
  });
  it('discards a malformed receipt while keeping the saved capture', () => {
    const restored = normalizeDraftStore({ activeDraftId: 'job', drafts: {
      job: { ...draft, submissionReceipt: { ...draft.submissionReceipt, sentAt: 'broken' } },
    } })!;
    assert.equal(restored.drafts.job.id, 'job');
    assert.equal(isJobSent(restored.drafts.job, 'crew'), false);
  });
});

describe('destination suggestions', () => {
  const properties = [{ id: 'shop', name: 'Thunderhorse' }];
  const units = [{ id: 'garage', property_id: 'shop', unit_number: 'Garage' }];
  it('matches a unique property and unit, allowing case and edge whitespace', () => {
    assert.deepEqual(matchJobDestination({ property: ' thunderhorse ', unit: 'GARAGE' }, properties, units), { propertyId: 'shop', unitId: 'garage' });
  });
  it('never picks an ambiguous property or a merely similar name', () => {
    assert.equal(matchJobDestination(draft, [...properties, { id: 'other', name: 'Thunderhorse' }], units), null);
    assert.equal(matchJobDestination({ ...draft, property: 'Thunderhorse North' }, properties, units), null);
  });
  it('requires an explicit unit choice when the match is missing or ambiguous', () => {
    assert.deepEqual(matchJobDestination(draft, properties, []), { propertyId: 'shop', unitId: '' });
    assert.deepEqual(matchJobDestination(draft, properties, [...units, { ...units[0], id: 'duplicate' }]), { propertyId: 'shop', unitId: '' });
  });
  it('does not suggest a unit from another property', () => {
    assert.deepEqual(matchJobDestination(draft, properties, [{ ...units[0], property_id: 'other' }]), { propertyId: 'shop', unitId: '' });
  });
});
