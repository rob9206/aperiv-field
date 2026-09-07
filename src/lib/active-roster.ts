// Archived units retain their captures but do not appear in the working roster.
export function activeRoster<P extends { id: string }, U extends { property_id: string; status?: string }>(
  properties: P[],
  units: U[],
): { properties: P[]; units: U[] } {
  const active = units.filter(unit => unit.status !== 'archived');
  const occupied = new Set(units.map(unit => unit.property_id));
  const activeProperties = new Set(active.map(unit => unit.property_id));
  return {
    properties: properties.filter(property => !occupied.has(property.id) || activeProperties.has(property.id)),
    units: active,
  };
}
