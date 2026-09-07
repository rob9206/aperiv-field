import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  SQM_TO_SQFT,
  parseVerifiedRoomPlanMeasurement,
} from './roomplan-measure.ts';

const fixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/roomplan-ios17-floor.json', import.meta.url),
    'utf8'
  )
) as unknown;

describe('parseVerifiedRoomPlanMeasurement', () => {
  it('reads a real iOS 17 floor polygon', () => {
    const result = parseVerifiedRoomPlanMeasurement(fixture);
    assert.equal(result?.source, 'roomplan-floor-polygon');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 20 * SQM_TO_SQFT) < 0.01);
  });

  it('falls back to valid floor dimensions', () => {
    const result = parseVerifiedRoomPlanMeasurement({
      floors: [{ dimensions: [3, 4, 0], polygonCorners: [] }],
    });
    assert.equal(result?.source, 'roomplan-floor-dimensions');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 12 * SQM_TO_SQFT) < 0.01);
  });

  it('falls back to dimensions when a nearly constant polygon axis is noisy', () => {
    const result = parseVerifiedRoomPlanMeasurement({
      floors: [
        {
          dimensions: [3, 4, 0],
          polygonCorners: [
            [0, 0, 0],
            [4, 0.000001, 0],
            [4, -0.000001, 3],
            [0, 0.000002, 3],
          ],
        },
      ],
    });

    assert.equal(result?.source, 'roomplan-floor-dimensions');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 12 * SQM_TO_SQFT) < 0.01);
  });

  it('falls back to dimensions when polygon corners have zero area', () => {
    const result = parseVerifiedRoomPlanMeasurement({
      floors: [
        {
          dimensions: [3, 4, 0],
          polygonCorners: [
            [0, 0, 0],
            [1, 0, 1],
            [2, 0, 2],
          ],
        },
      ],
    });

    assert.equal(result?.source, 'roomplan-floor-dimensions');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 12 * SQM_TO_SQFT) < 0.01);
  });

  it('rejects a bad polygon when dimensions are also invalid', () => {
    assert.equal(
      parseVerifiedRoomPlanMeasurement({
        floors: [
          {
            dimensions: [4, 0, 0],
            polygonCorners: [
              [0, 0, 0],
              [1, 0, 1],
              [2, 0, 2],
            ],
          },
        ],
      }),
      null
    );
  });

  it('reads object-shaped floor dimensions from Apple JSON', () => {
    const result = parseVerifiedRoomPlanMeasurement({
      floors: [
        {
          identifier: '7B2A1C0E-1111-2222-3333-444444444444',
          dimensions: { x: 3, y: 0, z: 4 },
          polygonCorners: [],
        },
      ],
    });
    assert.equal(result?.source, 'roomplan-floor-dimensions');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 12 * SQM_TO_SQFT) < 0.01);
  });

  it('reads object-shaped polygon corners from Apple JSON', () => {
    const result = parseVerifiedRoomPlanMeasurement({
      floors: [
        {
          polygonCorners: [
            { x: 0, y: 0, z: 0 },
            { x: 4, y: 0, z: 0 },
            { x: 4, y: 0, z: 3 },
            { x: 0, y: 0, z: 3 },
          ],
        },
      ],
    });
    assert.equal(result?.source, 'roomplan-floor-polygon');
    assert.ok(result);
    assert.ok(Math.abs(result.measuredSqft - 12 * SQM_TO_SQFT) < 0.01);
  });

  it('does not verify from walls', () => {
    assert.equal(
      parseVerifiedRoomPlanMeasurement({
        walls: [
          {
            dimensions: [4, 2.4, 0],
            transform: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
          },
        ],
      }),
      null
    );
  });

  it('rejects malformed and implausible values', () => {
    for (const value of [
      null,
      {},
      { floors: [] },
      { floors: [{ dimensions: [true, 4, 0] }] },
      { floors: [{ dimensions: [Number.MIN_VALUE, 4, 0] }] },
      { floors: [{ dimensions: [2_000, 2_000, 0] }] },
      { floors: [{ polygonCorners: [[0, 0, 0], [1, 0, 0]] }] },
    ]) {
      assert.equal(parseVerifiedRoomPlanMeasurement(value), null);
    }
  });
});
