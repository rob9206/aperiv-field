# Aperiv Field

Expo (React Native) app for on-site turnover walkthroughs and capture, shipped to TestFlight via EAS.

This is the **mobile** companion to the Next.js web app in [`rob9206/aperiv`](https://github.com/rob9206/aperiv). It is a separate codebase — not a wrapper around the website.

## Stack

- Expo SDK 57 · Expo Router · TypeScript
- EAS Build + Submit (`eas.json` profiles: `development`, `preview`, `production`)
- Supabase Auth via `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (`@supabase/supabase-js` + AsyncStorage session persistence)

## Local development

```bash
npm install
npx expo start --dev-client
```

The **development build** (dev client) requires a Metro bundler running on the same network — install it on your phone with:

```bash
eas build --platform ios --profile development
```

If the phone can't find the server, use a tunnel: `npx expo start --dev-client --tunnel`.

## Ship to TestFlight

Dev-client builds do **not** work standalone — never submit the `development` profile to TestFlight. Use `preview` or `production` (store distribution, JS bundle embedded):

```bash
# one-time: npm install -g eas-cli && eas login && eas init
git checkout main && git pull
eas build --platform ios --profile preview
eas submit --platform ios --profile preview --latest
```

Then in App Store Connect → TestFlight, add Kevin (and yourself) as internal/external testers and share the invite.

- Bundle ID: `com.aperiv.field`
- ASC App ID: `6790955096`
- Version bumps: `preview` and `production` auto-increment build numbers
- Do **not** resubmit an old build from before RoomPlan — scanning needs a binary built from current `main`

## Environment

Copy `.env.example` to `.env` and fill in the Supabase values. `EXPO_PUBLIC_*` variables are baked into the JS bundle at build time — set them in EAS (`eas env` or build profile `env`) for TestFlight builds.

If they're missing or malformed the app runs in a "not configured" placeholder mode instead of crashing (see `src/lib/supabase-env.ts`).

## Screens (v1 shell)

- `/` — home, config/signed-in status, sign-out
- `/login` — email/password via `signInWithPassword`
- `/walkthrough` — RoomPlan LiDAR capture (auth-protected)

## Room scanning (RoomPlan)

Room capture lives in the local Expo module `modules/expo-room-scan` (dependency `expo-room-scan`).

**Requirements**

- Physical LiDAR device (iPhone 12 Pro / later Pro models, or iPad Pro with LiDAR)
- iOS 16.4+
- A **native** EAS iOS build that links the module — Expo Go will never work, and an EAS Update / OTA JS push cannot add native code

**If Walkthrough says “New iOS build required”**

The JS bundle is present but `ExpoRoomScan` is missing from the binary. Rebuild and reinstall:

```bash
eas build --platform ios --profile preview
eas submit --platform ios --profile preview
```

Development client alternative: `eas build --platform ios --profile development`, then `npx expo start --dev-client`.
