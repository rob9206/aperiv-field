import type { Unit as DatabaseUnit, Walkthrough } from './database.types';
export type DashboardUnit = {
  id: string;
  property_id: string;
  unit_number: string;
  status: 'to_do' | 'in_progress' | 'needs_review' | 'approved';
  assigned_to: string | null;
  verified_sqft: number | null;
};
type Unit = DashboardUnit;

export function dashboardUnits(
  units: DatabaseUnit[],
  walkthroughs: Walkthrough[],
  turnovers: { unit_id: string; stage: string; started_at: string }[]
): DashboardUnit[] {
  return units.map((unit) => {
    const latest = walkthroughs
      .filter((w) => w.unit_id === unit.id && w.status === 'complete')
      .sort(
        (a, b) =>
          b.captured_at.localeCompare(a.captured_at) || b.id.localeCompare(a.id)
      )[0];
    const turnover = turnovers
      .filter((t) => t.unit_id === unit.id)
      .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
    const approved = ['work_orders', 'vendor_review', 'ready'].includes(
      turnover?.stage ?? ''
    );
    return {
      id: unit.id,
      property_id: unit.property_id,
      unit_number: unit.unit_number,
      status: latest?.source_draft_id
        ? 'needs_review'
        : approved
          ? 'approved'
          : latest
            ? 'needs_review'
            : turnover?.stage === 'walkthrough'
              ? 'in_progress'
              : 'to_do',
      assigned_to: latest?.captured_by ?? null,
      verified_sqft:
        latest && latest.verification_status !== 'unverified'
          ? latest.measured_sqft
          : null,
    };
  });
}

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
  const approvedUnits = units.filter(
    (unit) => unit.status === 'approved'
  ).length;
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
