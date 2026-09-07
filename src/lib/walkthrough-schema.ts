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
import {
  MAX_VERIFIED_ROOM_SQFT,
  MIN_VERIFIED_ROOM_SQFT,
} from './roomplan-measure.ts';

export type ScanMeasurementSource =
  | 'roomplan-floor-polygon'
  | 'roomplan-floor-dimensions'
  | 'wall-estimate'
  | 'export-only';

export type RoomScanArtifact = {
  scanId: string;
  jsonPath: string;
  usdzPath: string;
  measuredSqft?: number;
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
  'export-only',
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
  if (typeof value !== 'string') {
    return false;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function isSafeScanId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    value !== '.' &&
    value !== '..' &&
    !value.includes('\0') &&
    !/[\\/]/.test(value)
  );
}

function isSafeArtifactPath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.trim() === value &&
    !value.includes('\0') &&
    !value.split(/[\\/]/).includes('..')
  );
}

function isValidMeasuredSqft(value: unknown): value is number {
  return (
    isFiniteNumber(value) &&
    value >= MIN_VERIFIED_ROOM_SQFT &&
    value <= MAX_VERIFIED_ROOM_SQFT
  );
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
    !isSafeScanId(value.scanId) ||
    !isSafeArtifactPath(value.jsonPath) ||
    !isSafeArtifactPath(value.usdzPath) ||
    typeof value.source !== 'string' ||
    !SCAN_SOURCES.has(value.source as ScanMeasurementSource) ||
    !isDateString(value.capturedAt)
  ) {
    return null;
  }

  const source = value.source as ScanMeasurementSource;
  if (source === 'export-only') {
    return {
      scanId: value.scanId,
      jsonPath: value.jsonPath,
      usdzPath: value.usdzPath,
      source,
      capturedAt: value.capturedAt,
    };
  }

  if (!isValidMeasuredSqft(value.measuredSqft)) {
    return null;
  }

  return {
    scanId: value.scanId,
    jsonPath: value.jsonPath,
    usdzPath: value.usdzPath,
    measuredSqft: value.measuredSqft,
    source,
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

  const photos = value.photos
    .map(normalizePhoto)
    .filter((photo): photo is RoomPhoto => photo !== null);
  const hasDamage =
    typeof value.hasDamage === 'boolean' ? value.hasDamage : false;
  const issueParts =
    Array.isArray(value.issueParts) &&
    value.issueParts.every((part) => typeof part === 'string')
      ? ([...value.issueParts] as string[])
      : [];
  const skipped = typeof value.skipped === 'boolean' ? value.skipped : false;

  let scanArtifact: RoomScanArtifact | undefined;
  if (value.scanArtifact !== undefined) {
    const normalized = normalizeScanArtifact(value.scanArtifact);
    if (normalized !== null) {
      scanArtifact = normalized;
    }
  }

  return {
    id: value.id,
    name: value.name,
    sqft: value.sqft,
    condition: value.condition as RoomCondition,
    photos,
    notes: value.notes,
    hasDamage,
    issueParts,
    scanned: scanArtifact !== undefined,
    skipped,
    ...(scanArtifact === undefined ? {} : { scanArtifact }),
    ...(isFiniteNumber(value.measuredSqftFromScan)
      ? { measuredSqftFromScan: value.measuredSqftFromScan }
      : {}),
  };
}

function normalizeDraft(
  value: unknown,
  expectedId: string
): ManualWalkthroughDraft | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
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
  const findings = value.findings
    .map(normalizeFinding)
    .filter((finding): finding is WalkthroughFinding => finding !== null);
  if (rooms.some((room) => room === null)) {
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
    typeof value.verificationStatus === 'string' &&
    VERIFICATION_STATUSES.has(value.verificationStatus as VerificationStatus)
      ? (value.verificationStatus as VerificationStatus)
      : 'unverified';
  const guidePhase =
    typeof value.guidePhase === 'string' &&
    GUIDE_PHASES.has(value.guidePhase as GuidePhase)
      ? (value.guidePhase as GuidePhase)
      : 'room';
  const draft: ManualWalkthroughDraft = {
    id: expectedId,
    property: value.property,
    unit: value.unit,
    recordedSqft: value.recordedSqft,
    rooms: normalizedRooms,
    findings,
    createdAt: value.createdAt,
    ...(isDateString(value.completedAt)
      ? { completedAt: value.completedAt }
      : {}),
    guideRoomIndex,
    guidePhase,
    ...(isFiniteNumber(value.measuredSqftFromScan)
      ? { measuredSqftFromScan: value.measuredSqftFromScan }
      : {}),
    verificationStatus,
  };
  draft.verificationStatus = draftCanBeVerified(draft)
    ? verificationStatus
    : 'unverified';
  return draft;
}

export function roomHasSavedScan(
  room: Pick<RoomCapture, 'scanArtifact' | 'skipped'>
): boolean {
  const artifact = normalizeScanArtifact(room.scanArtifact);
  return (
    room.skipped !== true &&
    artifact != null &&
    (artifact.source === 'export-only' ||
      VERIFIED_SOURCES.has(artifact.source))
  );
}

export function isPersistableScanArtifact(
  artifact: RoomScanArtifact | undefined
): boolean {
  return roomHasSavedScan({ scanArtifact: artifact, skipped: false });
}

export function roomHasVerifiedScan(
  room: Pick<RoomCapture, 'scanArtifact' | 'skipped'>
): boolean {
  const artifact = normalizeScanArtifact(room.scanArtifact);
  return (
    room.skipped !== true &&
    artifact != null &&
    VERIFIED_SOURCES.has(artifact.source) &&
    isValidMeasuredSqft(artifact.measuredSqft)
  );
}

export function scanMeasuredSqft(rooms: RoomCapture[]): number {
  return rooms.reduce(
    (sum, room) =>
      roomHasVerifiedScan(room)
        ? sum + (room.scanArtifact?.measuredSqft ?? 0)
        : sum,
    0
  );
}

export function legacyCompatibilitySqft(
  draft: Pick<ManualWalkthroughDraft, 'rooms' | 'measuredSqftFromScan'>
): number {
  if (scanMeasuredSqft(draft.rooms) !== 0) {
    return 0;
  }
  const value = draft.measuredSqftFromScan;
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : 0;
}

export function draftCanBeVerified(draft: ManualWalkthroughDraft): boolean {
  if (draft.rooms.length === 0) {
    return false;
  }
  const scanIds = new Set<string>();
  const jsonPaths = new Set<string>();
  const usdzPaths = new Set<string>();
  for (const room of draft.rooms) {
    if (!roomHasVerifiedScan(room)) {
      return false;
    }
    const artifact = room.scanArtifact!;
    if (
      scanIds.has(artifact.scanId) ||
      jsonPaths.has(artifact.jsonPath) ||
      usdzPaths.has(artifact.usdzPath)
    ) {
      return false;
    }
    scanIds.add(artifact.scanId);
    jsonPaths.add(artifact.jsonPath);
    usdzPaths.add(artifact.usdzPath);
  }
  return true;
}

export function normalizeDraftStore(value: unknown): DraftStore | null {
  if (!isRecord(value) || !isRecord(value.drafts)) {
    return null;
  }
  if (
    value.activeDraftId !== undefined &&
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
    Object.prototype.hasOwnProperty.call(drafts, value.activeDraftId)
      ? value.activeDraftId
      : null;
  return { activeDraftId, drafts };
}
