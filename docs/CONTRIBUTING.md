# Contributing to Clyzio

## Prerequisites

- Node 20.x + npm 10.x
- Xcode 15+ (iOS) / Android Studio Hedgehog+ (Android)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (`brew install supabase/tap/supabase`)
- An `.env` file based on `.env.example`

## First-time setup

```bash
npm install
cp .env.example .env   # then fill in the EXPO_PUBLIC_* values
supabase start         # starts Postgres/Studio/Kong on 54321+
supabase db reset      # applies every migration under supabase/migrations
npm run start          # launches Metro
```

iOS prebuild:

```bash
MAPBOX_DOWNLOAD_TOKEN=... npx expo prebuild --platform ios --clean
npm run ios
```

## Daily workflow

```bash
npm run typecheck    # TS
npm run lint         # ESLint (errors only)
npm run format       # Prettier write
npm test             # jest
```

All four run on every PR via `.github/workflows/build.yml`.

## Adding a migration

1. Create `supabase/migrations/<YYYYMMDD_NNN>_<slug>.sql`.
2. Wrap changes in `BEGIN; … COMMIT;` for atomicity.
3. If you create a new table:
   - `ENABLE ROW LEVEL SECURITY`
   - Add explicit `INSERT`, `SELECT`, `UPDATE`, `DELETE` policies (or a
     single deny-all policy + service-role access).
4. Test locally with `supabase db reset`.
5. Regenerate client types: `SUPABASE_PROJECT_ID=… npm run gen:types`.

## Adding an edge function

1. `supabase/functions/<name>/index.ts`:
   ```ts
   import { verifyAuth } from '../_shared/auth.ts';
   import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
   import { parseBody, MySchema } from '../_shared/validate.ts';

   Deno.serve(async (req) => {
     if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
     let userId: string, supabase;
     try { ({ userId, supabase } = await verifyAuth(req)); }
     catch { return respondError(401, 'unauthorized'); }

     const parsed = await parseBody(req, MySchema);
     if (!parsed.ok) return parsed.response;

     try { /* logic */ return respondJSON(result); }
     catch (err) { return respondInternalError('my-function', err); }
   });
   ```
2. Add the zod schema to `supabase/functions/_shared/validate.ts`.
3. Register in `supabase/config.toml` (`[functions.my-function] verify_jwt = true`).
4. Document secrets in `.env.example`.

## Adding a screen

1. Prefer composing `components/ui/*` primitives.
2. Wrap the screen in `<Screen>` from `components/ui` (or
   `SafeAreaView` directly) — never a bare `<View>` at the root.
3. Read colors via `getPalette(isDark)` — don't inline hex.
4. Copy strings: add them to `lib/i18n/en.ts` and use `t('key')`.

## Commit style

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(matching): award bonus XP for carpool
fix(trip): infinite spinner when session not ready
chore(deps): bump supabase-js to 2.86.2
```

## Branching

- `main` → production (every merge builds + submits to stores)
- `preview` → internal TestFlight / Internal Play track
- feature branches → PR to `main`

## Release checklist

- [ ] `npm run typecheck && npm run lint && npm test` all green
- [ ] Supabase migrations applied on staging
- [ ] `OVERHAUL_LOG.md` / CHANGELOG updated
- [ ] Secrets reviewed (`.env.example` up to date)
- [ ] App-Store-specific: version bump in `app.config.ts`, screenshots, review notes
