**Recommended model:** `GPT-5.2 Codex Extra High` -- Tier 3 native code generation spans Swift availability, Expo Modules bridging, CNG fingerprints, and device lifecycle behavior.

# RoomPlan Native Result DTO Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the path-only RoomPlan bridge with a versioned, scan-bound native result that reports verification-quality floor area and has an explicit file/result lifecycle.

**Architecture:** Build this track from reconciled `main` only after the JS persistence and verification primitives from the OTA hotfix have been ported to `main`. Pass a generated scan ID into native session start, include it in processed/error events, and export only the matching processed room. On iOS 17+, compute area from RoomPlan floors; on iOS 16 or invalid floor geometry, return no Verified measurement rather than a convex-hull estimate.

**Tech Stack:** Expo SDK 57 local modules, Swift 5.9, Apple RoomPlan/ARKit/RealityKit, TypeScript 6, Expo CNG, EAS Build, Internal TestFlight.

## Global Constraints

- Branch name: `cursor/roomplan-result-dto-f26e`.
- Base: latest reconciled `origin/main` after the JS reliability primitives are
  available on `main`.
- Target: iOS 16.4; guard every iOS 17 RoomPlan floor API.
- Do not restore the convex-hull wall estimate as Verified.
- Do not modify App Privacy declarations or add SDKs/dependencies.
- Keep `@emnapi/core` and `@emnapi/runtime` pinned in `devDependencies`.
- Native changes require a new runtime fingerprint and a new EAS binary.
- Distribution for testers: Internal TestFlight.
- Keep PR #10 draft/superseded; do not close it without explicit instruction.
- Cloud test gate: after writing a test-only or implementation change, commit
  and push it and create/update the draft PR before running the corresponding
  RED or GREEN command. Never amend or force-push; follow-up fixes get new
  commits.

---

### Task 1: Create a clean native branch after the JS reliability port

**Files:**
- No tracked file changes.

**Interfaces:**
- Consumes: latest `origin/main` plus the ported `RoomScanArtifact`,
  `commitRoomScan`, and scan-only verification helpers.
- Produces: clean branch `cursor/roomplan-result-dto-f26e`.

- [ ] **Step 1: Fetch and inspect the base**

```bash
git fetch origin main
git log --oneline -5 origin/main
git diff --check origin/main
```

Confirm `main` contains:

```text
RoomScanArtifact
commitRoomScan
draftCanBeVerified
scanMeasuredSqft
```

If any interface is absent, port the corresponding JS-only commit from the
OTA branch first as its own commit; do not copy the rejected convex-hull code.

- [ ] **Step 2: Create an isolated branch**

```bash
git worktree add \
  ".worktrees/roomplan-result-dto" \
  -b "cursor/roomplan-result-dto-f26e" \
  "origin/main"
cd ".worktrees/roomplan-result-dto"
npm ci
```

- [ ] **Step 3: Verify baseline**

```bash
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test src/lib/*.test.ts
npx expo-doctor
```

Expected:
- TypeScript, lint, and tests exit 0.
- Expo Doctor patch-version findings must be resolved in a separate dependency
  commit before native implementation, or explicitly documented as a build
  blocker. Do not run `npm audit fix --force`.

---

### Task 2: Define a versioned native/TypeScript result contract

**Files:**
- Modify: `modules/expo-room-scan/src/ExpoRoomScan.types.ts`
- Modify: `modules/expo-room-scan/src/ExpoRoomScanModule.ts`
- Modify: `modules/expo-room-scan/index.ts`
- Create: `modules/expo-room-scan/src/ExpoRoomScan.types.test.ts`

**Interfaces:**
- Consumes: Expo Modules bridge values.
- Produces:

```ts
export type RoomScanMeasurementSource =
  | 'roomplan-floor-polygon'
  | 'roomplan-floor-dimensions';

export type RoomScanNativeMeasurement = {
  squareMeters: number;
  squareFeet: number;
  source: RoomScanMeasurementSource;
};

export type RoomScanExportResult = {
  schemaVersion: 1;
  scanId: string;
  usdzPath: string;
  jsonPath: string;
  measurement?: RoomScanNativeMeasurement;
};

export type RoomScanProcessedEvent = {
  scanId: string;
};

export type RoomScanErrorEvent = {
  scanId?: string;
  message: string;
};

export function isValidScanId(value: unknown): value is string;
```

- [ ] **Step 1: Write failing contract tests**

Create `ExpoRoomScan.types.test.ts` around a pure validator:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseRoomScanExportResult } from './ExpoRoomScan.types.ts';

describe('parseRoomScanExportResult', () => {
  it('accepts the versioned DTO', () => {
    assert.deepEqual(
      parseRoomScanExportResult({
        schemaVersion: 1,
        scanId: 'scan-1',
        usdzPath: '/scan/Room.usdz',
        jsonPath: '/scan/Room.json',
        measurement: {
          squareMeters: 10,
          squareFeet: 107.6391041671,
          source: 'roomplan-floor-polygon',
        },
      }),
      {
        schemaVersion: 1,
        scanId: 'scan-1',
        usdzPath: '/scan/Room.usdz',
        jsonPath: '/scan/Room.json',
        measurement: {
          squareMeters: 10,
          squareFeet: 107.6391041671,
          source: 'roomplan-floor-polygon',
        },
      }
    );
  });

  it('rejects a mismatched or malformed DTO', () => {
    assert.equal(
      parseRoomScanExportResult({
        schemaVersion: 1,
        scanId: 'other',
        usdzPath: '',
        jsonPath: '',
      }),
      null
    );
  });

  it('rejects unsafe scan identifiers', () => {
    assert.equal(isValidScanId('scan-123_abc'), true);
    assert.equal(isValidScanId('../other-scan'), false);
    assert.equal(isValidScanId(''), false);
  });
});
```

The parser receives an optional expected scan ID in production:

```ts
parseRoomScanExportResult(value, expectedScanId)
```

- [ ] **Step 2: Commit the contract tests, push, then verify RED**

```bash
git add modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
git commit -m "test(roomplan): specify versioned native result contract"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
```

Expected: FAIL because the parser and DTO do not exist.

Create a draft PR targeting `main` after this first pushed commit. Keep it
draft while RED commits are present.

- [ ] **Step 3: Implement exact runtime validation**

Implement `parseRoomScanExportResult` with:
- `schemaVersion === 1`;
- non-empty `scanId`, JSON path, and USDZ path;
- exact expected scan ID when provided;
- optional finite positive measurement;
- source restricted to the two verified sources;
- square-meter/square-foot consistency within 0.1%.

Implement scan ID validation once and reuse it in start/export/delete wrappers:

```ts
const SCAN_ID = /^[A-Za-z0-9_-]{1,128}$/;

export function isValidScanId(value: unknown): value is string {
  return typeof value === 'string' && SCAN_ID.test(value);
}
```

- [ ] **Step 4: Update module signatures**

```ts
declare class ExpoRoomScanNativeModule
  extends NativeModule<ExpoRoomScanModuleEvents> {
  isSupported(): Promise<boolean>;
  startSession(scanId: string): Promise<void>;
  finishSession(): Promise<void>;
  cancelSession(): Promise<void>;
  exportResults(scanId: string): Promise<unknown>;
  share(paths: string[]): Promise<void>;
  deleteResults(scanId: string): Promise<void>;
}
```

The public `exportResults` wrapper validates the unknown native value before
returning `RoomScanExportResult`.

- [ ] **Step 5: Commit implementation, push, then run GREEN checks**

```bash
git add modules/expo-room-scan
git commit -m "feat(roomplan): define versioned scan result contract"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
npx tsc --noEmit
```

---

### Task 3: Bind native session lifecycle to the scan ID

**Files:**
- Modify: `modules/expo-room-scan/ios/ExpoRoomScanModule.swift`
- Modify: `modules/expo-room-scan/ios/RoomScanView.swift`
- Modify: `modules/expo-room-scan/src/ExpoRoomScan.types.ts`
- Create: `src/lib/room-scan-session-controller.ts`
- Create: `src/lib/room-scan-session-controller.test.ts`

**Interfaces:**
- Consumes: validated `scanId` from JS at session start.
- Produces: processed/error events and exports bound to that ID.

- [ ] **Step 1: Write lifecycle and stale-ID tests**

Extend `ExpoRoomScan.types.test.ts` and create the pure
`room-scan-session-controller.test.ts`:

```ts
it('ignores processed events for another scan ID', () => {
  const controller = createRoomScanSessionController();
  controller.begin({ scanId: 'scan-a', draftId: 'd', roomId: 'r' });
  assert.equal(controller.processed({ scanId: 'scan-b' }), null);
  assert.equal(controller.current()?.scanId, 'scan-a');
});

it('clears the pending target on cancel', () => {
  const controller = createRoomScanSessionController();
  controller.begin({ scanId: 'scan-a', draftId: 'd', roomId: 'r' });
  controller.cancel();
  assert.equal(controller.current(), null);
});
```

- [ ] **Step 2: Commit lifecycle tests, push, then verify RED**

```bash
git add \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts \
  src/lib/room-scan-session-controller.test.ts
git commit -m "test(roomplan): reproduce stale native result delivery"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts \
  src/lib/room-scan-session-controller.test.ts
```

Expected: FAIL because the controller and ID-bound events do not exist.

- [ ] **Step 3: Introduce native result state**

Replace the loose `finalResults` state with:

```swift
@available(iOS 16.0, *)
private struct ProcessedScan {
  let scanId: String
  let room: CapturedRoom
}

private var activeScanId: String?

@available(iOS 16.0, *)
private var processedScan: ProcessedScan?
```

Extract scan ID validation into:

```swift
private func validateScanId(_ scanId: String) throws
```

Call it from both `startSession(scanId:)` and `exportResults(scanId:)`.

- [ ] **Step 4: Pass ID into session start**

Change:

```swift
AsyncFunction("startSession") { (scanId: String) in
  try self.startRoomCaptureSession(scanId: scanId)
}
```

`startRoomCaptureSession` sets `activeScanId` only after validation and before
running RoomPlan.

- [ ] **Step 5: Bind processed and error events**

On processed:

```swift
guard let scanId = activeScanId else {
  reportRoomCaptureError(RoomScanIdentifierMissingException())
  return
}
processedScan = ProcessedScan(scanId: scanId, room: processedResult)
isProcessing = false
sendStatus("processed")
sendEvent("onProcessed", ["scanId": scanId])
```

Error payload includes `activeScanId` when available. Cancel and every terminal
error clear `activeScanId` and `processedScan`.

- [ ] **Step 6: Refuse stale exports**

```swift
guard let processedScan, processedScan.scanId == scanId else {
  throw RoomScanResultsUnavailableException()
}
```

After a successful export, clear both processed result and active ID. Also
clear them whenever the owning `RoomScanView` unmounts, including after
processing completed.

- [ ] **Step 7: Implement the pure JS session controller**

Create `src/lib/room-scan-session-controller.ts` with:

```ts
export type PendingScan = {
  scanId: string;
  draftId: string;
  roomId: string;
};

export function createRoomScanSessionController() {
  let pending: PendingScan | null = null;
  return {
    begin(next: PendingScan) {
      if (pending) throw new Error('A scan is already active.');
      pending = next;
      return next;
    },
    current() {
      return pending;
    },
    processed(event: { scanId: string }) {
      return pending?.scanId === event.scanId ? pending : null;
    },
    cancel() {
      pending = null;
    },
    complete(scanId: string) {
      if (pending?.scanId !== scanId) return null;
      const completed = pending;
      pending = null;
      return completed;
    },
  };
}
```

- [ ] **Step 8: Commit implementation, push, then run GREEN checks**

```bash
git add \
  modules/expo-room-scan \
  src/lib/room-scan-session-controller.ts
git commit -m "fix(roomplan): bind native results to their capture session"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  modules/expo-room-scan/src/*.test.ts \
  src/lib/room-scan-session-controller.test.ts
npx tsc --noEmit
npm run lint
```

---

### Task 4: Compute native floor area without wall-hull verification

**Files:**
- Create: `modules/expo-room-scan/ios/Package.swift`
- Create: `modules/expo-room-scan/ios/RoomScanMeasurement.swift`
- Create: `modules/expo-room-scan/ios/Tests/RoomScanMeasurementTests.swift`
- Modify: `modules/expo-room-scan/ios/ExpoRoomScanModule.swift`
- Modify: `modules/expo-room-scan/ios/ExpoRoomScan.podspec`
- Modify: `modules/expo-room-scan/src/ExpoRoomScan.types.test.ts`

**Interfaces:**
- Consumes: iOS 17 `CapturedRoom.floors`.
- Produces:

```swift
struct RoomScanMeasurement {
  enum Source: String {
    case floorPolygon = "roomplan-floor-polygon"
    case floorDimensions = "roomplan-floor-dimensions"
  }

  let squareMeters: Double
  let source: Source
}
```

- [ ] **Step 1: Add Swift math tests and TypeScript parity vectors**

Add vectors that both native math and the OTA parser must satisfy:

```ts
[
  {
    name: 'rectangle polygon',
    corners: [[0, 0, 0], [4, 0, 0], [4, 5, 0], [0, 5, 0]],
    squareMeters: 20,
  },
  {
    name: 'concave L polygon',
    corners: [
      [0, 0, 0],
      [4, 0, 0],
      [4, 2, 0],
      [2, 2, 0],
      [2, 4, 0],
      [0, 4, 0],
    ],
    squareMeters: 12,
  },
]
```

Confirm shoelace preserves the 12 m² concavity rather than returning its hull.

Create `modules/expo-room-scan/ios/Package.swift`:

```swift
// swift-tools-version: 5.9
import PackageDescription

let package = Package(
  name: "RoomScanMeasurement",
  platforms: [.macOS(.v13)],
  products: [
    .library(name: "RoomScanMeasurement", targets: ["RoomScanMeasurement"])
  ],
  targets: [
    .target(
      name: "RoomScanMeasurement",
      path: ".",
      exclude: [
        "ExpoRoomScanModule.swift",
        "RoomScanView.swift",
        "ExpoRoomScan.podspec",
        "Tests",
      ],
      sources: ["RoomScanMeasurement.swift"]
    ),
    .testTarget(
      name: "RoomScanMeasurementTests",
      dependencies: ["RoomScanMeasurement"],
      path: "Tests"
    ),
  ]
)
```

Create `Tests/RoomScanMeasurementTests.swift`:

```swift
import XCTest
@testable import RoomScanMeasurement

final class RoomScanMeasurementTests: XCTestCase {
  func testRectanglePolygon() {
    let corners: [SIMD3<Float>] = [
      SIMD3<Float>(0, 0, 0),
      SIMD3<Float>(4, 0, 0),
      SIMD3<Float>(4, 5, 0),
      SIMD3<Float>(0, 5, 0),
    ]
    XCTAssertEqual(
      RoomScanMeasurementMath.polygonArea(corners),
      20,
      accuracy: 0.0001
    )
  }

  func testConcavePolygonPreservesRecess() {
    let corners: [SIMD3<Float>] = [
      SIMD3<Float>(0, 0, 0),
      SIMD3<Float>(4, 0, 0),
      SIMD3<Float>(4, 2, 0),
      SIMD3<Float>(2, 2, 0),
      SIMD3<Float>(2, 4, 0),
      SIMD3<Float>(0, 4, 0),
    ]
    XCTAssertEqual(
      RoomScanMeasurementMath.polygonArea(corners),
      12,
      accuracy: 0.0001
    )
  }

  func testInvalidPolygon() {
    XCTAssertEqual(
      RoomScanMeasurementMath.polygonArea([
        SIMD3<Float>(0, 0, 0),
        SIMD3<Float>(1, 0, 0),
      ]),
      0
    )
  }

  func testDimensionsArea() {
    XCTAssertEqual(
      RoomScanMeasurementMath.dimensionsArea(SIMD3<Float>(3, 4, 0)),
      12,
      accuracy: 0.0001
    )
  }
}
```

- [ ] **Step 2: Commit math tests, push, then verify RED**

```bash
git add \
  modules/expo-room-scan/ios/Package.swift \
  modules/expo-room-scan/ios/Tests/RoomScanMeasurementTests.swift \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
git commit -m "test(roomplan): specify floor area geometry"
git push -u origin cursor/roomplan-result-dto-f26e
swift test --package-path modules/expo-room-scan/ios
```

Expected: FAIL because `RoomScanMeasurement.swift` does not exist.

- [ ] **Step 3: Implement pure polygon/dimensions math**

In `RoomScanMeasurement.swift`:

```swift
import Foundation
import simd

struct RoomScanMeasurement {
  enum Source: String {
    case floorPolygon = "roomplan-floor-polygon"
    case floorDimensions = "roomplan-floor-dimensions"
  }

  let squareMeters: Double
  let source: Source
}

enum RoomScanMeasurementMath {
  static let squareMetersToSquareFeet = 10.76391041671

  static func polygonArea(_ corners: [SIMD3<Float>]) -> Double {
    guard corners.count >= 3 else { return 0 }
    let axisPairs = [(0, 1), (0, 2), (1, 2)]
    return axisPairs.reduce(0) { best, pair in
      let area = shoelace(corners, first: pair.0, second: pair.1)
      return max(best, area)
    }
  }

  private static func shoelace(
    _ corners: [SIMD3<Float>],
    first: Int,
    second: Int
  ) -> Double {
    func axis(_ point: SIMD3<Float>, _ index: Int) -> Double {
      switch index {
      case 0: return Double(point.x)
      case 1: return Double(point.y)
      default: return Double(point.z)
      }
    }

    var sum = 0.0
    for index in corners.indices {
      let current = corners[index]
      let next = corners[(index + 1) % corners.count]
      sum +=
        axis(current, first) * axis(next, second) -
        axis(next, first) * axis(current, second)
    }
    return abs(sum) / 2.0
  }

  static func dimensionsArea(_ dimensions: SIMD3<Float>) -> Double {
    let extents = [
      abs(Double(dimensions.x)),
      abs(Double(dimensions.y)),
      abs(Double(dimensions.z)),
    ]
    .filter { $0 > 0.0001 }
    .sorted(by: >)
    guard extents.count >= 2 else { return 0 }
    return extents[0] * extents[1]
  }
}
```

`shoelace` must preserve corner order and never construct a convex hull.

- [ ] **Step 4: Gate RoomPlan floors to iOS 17**

```swift
@available(iOS 17.0, *)
private func verifiedFloorMeasurement(
  from room: CapturedRoom
) -> RoomScanMeasurement? {
  guard !room.floors.isEmpty else { return nil }
  var total = 0.0
  var allUsedPolygon = true
  var identifiers = Set<UUID>()

  for floor in room.floors {
    guard identifiers.insert(floor.identifier).inserted else { continue }
    let polygon = RoomScanMeasurementMath.polygonArea(floor.polygonCorners)
    if polygon > 0 {
      total += polygon
      continue
    }
    let dimensions = RoomScanMeasurementMath.dimensionsArea(floor.dimensions)
    guard dimensions > 0 else { return nil }
    total += dimensions
    allUsedPolygon = false
  }

  guard total > 0, total.isFinite else { return nil }
  return RoomScanMeasurement(
    squareMeters: total,
    source: allUsedPolygon ? .floorPolygon : .floorDimensions
  )
}
```

If `#available(iOS 17.0, *)` is false, return `nil`. Do not inspect walls.

- [ ] **Step 5: Return the versioned DTO**

Change export return type to `[String: Any]`:

```swift
var payload: [String: Any] = [
  "schemaVersion": 1,
  "scanId": scanId,
  "usdzPath": usdzURL.path,
  "jsonPath": jsonURL.path,
]

if #available(iOS 17.0, *),
  let measurement = verifiedFloorMeasurement(from: processedScan.room) {
  payload["measurement"] = [
    "squareMeters": measurement.squareMeters,
    "squareFeet":
      measurement.squareMeters *
      RoomScanMeasurementMath.squareMetersToSquareFeet,
    "source": measurement.source.rawValue,
  ]
}
```

- [ ] **Step 6: Exclude Swift tests from the CocoaPods target**

Add to `ExpoRoomScan.podspec`:

```ruby
s.exclude_files = 'Tests/**/*', 'Package.swift'
```

Keep `RoomScanMeasurement.swift` inside the existing source-files glob.

- [ ] **Step 7: Commit implementation, push, then run GREEN math checks**

```bash
git add \
  modules/expo-room-scan/ios/RoomScanMeasurement.swift \
  modules/expo-room-scan/ios/ExpoRoomScanModule.swift \
  modules/expo-room-scan/ios/ExpoRoomScan.podspec
git commit -m "feat(roomplan): export verified floor measurement metadata"
git push -u origin cursor/roomplan-result-dto-f26e
swift test --package-path modules/expo-room-scan/ios
node --experimental-strip-types --test \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
```

Expected: both suites pass.

- [ ] **Step 8: Compile through an EAS development build**

Before claiming the Swift code compiles:

```bash
eas build --platform ios --profile development --non-interactive
```

This requires Expo/Apple authentication. If unavailable, report the blocker
and do not claim native compilation.

If EAS compilation fails, fix it in a new commit, push, update the draft PR,
and rerun the build. Do not amend the implementation commit.

---

### Task 5: Integrate the DTO and preserve old-export compatibility

**Files:**
- Modify: `src/app/walkthrough.tsx`
- Modify: `src/lib/read-roomplan-measure.ts`
- Modify: `src/lib/roomplan-measure.ts`
- Modify: `src/lib/roomplan-measure.test.ts`
- Modify: `src/lib/draft-store.ts`
- Modify: `src/lib/draft-store.test.ts`

**Interfaces:**
- Consumes: versioned native DTO or legacy path-only result.
- Produces:

```ts
export type LegacyRoomScanExportResult = {
  usdzPath: string;
  jsonPath: string;
};

export async function buildRoomScanArtifact(
  value: unknown,
  expectedScanId: string,
  readLegacyMeasurement?: (
    result: LegacyRoomScanExportResult
  ) => Promise<VerifiedScanMeasurement | null>
): Promise<RoomScanArtifact | null>;
```

- [ ] **Step 1: Write native-preference and legacy-fallback tests**

```ts
it('prefers a valid matching native measurement', async () => {
  const artifact = await buildRoomScanArtifact(nativeResult, 'scan-1');
  assert.equal(artifact?.source, 'roomplan-floor-polygon');
  assert.equal(artifact?.measuredSqft, nativeResult.measurement.squareFeet);
});

it('parses legacy Room.json when native measurement is absent', async () => {
  const artifact = await buildRoomScanArtifact(legacyResult, 'scan-1');
  assert.equal(artifact?.source, 'roomplan-floor-polygon');
});

it('rejects a native result for another scan', async () => {
  assert.equal(await buildRoomScanArtifact(nativeResult, 'scan-2'), null);
});

```

- [ ] **Step 2: Commit compatibility tests, push, then verify RED**

```bash
git add \
  src/lib/roomplan-measure.test.ts \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
git commit -m "test(scan): specify native and legacy export compatibility"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  src/lib/roomplan-measure.test.ts \
  modules/expo-room-scan/src/ExpoRoomScan.types.test.ts
```

- [ ] **Step 3: Implement compatibility adapter**

The adapter:
1. validates schema v1 and matching scan ID;
2. uses native measurement when present;
3. otherwise reads and parses `Room.json`;
4. emits one `RoomScanArtifact`;
5. returns `null` on malformed/unverified geometry.

Do not preserve the rejected `areaSquareFeet`/`areaSquareMeters` string fields
from PR #10.

- [ ] **Step 4: Integrate native delete lifecycle**

`deleteResults(scanId)` validates the identifier and removes only
`Documents/scans/<scanId>`. It must be idempotent for a missing directory and
reject an invalid identifier.

Register:

```swift
AsyncFunction("deleteResults") { (scanId: String) in
  try self.validateScanId(scanId)
  try self.deleteRoomCaptureResults(scanId: scanId)
}.runOnQueue(.main)
```

Implement:

```swift
private func deleteRoomCaptureResults(scanId: String) throws {
  let fileManager = FileManager.default
  guard let documentsURL = fileManager.urls(
    for: .documentDirectory,
    in: .userDomainMask
  ).first else {
    throw RoomScanDocumentsUnavailableException()
  }
  let scanURL = documentsURL
    .appendingPathComponent("scans", isDirectory: true)
    .appendingPathComponent(scanId, isDirectory: true)
  guard fileManager.fileExists(atPath: scanURL.path) else {
    return
  }
  try fileManager.removeItem(at: scanURL)
}
```

Use it after:
- failed parse/commit;
- rescan replacement;
- job deletion.

Keep direct path deletion as a legacy fallback for artifacts created by old
binaries.

- [ ] **Step 5: Commit implementation, push, then run GREEN checks**

```bash
git add \
  modules/expo-room-scan \
  src/app/walkthrough.tsx \
  src/lib/read-roomplan-measure.ts \
  src/lib/roomplan-measure.ts \
  src/lib/roomplan-measure.test.ts \
  src/lib/draft-store.ts \
  src/lib/draft-store.test.ts
git commit -m "feat(scan): consume versioned native RoomPlan results"
git push -u origin cursor/roomplan-result-dto-f26e
node --experimental-strip-types --test \
  modules/expo-room-scan/src/*.test.ts \
  src/lib/*.test.ts
npx tsc --noEmit
npm run lint
```

---

### Task 6: Build, review, and test the native binary

**Files:**
- No additional tracked changes expected unless review finds defects.

**Interfaces:**
- Consumes: completed native branch.
- Produces: draft PR, successful EAS iOS build, and Internal TestFlight device
  evidence.

- [ ] **Step 1: Run repository verification**

```bash
npm ci
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test \
  modules/expo-room-scan/src/*.test.ts \
  src/lib/*.test.ts
npx expo export --platform ios --output-dir /tmp/aperiv-native-ios
npx expo export --platform android --output-dir /tmp/aperiv-native-android
npx expo export --platform web --output-dir /tmp/aperiv-native-web
npx expo-doctor
```

Every command must exit 0. Resolve Expo SDK patch mismatches with
`npx expo install --fix` in a separate dependency commit only if required for
the native build; re-check the lockfile pins afterward.

- [ ] **Step 2: Confirm a new runtime**

```bash
npx expo-updates fingerprint:generate --platform ios > /tmp/native-fingerprint.json
node -e "const f=require('/tmp/native-fingerprint.json'); console.log(f.hash)"
```

Expected: a value different from `d0791770…`. Record it in the PR test plan.

- [ ] **Step 3: Request native-focused code review**

Review:
- iOS 16/17 availability;
- scan-ID lifecycle and stale callback rejection;
- DTO bridge types;
- polygon order and dimensions fallback;
- result clearing after export/unmount;
- file deletion identifier validation;
- legacy path-only compatibility;
- App Privacy unchanged.

Fix Critical/Important findings, then rerun Steps 1–2.

- [ ] **Step 4: Push and create a draft PR targeting `main`**

```bash
git push -u origin cursor/roomplan-result-dto-f26e
```

PR body must include:
- new fingerprint;
- EAS build URL;
- exact automated checks;
- unsupported iOS 16 Verified behavior (Unverified only without floors);
- no new data collection/SDKs;
- device test checklist.

- [ ] **Step 5: Build the production-equivalent binary**

```bash
eas build --platform ios --profile production --non-interactive
```

Do not submit or distribute until the build succeeds and its native module is
confirmed in the artifact/runtime.

- [ ] **Step 6: Distribute through Internal TestFlight**

Use the successful production build with the internal group. Do not use Ad Hoc
for remote partners unless their UDID is registered and the profile rebuilt.

- [ ] **Step 7: Execute LiDAR device acceptance**

On a supported iPhone/iPad:
1. verify the binary contains `ExpoRoomScan`;
2. scan a rectangular room and compare displayed area to a known measurement;
3. scan a concave room and confirm the floor polygon preserves concavity;
4. on iOS 16.4, confirm scan files save but job remains Unverified;
5. rescan and confirm replacement/old-file cleanup;
6. cancel and background/foreground during capture/processing;
7. reject stale events and mismatched scan IDs;
8. share JSON/USDZ;
9. delete the job and confirm files are gone;
10. complete every room and verify the scan-only total/status;
11. repeat key errors in Spanish.

Record device model, iOS version, build number, runtime fingerprint, expected
area, and observed area. Do not mark the PR ready until the acceptance record
is attached.

