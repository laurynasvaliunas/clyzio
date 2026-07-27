-- 039 — Lock down legacy SECURITY DEFINER RPCs (pre-launch security audit).
--
-- BACKGROUND
-- A pre-App-Store audit found that a family of legacy SECURITY DEFINER
-- functions accept a caller-supplied user/company id, perform NO authorization
-- check, and are executable by the `anon` role. The anon key is public — it
-- ships inside the app bundle — so these were reachable by anyone on the
-- internet via POST /rest/v1/rpc/<fn>.
--
-- Two findings were exploit-verified against production (rolled back):
--
--   C1  award_xp(user_uuid, xp_amount, trip_type)
--       As `anon`: award_xp('<uid>', 999999, 'walk') returned
--       {"new_xp":999999,"new_level":10,"leveled_up":true,...} — i.e. anyone
--       could set any user's XP/badges/trip counters. Because SECURITY DEFINER
--       runs as the owner it also bypassed guard_profile_protected_columns_trg,
--       defeating the server-authoritative complete-trip design (migration 018/035).
--       The client never calls it (0 references) — it is dead legacy code
--       superseded by the complete-trip edge function. => DROP.
--
--   C2  get_user_commute_context(p_user_id)
--       Returned home_address, home_lat/long, work_address, work_lat/long,
--       departure times, vehicle and first_name for ANY user id, to `anon`.
--       Combined with the `avatars` bucket's broad SELECT policy (which allows
--       listing objects named "<user_uuid>/avatar.<ext>"), this formed a full
--       harvest chain: list bucket -> every user id -> every home address.
--       => self-scoped auth check + bucket listing removed (see 039b below).
--
-- The functions hardened in earlier rounds (get_public_profiles,
-- find_carpool_candidates, get_company_inventory, accept_company_invite,
-- verify_company_domain, backfill_company_domain) already check auth and are
-- deliberately left alone.
--
-- STRATEGY
--   * DROP the two functions with zero client callers (award_xp,
--     get_company_employees).
--   * Add an authorization gate to the ones the app genuinely uses:
--       - self-scoped   : auth.uid() = the requested user
--       - company-scoped: requester must belong to the same company
--   * REVOKE EXECUTE from `anon` on all of them. Only the two genuinely
--     pre-login lookups (lookup_invite_by_token, lookup_company_by_email_domain)
--     keep anon access.

-- ─── C1: drop the unauthenticated writer ─────────────────────────────────────
-- No client references (verified across app/, components/, lib/, store/,
-- supabase/functions/). Gamification is owned by the complete-trip edge fn.
drop function if exists public.award_xp(uuid, integer, text);

-- Dead admin helper, also unreferenced by the client, leaked employee
-- names/XP/trip counts for a company id.
drop function if exists public.get_company_employees(uuid);

-- ─── C2: self-scoped — commute context contains home/work addresses ──────────
create or replace function public.get_user_commute_context(p_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  result JSONB;
BEGIN
  -- Authorization: this payload includes the user's exact home and work
  -- addresses. Only the user themselves may read it.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'home_address', p.home_address,
    'home_lat', p.home_lat,
    'home_long', p.home_long,
    'work_address', p.work_address,
    'work_lat', p.work_lat,
    'work_long', p.work_long,
    'preferred_departure_time', p.preferred_departure_time,
    'preferred_departure_days', p.preferred_departure_days,
    'commuting_habits', p.commuting_habits,
    'baseline_co2_mode', p.baseline_co2_mode,
    'baseline_co2', p.baseline_co2,
    'total_co2_saved', p.total_co2_saved,
    'trips_completed', p.trips_completed,
    'is_driver', p.is_driver,
    'car_make', p.car_make,
    'car_model', p.car_model,
    'first_name', p.first_name,
    'ai_cache_updated_at', p.ai_cache_updated_at
  )
  INTO result
  FROM public.profiles p
  WHERE p.id = p_user_id;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$function$;

-- ─── Self-scoped: personal impact stats ──────────────────────────────────────
create or replace function public.get_user_impact(user_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  result JSONB;
  week_start TIMESTAMPTZ := date_trunc('week', now());
  last_week_start TIMESTAMPTZ := date_trunc('week', now()) - INTERVAL '1 week';
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> user_uuid THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_co2_saved',  COALESCE(p.total_co2_saved, 0),
    'total_trips',      COALESCE(p.trips_completed, 0),
    'this_week_co2',    COALESCE((
      SELECT SUM(r.co2_saved)
      FROM public.rides r
      WHERE (r.rider_id = user_uuid OR r.driver_id = user_uuid)
        AND r.status = 'completed'
        AND r.completed_at >= week_start
    ), 0),
    'last_week_co2',    COALESCE((
      SELECT SUM(r.co2_saved)
      FROM public.rides r
      WHERE (r.rider_id = user_uuid OR r.driver_id = user_uuid)
        AND r.status = 'completed'
        AND r.completed_at >= last_week_start
        AND r.completed_at < week_start
    ), 0)
  )
  INTO result
  FROM public.profiles p
  WHERE p.id = user_uuid;

  RETURN COALESCE(result, '{}'::JSONB);
END;
$function$;

-- ─── Company-scoped helper: caller must be in the company they ask about ─────
-- Kept internal (no direct grants) — used by the four aggregate functions.
create or replace function public.assert_same_company(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  caller_company UUID;
  target_company UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT company_id INTO caller_company FROM public.profiles WHERE id = auth.uid();
  SELECT company_id INTO target_company FROM public.profiles WHERE id = p_user_id;

  -- Solo users (NULL company) have no company aggregates to read, and a caller
  -- may only ever read their OWN company's numbers.
  IF caller_company IS NULL OR target_company IS NULL OR caller_company <> target_company THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN caller_company;
END;
$function$;

revoke all on function public.assert_same_company(uuid) from public, anon;
grant execute on function public.assert_same_company(uuid) to authenticated, service_role;

create or replace function public.get_company_totals(user_uuid uuid)
returns table(company_name text, total_co2_saved numeric, total_trips bigint, employee_count bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  company UUID;
BEGIN
  company := public.assert_same_company(user_uuid);
  RETURN QUERY
    SELECT
      c.name::TEXT AS company_name,
      COALESCE(SUM(p.total_co2_saved), 0) AS total_co2_saved,
      COALESCE(SUM(p.trips_completed), 0)::BIGINT AS total_trips,
      COUNT(p.id) AS employee_count
    FROM public.profiles p
    JOIN public.companies c ON c.id = company
    WHERE p.company_id = company
    GROUP BY c.name;
END;
$function$;

create or replace function public.get_company_leaderboard(user_uuid uuid)
returns table(id uuid, name text, department text, total_saved numeric, is_current_user boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  company UUID;
BEGIN
  company := public.assert_same_company(user_uuid);
  RETURN QUERY
    SELECT
      p.id,
      CONCAT(p.first_name, ' ', p.last_name)::TEXT AS name,
      p.department::TEXT,
      COALESCE(p.total_co2_saved, 0) AS total_saved,
      (p.id = user_uuid) AS is_current_user
    FROM public.profiles p
    WHERE p.company_id = company
    ORDER BY total_saved DESC
    LIMIT 50;
END;
$function$;

-- ─── Revoke anon on every argument-taking DEFINER function ───────────────────
-- Exceptions (must work pre-login, and both are token/domain lookups that
-- return no personal data): lookup_invite_by_token, lookup_company_by_email_domain.
do $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND p.proname NOT IN ('lookup_invite_by_token', 'lookup_company_by_email_domain')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
  END LOOP;
END $$;

-- ─── C2 (second half): stop the avatars bucket from being listable ───────────
-- A public bucket serves object URLs WITHOUT a broad SELECT policy on
-- storage.objects. The broad policy only added the ability to enumerate every
-- object — i.e. every user id — which is what completed the harvest chain.
drop policy if exists "Public read avatars" on storage.objects;
drop policy if exists "Public read company logos" on storage.objects;

-- Authenticated users may still read/list their OWN avatar folder (needed for
-- upsert bookkeeping); everyone else consumes avatars via the public object URL.
create policy "Users can read own avatar objects"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ─── 039b: the revoke above was a no-op — these functions carry Postgres'
-- default `GRANT EXECUTE TO PUBLIC`, so `anon` inherited EXECUTE via PUBLIC and
-- revoking from `anon` alone changed nothing. Revoke from PUBLIC, then re-grant
-- explicitly. Trigger functions (returns trigger) get no grants.
do $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig,
           p.proname,
           (pg_get_function_result(p.oid) = 'trigger') AS is_trigger
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', fn.sig);
    IF NOT fn.is_trigger THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', fn.sig);
    END IF;
    IF fn.proname IN ('lookup_invite_by_token', 'lookup_company_by_email_domain') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', fn.sig);
    END IF;
  END LOOP;
END $$;

-- ─── 039c: the blanket grant above was too broad — restore the two
-- service-role-only mutating routines it re-exposed.
revoke execute on function public.recompute_company_green_score(uuid) from authenticated, anon, public;
revoke execute on function public.claim_pending_invite(uuid, text) from authenticated, anon, public;
grant execute on function public.recompute_company_green_score(uuid) to service_role;
grant execute on function public.claim_pending_invite(uuid, text) to service_role;
