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
