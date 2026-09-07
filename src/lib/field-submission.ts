import type { ManualWalkthroughDraft } from './walkthrough-draft';
import {
  draftCanBeVerified,
  roomHasVerifiedScan,
  scanMeasuredSqft,
} from './walkthrough-schema.ts';

export type RemoteSubmission = {
  id: string;
  unit_id: string;
  status: 'in_progress' | 'complete';
};
export type Asset = {
  bucket: 'walkthrough-scans' | 'walkthrough-photos';
  path: string;
  uri: string;
  contentType: string;
  roomName?: string;
};
export type SubmissionPayload = {
  unit_id: string;
  captured_by: string;
  source_draft_id: string;
  captured_at: string;
  device: string;
  scan_duration_seconds: number;
  photo_count: number;
  measured_sqft: number;
  verification_status: 'verified' | 'unverified';
  condition_summary: string;
  rooms: Record<string, unknown>[];
  condition_findings: Record<string, unknown>[];
  total_estimated_amount: number;
};
export type SubmissionPorts = {
  begin(payload: SubmissionPayload): Promise<RemoteSubmission>;
  upload(asset: Asset): Promise<void>;
  complete(id: string, payload: SubmissionPayload): Promise<void>;
};

function segment(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(value))
    throw new Error('Invalid asset identifier.');
  return value;
}

/** One saved revision has one immutable remote identity, including across restarts. */
export function submissionKey(draft: ManualWalkthroughDraft): string {
  if (!draft.completedAt || !Number.isFinite(Date.parse(draft.completedAt))) {
    throw new Error('Save the job before sending it.');
  }
  return `${draft.id}@${draft.completedAt}`;
}

export function buildSubmission(
  draft: ManualWalkthroughDraft,
  unitId: string,
  userId: string,
  remoteId?: string
) {
  const verified =
    draft.verificationStatus === 'verified' && draftCanBeVerified(draft);
  const assets: Asset[] = [];
  const prefix = remoteId
    ? `field/${segment(userId)}/${segment(remoteId)}`
    : null;
  const findings: Record<string, unknown>[] = draft.findings.map(
    ({ severity, title, body }) => ({ severity, title, body })
  );
  const rooms = draft.rooms.map((room) => {
    const measured = roomHasVerifiedScan(room)
      ? room.scanArtifact!.measuredSqft ?? null
      : null;
    if (
      room.condition !== 'good' ||
      room.notes.trim() ||
      room.issueParts?.length
    ) {
      findings.push({
        severity:
          room.condition === 'issue'
            ? 'high'
            : room.condition === 'watch'
              ? 'medium'
              : 'low',
        title: room.name,
        body: [
          room.condition === 'issue'
            ? 'Needs fixing'
            : room.condition === 'watch'
              ? 'Small stuff'
              : 'Ready',
          ...(room.issueParts ?? []),
          room.notes.trim(),
        ]
          .filter(Boolean)
          .join(' · '),
      });
    }
    const photos = room.photos.map((photo) => {
      const extension = photo.uri
        .match(/\.(jpe?g|png|heic|webp)$/i)?.[1]
        ?.toLowerCase();
      if (!extension) throw new Error('Unsupported photo format.');
      const path = prefix
        ? `${prefix}/${segment(room.id)}/${segment(photo.id)}.${extension}`
        : null;
      if (path)
        assets.push({
          bucket: 'walkthrough-photos',
          path,
          uri: photo.uri,
          roomName: room.name,
          contentType:
            extension === 'jpg' ? 'image/jpeg' : `image/${extension}`,
        });
      return { id: photo.id, storage_path: path };
    });
    const scan = room.scanArtifact;
    const scanPath =
      prefix && scan
        ? `${prefix}/${segment(room.id)}/${segment(scan.scanId)}.usdz`
        : null;
    const jsonPath =
      prefix && scan
        ? `${prefix}/${segment(room.id)}/${segment(scan.scanId)}.json`
        : null;
    if (scan && scanPath && jsonPath) {
      assets.push({
        bucket: 'walkthrough-scans',
        path: scanPath,
        uri: scan.usdzPath,
        roomName: room.name,
        contentType: 'model/vnd.usdz+zip',
      });
      assets.push({
        bucket: 'walkthrough-scans',
        path: jsonPath,
        uri: scan.jsonPath,
        roomName: room.name,
        contentType: 'application/json',
      });
    }
    return {
      id: room.id,
      name: room.name,
      sqft: measured,
      condition: room.condition,
      notes: room.notes,
      issue_parts: room.issueParts ?? [],
      skipped: room.skipped === true,
      verification_status: measured == null ? 'unverified' : 'verified',
      photos,
      scan_asset_path: scanPath,
      parametric_json_path: jsonPath,
      scan_id: scan?.scanId ?? null,
      measurement_source: scan?.source ?? null,
    };
  });
  const payload: SubmissionPayload = {
    unit_id: unitId,
    captured_by: userId,
    source_draft_id: submissionKey(draft),
    captured_at: draft.completedAt!,
    device: 'Aperiv Field',
    scan_duration_seconds: 0,
    photo_count: draft.rooms.reduce((sum, room) => sum + room.photos.length, 0),
    // Legacy DB column is NOT NULL. Zero is a compatibility placeholder, never a verified measurement.
    measured_sqft: verified ? Math.round(scanMeasuredSqft(draft.rooms)) : 0,
    verification_status: verified ? 'verified' : 'unverified',
    condition_summary: verified ? 'Verified room scans' : 'Unverified capture',
    rooms,
    condition_findings: findings,
    total_estimated_amount: 0,
  };
  return { payload, assets };
}

/** Local files and drafts are never modified by submission, including on failure. */
export async function submitFieldDraft(
  draft: ManualWalkthroughDraft,
  unitId: string,
  userId: string,
  ports: SubmissionPorts
): Promise<string> {
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(unitId) || !uuid.test(userId))
    throw new Error('Choose a valid unit and sign in.');
  const snapshot = JSON.parse(JSON.stringify(draft)) as ManualWalkthroughDraft;
  const { payload: initial } = buildSubmission(snapshot, unitId, userId);
  const remote = await ports.begin(initial);
  if (remote.unit_id !== unitId)
    throw new Error('This saved job was already linked to another unit.');
  if (remote.status === 'complete') return remote.id;
  const { payload, assets } = buildSubmission(
    snapshot,
    unitId,
    userId,
    remote.id
  );
  for (const asset of assets) await ports.upload(asset);
  await ports.complete(remote.id, payload);
  return remote.id;
}
