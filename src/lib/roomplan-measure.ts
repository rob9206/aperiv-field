/** Square meters → square feet. */
export const SQM_TO_SQFT = 10.76391041671;

type RoomPlanSurface = {
  dimensions?: unknown;
  polygonCorners?: unknown;
  transform?: unknown;
};

type RoomPlanJson = {
  floors?: unknown;
  walls?: unknown;
};

type XZPoint = { x: number; z: number };

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

function xzPolygonAreaM2(points: XZPoint[]): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    sum += current.x * next.z - next.x * current.z;
  }
  return Math.abs(sum) / 2;
}

/** Monotone-chain convex hull on the XZ plane. */
export function convexHullXZ(points: XZPoint[]): XZPoint[] {
  if (points.length <= 1) {
    return points.slice();
  }

  const sorted = points
    .map((point, index) => ({ point, index }))
    .sort((left, right) => {
      if (left.point.x !== right.point.x) {
        return left.point.x - right.point.x;
      }
      if (left.point.z !== right.point.z) {
        return left.point.z - right.point.z;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.point);

  const unique: XZPoint[] = [];
  for (const point of sorted) {
    const last = unique[unique.length - 1];
    if (
      last &&
      Math.abs(last.x - point.x) < 1e-6 &&
      Math.abs(last.z - point.z) < 1e-6
    ) {
      continue;
    }
    unique.push(point);
  }

  if (unique.length <= 2) {
    return unique;
  }

  const cross = (origin: XZPoint, a: XZPoint, b: XZPoint) =>
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);

  const lower: XZPoint[] = [];
  for (const point of unique) {
    while (
      lower.length >= 2 &&
      cross(lower[lower.length - 2], lower[lower.length - 1], point) <= 0
    ) {
      lower.pop();
    }
    lower.push(point);
  }

  const upper: XZPoint[] = [];
  for (let i = unique.length - 1; i >= 0; i -= 1) {
    const point = unique[i];
    while (
      upper.length >= 2 &&
      cross(upper[upper.length - 2], upper[upper.length - 1], point) <= 0
    ) {
      upper.pop();
    }
    upper.push(point);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
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
 * Estimate floor area from wall segments (iOS 16 RoomPlan has walls but no floors).
 * Uses wall length + transform to collect floor-plane endpoints, then convex hull.
 */
export function wallFootprintAreaM2(walls: unknown): number {
  if (!Array.isArray(walls) || walls.length === 0) {
    return 0;
  }

  const endpoints: XZPoint[] = [];
  for (const wall of walls) {
    if (!wall || typeof wall !== 'object') {
      continue;
    }
    const surface = wall as RoomPlanSurface;
    const dimensions = asNumberArray(surface.dimensions);
    const transform = asNumberArray(surface.transform);
    if (!dimensions || !transform || transform.length < 16) {
      continue;
    }

    const length = Math.abs(dimensions[0] ?? 0);
    if (!(length > 1e-4)) {
      continue;
    }

    // Column-major 4x4: X axis = length direction, translation = center.
    const axisX = transform[0];
    const axisZ = transform[2];
    const centerX = transform[12];
    const centerZ = transform[14];
    const axisLength = Math.hypot(axisX, axisZ) || 1;
    const half = length / 2;
    const dx = (axisX / axisLength) * half;
    const dz = (axisZ / axisLength) * half;
    endpoints.push({ x: centerX - dx, z: centerZ - dz });
    endpoints.push({ x: centerX + dx, z: centerZ + dz });
  }

  return xzPolygonAreaM2(convexHullXZ(endpoints));
}

function sumSurfaceAreasM2(surfaces: unknown): number {
  if (!Array.isArray(surfaces) || surfaces.length === 0) {
    return 0;
  }
  let squareMeters = 0;
  for (const surface of surfaces) {
    if (!surface || typeof surface !== 'object') {
      continue;
    }
    squareMeters += floorAreaM2(surface as RoomPlanSurface);
  }
  return squareMeters;
}

/**
 * Total floor area in square feet from a RoomPlan `CapturedRoom` JSON payload.
 * Prefers floors (iOS 17+); falls back to wall-footprint estimate.
 */
export function measuredSqftFromRoomPlanJson(json: unknown): number | null {
  if (!json || typeof json !== 'object') {
    return null;
  }
  const payload = json as RoomPlanJson;

  let squareMeters = sumSurfaceAreasM2(payload.floors);
  if (!(squareMeters > 0)) {
    squareMeters = wallFootprintAreaM2(payload.walls);
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
