-- Migration 010: Security hardening
-- Date: 2026-04-17
--
-- Closes the findings from the overhaul audit:
--   1) Enable RLS on `matcher_runs` (was previously off — service role bypasses).
--   2) Add missing DELETE policies for profiles, messages, ai_suggestions,
--      company_challenges.
--   3) Harden every SECURITY DEFINER function:
--      - `SET search_path = public, pg_temp` to prevent search-path injection.
--      - `REVOKE EXECUTE ... FROM PUBLIC` + `GRANT EXECUTE ... TO authenticated`.
--   4) Narrow the overly-broad "view scheduled rides" policy introduced in
--      migration 006 to only authenticated users (no anon).
--
-- NOTE: This migration is idempotent — it only enables RLS / adds policies /
-- re-grants privileges. Existing data is untouched.

BEGIN;

-- ─── 1. RLS on matcher_runs ─────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.matcher_runs ENABLE ROW LEVEL SECURITY;

-- Deny-all for clients; service role bypasses RLS entirely so the matcher
-- cron / edge function continues to insert rows.
DROP POLICY IF EXISTS "no client access to matcher_runs" ON public.matcher_runs;
CREATE POLICY "no client access to matcher_runs" ON public.matcher_runs
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- ─── 2. Missing DELETE policies ─────────────────────────────────────────────

-- profiles: users can delete only their own (the `delete-account` edge
-- function uses service role which bypasses RLS for admin deletes).
DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile" ON public.profiles
  FOR DELETE USING (auth.uid() = id);

-- messages: sender can delete their own message
DROP POLICY IF EXISTS "Sender can delete own message" ON public.messages;
CREATE POLICY "Sender can delete own message" ON public.messages
  FOR DELETE USING (auth.uid() = sender_id);

-- ai_suggestions: owner can delete their own suggestion record
DROP POLICY IF EXISTS "Users can delete own AI suggestions" ON public.ai_suggestions;
CREATE POLICY "Users can delete own AI suggestions" ON public.ai_suggestions
  FOR DELETE USING (auth.uid() = user_id);

-- company_challenges: only managers of the challenge's company can delete
DROP POLICY IF EXISTS "Managers can delete challenges" ON public.company_challenges;
CREATE POLICY "Managers can delete challenges" ON public.company_challenges
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = company_challenges.company_id
        AND profiles.is_manager = true
    )
  );

-- ─── 3. Harden SECURITY DEFINER functions ───────────────────────────────────

-- 3a. search_path hardening. The `ALTER FUNCTION ... SET search_path` form is
--     idempotent and does not require knowing each function's body.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS fn_name,
      pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname IN (
        'handle_new_user',
        'get_user_commute_context',
        'get_company_stats',
        'find_carpool_candidates',
        'get_user_impact',
        'get_company_leaderboard',
        'get_department_leaderboard',
        'get_company_breakdown',
        'get_company_totals'
      )
  LOOP
    EXECUTE format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public, pg_temp',
      fn.schema_name, fn.fn_name, fn.args
    );
  END LOOP;
END $$;

-- 3b. Least-privilege grants. By default `SECURITY DEFINER` functions are
-- executable by PUBLIC which means `anon` can invoke them from a browser.
-- Tighten: only `authenticated` role can call user-scoped RPCs. The
-- `handle_new_user` trigger fires as superuser so its grants are irrelevant;
-- we still revoke public for cleanliness.
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOR fn IN SELECT unnest(ARRAY[
    'get_user_commute_context(UUID)',
    'get_company_stats(UUID)',
    'find_carpool_candidates(DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TIMESTAMPTZ, TEXT, DOUBLE PRECISION, UUID)',
    'get_user_impact(UUID)',
    'get_company_leaderboard(UUID)',
    'get_department_leaderboard(UUID)',
    'get_company_breakdown(UUID)',
    'get_company_totals(UUID)'
  ])
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM anon',   fn);
      EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO authenticated', fn);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not re-grant %: %', fn, SQLERRM;
    END;
  END LOOP;
END $$;

-- ─── 4. Narrow the "public rides" policy to authenticated users ─────────────
-- The visibility policy introduced in migration 006 was intended for the map
-- showing nearby commuters. Restrict to `authenticated` so anon cannot read
-- any location data even with a leaked anon key.
DROP POLICY IF EXISTS "Authenticated users can view scheduled rides" ON public.rides;
CREATE POLICY "Authenticated users can view scheduled rides" ON public.rides
  FOR SELECT TO authenticated USING (
    status IN ('scheduled', 'requested', 'active')
    AND (
      auth.uid() = rider_id
      OR auth.uid() = driver_id
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        WHERE (p.id = rides.driver_id OR p.id = rides.rider_id)
          AND p.is_public = true
      )
    )
  );

-- Same for the public-profiles policy
DROP POLICY IF EXISTS "Public profiles are visible to authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are visible to authenticated users" ON public.profiles
  FOR SELECT TO authenticated USING (is_public = true OR auth.uid() = id);

COMMIT;
