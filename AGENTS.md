# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

## Learned User Preferences

- Prefer planning first, then hand off complex native implementation to Codex.
- Prefer native RoomPlan scan → save files before building the web-aligned walkthrough UI.
- When status claims disagree with what is on device, verify the installed native binary includes the required modules—not only Metro/JS.
- When asked for "draft text," provide short partner-ready messages with minimal process chatter.
- For remote partner iOS installs, prefer Internal TestFlight; Ad Hoc needs UDID registration and a rebuild per new device. Expo Orbit is local-only and does not simplify remote partner installs.
- Field UX must stay very simple for non-tech-savvy and Spanish-speaking crew: bilingual UI with English as the default (for Dawson/Kevin testing), easy switch to Spanish for crew, plain language, large touch targets, photos-first capture, and a job-list mental model—check in by unit, then one screen per room (not a multi-step wizard).
- Locked capture UX (Claude Design Turns 2+3): one screen per room with Scan + “Is this room ready?” (Ready / Small stuff / Needs fixing) + optional part chips (no free-text required) + photos; do not ship the six-phase arrive→scan→condition→damage→photo→advance wizard as the target.
- Verified walkthroughs require a successful LiDAR/RoomPlan scan to confirm unit sq ft; non-LiDAR devices may only finish as Unverified (photos/notes).
- Visual direction for Field: teal accent (#0F766E), deep slate, amber only for Unverified—not Aperiv marketing blue.

## Learned Workspace Facts

- This is an Expo SDK 57 CNG app (`com.aperiv.field`, EAS `@dawsondynamics/aperiv-field`); iOS builds run via EAS from Windows (no local Xcode).
- Local module `modules/expo-room-scan` wraps Apple RoomPlan; `/walkthrough` needs a native iOS build that includes `ExpoRoomScan`—Expo Go and web always show the unsupported/placeholder path.
- RoomPlan requires a LiDAR-capable iPhone/iPad; `isSupported()` is false on Android, web, simulators, and non-LiDAR devices. Core Field outcome is verified unit sq ft from RoomPlan vs recorded.
- EAS `preview` and `internal` (PR #8 on `origin/main`) are Ad Hoc; additional tester devices must be registered and the profile rebuilt (refresh Ad Hoc provisioning when adding a UDID), or use a store/`production` build with Internal TestFlight.
- Lockfile gotcha: local npm 11 (Windows) omits `@emnapi/core`/`@emnapi/runtime` from package-lock.json, but the EAS macOS worker's npm 10 requires them — `npm ci` fails the Install dependencies phase. They are pinned as devDependencies as the fix; do not remove them, and re-check after any lockfile regeneration.
- Related walkthrough result UI/schema lives in GitHub `rob9206/aperiv`; Field is the mobile companion meant to write walkthrough results the web already reads—there was no prior custom Aperiv LiDAR scanner on this Windows machine (Apple RoomPlan sample + Expo/web placeholders).
- Field's Supabase client is auth-only today; manual walkthrough drafts stay in AsyncStorage and RoomPlan exports stay local/share-sheet—inserts/uploads to `walkthroughs` (and photo storage) are not shipped yet.
- Manual walkthrough unit entry is free-text (property/unit/recorded sqft) for now (no live Supabase roster); QR/GPS door check-in is Phase 2; talk-while-scanning voice notes are Phase 3 (mic/App Privacy).
- Walkthrough photos are copied to `Paths.document/walkthrough-photos/<draftId>/` via the new sync expo-file-system API; drafts live in one AsyncStorage key `aperiv.field.walkthrough.drafts.v2` (multi-draft store with `activeDraftId`, auto-migrates the old v1 single-draft key).
- Build 12 shipped the manual-capture defect fixes (free-text unit, real camera/library photos, multi-draft) in the old wizard shell. The guided job-list UX + polish (through commit `26ded93`, incl. the RoomPlan-resume fix) went live 2026-08-02 ~18:26 EDT as an EAS Update on the `production` channel — builds 12 and 13 (iOS runtime `d0791770…`) pick it up after two app launches.
- Locale preference is stored at `aperiv.field.locale.v1` (JSON `"en"` / `"es"`); default English.

## App Store status — verified 2026-08-01

- App Store Connect app ID `6790955096`, iOS App Version 1.0, state "Prepare for Submission".
- Version 1.0 metadata is COMPLETE and saved: description, keywords, subtitle
  ("LiDAR turnover walkthroughs"), promotional text, support + marketing URL
  (`https://aperiv.com`), copyright "2026 Aperiv LLC", primary category Business,
  secondary Productivity, Content Rights = no third-party content, Age Rating 4+.
  Do not re-ask about these.
- STILL OPEN outside this repo: 6.5" screenshots (1242×2688 or 1284×2778) not uploaded;
  App Privacy questionnaire not started and has no Privacy Policy URL.
- Build history: 6 = REJECTED (40 crashes / 21 sessions). 8, 9 = Ready to Submit.
  10 = Testing, passed Beta App Review, uploaded Jul 25, **predates the manual capture
  flow committed Jul 30** — so TestFlight testers are seeing the old placeholder screen.
- TestFlight groups: `Team (Expo)` internal (Rob only), `aperiv-test` external
  (Rob + Kevin Huebner + Jordan Case). Internal testers skip Beta App Review; external
  testers need each new build reviewed.
- App Privacy will be declared as: email address + user ID only, for app functionality,
  not used for tracking. Any new SDK that collects anything else breaks this. Do not add
  analytics, crash reporting, or tracking without flagging it explicitly.

## Repo history — reconciled 2026-08-09

- Local capture line (`db873c6`…`eda2d7d`) and `origin/main` (`87ae068`…`338dc49`) were
  unrelated histories; they were joined with `git merge --allow-unrelated-histories`.
- Pre-merge backups: branch `backup/pre-reconcile-main`, tags `backup/main-eda2d7d` and
  `backup/origin-main-338dc49`.
- Merge kept origin EAS/`expo-room-scan` linking (incl. `internal` Ad Hoc + TestFlight
  `preview`) and local crew walkthrough UX. **Do not force-push `main`.**

## Known defects — 2026-08-01 list resolved 2026-08-02 (uncommitted work)

All seven defects from the 2026-08-01 audit were fixed in source on 2026-08-02: demo
roster → free-text unit entry, photo-count TextInput → real camera/library capture via
expo-image-picker, no prefilled sqft totals, per-draft storage (no overwrite), no
Supabase/env text on index or login, deduped titles, login has branding + themed inline
errors. Still deferred by explicit scope decision: password reset + signup flows
(need Supabase email/deep-link decisions) and any Supabase reads/writes.
Build 11 requires a new native binary (expo-image-picker + expo-file-system added).
