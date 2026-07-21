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

Dev-client builds do **not** work standalone — never submit the `development` profile to TestFlight. Use `preview` or `production` (JS bundle embedded):

```bash
# one-time: npm install -g eas-cli && eas login && eas init
eas build --platform ios --profile preview
eas submit --platform ios --profile preview
```

- Bundle ID: `com.aperiv.field`
- Version bumps: `production` auto-increments via `autoIncrement`.

## Environment

Copy `.env.example` to `.env` and fill in the Supabase values. `EXPO_PUBLIC_*` variables are baked into the JS bundle at build time — set them in EAS (`eas env` or build profile `env`) for TestFlight builds.

If they're missing or malformed the app runs in a "not configured" placeholder mode instead of crashing (see `src/lib/supabase-env.ts`).

## Screens (v1 shell)

- `/` — home, config/signed-in status, sign-out
- `/login` — email/password via `signInWithPassword`
- `/walkthrough` — capture flow placeholder (auth-protected; LiDAR later)
