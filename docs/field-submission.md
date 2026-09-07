# Field submission milestone

This branch connects a saved phone job to an existing Aperiv property and unit. A crew member explicitly chooses **Send to manager**, selects the destination, and sends. The EN/ES capture flow and local drafts remain available. Sending never deletes local photos, scan exports, or job metadata.

The companion web/database work is on `rob9206/aperiv`, branch `codex/field-submission-flow`. Its `docs/field-submission.md` describes the shared contract and migration.

## Sending and retries

- Sending is native-only and disabled unless `EXPO_PUBLIC_FIELD_SUBMISSION_ENABLED=true` when the app bundle is built. This is a rollout switch, not an authorization boundary.
- Both apps must point to the same Supabase project. Use the existing public client key and authenticated session; no service-role key belongs in Field.
- A saved revision (`draft.id@completedAt`) belongs to one submitting user and one destination unit. The server generates the remote UUID. A retry reuses that row and deterministic asset paths.
- The row starts `in_progress`. Photos and USDZ/JSON files upload first. Only then does it become `complete` and appear for review.
- A failed upload or lost final response is retryable. There is no background sending or automatic retry. Reopen the saved job, select the same destination, and send again.
- Editing and saving creates a new revision. Completed remote submissions stay immutable; later revisions supersede them in the dashboard.
- Local files must exist under the app's capture directories and be at most 50 MB per file. An unavailable or oversized file leaves the submission pending and the local draft intact.

## Measurements and compatibility

Only the existing successful floor-polygon/floor-dimensions checks can produce Verified. A missing scan, skipped room, export-only scan, wall estimate, or repeated scan cannot verify a unit. Typed square feet are never promoted to a measured result. Room measurements retain decimals; the legacy integer unit-total column receives the rounded total.

Unverified submissions use an explicit status and a compatibility zero in the database's required total column. Both dashboards and the web review suppress that zero as a measurement.

This branch also includes the two scan-retention commits from [Field PR #13](https://github.com/rob9206/aperiv-field/pull/13): `d1e5ac9` and `dce1c34`. That PR reports its OTA as already published while remaining unmerged. Including its changes preserves export-only files and accepts Apple's object-shaped floor vectors when this branch is released. No native module changes are included.

## Release order and remaining acceptance

### Confirmed tester and release path (2026-09-07)

Rob is testing on an iPhone 15 Pro Max with TestFlight build 13. The authenticated EAS check confirmed build ID `14228333-9d49-421d-add2-06a257edbb5a`, production profile/channel, runtime `d0791770178bd021d9a4444d1cf738ec0e405752`, and source `c92b39625019df7daaa7118055aa38c809ba3a87`. Current main includes native scanner/linking changes that are absent from that installed runtime. A matching JavaScript-only OTA must not be forced onto build 13.

The `field-test` build profile inherits the store/TestFlight setup, enables sending only in that profile, and uses the separate `field-submission-test` update channel. Create a new signed TestFlight binary for this milestone. Its build number comes from EAS auto-increment; do not assume the next number is 14.

`.github/workflows/field-build-readiness.yml` reads installed build metadata and compares native fingerprints using the existing Expo repository credential. It never starts builds or publishes updates.

`.github/workflows/field-testflight.yml` is prepared but has not been run. After the database migration and companion web release are approved and ready, it can be deliberately triggered by creating/pushing `release/field-submission-test` from the reviewed feature commit, or by manual dispatch with `backend_ready=true`. It validates Field, checks that the preview environment targets the existing Aperiv project and exposes the new submission columns, then builds and submits through the `field-test` profile. The workflow stops before building if the backend check fails. It does not change the production OTA channel or release an App Store version.

The configured test target is the existing Aperiv database. Using it requires approval to apply the additive migration and release the companion web change before the enabled phone test. To use a separate staging database instead, change the approved project reference and both apps' test environment settings first.

### Acceptance sequence

1. Apply the companion migration to staging, then release the companion web app there.
2. Build an internal Field bundle against staging with sending enabled. Use a binary containing `ExpoRoomScan`, not Expo Go.
3. On a LiDAR device, save one room with a photo and a measured scan. Send to a real test unit. Confirm exactly one completed row, matching room measurements/findings, working photo and scan links, and **Awaiting review** on web. Confirm local files still open/share.
4. Interrupt the connection during upload, restart the app, and retry the same saved revision/destination. Confirm one completed submission and intact local files. Repeated sending after success must not create another row.
5. Repeat with a non-LiDAR photos/notes capture and an export-only scan. Both must remain Unverified. Run the same flow in Spanish.
6. Before production enablement, reconcile the target EAS runtime/channel and update the privacy policy/App Privacy declarations for uploaded photos, scan content, and notes linked to the signed-in user. The older email/user-ID-only declaration no longer describes this optional sending feature.
7. Deploy the migration, then web, then enable sending in the intended Field bundle. Disable the switch in a replacement bundle to stop new sending; retain the additive database schema and submitted files.

The database retains the existing shared-portfolio read authorization; this milestone does not introduce property membership or tenant isolation. New Field rows/files have ownership and completion write protections. Manager review is read-only in this milestone; approving a new Field submission is a later workflow.

## Validation

Use Node 24 and `npm ci --include=dev`. Run:

```sh
npm run lint
npx tsc --noEmit
node --experimental-strip-types --test src/lib/*.test.ts
npx expo export --platform ios --output-dir /tmp/aperiv-field-ios
```

Automated checks cover retries, lost acknowledgements, revision identity, local retention, export-only compatibility, measurement rules, and the real roster adapter. An iOS bundle export checks JavaScript compilation; it does not replace the physical-device acceptance above. No production migration or OTA was applied while preparing this branch.

## Build 14 upload retry fix

The first phone attempt created one pending Field row, but no assets arrived. Investigation reproduced an iOS app-update defect: stored absolute file locations can refer to a previous app container, causing uploads to reject preserved files and orphan cleanup to misclassify referenced files. This fix resolves capture paths inside the current Documents capture folders, normalizes the iOS private/var alias, and protects relocated references in cleanup. A regression test failed before the fix and passes afterward.

The send screen now scrolls to its result and distinguishes missing scan/photo files, oversized files, upload errors, and finalization errors in English and Spanish. It retains the selected target for retry and provides a link back to the saved job. Missing attachments are never silently dropped or marked complete. If an attachment is already absent, the affected room must be recaptured.

The dedicated test update workflow compares its native fingerprint with build 14 before publishing to `field-submission-test`. It does not publish to the production or preview channels.

## Phone submission and Send screen follow-up (2026-09-07)

Build 14 was built and uploaded to TestFlight after the companion migration and web release. The upload fix was published to its compatible test channel. A subsequent physical-device submission completed: three photos and the USDZ/JSON scan exports are present in private storage. Its Living room has a verified floor-polygon measurement; the overall walkthrough correctly remains Unverified because the other rooms were skipped. The earlier pending attempt remains preserved. Authenticated manager-screen viewing and interrupted-network acceptance still require device testing.

The Send screen now uses a teal primary action, a persistent bottom action area with the selected destination, and a loading indicator. The selected property collapses into a summary and units use a compact two-column layout with checkmarks. Changing the property clears the unit selection. A smaller heading, corrected safe-area padding, and a distinct sent confirmation replace the long, flat button list. All new copy is available in English and Spanish. This is a JavaScript-only change targeting the same build 14 runtime; native rendering still needs physical-device review.

### Demo cleanup prerequisites

Read-only inventory found nine seeded properties, 72 units, and 932 invoices with the deterministic seed invoice IDs. Of ten walkthroughs, only one has the explicit walkthrough ID from `supabase/seed.sql`; seven older non-seed walkthroughs and both Field submissions must be preserved until their disposition is known.

The new successful capture is linked to the seeded Vista del Mar unit 6B. Deleting that property or unit cascades to its walkthrough and photo rows. The saved Field revision also locks its destination, so direct reassignment is not a normal application update. Establish the actual property/unit roster and a concrete retention/reassignment plan before removing the sample portfolio. Do not run `seed.sql` as cleanup: it truncates the application tables. Preserve auth accounts and stored capture files. Some companion web views also contain demo content in code, so database cleanup alone does not remove every demo screen.
