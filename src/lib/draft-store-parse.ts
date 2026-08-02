export type DraftStoreShape = {
  activeDraftId: string | null;
  drafts: Record<string, unknown>;
};

export function isValidDraftStore(value: unknown): value is DraftStoreShape {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  const drafts = record.drafts;
  if (drafts == null || typeof drafts !== 'object' || Array.isArray(drafts)) {
    return false;
  }
  const active = record.activeDraftId;
  if (active !== null && typeof active !== 'string') {
    return false;
  }
  return true;
}

export function parseDraftStoreRaw(raw: string | null): DraftStoreShape | null {
  if (raw == null) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    return isValidDraftStore(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
