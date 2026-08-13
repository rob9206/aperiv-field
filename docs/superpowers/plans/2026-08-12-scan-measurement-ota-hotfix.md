**Recommended model:** `Opus 4.6 Max` -- Tier 3 refactor must preserve an installed native runtime while replacing persistence and verification behavior.

# Scan Measurement OTA Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver reliable post-scan square footage to builds 12/13 without changing their native runtime, while preventing partial, estimated, stale, or manually entered values from verifying a unit.

**Architecture:** Create an OTA branch from the JS-only one-screen capture commit `eda2d7d` (a descendant of deployed runtime commit `26ded93`). Parse only verification-quality floor geometry from the native module's existing `Room.json`, commit results through one queued read-modify-write store, and bind every result to the draft and room captured before scanning. Keep native files and all fingerprint inputs unchanged.

**Tech Stack:** Expo SDK 57, React Native 0.86, TypeScript 6, Expo Router, AsyncStorage, Expo FileSystem, Node test runner, EAS Update fingerprint runtime.

## Global Constraints

- Branch name: `cursor/scan-measurement-ota-f26e`.
- Branch base: `eda2d7dd12ef6269546218e91445084679c75977`.
- Required iOS runtime fingerprint before and after changes:
  `d0791770178bd021d9a4444d1cf738ec0e405752`.
- Do not modify `app.json`, `eas.json`, `package.json`, `package-lock.json`,
  `fingerprint.config.js`, or any file under `modules/**/ios`.
- Do not add dependencies.
- Keep the one-screen-per-room capture UX from `eda2d7d`.
- English is default; every new field-facing string requires English and Spanish.
- Verified requires every required room to have a positive finite RoomPlan floor
  measurement; any skipped room forces Unverified.
- Legacy/manual `room.sqft` never contributes to a scan-derived total.
- Wall-derived estimates never satisfy Verified.
- Do not publish to production without an existing build 12/13 device test.
- Cloud test gate: after writing a test-only or implementation change, commit
  and push it and create/update the draft PR before running the corresponding
  RED or GREEN command. Never amend or force-push; follow-up fixes get new
  commits.

---

### Task 1: Create the installed-runtime branch and establish the fingerprint gate

**Files:**
- No tracked file changes.

**Interfaces:**
- Consumes: deployed source `26ded93`, JS-only one-screen commit `eda2d7d`.
- Produces: isolated branch `cursor/scan-measurement-ota-f26e` with a recorded
  baseline fingerprint.

- [ ] **Step 1: Create an isolated worktree and branch**

```bash
git worktree add \
  ".worktrees/scan-measurement-ota" \
  -b "cursor/scan-measurement-ota-f26e" \
  "eda2d7dd12ef6269546218e91445084679c75977"
cd ".worktrees/scan-measurement-ota"
npm ci
```

- [ ] **Step 2: Verify the baseline source and quality gates**

```bash
git diff --name-only \
  "26ded93341cc69c72308a045d6eda44cc57286a7..HEAD"
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test src/lib/*.test.ts
```

Expected:
- the diff from `26ded93` contains only docs/TypeScript/theme files;
- TypeScript and lint exit 0;
- existing tests pass.

- [ ] **Step 3: Verify the installed runtime fingerprint**

```bash
npx expo-updates fingerprint:generate --platform ios > /tmp/ota-fingerprint.json
node -e "const f=require('/tmp/ota-fingerprint.json'); console.log(f.hash)"
```

Expected exactly:

```text
d0791770178bd021d9a4444d1cf738ec0e405752
```

If it differs, stop. Do not implement on this branch until the changed
fingerprint sources are identified and removed.

---

### Task 2: Parse verification-quality RoomPlan floor geometry

**Files:**
- Create: `src/lib/roomplan-measure.ts`
- Create: `src/lib/roomplan-measure.test.ts`
- Create: `src/lib/fixtures/roomplan-ios17-floor.json`
- Create: `src/lib/read-roomplan-measure.ts`

**Interfaces:**
- Consumes: existing `RoomScanExportResult` with `jsonPath` and `usdzPath`.
- Produces:

```ts
export type VerifiedScanMeasurement = {
  measuredSqft: number;
  source: 'roomplan-floor-polygon' | 'roomplan-floor-dimensions';
};

export function parseVerifiedRoomPlanMeasurement(
  value: unknown
): VerifiedScanMeasurement | null;

export async function readVerifiedMeasurementFromExport(
  result: RoomScanExportResult
): Promise<VerifiedScanMeasurement | null>;
```

- [ ] **Step 1: Add a real exported-floor fixture**

Create `src/lib/fixtures/roomplan-ios17-floor.json` from a sanitized iOS 17
RoomPlan export. Retain the real encoding shape for `floors`, `dimensions`,
`polygonCorners`, and `transform`; remove identifiers and objects not required
by the parser.

The fixture must contain a four-corner 4 m × 5 m floor:

```json
{
  "floors": [
    {
      "dimensions": [4, 5, 0],
      "polygonCorners": [
        [-2, -2.5, 0],
        [2, -2.5, 0],
        [2, 2.5, 0],
        [-2, 2.5, 0]
      ],
      "transform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }
  ]
}
```

- [ ] **Step 2: Write failing parser tests**

Create `src/lib/roomplan-measure.test.ts`:

```ts
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
```

- [ ] **Step 3: Commit the regression test, push, then verify RED**

```bash
git add \
  src/lib/fixtures/roomplan-ios17-floor.json \
  src/lib/roomplan-measure.test.ts
git commit -m "test(scan): reproduce missing RoomPlan floor measurement"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/roomplan-measure.test.ts
```

Expected: FAIL because `roomplan-measure.ts` does not exist.

Create the draft PR targeting `main` after this first pushed commit. Keep it
draft while RED commits are present.

- [ ] **Step 4: Implement the floor-only parser**

Create `src/lib/roomplan-measure.ts` with these exported constants and
validation rules:

```ts
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
```

Implement shoelace area over the two non-constant local-plane axes. If a floor
has at least three valid polygon corners, use the polygon. Otherwise use the
two positive finite floor dimension extents. Sum valid floor surfaces. Reject
duplicate floor identifiers rather than summing them twice. Return `null` if
any declared floor is malformed or the final area fails `validSqft`.

Do not inspect `walls` in this function.

- [ ] **Step 5: Implement the file reader**

Create `src/lib/read-roomplan-measure.ts`:

```ts
import { File } from 'expo-file-system';

import type { RoomScanExportResult } from '../../modules/expo-room-scan';
import {
  parseVerifiedRoomPlanMeasurement,
  type VerifiedScanMeasurement,
} from './roomplan-measure';

export async function readVerifiedMeasurementFromExport(
  result: RoomScanExportResult
): Promise<VerifiedScanMeasurement | null> {
  try {
    const uri = result.jsonPath.startsWith('file://')
      ? result.jsonPath
      : `file://${result.jsonPath}`;
    const file = new File(uri);
    if (!file.exists) return null;
    return parseVerifiedRoomPlanMeasurement(JSON.parse(await file.text()));
  } catch {
    return null;
  }
}
```

- [ ] **Step 6: Commit the implementation, push, then run GREEN checks**

```bash
git add \
  src/lib/roomplan-measure.ts \
  src/lib/read-roomplan-measure.ts
git commit -m "feat(scan): parse verified floor area from RoomPlan export"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/roomplan-measure.test.ts
node --experimental-strip-types --test src/lib/*.test.ts
```

Expected: PASS with no failed tests.

- [ ] **Step 7: Update the draft PR checkpoint**

Update the draft PR body with the RED/GREEN commands and passing test count.

---

### Task 3: Normalize persisted drafts and define scan-only verification

**Files:**
- Create: `src/lib/walkthrough-schema.ts`
- Create: `src/lib/walkthrough-schema.test.ts`
- Modify: `src/lib/walkthrough-draft.ts`
- Modify: `src/lib/walkthrough-draft.test.ts`
- Modify: `src/lib/guide-steps.ts`
- Modify: `src/lib/guide-steps.test.ts`

**Interfaces:**
- Consumes: legacy v1/v2 persisted drafts and new scan artifacts.
- Produces:

```ts
export type ScanMeasurementSource =
  | 'roomplan-floor-polygon'
  | 'roomplan-floor-dimensions'
  | 'wall-estimate';

export type RoomScanArtifact = {
  scanId: string;
  jsonPath: string;
  usdzPath: string;
  measuredSqft: number;
  source: ScanMeasurementSource;
  capturedAt: string;
};

export function roomHasVerifiedScan(
  room: Pick<RoomCapture, 'scanArtifact' | 'skipped'>
): boolean;
export function scanMeasuredSqft(rooms: RoomCapture[]): number;
export function draftCanBeVerified(draft: ManualWalkthroughDraft): boolean;
export function normalizeDraftStore(value: unknown): DraftStore | null;
```

- [ ] **Step 1: Write failing verification tests**

Add to `src/lib/walkthrough-draft.test.ts`:

```ts
describe('scan verification', () => {
  const artifact = (measuredSqft: number): RoomScanArtifact => ({
    scanId: 'scan-1',
    jsonPath: '/scan/Room.json',
    usdzPath: '/scan/Room.usdz',
    measuredSqft,
    source: 'roomplan-floor-polygon',
    capturedAt: '2026-08-12T00:00:00.000Z',
  });

  it('requires every room and rejects skipped rooms', () => {
    const draft = createDraft('Oak', '1A', '1000', ['Living', 'Kitchen']);
    draft.rooms[0].scanArtifact = artifact(100);
    assert.equal(draftCanBeVerified(draft), false);
    draft.rooms[1].scanArtifact = artifact(80);
    assert.equal(draftCanBeVerified(draft), true);
    draft.rooms[1].skipped = true;
    assert.equal(draftCanBeVerified(draft), false);
  });

  it('excludes legacy typed sqft from scan totals', () => {
    const rooms = [
      { ...createRoom('A'), sqft: '900', scanArtifact: artifact(100) },
      { ...createRoom('B'), sqft: '500' },
    ];
    assert.equal(scanMeasuredSqft(rooms), 100);
  });

  it('rejects wall estimates for verification', () => {
    const draft = createDraft('Oak', '1A', '', ['Living']);
    draft.rooms[0].scanArtifact = {
      ...artifact(100),
      source: 'wall-estimate',
    };
    assert.equal(draftCanBeVerified(draft), false);
  });
});
```

- [ ] **Step 2: Commit the regression tests, push, then verify RED**

```bash
git add src/lib/walkthrough-draft.test.ts
git commit -m "test(verification): reject partial and manual scan totals"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/walkthrough-draft.test.ts
```

Expected: FAIL because the new types/functions do not exist.

- [ ] **Step 3: Add schema fields and pure verification helpers**

Extend `RoomCapture`:

```ts
export type RoomCapture = {
  // existing fields
  skipped?: boolean;
  scanArtifact?: RoomScanArtifact;
  /** Compatibility mirror; never use as verification source. */
  measuredSqftFromScan?: number;
};
```

Implement:

```ts
const VERIFIED_SOURCES = new Set<ScanMeasurementSource>([
  'roomplan-floor-polygon',
  'roomplan-floor-dimensions',
]);

export function roomHasVerifiedScan(
  room: Pick<RoomCapture, 'scanArtifact' | 'skipped'>
): boolean {
  const artifact = room.scanArtifact;
  return (
    room.skipped !== true &&
    artifact != null &&
    VERIFIED_SOURCES.has(artifact.source) &&
    Number.isFinite(artifact.measuredSqft) &&
    artifact.measuredSqft > 0
  );
}

export function scanMeasuredSqft(rooms: RoomCapture[]): number {
  return rooms.reduce(
    (sum, room) =>
      roomHasVerifiedScan(room) ? sum + room.scanArtifact!.measuredSqft : sum,
    0
  );
}

export function draftCanBeVerified(draft: ManualWalkthroughDraft): boolean {
  return draft.rooms.length > 0 && draft.rooms.every(roomHasVerifiedScan);
}
```

Keep the historical `measuredSqft()` export only for legacy display. Never use
it to populate `measuredSqftFromScan` or determine Verified status.

- [ ] **Step 4: Add full nested normalization and guide tests**

Create `src/lib/walkthrough-schema.test.ts` covering:

```ts
assert.equal(normalizeDraftStore(null), null);
assert.equal(
  normalizeDraftStore({ activeDraftId: 'x', drafts: { x: {} } }),
  null
);
```

Also cover:
- out-of-range `guideRoomIndex` normalizes to `0`;
- old `scanned: true` without a numeric artifact becomes `scanned: false`;
- old `verificationStatus: 'verified'` without complete artifacts becomes
  `unverified`;
- finite legacy `measuredSqftFromScan` is preserved for display but not
  promoted into `scanArtifact`;
- valid photos, condition, notes, and findings survive normalization.

Add `guide-steps.test.ts` cases for measured, unmeasured, skipped, and
non-LiDAR paths.

- [ ] **Step 5: Commit the additional tests, push, then verify RED**

```bash
git add \
  src/lib/walkthrough-schema.test.ts \
  src/lib/guide-steps.test.ts
git commit -m "test(storage): reject malformed and skipped verification state"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test \
  src/lib/walkthrough-schema.test.ts \
  src/lib/guide-steps.test.ts
```

Expected: FAIL because normalization and artifact-based gating do not exist.

- [ ] **Step 6: Implement `normalizeDraftStore`**

Create `src/lib/walkthrough-schema.ts` as a pure parser. Validate every nested
draft, room, photo, finding, index, enum, date string, and scan artifact.
Return `null` for a store with no recoverable `drafts` object. Drop malformed
draft entries individually. Recompute:

```ts
verificationStatus: draftCanBeVerified(draft)
  ? draft.verificationStatus
  : 'unverified'
```

Update `loadDraftStore()` to call `normalizeDraftStore` rather than casting a
top-level shape.

- [ ] **Step 7: Update room advance gating**

`canAdvanceRoom` must require `roomHasVerifiedScan(room)` only when LiDAR
verification remains enabled:

```ts
export function canAdvanceRoom(
  room: Pick<RoomCapture, 'photos' | 'scanArtifact' | 'skipped'>,
  lidarRequired: boolean
): RoomAdvanceBlock {
  if (room.photos.length < 1) return 'photo';
  if (lidarRequired && !roomHasVerifiedScan(room)) return 'scan';
  return 'ok';
}
```

- [ ] **Step 8: Commit implementation, push, then run GREEN checks**

```bash
git add \
  src/lib/walkthrough-schema.ts \
  src/lib/walkthrough-schema.test.ts \
  src/lib/walkthrough-draft.ts \
  src/lib/walkthrough-draft.test.ts \
  src/lib/guide-steps.ts \
  src/lib/guide-steps.test.ts
git commit -m "fix(verification): require complete scan-derived room totals"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test \
  src/lib/walkthrough-schema.test.ts \
  src/lib/walkthrough-draft.test.ts \
  src/lib/guide-steps.test.ts
node --experimental-strip-types --test src/lib/*.test.ts
```

---

### Task 4: Replace full-snapshot writes with queued ID-bound mutations

**Files:**
- Create: `src/lib/draft-store.ts`
- Create: `src/lib/draft-store.test.ts`
- Modify: `src/lib/walkthrough-draft.ts`
- Modify: `src/app/index.tsx`
- Modify: `src/components/manual-walkthrough.tsx`

**Interfaces:**
- Consumes: AsyncStorage and pure `normalizeDraftStore`.
- Produces:

```ts
export type DraftStoreMutation<T> = (
  store: DraftStore
) => { store: DraftStore; value: T } | null;

export async function mutateDraftStore<T>(
  mutation: DraftStoreMutation<T>
): Promise<{ store: DraftStore; value: T } | null>;

export async function mutateDraftById<T>(
  draftId: string,
  mutation: (draft: ManualWalkthroughDraft) => {
    draft: ManualWalkthroughDraft;
    value: T;
  } | null
): Promise<{ store: DraftStore; value: T } | null>;
```

- [ ] **Step 1: Write failing queue/rebase tests**

Use a repository factory with an injectable storage adapter in
`draft-store.ts`:

```ts
export type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

export type DraftStoreRepository = {
  loadDraftStore(): Promise<DraftStore>;
  mutateDraftStore<T>(
    mutation: DraftStoreMutation<T>
  ): Promise<{ store: DraftStore; value: T } | null>;
  mutateDraftById<T>(
    draftId: string,
    mutation: (draft: ManualWalkthroughDraft) => {
      draft: ManualWalkthroughDraft;
      value: T;
    } | null
  ): Promise<{ store: DraftStore; value: T } | null>;
};

export function createDraftStoreRepository(
  storage: KeyValueStorage
): DraftStoreRepository;

export const draftStoreRepository =
  createDraftStoreRepository(AsyncStorage);

export const loadDraftStore =
  draftStoreRepository.loadDraftStore;
export const mutateDraftStore =
  draftStoreRepository.mutateDraftStore;
export const mutateDraftById =
  draftStoreRepository.mutateDraftById;
```

In `src/lib/draft-store.test.ts`, create a repository with an in-memory
adapter and prove:

```ts
it('rebases concurrent mutations on the latest committed store', async () => {
  const repository = createDraftStoreRepository(memoryStorage);
  const first = repository.mutateDraftById('a', draft => ({
    draft: { ...draft, unit: '2A' },
    value: undefined,
  }));
  const second = repository.mutateDraftById('b', draft => ({
    draft: { ...draft, unit: '3B' },
    value: undefined,
  }));
  await Promise.all([first, second]);
  const saved = await repository.loadDraftStore();
  assert.equal(saved.drafts.a.unit, '2A');
  assert.equal(saved.drafts.b.unit, '3B');
});
```

Also prove migration completes before queue entry and cannot deadlock.

- [ ] **Step 2: Commit the queue tests, push, then verify RED**

```bash
git add src/lib/draft-store.test.ts
git commit -m "test(storage): reproduce stale full-store overwrite"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/draft-store.test.ts
```

Expected: FAIL because `draft-store.ts` does not exist.

- [ ] **Step 3: Implement unlocked migration plus one mutation queue**

`draft-store.ts` must have private `readUnlocked`, `writeUnlocked`, and
`migrateLegacyUnlocked` functions. The exported queue is:

```ts
export async function mutateDraftStore<T>(
  mutation: DraftStoreMutation<T>
): Promise<{ store: DraftStore; value: T } | null> {
  let result: { store: DraftStore; value: T } | null = null;
  const run = async () => {
    const current = await readUnlocked();
    const next = mutation(current);
    if (!next) return;
    await writeUnlocked(next.store);
    result = next;
  };
  const queued = mutationChain.then(run, run);
  mutationChain = queued.then(
    () => undefined,
    () => undefined
  );
  await queued;
  return result;
}
```

This code lives inside `createDraftStoreRepository`, where `mutationChain` is
closed over per repository. Migration occurs inside `readUnlocked` with direct
adapter writes; it must not call `mutateDraftStore`.

- [ ] **Step 4: Add explicit scan commit mutation**

```ts
export async function commitRoomScan(input: {
  draftId: string;
  roomId: string;
  artifact: RoomScanArtifact;
}): Promise<{ store: DraftStore; replaced?: RoomScanArtifact } | null> {
  return mutateDraftById(input.draftId, draft => {
    const index = draft.rooms.findIndex(room => room.id === input.roomId);
    if (index < 0) return null;
    const replaced = draft.rooms[index].scanArtifact;
    const rooms = draft.rooms.map((room, roomIndex) =>
      roomIndex === index
        ? {
            ...room,
            skipped: false,
            scanned: true,
            scanArtifact: input.artifact,
            measuredSqftFromScan: input.artifact.measuredSqft,
          }
        : room
    );
    return {
      draft: {
        ...draft,
        rooms,
        measuredSqftFromScan: scanMeasuredSqft(rooms),
        verificationStatus: 'unverified',
        completedAt: undefined,
      },
      value: { replaced },
    };
  });
}
```

Add tests that wrong `draftId`/`roomId` returns `null`, rescan replaces the old
artifact, and total does not double-count.

- [ ] **Step 5: Move all store writers onto mutations**

Update:
- Home open/delete in `src/app/index.tsx`;
- route selection and draft creation in `ManualWalkthrough`;
- room patches, photo metadata, skip, add room, completion, and start another.

No component may call a public full-snapshot `saveDraftStore`. Remove or make
that function private.

Use Expo Router `useFocusEffect` on Home to reload the committed store whenever
the screen regains focus.

- [ ] **Step 6: Commit implementation, push, then run GREEN checks**

```bash
git add \
  src/lib/draft-store.ts \
  src/lib/draft-store.test.ts \
  src/lib/walkthrough-draft.ts \
  src/app/index.tsx \
  src/components/manual-walkthrough.tsx
git commit -m "fix(storage): serialize draft mutations against latest state"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/draft-store.test.ts
node --experimental-strip-types --test src/lib/*.test.ts
npx tsc --noEmit
npm run lint
```

---

### Task 5: Bind scan completion to one draft/room and localize the flow

**Files:**
- Modify: `src/app/walkthrough.tsx`
- Modify: `src/components/manual-walkthrough.tsx`
- Modify: `src/lib/i18n.ts`
- Modify: `src/lib/i18n.test.ts`
- Modify: `src/lib/draft-store.ts`
- Modify: `src/lib/draft-store.test.ts`

**Interfaces:**
- Consumes: `readVerifiedMeasurementFromExport`, `commitRoomScan`.
- Produces:

```ts
export type ScanTarget = {
  draftId: string;
  roomId: string;
};

type ManualWalkthroughProps = {
  onOpenLidar?: (target: ScanTarget) => void;
  lidarAvailable?: boolean;
  manualUnverified?: boolean;
};
```

- [ ] **Step 1: Write ID-binding and localization regression tests**

Add to `draft-store.test.ts`:

```ts
it('never assigns a late scan to the newly active room', async () => {
  const result = await commitRoomScan({
    draftId: 'draft-a',
    roomId: 'room-a',
    artifact,
  });
  assert.equal(result?.store.drafts['draft-a'].rooms[0].scanArtifact, artifact);
  assert.equal(
    result?.store.drafts['draft-b'].rooms[0].scanArtifact,
    undefined
  );
});
```

First set `activeDraftId` to `draft-b`; the explicit target must still update
only `draft-a`/`room-a`.

Add to `i18n.test.ts`:

```ts
assert.equal(t('en', 'scanMeasureFailed').includes('sq ft'), true);
assert.equal(t('es', 'scanMeasureFailed').includes('pies²'), true);
assert.equal(t('en', 'continueUnverified'), 'Continue unverified');
assert.equal(t('es', 'continueUnverified'), 'Continuar sin verificar');
```

- [ ] **Step 2: Commit regression tests, push, then verify RED**

```bash
git add src/lib/draft-store.test.ts src/lib/i18n.test.ts
git commit -m "test(scan): reproduce late result and untranslated failures"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test \
  src/lib/draft-store.test.ts \
  src/lib/i18n.test.ts
```

Expected: FAIL until scan completion uses explicit IDs and the bilingual keys
exist.

- [ ] **Step 3: Capture target before unmounting the guide**

In `ManualWalkthrough`, invoke:

```ts
onOpenLidar?.({ draftId: draft.id, roomId: room.id });
```

In `WalkthroughScreen`, store the target in a ref alongside `scanId`:

```ts
const activeScan = useRef<{
  scanId: string;
  target: ScanTarget;
} | null>(null);
```

`beginScan` requires both values. On processed:

1. export;
2. parse;
3. build `RoomScanArtifact`;
4. call `commitRoomScan` with explicit IDs;
5. delete superseded files after commit;
6. clear the one-shot ref;
7. remount Manual, which hydrates the committed store.

Remove `scanCompletedToken`, `scanResultStore`, and all result-replay effects.

- [ ] **Step 4: Fail closed and support manual Unverified**

If parsing or commit fails, do not mark `scanned`. Error actions are:
- Retry LiDAR;
- Continue Unverified, which remounts Manual with `manualUnverified=true` so
  `canAdvanceRoom` does not require a scan and final status cannot be Verified.

- [ ] **Step 5: Add bilingual scan strings**

Add these exact values to `en`:

```ts
scanTitle: 'Room scan',
scanInstructions: 'Move slowly and capture every wall.',
scanStart: 'Start room scan',
scanCancel: 'Cancel',
scanDone: 'Done',
scanProcessing: 'Processing room scan…',
scanKeepOpen: 'Keep this screen open while RoomPlan builds the model.',
scanInterrupted: 'Scan interrupted',
scanMeasureFailed:
  'Scan saved, but sq ft could not be read. Scan the room again.',
scanDraftMissing:
  'Could not save the scan to this job. Go back and reopen the job.',
scanRetry: 'Try LiDAR again',
continueUnverified: 'Continue unverified',
shareScanFiles: 'Share scan files',
```

Add the matching values to `es`:

```ts
scanTitle: 'Escaneo de habitación',
scanInstructions: 'Muévete despacio y captura todas las paredes.',
scanStart: 'Empezar escaneo',
scanCancel: 'Cancelar',
scanDone: 'Listo',
scanProcessing: 'Procesando el escaneo…',
scanKeepOpen:
  'Mantén esta pantalla abierta mientras se crea el modelo.',
scanInterrupted: 'Escaneo interrumpido',
scanMeasureFailed:
  'Escaneo guardado, pero no se pudieron leer los pies². Escanea la habitación de nuevo.',
scanDraftMissing:
  'No se pudo guardar el escaneo en este trabajo. Vuelve a abrir el trabajo.',
scanRetry: 'Intentar LiDAR de nuevo',
continueUnverified: 'Continuar sin verificar',
shareScanFiles: 'Compartir archivos del escaneo',
```

Use `useLocale().t` for every scan screen string and error.

- [ ] **Step 6: Commit implementation, push, then run GREEN checks**

```bash
git add \
  src/app/walkthrough.tsx \
  src/components/manual-walkthrough.tsx \
  src/lib/i18n.ts \
  src/lib/i18n.test.ts \
  src/lib/draft-store.ts \
  src/lib/draft-store.test.ts
git commit -m "fix(scan): bind exported area to the originating room"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test \
  src/lib/draft-store.test.ts \
  src/lib/i18n.test.ts
node --experimental-strip-types --test src/lib/*.test.ts
npx tsc --noEmit
npm run lint
```

---

### Task 6: Make scan/photo file lifecycle transactional

**Files:**
- Create: `src/lib/capture-files.ts`
- Create: `src/lib/capture-files.test.ts`
- Modify: `src/lib/draft-store.ts`
- Modify: `src/lib/walkthrough-draft.ts`
- Modify: `src/components/manual-walkthrough.tsx`
- Modify: `src/app/index.tsx`

**Interfaces:**
- Consumes: scan/photo paths and committed metadata mutations.
- Produces:

```ts
export function deleteLocalFile(uriOrPath: string): void;
export function deleteScanArtifactFiles(artifact: RoomScanArtifact): void;
export function deleteDraftCaptureFiles(draft: ManualWalkthroughDraft): void;
```

- [ ] **Step 1: Write failing lifecycle tests**

Test pure path collection and compensation callbacks without mocking Expo
internals:

```ts
it('collects both files from every room scan artifact', () => {
  assert.deepEqual(scanPathsForDraft(draft), [
    '/scan/Room.json',
    '/scan/Room.usdz',
  ]);
});

it('keeps old metadata when a removal commit fails', async () => {
  storage.failNextWrite();
  await assert.rejects(removePhotoFromDraft(input));
  assert.equal((await loadDraftStore()).drafts.d.rooms[0].photos.length, 1);
  assert.equal(deletedUris.length, 0);
});
```

- [ ] **Step 2: Commit lifecycle tests, push, then verify RED**

```bash
git add src/lib/capture-files.test.ts
git commit -m "test(capture): reproduce metadata and file divergence"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test src/lib/capture-files.test.ts
```

Expected: FAIL because lifecycle helpers do not exist.

- [ ] **Step 3: Implement commit-first deletion**

Implement:
- photo add: copy → commit metadata → delete copy on failed commit;
- photo remove: commit metadata → delete removed file;
- rescan: commit replacement → delete old JSON/USDZ;
- job delete: commit draft removal → delete all owned photos/scans;
- failed scan parse/commit: delete newly exported JSON/USDZ.

File deletion errors remain non-fatal after metadata commit, leaving an orphan
rather than broken metadata.

- [ ] **Step 4: Expose reachable share action**

On a measured room card or Done screen, call existing native `share` with the
artifact's JSON/USDZ paths. Remove the unreachable `complete` state and its
circular share screen from `src/app/walkthrough.tsx`.

- [ ] **Step 5: Await completion persistence**

`saveJob` must:

```ts
setIsSaving(true);
try {
  const committed = await completeDraft({ draftId: draft.id, requestedStatus });
  if (!committed) throw new Error('Draft changed before save.');
  setStore(committed.store);
  setSavedMessage(t('savedOnDevice'));
  setScreenStep('done');
} catch {
  setHydrateError(t('saveFailed'));
} finally {
  setIsSaving(false);
}
```

Disable Save/navigation while `isSaving`. Never show `savedOnDevice` before
the mutation commits.

- [ ] **Step 6: Commit implementation, push, then run GREEN checks**

```bash
git add \
  src/lib/capture-files.ts \
  src/lib/capture-files.test.ts \
  src/lib/draft-store.ts \
  src/lib/walkthrough-draft.ts \
  src/components/manual-walkthrough.tsx \
  src/app/index.tsx \
  src/app/walkthrough.tsx
git commit -m "fix(capture): make local file lifecycle follow committed metadata"
git push -u origin cursor/scan-measurement-ota-f26e
node --experimental-strip-types --test \
  src/lib/capture-files.test.ts \
  src/lib/draft-store.test.ts
node --experimental-strip-types --test src/lib/*.test.ts
npx tsc --noEmit
npm run lint
```

---

### Task 7: Verify runtime compatibility and prepare the OTA preview

**Files:**
- No additional tracked changes expected.

**Interfaces:**
- Consumes: completed OTA branch.
- Produces: evidence that the branch is build-12/13 compatible and ready for
  a preview update.

- [ ] **Step 1: Run all static and unit checks**

```bash
npm ci
npx tsc --noEmit
npm run lint
node --experimental-strip-types --test src/lib/*.test.ts
```

Expected: all commands exit 0 with zero failed tests and zero lint errors.

- [ ] **Step 2: Bundle all platforms**

```bash
npx expo export --platform ios --output-dir /tmp/aperiv-ota-ios
npx expo export --platform android --output-dir /tmp/aperiv-ota-android
npx expo export --platform web --output-dir /tmp/aperiv-ota-web
```

Expected: all exports exit 0.

- [ ] **Step 3: Prove no native fingerprint drift**

```bash
npx expo-updates fingerprint:generate --platform ios > /tmp/ota-final-fingerprint.json
node -e "const f=require('/tmp/ota-final-fingerprint.json'); console.log(f.hash)"
git diff --exit-code \
  "eda2d7dd12ef6269546218e91445084679c75977..HEAD" \
  -- app.json eas.json package.json package-lock.json fingerprint.config.js modules
```

Expected fingerprint:

```text
d0791770178bd021d9a4444d1cf738ec0e405752
```

Expected git diff command: exit 0.

- [ ] **Step 4: Request code review**

Review the full range from `eda2d7d` to `HEAD`, with explicit attention to:
- complete-room verification;
- scan/manual total separation;
- ID-bound scan writes;
- AsyncStorage queue behavior;
- file compensation;
- bilingual errors;
- runtime fingerprint.

Fix every Critical/Important issue and rerun Steps 1–3.

- [ ] **Step 5: Push and create a draft PR**

```bash
git push -u origin cursor/scan-measurement-ota-f26e
```

Create a draft PR targeting `main`. Publish preview/production updates from
the OTA branch checkout before merge, because `main` has a different native
fingerprint. Do not merge or mark ready without explicit instruction.

- [ ] **Step 6: Publish preview only after Expo authentication**

```bash
eas update \
  --branch scan-measurement-preview \
  --platform ios \
  --message "fix scan measured square footage"
```

Before publishing, inspect the command's runtime and require `d0791770…`.
Environment without `EXPO_TOKEN` must stop and request authentication; do not
work around it.

- [ ] **Step 7: Test on an existing build 12/13 LiDAR device**

Required device scenarios:
1. rectangular room populates sq ft;
2. rescan replaces the prior value;
3. cancel returns without replaying stale data;
4. failed/missing floor geometry offers retry and Unverified;
5. scan one room + skip another cannot save Verified;
6. legacy typed sqft never appears in measured scan total;
7. share works and deleting the job removes scan/photo files;
8. English/Spanish toggle covers scan errors;
9. two app launches confirm the production-like OTA reload path.

Record the runtime/build number and observed values. Do not publish production
until all scenarios pass.

