**Recommended model:** `GPT-5.2 Codex` -- Multi-screen Expo UX + i18n with clear file boundaries

# Crew Job-List UX (Bilingual) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Simple guided field jobs: check in with unit number → **room-by-room guided walkthrough** (scan room → condition/damage/photo prompts → next) → Verified sq ft (LiDAR) or Unverified (no LiDAR). English default, Spanish toggle, home job list. No Supabase sync in this pass.

**Architecture:** i18n + `LocaleProvider`. Home = My jobs. Capture = check-in → **scripted guide state machine** over rooms (Living → Kitchen → …): for each room, prompt → RoomPlan segment when LiDAR → condition/damage/photo chips → next. Done compares recorded vs measured. Non‑LiDAR skips scan prompts, Unverified-only save. LLM/voice deferred to Phase 3; this pass uses scripted `t()` prompts only.

**Tech Stack:** Expo SDK 57, Expo Router, React Native, AsyncStorage, existing `walkthrough-draft.ts` + `expo-image-picker` / `expo-file-system`. Tests: Node 24 `node --experimental-strip-types --test` (no new test framework dependency).

## Global Constraints

- Expo SDK 57 — consult https://docs.expo.dev/versions/v57.0.0/ before APIs
- No new npm dependencies unless a task explicitly requires one and user approved
- Keep `@emnapi/core` / `@emnapi/runtime` pinned as devDependencies (EAS npm ci)
- Do not `git pull` / `git push --force` on orphan `main`; push backup branches only
- Locale default must be `en` (Dawson/Kevin testing); Spanish via explicit toggle
- **Product goal: verify unit sq ft.** RoomPlan/LiDAR measured total is the source of truth for a **Verified** job. Typed sq ft must never be labeled verified.
- Crew story: walk up → check in unit → guided per-room scan + damage/condition prompts → save.
- On LiDAR: each room’s measure path uses RoomPlan; Verified save requires successful scan data. Photos + condition prompts after each room scan.
- On non‑LiDAR: **allow Unverified** save with same guided photo/condition prompts; never Verified.
- Guide v1 = scripted prompts via `t()` (go to room X, start scan, condition, damage?, photo, next). Not LLM.
- Crew copy: plain words — Jobs/Trabajos, Unit/Unidad, Scan/Escanear, Photos/Fotos, Save/Guardar — never “Supabase”, “draft”, “walkthrough”. Show “Recorded X · Measured Y”.
- Primary touch targets ≥ `MinTouchTarget` (44); prefer ≥ 52 for primary CTAs
- Out of scope this pass: Supabase sync, QR/GPS/assigned (Phase 2), LLM/voice coach (Phase 3), signup/password reset.
- Commit frequently; conventional `feat:` / `fix:` subjects

## Phase 2 (after job-list ships) — Unit confirmation without typing

**Status: locked as post–job-list.** Do not implement in Tasks 1–6. Kick off only after EN/ES job-list is on a tester build.

Ordered by crew value:

1. **Door QR (primary next feature)**  
   - Encode `units.id` (UUID) or stable slug in QR; open via app scheme `aperiv-field://job?unitId=` or universal link.  
   - Unit step UI: primary **Scan QR** / **Escanear código**, secondary free-text.  
   - New native module likely: barcode scanner (`expo-camera` + barcode or `expo-barcode-scanner` equivalent for SDK 57 — verify docs).  
   - Ops: generate printable QR per unit from web/admin; sticker at door.  
   - Fallback: always keep type-in if scan fails / no sticker.

2. **GPS property hint (assist only)**  
   - On New job, if permission granted, reverse-geocode / match nearest `properties` lat-lng within ~100–150m.  
   - Prefill **property** name only; crew still confirms **unit** (type, QR, or assigned list).  
   - Do not auto-select unit from GPS (apartment density makes this wrong too often).  
   - Permissions + App Privacy: precise location for app functionality, not tracking.

3. **Assigned jobs list**  
   - Pull open turnovers from Supabase; home rows become office-assigned units (tap to start).  
   - Pairs with QR: list for “what’s today”, QR for “I’m at the door”.

## Phase 3 (after Phase 2) — Voice notes + smarter coach

**Scripted room-by-room guide is in this pass (Tasks 0–6), not Phase 3.**

**Locked (user 2026-08-02): Option A — no talk-to-note in Phase 1.** Post-room flow stays chips + typed damage note + photo only. Talking while scanning is deferred.

Phase 3 adds, in order:
1. Optional **hold-to-talk while scanning** → on-device/OS speech-to-text → transcript appended to current room notes (chips remain backup; never required to Save). Requires mic permission + App Privacy update.
2. Optional TTS for guide prompts; later opt-in LLM suggestions from photos/notes (further privacy update). Never block Save on cloud AI; offline scripted guide must keep working.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/i18n.ts` | Locale type, dictionary (`en`/`es`), `t()`, default room name keys |
| `src/lib/i18n.test.ts` | Pure unit tests for `t()` and locale normalization |
| `src/lib/locale-storage.ts` | Load/save locale preference (`aperiv.field.locale.v1`) |
| `src/lib/locale-storage.test.ts` | Tests with in-memory AsyncStorage mock |
| `src/providers/locale-provider.tsx` | React context: `locale`, `setLocale`, `t` |
| `src/components/language-toggle.tsx` | Compact EN \| ES control |
| `src/components/job-list.tsx` | Home job rows from `DraftStore` |
| `src/app/index.tsx` | Signed-in = job list shell; signed-out = sign-in CTA |
| `src/app/_layout.tsx` | Wrap `LocaleProvider`; localized stack titles |
| `src/app/login.tsx` | Localized branding + errors; language toggle |
| `src/components/manual-walkthrough.tsx` | Guided check-in → room loop → done; all strings via `t()` |
| `src/lib/guide-steps.ts` | Pure guide phase helpers + prompt keys (testable) |
| `src/app/walkthrough.tsx` | RoomPlan hooked into current-room scan phase |
| `src/lib/walkthrough-draft.ts` | Per-room progress, scan measure, verification status |

---

### Task 0: Fix Bugbot draft/photo persistence defects (before UX rewrite)

**Why first:** Guided capture rewrites the same files. Ship these correctness fixes so check-in / photos / resume do not lose data under the current shell, then build the room guide on a solid store.

**Files:**
- Modify: `src/lib/walkthrough-draft.ts`
- Modify: `src/components/manual-walkthrough.tsx`
- Create: `src/lib/walkthrough-draft.test.ts` (validation + corrupt-v2 → v1 recovery)

**Fixes (locked):**

1. **`drafts: null` rejected** — treat store as valid only when `drafts` is a non-null plain object (`drafts != null && typeof drafts === 'object' && !Array.isArray(drafts)`). Invalid → fall through to legacy / empty.
2. **Corrupt v2 still tries v1** — wrap v2 `JSON.parse` in try/catch; on throw or invalid shape, continue to legacy migration instead of rejecting.
3. **Hydration race** — do not allow `startWalkthrough` / step advance until `store !== null`. Disable Start CTA while loading; if somehow called early, queue. Optionally keep a `storeRef` updated on every set so persist always sees latest.
4. **Serialized saves** — chain `saveDraftStore` via a module- or component-level promise queue so writes cannot overlap/out-of-order.
5. **Stale photo merge** — after picker returns, read the latest draft from a `storeRef` / functional update (not the closure `draft`/`room.photos` from before `await`). Append photos onto that snapshot’s room.

- [ ] **Step 1: Failing tests for store load**

In `walkthrough-draft.test.ts`: `drafts: null` → empty or migrate; corrupt v2 JSON + valid legacy → migrated store; valid v2 → returned.

- [ ] **Step 2: Implement load validation + migrate fallthrough**

- [ ] **Step 3: Fix manual-walkthrough persist / photo / start gates**

- [ ] **Step 4: Typecheck + lint + tests + commit**

```powershell
node --experimental-strip-types --test src/lib/walkthrough-draft.test.ts
npx tsc --noEmit
npm run lint
git add src/lib/walkthrough-draft.ts src/lib/walkthrough-draft.test.ts src/components/manual-walkthrough.tsx
git commit -m "fix(drafts): harden store load and photo persist races"
```

---

### Task 1: i18n core (`t` + dictionaries)

**Files:**
- Create: `src/lib/i18n.ts`
- Create: `src/lib/i18n.test.ts`
- Test: `src/lib/i18n.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `export type AppLocale = 'en' | 'es'`
  - `export function normalizeLocale(value: unknown): AppLocale` — invalid → `'en'`
  - `export function t(locale: AppLocale, key: TranslationKey): string`
  - `export type TranslationKey` — union of all dictionary keys
  - Keys must include at least: `appName`, `tagline`, `signIn`, `signOut`, `myJobs`, `newJob`, `jobInProgress`, `jobDone`, `jobVerified`, `jobUnverified`, `openJob`, `deleteJob`, `confirmDelete`, `property`, `unit`, `recordedSqftOptional`, `startJob`, `startScan`, `scanRequired`, `noLidarDevice`, `goToRoom`, `anyDamage`, `yes`, `no`, `nextRoom`, `finishJob`, `rooms`, `takePhoto`, `addFromLibrary`, `addRoom`, `removeRoom`, `roomName`, `measuredSqft`, `recordedSqftLabel`, `condition`, `conditionGood`, `conditionWatch`, `conditionIssue`, `notes`, `photosCount`, `continue`, `optionalProblems`, `addProblem`, `problemTitle`, `problemDetails`, `saveJob`, `saveVerified`, `savedOnDevice`, `editRooms`, `startAnother`, `language`, `noJobsYet`, `signInToStart`, `signInUnavailable`, `checkingSession`, `signedInAs`, `severityLow`, `severityMedium`, `severityHigh`, `roomLiving`, `roomKitchen`, `roomBedroom`, `roomBathroom`

- [ ] **Step 1: Write the failing test**

Create `src/lib/i18n.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLocale, t } from './i18n.ts';

describe('normalizeLocale', () => {
  it('defaults invalid values to en', () => {
    assert.equal(normalizeLocale(undefined), 'en');
    assert.equal(normalizeLocale('fr'), 'en');
    assert.equal(normalizeLocale('ES'), 'es');
  });
});

describe('t', () => {
  it('returns English by default keys', () => {
    assert.equal(t('en', 'myJobs'), 'My jobs');
    assert.equal(t('en', 'takePhoto'), 'Take photo');
  });

  it('returns Spanish strings for es', () => {
    assert.equal(t('es', 'myJobs'), 'Mis trabajos');
    assert.equal(t('es', 'takePhoto'), 'Tomar foto');
    assert.equal(t('es', 'newJob'), 'Nuevo trabajo');
  });

  it('never exposes jargon in crew strings', () => {
    const keys = ['myJobs', 'newJob', 'saveJob', 'savedOnDevice', 'jobInProgress'] as const;
    for (const key of keys) {
      for (const locale of ['en', 'es'] as const) {
        const value = t(locale, key).toLowerCase();
        assert.equal(value.includes('supabase'), false);
        assert.equal(value.includes('draft'), false);
        assert.equal(value.includes('walkthrough'), false);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/i18n.test.ts`  
Expected: FAIL — `Cannot find module` / `i18n.ts` missing

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/i18n.ts` with both dictionaries. Example shape (include every key from Interfaces):

```ts
export type AppLocale = 'en' | 'es';

const en = {
  appName: 'Aperiv Field',
  tagline: 'On-site unit jobs and photos.',
  signIn: 'Sign in',
  signOut: 'Sign out',
  myJobs: 'My jobs',
  newJob: 'New job',
  jobInProgress: 'In progress',
  jobDone: 'Done',
  openJob: 'Open',
  deleteJob: 'Delete',
  confirmDelete: 'Delete?',
  property: 'Property',
  unit: 'Unit',
  recordedSqftOptional: 'Recorded sq ft (optional)',
  startJob: 'Start job',
  rooms: 'Rooms',
  takePhoto: 'Take photo',
  addFromLibrary: 'Add from library',
  addRoom: 'Add room',
  removeRoom: 'Remove',
  roomName: 'Room name',
  measuredSqft: 'Measured sq ft',
  condition: 'Condition',
  conditionGood: 'Good',
  conditionWatch: 'Watch',
  conditionIssue: 'Issue',
  notes: 'Notes',
  photosCount: 'Photos',
  continue: 'Continue',
  optionalProblems: 'Problems (optional)',
  addProblem: 'Add problem',
  problemTitle: 'Short title',
  problemDetails: 'Details',
  saveJob: 'Save job',
  savedOnDevice: 'Saved on this phone.',
  editRooms: 'Edit rooms',
  startAnother: 'Start another job',
  startScan: 'Start scan',
  scanRequired: 'Scan the unit to verify square feet.',
  noLidarDevice: 'This phone cannot verify sq ft. Use a LiDAR iPhone.',
  jobVerified: 'Verified',
  jobUnverified: 'Unverified',
  recordedSqftLabel: 'Recorded',
  saveVerified: 'Save verified job',
  language: 'Language',
  noJobsYet: 'No jobs yet. Tap New job to start.',
  signInToStart: 'Sign in to see your jobs.',
  signInUnavailable: 'Sign-in is unavailable in this build. Update the app or contact support.',
  checkingSession: 'Checking…',
  signedInAs: 'Signed in as',
  severityLow: 'Low',
  severityMedium: 'Medium',
  severityHigh: 'High',
  roomLiving: 'Living',
  roomKitchen: 'Kitchen',
  roomBedroom: 'Bedroom',
  roomBathroom: 'Bathroom',
} as const;

const es: { [K in keyof typeof en]: string } = {
  appName: 'Aperiv Field',
  tagline: 'Trabajos y fotos en la unidad.',
  signIn: 'Iniciar sesión',
  signOut: 'Cerrar sesión',
  myJobs: 'Mis trabajos',
  newJob: 'Nuevo trabajo',
  jobInProgress: 'En curso',
  jobDone: 'Listo',
  openJob: 'Abrir',
  deleteJob: 'Borrar',
  confirmDelete: '¿Borrar?',
  property: 'Propiedad',
  unit: 'Unidad',
  recordedSqftOptional: 'Pies² registrados (opcional)',
  startJob: 'Empezar trabajo',
  rooms: 'Habitaciones',
  takePhoto: 'Tomar foto',
  addFromLibrary: 'Elegir de galería',
  addRoom: 'Agregar habitación',
  removeRoom: 'Quitar',
  roomName: 'Nombre',
  measuredSqft: 'Pies² medidos',
  condition: 'Estado',
  conditionGood: 'Bien',
  conditionWatch: 'Revisar',
  conditionIssue: 'Problema',
  notes: 'Notas',
  photosCount: 'Fotos',
  continue: 'Continuar',
  optionalProblems: 'Problemas (opcional)',
  addProblem: 'Agregar problema',
  problemTitle: 'Título corto',
  problemDetails: 'Detalles',
  saveJob: 'Guardar trabajo',
  savedOnDevice: 'Guardado en este teléfono.',
  editRooms: 'Editar habitaciones',
  startAnother: 'Empezar otro trabajo',
  startScan: 'Empezar escaneo',
  scanRequired: 'Escanea la unidad para verificar los pies cuadrados.',
  noLidarDevice: 'Este teléfono no puede verificar pies². Usa un iPhone con LiDAR.',
  jobVerified: 'Verificado',
  jobUnverified: 'No verificado',
  recordedSqftLabel: 'Registrado',
  saveVerified: 'Guardar trabajo verificado',
  language: 'Idioma',
  noJobsYet: 'Aún no hay trabajos. Toca Nuevo trabajo.',
  signInToStart: 'Inicia sesión para ver tus trabajos.',
  signInUnavailable: 'El inicio de sesión no está disponible. Actualiza la app o contacta soporte.',
  checkingSession: 'Comprobando…',
  signedInAs: 'Sesión',
  severityLow: 'Bajo',
  severityMedium: 'Medio',
  severityHigh: 'Alto',
  roomLiving: 'Sala',
  roomKitchen: 'Cocina',
  roomBedroom: 'Recámara',
  roomBathroom: 'Baño',
};

export type TranslationKey = keyof typeof en;

export function normalizeLocale(value: unknown): AppLocale {
  if (typeof value !== 'string') return 'en';
  const v = value.trim().toLowerCase();
  if (v === 'es' || v.startsWith('es-')) return 'es';
  if (v === 'en' || v.startsWith('en-')) return 'en';
  return 'en';
}

export function t(locale: AppLocale, key: TranslationKey): string {
  return (locale === 'es' ? es : en)[key];
}

export function defaultRoomNames(locale: AppLocale): string[] {
  return [
    t(locale, 'roomLiving'),
    t(locale, 'roomKitchen'),
    t(locale, 'roomBedroom'),
    t(locale, 'roomBathroom'),
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --experimental-strip-types --test src/lib/i18n.test.ts`  
Expected: PASS (all tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n.ts src/lib/i18n.test.ts
git commit -m "$(cat <<'EOF'
feat(i18n): add en/es dictionaries with English default

EOF
)"
```

On Windows PowerShell if heredoc fails:

```powershell
git add src/lib/i18n.ts src/lib/i18n.test.ts
git commit -m "feat(i18n): add en/es dictionaries with English default"
```

---

### Task 2: Locale persistence + provider

**Files:**
- Create: `src/lib/locale-storage.ts`
- Create: `src/lib/locale-storage.test.ts`
- Create: `src/providers/locale-provider.tsx`
- Create: `src/components/language-toggle.tsx`
- Modify: `src/app/_layout.tsx`

**Interfaces:**
- Consumes: `AppLocale`, `normalizeLocale`, `t`, `TranslationKey` from `src/lib/i18n.ts`
- Produces:
  - `loadLocale(): Promise<AppLocale>`
  - `saveLocale(locale: AppLocale): Promise<void>`
  - `useLocale(): { locale: AppLocale; setLocale: (l: AppLocale) => void; t: (key: TranslationKey) => string; ready: boolean }`

- [ ] **Step 1: Write the failing storage test**

Create `src/lib/locale-storage.test.ts`:

```ts
import assert from 'node:assert/strict';
import { describe, it, beforeEach } from 'node:test';

const memory = new Map<string, string>();

// Minimal mock before importing module under test pattern:
// Implement locale-storage to accept an optional storage inject OR
// test normalize + key constant by exporting STORAGE_KEY and pure helpers.

import { LOCALE_STORAGE_KEY, parseStoredLocale } from './locale-storage.ts';

describe('parseStoredLocale', () => {
  it('returns en when missing or corrupt', () => {
    assert.equal(parseStoredLocale(null), 'en');
    assert.equal(parseStoredLocale('{'), 'en');
    assert.equal(parseStoredLocale('"es"'), 'es');
  });
});

describe('LOCALE_STORAGE_KEY', () => {
  it('is stable', () => {
    assert.equal(LOCALE_STORAGE_KEY, 'aperiv.field.locale.v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --experimental-strip-types --test src/lib/locale-storage.test.ts`  
Expected: FAIL — module missing

- [ ] **Step 3: Implement storage helpers**

Create `src/lib/locale-storage.ts`:

```ts
import AsyncStorage from '@react-native-async-storage/async-storage';

import { normalizeLocale, type AppLocale } from '@/lib/i18n';

export const LOCALE_STORAGE_KEY = 'aperiv.field.locale.v1';

export function parseStoredLocale(raw: string | null): AppLocale {
  if (raw == null) return 'en';
  try {
    const parsed: unknown = JSON.parse(raw);
    return normalizeLocale(parsed);
  } catch {
    return normalizeLocale(raw);
  }
}

export async function loadLocale(): Promise<AppLocale> {
  try {
    const raw = await AsyncStorage.getItem(LOCALE_STORAGE_KEY);
    return parseStoredLocale(raw);
  } catch {
    return 'en';
  }
}

export async function saveLocale(locale: AppLocale): Promise<void> {
  await AsyncStorage.setItem(LOCALE_STORAGE_KEY, JSON.stringify(locale));
}
```

- [ ] **Step 4: Run storage tests**

Run: `node --experimental-strip-types --test src/lib/locale-storage.test.ts`  
Expected: PASS

- [ ] **Step 5: Implement LocaleProvider + LanguageToggle**

Create `src/providers/locale-provider.tsx`:

```tsx
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { t as translate, type AppLocale, type TranslationKey } from '@/lib/i18n';
import { loadLocale, saveLocale } from '@/lib/locale-storage';

type LocaleContextValue = {
  locale: AppLocale;
  setLocale: (locale: AppLocale) => void;
  t: (key: TranslationKey) => string;
  ready: boolean;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<AppLocale>('en');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadLocale().then((loaded) => {
      setLocaleState(loaded);
      setReady(true);
    });
  }, []);

  const setLocale = (next: AppLocale) => {
    setLocaleState(next);
    void saveLocale(next);
  };

  const value = useMemo<LocaleContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => translate(locale, key),
      ready,
    }),
    [locale, ready]
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used within LocaleProvider');
  }
  return ctx;
}
```

Create `src/components/language-toggle.tsx`:

```tsx
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { MinTouchTarget, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useLocale } from '@/providers/locale-provider';
import type { AppLocale } from '@/lib/i18n';

export function LanguageToggle() {
  const theme = useTheme();
  const { locale, setLocale, t } = useLocale();

  const Chip = ({ code, label }: { code: AppLocale; label: string }) => {
    const active = locale === code;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        onPress={() => setLocale(code)}
        style={[
          styles.chip,
          {
            backgroundColor: active ? theme.accent : theme.backgroundSelected,
            borderColor: theme.border,
          },
        ]}>
        <ThemedText
          type="smallBold"
          style={active ? { color: theme.onAccent } : undefined}>
          {label}
        </ThemedText>
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap} accessibilityLabel={t('language')}>
      <Chip code="en" label="EN" />
      <Chip code="es" label="ES" />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', gap: Spacing.two },
  chip: {
    minHeight: MinTouchTarget,
    minWidth: MinTouchTarget + 8,
    paddingHorizontal: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Spacing.two,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
```

Wrap provider in `src/app/_layout.tsx` inside `ThemeProvider`, outside or around `AuthProvider` (LocaleProvider should wrap navigators so login/home can use it):

```tsx
import { LocaleProvider } from '@/providers/locale-provider';

// inside RootLayout return:
<ThemeProvider value={...}>
  <LocaleProvider>
    <AuthProvider>
      <SplashScreenController />
      <RootNavigator />
    </AuthProvider>
  </LocaleProvider>
</ThemeProvider>
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`  
Expected: no errors from new files

- [ ] **Step 7: Commit**

```powershell
git add src/lib/locale-storage.ts src/lib/locale-storage.test.ts src/providers/locale-provider.tsx src/components/language-toggle.tsx src/app/_layout.tsx
git commit -m "feat(i18n): persist locale preference with EN default"
```

---

### Task 3: Home = My jobs list

**Files:**
- Create: `src/components/job-list.tsx`
- Modify: `src/app/index.tsx`
- Consumes: `loadDraftStore`, `saveDraftStore`, `DraftStore`, `ManualWalkthroughDraft`, `totalPhotos` from `src/lib/walkthrough-draft.ts`
- Consumes: `useLocale`, `LanguageToggle`, `useAuth`

**Interfaces:**
- Produces: `JobList` props:
  - `store: DraftStore`
  - `onNewJob: () => void`
  - `onOpenJob: (id: string) => void`
  - `onDeleteJob: (id: string) => void`

- [ ] **Step 1: Implement `JobList`**

Create `src/components/job-list.tsx` that:
- Sorts drafts by `createdAt` descending
- Renders each row: `{property} · {unit}`, status (`t('jobInProgress')` / `t('jobDone')`), `{totalPhotos} {t('photosCount')}`
- Row minHeight ≥ 56; whole row pressable → `onOpenJob`
- Delete uses two-tap confirm with `t('confirmDelete')` (same pattern as current manual-walkthrough)
- Empty state: `t('noJobsYet')`
- Primary button at top or bottom: `t('newJob')` → `onNewJob` (minHeight 52, `theme.accent`)

- [ ] **Step 2: Rework `src/app/index.tsx`**

Behavior:
- Show brand `t('appName')` + `t('tagline')` + `LanguageToggle`
- If signed out: `t('signInToStart')` + link to `/login` labeled `t('signIn')`
- If signed in:
  - Load draft store on mount (same as manual walkthrough)
  - Render `JobList`
  - `onNewJob` → `router.push({ pathname: '/walkthrough', params: { mode: 'new' } })`
  - `onOpenJob` → set `activeDraftId` in store, then `router.push({ pathname: '/walkthrough', params: { mode: 'resume', id } })`
  - Sign out button uses `t('signOut')`
- Remove “Status” jargon card; optional one-line `t('signedInAs') + email` in secondary text

Use `expo-router` `router` from `expo-router` for navigation.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`  
Run: `npm run lint`  
Expected: clean for touched files

- [ ] **Step 4: Commit**

```powershell
git add src/components/job-list.tsx src/app/index.tsx
git commit -m "feat(home): replace status card with My jobs list"
```

---

### Task 4: Guided room-by-room capture (check-in → per-room scan/prompts → done)

**Files:**
- Modify: `src/components/manual-walkthrough.tsx` (or rename toward job guide) — state machine, not chip wizard
- Modify: `src/lib/walkthrough-draft.ts` — per-room progress; `measuredSqftFromScan`; `verificationStatus: 'verified' | 'unverified'`
- Modify: `src/app/walkthrough.tsx` — RoomPlan session integrated into current-room step when LiDAR
- Optional create: `src/lib/guide-steps.ts` — pure helper `nextGuidePrompt(locale, roomIndex, phase)` for tests

**Interfaces:**
- Consumes: `useLocale().t`, draft store, RoomPlan, image picker
- Produces: `'checkin' | 'roomGuide' | 'done'`
- Inside `roomGuide`: phases `'arrive' | 'scan' | 'condition' | 'damage' | 'photo' | 'advance'` for current room index
- Verified save only when LiDAR scan data present; non‑LiDAR skips `'scan'` phase, Unverified only

- [ ] **Step 1: Update `createDraft` signature**

In `walkthrough-draft.ts`:

```ts
export function createDraft(
  property: string,
  unit: string,
  recordedSqft: string,
  roomNames: string[] = DEFAULT_ROOM_NAMES
): ManualWalkthroughDraft {
  return {
    id: newId('draft'),
    property: property.trim(),
    unit: unit.trim(),
    recordedSqft: recordedSqft.trim(),
    rooms: roomNames.map(createRoom),
    findings: [],
    createdAt: new Date().toISOString(),
  };
}
```

Keep `DEFAULT_ROOM_NAMES` as English fallbacks for migration/tests.

- [ ] **Step 2: Rewrite manual-walkthrough UX**

Replace chip wizard with guided room loop:

1. **checkin** — property + unit + recorded sq ft. CTA start job. Banner if no LiDAR (`noLidarDevice`).
2. **roomGuide** — for room[i]:
   - arrive: “Go to {roomName}” + Continue
   - scan (LiDAR only): Start scan → RoomPlan → on success advance
   - condition: Good / Watch / Issue (large chips)
   - damage: “Any damage?” No / Yes → short note field
   - photo: Take photo — require ≥1 photo per room before Next
   - advance: Next room or Finish
3. **done** — Recorded vs Measured; Verified or Unverified; Save; back to My jobs.

Rules:
- One prompt on screen at a time (crew-simple)
- All strings via `t(...)` including guide sentences (add keys like `goToRoom`, `anyDamage`, `yes`, `no`, `nextRoom`, `finishJob`)
- Primary buttons minHeight 52
- Resume restores current room index + phase

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`  
Run: `npm run lint`  
Expected: pass

- [ ] **Step 4: Commit**

```powershell
git add src/components/manual-walkthrough.tsx src/lib/walkthrough-draft.ts src/app/walkthrough.tsx
git commit -m "feat(capture): guided room-by-room scan and condition prompts"
```

---

### Task 5: Login + stack titles localized

**Files:**
- Modify: `src/app/login.tsx`
- Modify: `src/app/_layout.tsx` (stack `options.title` via a small inner component that calls `useLocale`)

- [ ] **Step 1: Login copy**

Use `t('appName')`, `t('tagline')`, `t('signIn')`, `t('signInUnavailable')`, placeholders for email/password can stay “Email” / “Password” or add keys `email` / `password` to i18n (add keys if used). Include `LanguageToggle` under brand.

- [ ] **Step 2: Stack titles**

In `_layout.tsx`, set login title to `t('signIn')` and walkthrough title to `t('rooms')` or `t('myJobs')` context — prefer walkthrough header title `t('appName')` with `headerBackTitleVisible` for back to jobs.

Because `useLocale` needs provider, create `function LocalizedStack()` inside file under provider.

- [ ] **Step 3: Lint/typecheck + commit**

```powershell
npx tsc --noEmit
npm run lint
git add src/app/login.tsx src/app/_layout.tsx src/lib/i18n.ts
git commit -m "feat(i18n): localize login and navigation titles"
```

---

### Task 6: Acceptance pass + docs note

**Files:**
- Modify: `AGENTS.md` — only if needed to record “English default + ES toggle shipped in job-list pass” (preference already present; add workspace fact that job-list UX landed when done)
- No product README required unless missing run instructions

- [ ] **Step 1: Run full automated checks**

```powershell
node --experimental-strip-types --test src/lib/i18n.test.ts src/lib/locale-storage.test.ts
npx tsc --noEmit
npm run lint
```

Expected: all pass

- [ ] **Step 2: Manual device checklist (TestFlight or dev client)**

- [ ] Fresh install / update: UI is English
- [ ] Toggle ES: home shows “Mis trabajos”, CTA “Nuevo trabajo”
- [ ] Toggle back EN: English returns; preference survives app restart
- [ ] Check in → guided “Go to Living” (or ES) → scan → condition → damage → photo → next room
- [ ] LiDAR: Verified save only after scan data; Done shows Recorded vs Measured
- [ ] Non‑LiDAR: Unverified save allowed; never Verified
- [ ] Job appears on home list; resume continues mid-guide
- [ ] EN/ES toggle; no jargon visible

- [ ] **Step 3: Ship path**

Prefer OTA (no new native modules):

```powershell
eas update --channel production --message "Crew job list + EN/ES"
```

If Testers are on a binary without matching runtime fingerprint, run:

```powershell
eas build --platform ios --profile production --non-interactive --no-wait
```

- [ ] **Step 4: Final commit for AGENTS.md if updated**

```powershell
git add AGENTS.md
git commit -m "docs(agents): note job-list bilingual UX defaults to English"
```

- [ ] **Step 5: Backup branch (orphan main safety)**

```powershell
git push origin HEAD:backup/crew-job-list-ux
```

---

## Self-Review

**1. Spec coverage**
- Bugbot draft/photo races → Task 0 (prerequisite)  
- English default + ES toggle → Tasks 1–2, 5  
- Job list home → Task 3  
- Guided room-by-room scan + condition/damage/photo → Task 4  
- Sq ft verification (LiDAR Verified / Unverified allowed) → Task 4  
- Plain language / no jargon → Task 1 jargon test + Task 4 string audit  
- No Supabase sync → Global Constraints / not scheduled  
- QR/GPS → Phase 2; LLM coach → Phase 3  

**2. Placeholder scan:** No TBD/TODO steps; dictionaries and commands are concrete.

**3. Type consistency:** `AppLocale`, `TranslationKey`, `t(locale,key)` / `useLocale().t(key)`; draft gains per-room guide progress + verification fields.

---
