# Crew workflow simplification

The crew starts a job, captures one room at a time, then reviews the destination and sends. This extends the existing bilingual capture flow without changing RoomPlan, the database schema, or verification rules.

- **My jobs:** In progress, Ready to send, and Sent describe the next action. Sent jobs collapse behind a count. Delete is under More options and still requires confirmation. New job starts a separate job while preserving unfinished jobs.
- **One screen per room:** Photos come first. A fixed bottom action offers Take photo, Scan room, or Next room according to what is missing. Condition and optional repair tags stay on the same screen. Room options contains rename, add, and skip. Navigation scrolls the next room to the top. English and Spanish labels remain available.
- **Review:** Review & send saves locally and opens destination confirmation. Save and send later remains available. Measurements and raw scan files move into details; unverified area remains explicit.
- **Send:** A unique exact property/unit name match can prefill the destination, which remains visible and editable before the crew explicitly sends. Ambiguous names never select a unit. Reopening an already sent job shows the confirmation and allows viewing the saved capture.
- **Sent status:** A local receipt records the authenticated user and exact completed revision only after the server acknowledges completion. Editing a job invalidates its current Sent status. Opening an older saved job checks its exact remote submission identity to recover a missing receipt. A local receipt save failure is reported separately from upload failure. Sent is an upload acknowledgement, not manager approval.

## Verification

TypeScript, ESLint, the iOS bundle, and 129 library tests pass locally. Eight additional tests cover receipt persistence, changed revisions, account isolation, malformed receipts, and safe destination matching. The existing upload, retry, measurement, and file-retention tests remain intact.

The browser cannot reach the local preview. Physical-device visual acceptance is still required, in English and Spanish, including large text, keyboard entry, camera/scan return, room options, Save and send later, destination confirmation, and reopening Sent jobs. Test on the existing build 14 channel after its runtime compatibility gate passes. No new native build is intended.
