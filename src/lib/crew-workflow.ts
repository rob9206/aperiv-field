import type { ManualWalkthroughDraft } from './walkthrough-draft';

export function isJobSent(draft: ManualWalkthroughDraft, userId: string | undefined) {
  return !!userId && !!draft.completedAt &&
    draft.submissionReceipt?.userId === userId &&
    draft.submissionReceipt.completedAt === draft.completedAt;
}

export function normalizeReceipt(value: unknown): ManualWalkthroughDraft['submissionReceipt'] {
  if (!value || typeof value !== 'object') return undefined;
  const receipt = value as Record<string, unknown>;
  for (const key of ['captureId', 'userId', 'unitId', 'completedAt', 'sentAt']) {
    if (typeof receipt[key] !== 'string' || !receipt[key]) return undefined;
  }
  if (!Number.isFinite(Date.parse(receipt.completedAt as string)) ||
      !Number.isFinite(Date.parse(receipt.sentAt as string))) return undefined;
  return {
    captureId: receipt.captureId as string,
    userId: receipt.userId as string,
    unitId: receipt.unitId as string,
    completedAt: receipt.completedAt as string,
    sentAt: receipt.sentAt as string,
  };
}

/** Suggest only a unique, exact name match. The crew still confirms Send. */
export function matchJobDestination(
  draft: Pick<ManualWalkthroughDraft, 'property' | 'unit'>,
  properties: { id: string; name: string }[],
  units: { id: string; property_id: string; unit_number: string }[],
) {
  const normalize = (name: string) => name.trim().toLocaleLowerCase();
  const matchingProperties = properties.filter(p => normalize(p.name) === normalize(draft.property));
  if (matchingProperties.length !== 1) return null;
  const property = matchingProperties[0];
  const matches = units.filter(u => u.property_id === property.id && normalize(u.unit_number) === normalize(draft.unit));
  return { propertyId: property.id, unitId: matches.length === 1 ? matches[0].id : '' };
}
