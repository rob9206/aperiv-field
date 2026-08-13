export const SQM_TO_SQFT = 10.76391041671;
export const MIN_VERIFIED_ROOM_SQFT = 1;
export const MAX_VERIFIED_ROOM_SQFT = 2_000;

export type VerifiedScanMeasurement = {
  measuredSqft: number;
  source: 'roomplan-floor-polygon' | 'roomplan-floor-dimensions';
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function validSqft(squareMeters: number): number | null {
  const sqft = squareMeters * SQM_TO_SQFT;
  return Number.isFinite(sqft) &&
    sqft >= MIN_VERIFIED_ROOM_SQFT &&
    sqft <= MAX_VERIFIED_ROOM_SQFT
    ? sqft
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function polygonArea(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return null;
  }

  const corners: number[][] = [];
  for (const corner of value) {
    if (
      !Array.isArray(corner) ||
      corner.length !== 3 ||
      !corner.every(isFiniteNumber)
    ) {
      return null;
    }
    corners.push(corner);
  }
  if (corners.length < 3) {
    return undefined;
  }

  const varyingAxes = [0, 1, 2].filter((axis) => {
    const first = corners[0][axis];
    return corners.some((corner) => corner[axis] !== first);
  });
  if (varyingAxes.length !== 2) {
    return null;
  }

  const [xAxis, yAxis] = varyingAxes;
  let twiceArea = 0;
  for (let index = 0; index < corners.length; index += 1) {
    const current = corners[index];
    const next = corners[(index + 1) % corners.length];
    twiceArea +=
      current[xAxis] * next[yAxis] - next[xAxis] * current[yAxis];
  }
  const area = Math.abs(twiceArea) / 2;
  return Number.isFinite(area) && area > 0 ? area : null;
}

function dimensionsArea(value: unknown): number | null {
  if (
    !Array.isArray(value) ||
    value.length < 2 ||
    !value.every(isFiniteNumber) ||
    value.some((extent) => extent < 0)
  ) {
    return null;
  }
  const positiveExtents = value.filter((extent) => extent > 0);
  if (positiveExtents.length !== 2) {
    return null;
  }
  const area = positiveExtents[0] * positiveExtents[1];
  return Number.isFinite(area) && area > 0 ? area : null;
}

export function parseVerifiedRoomPlanMeasurement(
  value: unknown
): VerifiedScanMeasurement | null {
  if (!isRecord(value) || !Array.isArray(value.floors) || value.floors.length === 0) {
    return null;
  }

  const identifiers = new Set<string>();
  let squareMeters = 0;
  let usedDimensions = false;

  for (const floorValue of value.floors) {
    if (!isRecord(floorValue)) {
      return null;
    }

    if ('identifier' in floorValue) {
      const identifier = floorValue.identifier;
      if (
        typeof identifier !== 'string' ||
        identifier.length === 0 ||
        identifiers.has(identifier)
      ) {
        return null;
      }
      identifiers.add(identifier);
    }

    const fromPolygon = polygonArea(floorValue.polygonCorners);
    if (fromPolygon !== undefined) {
      if (fromPolygon !== null) {
        squareMeters += fromPolygon;
        continue;
      }
    }

    const fromDimensions = dimensionsArea(floorValue.dimensions);
    if (fromDimensions === null) {
      return null;
    }
    squareMeters += fromDimensions;
    usedDimensions = true;
  }

  const measuredSqft = validSqft(squareMeters);
  if (measuredSqft === null) {
    return null;
  }
  return {
    measuredSqft,
    source: usedDimensions
      ? 'roomplan-floor-dimensions'
      : 'roomplan-floor-polygon',
  };
}
