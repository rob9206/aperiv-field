import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  SQM_TO_SQFT,
  measuredSqftFromExportFields,
  measuredSqftFromRoomPlanJson,
} from './roomplan-measure.ts';

describe('measuredSqftFromRoomPlanJson', () => {
  it('returns null for missing floors', () => {
    assert.equal(measuredSqftFromRoomPlanJson(null), null);
    assert.equal(measuredSqftFromRoomPlanJson({}), null);
    assert.equal(measuredSqftFromRoomPlanJson({ floors: [] }), null);
  });

  it('uses floor dimensions (meters) and converts to sq ft', () => {
    // 4m x 5m = 20 m² ≈ 215.3 ft²
    const sqft = measuredSqftFromRoomPlanJson({
      floors: [{ dimensions: [4, 0, 5] }],
    });
    assert.ok(sqft != null);
    assert.ok(Math.abs(sqft - 20 * SQM_TO_SQFT) < 0.01);
  });

  it('sums multiple floors', () => {
    const sqft = measuredSqftFromRoomPlanJson({
      floors: [{ dimensions: [2, 0, 3] }, { dimensions: [4, 0, 5] }],
    });
    assert.ok(sqft != null);
    assert.ok(Math.abs(sqft - 26 * SQM_TO_SQFT) < 0.01);
  });

  it('prefers polygonCorners shoelace area when present', () => {
    // Unit square in XZ → 1 m²
    const sqft = measuredSqftFromRoomPlanJson({
      floors: [
        {
          dimensions: [10, 0, 10],
          polygonCorners: [
            [0, 0, 0],
            [1, 0, 0],
            [1, 0, 1],
            [0, 0, 1],
          ],
        },
      ],
    });
    assert.ok(sqft != null);
    assert.ok(Math.abs(sqft - SQM_TO_SQFT) < 0.01);
  });

  it('handles local-plane XY polygon corners', () => {
    const sqft = measuredSqftFromRoomPlanJson({
      floors: [
        {
          polygonCorners: [
            [0, 0, 0],
            [2, 0, 0],
            [2, 3, 0],
            [0, 3, 0],
          ],
        },
      ],
    });
    assert.ok(sqft != null);
    assert.ok(Math.abs(sqft - 6 * SQM_TO_SQFT) < 0.01);
  });
});

describe('measuredSqftFromExportFields', () => {
  it('prefers areaSquareFeet when valid', () => {
    assert.equal(
      measuredSqftFromExportFields({
        areaSquareFeet: '215.3',
        areaSquareMeters: '99',
      }),
      215.3
    );
  });

  it('falls back to areaSquareMeters', () => {
    const sqft = measuredSqftFromExportFields({ areaSquareMeters: 10 });
    assert.ok(sqft != null);
    assert.ok(Math.abs(sqft - 10 * SQM_TO_SQFT) < 0.01);
  });

  it('returns null when both are missing/invalid', () => {
    assert.equal(measuredSqftFromExportFields({}), null);
    assert.equal(
      measuredSqftFromExportFields({ areaSquareFeet: 'nope' }),
      null
    );
  });
});
