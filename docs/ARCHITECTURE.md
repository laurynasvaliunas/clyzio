# Clyzio architecture

This document is the one-page map of how the app fits together. For the
"what and why was changed during the overhaul" narrative, see
[`OVERHAUL_LOG.md`](../OVERHAUL_LOG.md).

---

## Layers

```
┌────────────────────────────────────────────────────────────┐
│  UI (React Native / Expo Router, app/)                     │
│  - app/(auth)/*      Unauthenticated screens               │
│  - app/(tabs)/*      Main tabs                              │
│  - app/trip/[id]     Active / history trip                  │
│  - app/legal/*       Public legal pages                     │
│  - app/settings/*    Profile, prefs, notifications          │
└────────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────────┐
│  Primitives & state                                        │
│  - components/ui/*           Design-system primitives       │
│  - contexts/*                Theme, Toast                   │
│  - store/*                   Zustand stores                 │
│  - lib/theme/tokens.ts       Colors, spacing, radii, …      │
│  - lib/i18n/                 Typed translations             │
│  - lib/deepLinks.ts          clyzio:// + https://clyzio.app │
│  - lib/supabase.ts           Hybrid SecureStore + Supabase  │
│  - lib/sentry.ts             Error + perf monitoring        │
└────────────────────────────────────────────────────────────┘
                           │
┌────────────────────────────────────────────────────────────┐
│  Backend (Supabase)                                        │
│  - Postgres                  schemas in supabase/migrations │
│  - Edge Functions (Deno)     supabase/functions/*           │
│    - Shared helpers in supabase/functions/_shared/          │
│      - auth.ts           verifyAuth(req)                    │
│      - cors.ts           hardened CORS policy               │
│      - anthropic.ts      Claude wrapper                     │
│      - validate.ts       zod schemas per function           │
│      - respond.ts        respondJSON / respondError / …     │
│      - expoPush.ts       batched Expo push sender           │
│  - Auth (JWT) and Realtime                                  │
└────────────────────────────────────────────────────────────┘
```

## Edge functions

Function | Caller | Auth
---|---|---
`submit-trip-intent` | App (passenger / driver) | JWT
`driver-respond-to-matches` | App (driver) | JWT
`passenger-respond-to-match` | App (passenger) | JWT
`ai-commute-planner` | App | JWT
`ai-carpool-matcher` | App | JWT
`ai-sustainability-report` | Manager dashboard | JWT
`daily-commute-matcher` | Cron / dashboard | `x-cron-secret` OR JWT
`delete-account` | App | JWT (+ service role inside)

Every function:

1. Calls `verifyAuth(req)` and fails closed (401).
2. `parseBody(req, Schema)` — zod schema from `validate.ts`.
3. Returns `respondJSON / respondError / respondInternalError`.
4. Logs details server-side, never in the response body.

## Client auth

`lib/supabase.ts` wires a hybrid storage adapter:
- On iOS/Android: `expo-secure-store` (Keychain / Keystore).
- On web: `AsyncStorage` fallback (localStorage).

A legacy read-through fallback allows users upgrading from the old
`AsyncStorage` session to continue without being signed out — the first
successful SecureStore write clears the legacy copy.

## State management

Zustand stores in `store/*`:

- `useAIStore` — incoming AI suggestions
- `useTripStore` — active trip
- `useNotificationToastStore` — one-off toasts

Each store exports a hook and (where relevant) a subscribe helper used by
`app/_layout.tsx`.

## Design system

`lib/theme/tokens.ts` defines:
- brand + semantic colors, light/dark palettes
- spacing (4/8/12/16/20/24/…), radii (4/8/12/16/20/24/full), typography, shadows, motion

`components/ui/*` primitives consume these tokens and expose a stable,
accessibility-complete API. All call-sites should import from
`components/ui` before writing one-off layouts.

## Observability

- **Sentry** (`lib/sentry.ts`) initialises early in `_layout.tsx`, attaches
  the logged-in user's opaque ID, and wraps the root `ErrorBoundary`.
- **`captureError(err, { feature })`** is used in every hot-path catch block
  so bug reports are grouped by surface area.
- **Scrubbing:** PII is never sent to Sentry — only the Supabase user id and
  the feature tag.

## Deep links

`clyzio://ride/<id>`, `clyzio://profile/<id>`, `clyzio://invite/<code>`
and their `https://clyzio.app/*` equivalents route through
`lib/deepLinks.ts` and the listener in `app/_layout.tsx`.
