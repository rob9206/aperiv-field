import type {
  DraftStore,
  FindingSeverity,
  GuidePhase,
  ManualWalkthroughDraft,
  RoomCapture,
  RoomCondition,
  RoomPhoto,
  VerificationStatus,
  WalkthroughFinding,
} from './walkthrough-draft';

export type ScanMeasurementSource =
  | 'roomplan-floor-polygon'
  | 'roomplan-floor-dimensions'
  | 'wall-estimate';

export type RoomScanArtifact = {
  scanId: string;
  jsonPath: string;
  usdzPath: string;
  measuredSqft: number;
  source: ScanMeasurementSource;
  capturedAt: string;
};

const VERIFIED_SOURCES = new Set<ScanMeasurementSource>([
  'roomplan-floor-polygon',
  'roomplan-floor-dimensions',
]);
const SCAN_SOURCES = new Set<ScanMeasurementSource>([
  ...VERIFIED_SOURCES,
  'wall-estimate',
]);
const ROOM_CONDITIONS = new Set<RoomCondition>(['good', 'watch', 'issue']);
const FINDING_SEVERITIES = new Set<FindingSeverity>([
  'low',
  'medium',
  'high',
]);
const GUIDE_PHASES = new Set<GuidePhase>([
  'room',
  'arrive',
  'scan',
  'condition',
  'damage',
  'photo',
  'advance',
]);
const VERIFICATION_STATUSES = new Set<VerificationStatus>([
  'verified',
  'unverified',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isDateString(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function normalizePhoto(value: unknown): RoomPhoto | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.uri !== 'string') {
    return null;
  }
  return { id: value.id, uri: value.uri };
}

function normalizeFinding(value: unknown): WalkthroughFinding | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.severity !== 'string' ||
    !FINDING_SEVERITIES.has(value.severity as FindingSeverity) ||
    typeof value.title !== 'string' ||
    typeof value.body !== 'string'
  ) {
    return null;
  }
  return {
    id: value.id,
    severity: value.severity as FindingSeverity,
    title: value.title,
    body: value.body,
  };
}

function normalizeScanArtifact(value: unknown): RoomScanArtifact | null {
  if (
    !isRecord(value) ||
    typeof value.scanId !== 'string' ||
    typeof value.jsonPath !== 'string' ||
    typeof value.usdzPath !== 'string' ||
    !isFiniteNumber(value.measuredSqft) ||
    typeof value.source !== 'string' ||
    !SCAN_SOURCES.has(value.source as ScanMeasurementSource) ||
    !isDateString(value.capturedAt)
  ) {
    return null;
  }
  return {
    scanId: value.scanId,
    jsonPath: value.jsonPath,
    usdzPath: value.usdzPath,
    measuredSqft: value.measuredSqft,
    source: value.source as ScanMeasurementSource,
    capturedAt: value.capturedAt,
  };
}

function normalizeRoom(value: unknown): RoomCapture | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.name !== 'string' ||
    typeof value.sqft !== 'string' ||
    typeof value.condition !== 'string' ||
    !ROOM_CONDITIONS.has(value.condition as RoomCondition) ||
    !Array.isArray(value.photos) ||
    typeof value.notes !== 'string'
  ) {
    return null;
  }

  const photos = value.photos.map(normalizePhoto);
  if (photos.some((photo) => photo === null)) {
    return null;
  }
  if (value.hasDamage !== undefined && typeof value.hasDamage !== 'boolean') {
    return null;
  }
  if (
    value.issueParts !== undefined &&
    (!Array.isArray(value.issueParts) ||
      !value.issueParts.every((part) => typeof part === 'string'))
  ) {
    return null;
  }
  if (value.scanned !== undefined && typeof value.scanned !== 'boolean') {
    return null;
  }
  if (value.skipped !== undefined && typeof value.skipped !== 'boolean') {
    return null;
  }
  if (
    value.measuredSqftFromScan !== undefined &&
    !isFiniteNumber(value.measuredSqftFromScan)
  ) {
    return null;
  }

  let scanArtifact: RoomScanArtifact | undefined;
  if (value.scanArtifact !== undefined) {
    const normalized = normalizeScanArtifact(value.scanArtifact);
    if (normalized === null) {
      return null;
    }
    scanArtifact = normalized;
  }

  return {
    id: value.id,
    name: value.name,
    sqft: value.sqft,
    condition: value.condition as RoomCondition,
    photos: photos as RoomPhoto[],
    notes: value.notes,
    ...(value.hasDamage === undefined ? {} : { hasDamage: value.hasDamage }),
    ...(value.issueParts === undefined
      ? {}
      : { issueParts: [...value.issueParts] as string[] }),
    scanned: scanArtifact !== undefined,
    ...(value.skipped === undefined ? {} : { skipped: value.skipped }),
    ...(scanArtifact === undefined ? {} : { scanArtifact }),
    ...(value.measuredSqftFromScan === undefined
      ? {}
      : { measuredSqftFromScan: value.measuredSqftFromScan }),
  };
}

function normalizeDraft(
  value: unknown,
  expectedId: string
): ManualWalkthroughDraft | null {
  if (
    !isRecord(value) ||
    value.id !== expectedId ||
    typeof value.property !== 'string' ||
    typeof value.unit !== 'string' ||
    typeof value.recordedSqft !== 'string' ||
    !Array.isArray(value.rooms) ||
    !Array.isArray(value.findings) ||
    !isDateString(value.createdAt)
  ) {
    return null;
  }

  const rooms = value.rooms.map(normalizeRoom);
  const findings = value.findings.map(normalizeFinding);
  if (
    rooms.some((room) => room === null) ||
    findings.some((finding) => finding === null)
  ) {
    return null;
  }
  if (value.completedAt !== undefined && !isDateString(value.completedAt)) {
    return null;
  }
  if (
    value.guidePhase !== undefined &&
    (typeof value.guidePhase !== 'string' ||
      !GUIDE_PHASES.has(value.guidePhase as GuidePhase))
  ) {
    return null;
  }
  if (
    value.measuredSqftFromScan !== undefined &&
    !isFiniteNumber(value.measuredSqftFromScan)
  ) {
    return null;
  }
  if (
    value.verificationStatus !== undefined &&
    (typeof value.verificationStatus !== 'string' ||
      !VERIFICATION_STATUSES.has(value.verificationStatus as VerificationStatus))
  ) {
    return null;
  }

  const normalizedRooms = rooms as RoomCapture[];
  const guideRoomIndex =
    typeof value.guideRoomIndex === 'number' &&
    Number.isInteger(value.guideRoomIndex) &&
    value.guideRoomIndex >= 0 &&
    value.guideRoomIndex < normalizedRooms.length
      ? value.guideRoomIndex
      : 0;
  const verificationStatus =
    (value.verificationStatus as VerificationStatus | undefined) ?? 'unverified';
  const draft: ManualWalkthroughDraft = {
    id: value.id,
    property: value.property,
    unit: value.unit,
    recordedSqft: value.recordedSqft,
    rooms: normalizedRooms,
    findings: findings as WalkthroughFinding[],
    createdAt: value.createdAt,
    ...(value.completedAt === undefined ? {} : { completedAt: value.completedAt }),
    guideRoomIndex,
    guidePhase: (value.guidePhase as GuidePhase | undefined) ?? 'room',
    ...(value.measuredSqftFromScan === undefined
      ? {}
      : { measuredSqftFromScan: value.measuredSqftFromScan }),
    verificationStatus,
  };
  draft.verificationStatus = draftCanBeVerified(draft)
    ? verificationStatus
    : 'unverified';
  return draft;
}

export function roomHasVerifiedScan(
  room: Pick<RoomCapture, 'scanArtifact' | 'skipped'>
): boolean {
  const artifact = room.scanArtifact;
  return (
    room.skipped !== true &&
    artifact != null &&
    VERIFIED_SOURCES.has(artifact.source) &&
    Number.isFinite(artifact.measuredSqft) &&
    artifact.measuredSqft > 0
  );
}

export function scanMeasuredSqft(rooms: RoomCapture[]): number {
  return rooms.reduce(
    (sum, room) =>
      roomHasVerifiedScan(room) ? sum + room.scanArtifact!.measuredSqft : sum,
    0
  );
}

export function draftCanBeVerified(draft: ManualWalkthroughDraft): boolean {
  return draft.rooms.length > 0 && draft.rooms.every(roomHasVerifiedScan);
}

export function normalizeDraftStore(value: unknown): DraftStore | null {
  if (!isRecord(value) || !isRecord(value.drafts)) {
    return null;
  }
  if (
    value.activeDraftId !== null &&
    typeof value.activeDraftId !== 'string'
  ) {
    return null;
  }

  const sourceEntries = Object.entries(value.drafts);
  const normalizedEntries = sourceEntries.flatMap(([id, draftValue]) => {
    const draft = normalizeDraft(draftValue, id);
    return draft === null ? [] : ([[id, draft]] as const);
  });
  if (sourceEntries.length > 0 && normalizedEntries.length === 0) {
    return null;
  }

  const drafts = Object.fromEntries(normalizedEntries) as Record<
    string,
    ManualWalkthroughDraft
  >;
  const activeDraftId =
    typeof value.activeDraftId === 'string' &&
    Object.hasOwn(drafts, value.activeDraftId)
      ? value.activeDraftId
      : null;
  return { activeDraftId, drafts };
}
