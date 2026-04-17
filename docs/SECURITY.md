# Clyzio security posture

This document describes the controls in place as of the 2026-04-17 overhaul.
Pair with `.cursorrules` and `OVERHAUL_LOG.md`.

## Reporting a vulnerability

Email `security@clyzio.app` with a PoC. We triage within 24 hours. Do not
file public GitHub issues for security problems.

## Threat model (summary)

| Asset | Threat | Control |
|---|---|---|
| User identity (JWT) | Device-local theft | `expo-secure-store` (Keychain / Keystore) — migration 2026-04 |
| User identity (JWT) | Server-side forgery | Supabase JWT signatures, RS256 |
| User profile / locations | Client-bypass via anon key | RLS on every table, authenticated-only SELECT policies on rides/profiles |
| Scheduled matcher | Anonymous invocation of privileged logic | `daily-commute-matcher` requires JWT or `x-cron-secret` — no service-role fallback |
| DB schema integrity | Search-path injection | All `SECURITY DEFINER` RPCs have `SET search_path = public, pg_temp` (migration 010) |
| AI upstream errors leaking PII | Claude error-body returned to client | `anthropic.ts` logs errors server-side, returns only `claude_upstream_error` |
| Account deletion | Orphaned auth rows | `delete-account` edge function uses service role + `auth.admin.deleteUser` |
| Push token abuse | Expo rate-limiting anon senders | `EXPO_PUSH_ACCESS_TOKEN` header attached by `expoPush.ts` |
| CORS / CSRF | Wildcard origins exposed on edge functions | `ALLOWED_ORIGINS` env var narrows allowed origins (defaults to `*` only for dev) |

## RLS policies (summary)

- `profiles`: owner can read/update/delete own; authenticated users can read
  rows where `is_public = true`.
- `rides`: participants can read/update their own; authenticated users can
  read scheduled/active rides that belong to public profiles.
- `messages`: participants only (insert, select, delete).
- `ratings`: insert if trip participant and rating the other party; read
  open to authenticated (for aggregate avg scores); update/delete only the
  rater within 24 hours.
- `matcher_runs`: deny-all client policy (service role bypasses).
- `safety_incidents`: owner only.
- `referrals`: owner only for SELECT; writes via edge function (service role).

## Edge function contract

Every function:

1. `verifyAuth(req)` OR `x-cron-secret` check — fail closed with 401.
2. `parseBody(req, Schema)` — zod validation from `_shared/validate.ts`.
3. Sanitised responses via `_shared/respond.ts`.
4. Upstream errors (Claude / Supabase) logged server-side with details,
   client receives only `{ error: 'internal_error', code?: string }`.

## Secret inventory

Where | Secret | Scope
---|---|---
Expo EAS secret | `MAPBOX_DOWNLOAD_TOKEN` | Native build
Expo EAS secret | `EXPO_PUBLIC_*` (Supabase URL / anon key / Mapbox public / Sentry DSN) | Client bundle
Supabase secrets | `ANTHROPIC_API_KEY` | Edge functions
Supabase secrets | `CRON_SHARED_SECRET` | `daily-commute-matcher` trigger
Supabase secrets | `EXPO_PUSH_ACCESS_TOKEN` | Expo push API
Supabase secrets | `ALLOWED_ORIGINS` | CORS

## Security review checklist (PRs)

- [ ] Any new table has RLS enabled and explicit INSERT/SELECT/UPDATE/DELETE policies.
- [ ] Any new `SECURITY DEFINER` RPC has `SET search_path = public, pg_temp`.
- [ ] Any new edge function uses `verifyAuth`, `parseBody`, `respondError`.
- [ ] No PII in `console.log` / Sentry breadcrumbs.
- [ ] No raw database / API error messages leaked in responses.
