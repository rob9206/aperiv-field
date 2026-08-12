# Scan Measurement Reliability Design

**Status:** Approved direction, pending implementation plan

## Goal

Populate measured room square footage after RoomPlan scans without allowing
partial, estimated, stale, or manually entered values to verify a unit.

## Delivery Boundary

This work ships in two independent tracks.

### Track 1: Installed-runtime OTA hotfix

Build the OTA change from the source line whose iOS fingerprint is
`d0791770178bd021d9a4444d1cf738ec0e405752` (commit `26ded93`). It must not
change native code, native dependencies, app configuration, or other
fingerprint inputs.

The OTA reads the `Room.json` already exported by the installed RoomPlan
module. It accepts only a valid RoomPlan floor polygon or floor dimensions as
verification-quality area. Missing or malformed floor geometry fails closed:
the room remains unscanned for verification and the bilingual UI offers retry
or an Unverified manual path.

### Track 2: Native follow-up build

Land native API improvements on the reconciled `main` line and distribute them
in a new EAS/TestFlight binary. The native module returns an app-owned,
versioned result DTO containing paths, square footage, and measurement
provenance. Native wall reconstruction is not accepted as Verified unless a
future implementation validates a closed perimeter and preserves concavity.

The native follow-up is not required for the OTA parser to work on an iOS 17+
installed binary.

## Alternatives Considered

1. **One native PR and one new binary only.** Simpler release topology, but it
   does not fix installed builds quickly.
2. **Force the new fingerprint update onto old binaries.** Rejected because it
   defeats Expo runtime compatibility guarantees.
3. **Use a convex hull of wall endpoints as Verified area.** Rejected because
   it fills concavities and can infer area from incomplete wall sets.

The selected two-track design keeps the hotfix binary-compatible and isolates
native evolution behind a new build.

## Data Model

Each room stores scan state independently:

```ts
type ScanMeasurementSource =
  | 'roomplan-floor-polygon'
  | 'roomplan-floor-dimensions'
  | 'wall-estimate';

type RoomScanArtifact = {
  scanId: string;
  jsonPath: string;
  usdzPath: string;
  measuredSqft: number;
  source: ScanMeasurementSource;
  capturedAt: string;
};
```

`wall-estimate` may be displayed as an estimate but never satisfies Verified
eligibility. Legacy `room.sqft` remains readable for migration/display only
and never contributes to a `FromScan` field.

A skipped room is stored explicitly rather than inferred from navigation.

## Verification Invariants

A walkthrough is Verified only when all of these are true:

1. Every required, non-removed room has a positive finite scan measurement.
2. Every measurement source is `roomplan-floor-polygon` or
   `roomplan-floor-dimensions`.
3. No room is skipped.
4. The displayed/stored measured total is the sum of per-room scan
   measurements only.
5. The scan result is committed to the same `draftId` and `roomId` captured
   before scanning started.

Any failed invariant forces Unverified status. Existing completed drafts that
do not meet the new invariants are normalized to Unverified when loaded.

## Persistence Architecture

All draft mutations use one queued read-modify-write API. UI components do not
write full store snapshots directly.

The mutation API:

- reads the latest persisted store inside the queue;
- validates and normalizes the nested schema;
- applies a mutation against explicit IDs;
- writes the resulting store;
- returns the committed store to the caller.

Scan start captures `draftId` and `roomId`. Scan completion aborts if either no
longer matches.

File lifecycle follows metadata commits:

- add: copy file, commit metadata, delete the copy if commit fails;
- remove: commit metadata removal, then delete the file;
- delete job: commit the tombstone/removal, then delete owned photos and scans;
- rescan: commit the replacement artifact, then delete the superseded scan.

Legacy migration runs before entering the mutation queue so it cannot enqueue
a write behind itself.

## UI and Error Handling

Scan completion is a one-shot result rather than a persistent token/snapshot.
The guide hydrates from the committed store after the parent finishes the
queued mutation.

All scan instructions, errors, retry actions, and manual fallback copy use the
existing English/Spanish translation layer. Choosing manual capture marks the
walkthrough Unverified and does not keep LiDAR gating enabled.

The room card displays measured square footage only for a valid numeric scan.
It does not show a successful scan checkmark for an unmeasured room.

This release populates square footage. Length-by-width dimension fields are
outside scope because the current product schema and UI do not contain them.

## Tests

### Pure unit tests

- real iOS 17 `Room.json` floor fixture;
- malformed floors and implausible numeric values fail closed;
- scan-only totals exclude legacy typed square footage;
- all-room verification and skipped-room downgrade;
- rescan replaces rather than double-counts.

### Persistence tests

- queued mutations rebase on the latest store;
- explicit draft/room binding rejects late results;
- legacy migration cannot deadlock;
- failed add/remove/delete operations preserve recoverable metadata/files;
- nested malformed stores normalize without crashing.

### Integration checks

- scan completion remount shows the committed room measure;
- cancel/back cannot replay a previous scan result;
- save success appears only after persistence succeeds;
- English and Spanish scan failures render correctly;
- fingerprint for the OTA branch exactly matches `d0791770…`;
- lint, TypeScript, unit tests, and Android/iOS/web bundles pass.

### Native/device checks

The native track requires a successful EAS iOS build and a LiDAR-device test:
scan, rescan, cancel, background/foreground, export/share, delete, and
Verified/Unverified completion.

## Rollout

1. Publish the JS-only fix to a preview branch using the installed runtime.
2. Test it on an existing build 12/13 device.
3. Publish to production only after confirming the runtime and room measure.
4. Build and distribute the native follow-up through Internal TestFlight.
5. Keep the wall estimate Unverified until a validated perimeter algorithm
   has its own accuracy acceptance tests.
