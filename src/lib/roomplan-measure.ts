/** Square meters → square feet. */
export const SQM_TO_SQFT = 10.76391041671;

type RoomPlanSurface = {
  dimensions?: unknown;
  polygonCorners?: unknown;
};

type RoomPlanJson = {
  floors?: unknown;
};

function asNumberArray(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const numbers = value.map((item) => Number(item));
  if (numbers.some((item) => !Number.isFinite(item))) {
    return null;
  }
  return numbers;
}

function asCornerList(value: unknown): number[][] | null {
  if (!Array.isArray(value) || value.length < 3) {
    return null;
  }
  const corners: number[][] = [];
  for (const corner of value) {
    const point = asNumberArray(corner);
    if (!point || point.length < 2) {
      return null;
    }
    corners.push(point);
  }
  return corners;
}

/** Shoelace area using the two axes with the largest span (local plane coords). */
function polygonAreaM2(corners: number[][]): number {
  const axisPairs: Array<[number, number]> = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];

  let bestArea = 0;
  for (const [a, b] of axisPairs) {
    if (corners.some((corner) => corner.length <= Math.max(a, b))) {
      continue;
    }
    let sum = 0;
    for (let i = 0; i < corners.length; i += 1) {
      const current = corners[i];
      const next = corners[(i + 1) % corners.length];
      sum += current[a] * next[b] - next[a] * current[b];
    }
    const area = Math.abs(sum) / 2;
    if (area > bestArea) {
      bestArea = area;
    }
  }
  return bestArea;
}

/** Bounding-box area from RoomPlan surface dimensions (meters). */
function dimensionsAreaM2(dimensions: number[]): number {
  const positive = dimensions
    .map((value) => Math.abs(value))
    .filter((value) => value > 1e-4)
    .sort((left, right) => right - left);
  if (positive.length < 2) {
    return 0;
  }
  return positive[0] * positive[1];
}

function floorAreaM2(surface: RoomPlanSurface): number {
  const corners = asCornerList(surface.polygonCorners);
  if (corners) {
    const polygonArea = polygonAreaM2(corners);
    if (polygonArea > 0) {
      return polygonArea;
    }
  }

  const dimensions = asNumberArray(surface.dimensions);
  if (!dimensions) {
    return 0;
  }
  return dimensionsAreaM2(dimensions);
}

/**
 * Total floor area in square feet from a RoomPlan `CapturedRoom` JSON payload.
 * Returns null when floors are missing or area cannot be derived.
 */
export function measuredSqftFromRoomPlanJson(json: unknown): number | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const floors = (json as RoomPlanJson).floors;
  if (!Array.isArray(floors) || floors.length === 0) {
    return null;
  }

  let squareMeters = 0;
  for (const floor of floors) {
    if (!floor || typeof floor !== 'object') {
      continue;
    }
    squareMeters += floorAreaM2(floor as RoomPlanSurface);
  }

  if (!(squareMeters > 0) || !Number.isFinite(squareMeters)) {
    return null;
  }

  return squareMeters * SQM_TO_SQFT;
}

/**
 * Prefer native-provided area fields when present; otherwise parse Room.json.
 */
export function measuredSqftFromExportFields(fields: {
  areaSquareFeet?: string | number | null;
  areaSquareMeters?: string | number | null;
}): number | null {
  const sqft = Number(fields.areaSquareFeet);
  if (Number.isFinite(sqft) && sqft > 0) {
    return sqft;
  }
  const sqm = Number(fields.areaSquareMeters);
  if (Number.isFinite(sqm) && sqm > 0) {
    return sqm * SQM_TO_SQFT;
  }
  return null;
}
