import assert from 'node:assert/strict';
import { test } from 'node:test';
import { activeRoster } from './active-roster.ts';

test('archived captures stay out of the roster without hiding mixed or empty properties', () => {
  const properties = [{ id: 'archive' }, { id: 'mixed' }, { id: 'empty' }];
  const units = [
    { id: 'old', property_id: 'archive', status: 'archived' },
    { id: 'old-mixed', property_id: 'mixed', status: 'archived' },
    { id: 'garage', property_id: 'mixed', status: 'active' },
  ];
  const result = activeRoster(properties, units);
  assert.deepEqual(result.properties.map(p => p.id), ['mixed', 'empty']);
  assert.deepEqual(result.units.map(u => u.id), ['garage']);
  assert.equal(units.length, 3);
});
