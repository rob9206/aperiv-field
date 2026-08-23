import type { Unit } from '@/lib/database.types';

export const DEFAULT_DASHBOARD_PROPERTY_ID = 'default-property-id';

export type DashboardMetrics = {
  progress: number;
  awaitingReview: number;
  totalSqft: number;
  activeCrew: number;
};

export type DashboardColumns = {
  toDo: Unit[];
  inProgress: Unit[];
  needsReview: Unit[];
  approved: Unit[];
};

export type DashboardSnapshot = {
  metrics: DashboardMetrics;
  columns: DashboardColumns;
};

export function buildDashboardFromUnits(units: Unit[]): DashboardSnapshot {
  const totalUnits = units.length;
  const approvedUnits = units.filter((unit) => unit.status === 'approved').length;
  const progress =
    totalUnits > 0 ? Math.round((approvedUnits / totalUnits) * 100) : 0;

  const awaitingReview = units.filter(
    (unit) => unit.status === 'needs_review'
  ).length;
  const totalSqft = units.reduce(
    (sum, unit) => sum + (unit.verified_sqft ?? 0),
    0
  );

  const activeCrewIds = new Set(
    units
      .filter((unit) => unit.status === 'in_progress' && unit.assigned_to)
      .map((unit) => unit.assigned_to as string)
  );

  return {
    metrics: {
      progress,
      awaitingReview,
      totalSqft,
      activeCrew: activeCrewIds.size,
    },
    columns: {
      toDo: units.filter((unit) => unit.status === 'to_do'),
      inProgress: units.filter((unit) => unit.status === 'in_progress'),
      needsReview: units.filter((unit) => unit.status === 'needs_review'),
      approved: units.filter((unit) => unit.status === 'approved'),
    },
  };
}

function csvCell(value: string | number | null): string {
  const raw = value == null ? '' : String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildUnitsExportCsv(units: Unit[]): string {
  const header = 'unit_number,status,assigned_to,verified_sqft';
  const rows = units.map((unit) =>
    [
      csvCell(unit.unit_number),
      csvCell(unit.status),
      csvCell(unit.assigned_to),
      csvCell(unit.verified_sqft),
    ].join(',')
  );
  return [header, ...rows].join('\n');
}
