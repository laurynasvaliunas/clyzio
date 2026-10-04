-- 041 — Pre-launch security pass 2 (October 2026 review, findings B1 + B2).
--
-- B1  Three company aggregate RPCs still trusted a caller-supplied id.
--     039 gated get_company_totals / get_company_leaderboard but missed these
--     siblings, and 039b's grant made them callable by every signed-in user:
--       get_department_leaderboard(user_uuid) — names + CO2 of another company
--       get_company_breakdown(user_uuid)      — per-department totals
--       get_company_stats(p_company_id)       — full company dashboard
--     => same assert_same_company() gate as 039; get_company_stats is a
--        manager/admin view, so it requires that role (or the service role,
--        which ai-sustainability-report uses after its own manager check).
--
-- B2  Ride integrity. The rides UPDATE policy only checks ownership, so a
--     client could PATCH status='completed' directly. That bypasses the
--     complete-trip edge function but still fires the AFTER UPDATE OF status
--     triggers: award_referral_on_first_trip (+250 XP to the referrer — and
--     pending_referral_code is client-set) and update_company_green_score.
--     The CO2 that enforce_ride_co2 derives server-side also rested on two
--     client-controlled inputs: profiles.baseline_co2 (unbounded) and the
--     ride coordinates (accepted up to 1000 km).
--     => guard_ride_client_writes: from the app a ride is created 'scheduled'
--        and solo-owned, and afterwards the ONLY change allowed is cancelling
--        it. Completion is server-only (complete-trip runs as service_role).
--     => baseline_co2 bounded to the physical range (catalog max is 0.192).
--     => distance sanity cap lowered to 200 km.

-- ─── B1 ──────────────────────────────────────────────────────────────────────

create or replace function public.get_department_leaderboard(user_uuid uuid)
returns table(user_id uuid, user_name text, total_co2_saved numeric, total_trips bigint)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  user_dept TEXT;
  user_company UUID;
BEGIN
  user_company := public.assert_same_company(user_uuid);

  SELECT department INTO user_dept
  FROM public.profiles WHERE profiles.id = user_uuid;

  RETURN QUERY
    SELECT
      p.id AS user_id,
      CONCAT(p.first_name, ' ', p.last_name)::TEXT AS user_name,
      COALESCE(p.total_co2_saved, 0) AS total_co2_saved,
      COALESCE(p.trips_completed, 0)::BIGINT AS total_trips
    FROM public.profiles p
    WHERE p.company_id = user_company
      AND p.department = user_dept
    ORDER BY total_co2_saved DESC
    LIMIT 20;
END;
$function$;

create or replace function public.get_company_breakdown(user_uuid uuid)
returns table(department_id text, department_name text, total_co2_saved numeric, employee_count bigint)
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
      p.department::TEXT AS department_id,
      p.department::TEXT AS department_name,
      COALESCE(SUM(p.total_co2_saved), 0) AS total_co2_saved,
      COUNT(p.id) AS employee_count
    FROM public.profiles p
    WHERE p.company_id = company
      AND p.department IS NOT NULL
    GROUP BY p.department
    ORDER BY total_co2_saved DESC;
END;
$function$;

create or replace function public.get_company_stats(p_company_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
DECLARE
  result JSONB;
  jwt_role TEXT := coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
BEGIN
  IF auth.uid() IS NULL THEN
    -- No end user: only the service role (edge functions) may read this.
    IF jwt_role <> 'service_role' THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND company_id = p_company_id AND is_manager
    )
    OR public.is_company_admin(auth.uid(), p_company_id)
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'company_name', c.name,
    'green_commute_score', c.green_commute_score,
    'employee_count', (
      SELECT COUNT(*) FROM public.profiles WHERE company_id = p_company_id
    ),
    'active_users', (
      SELECT COUNT(DISTINCT p2.id)
      FROM public.profiles p2
      WHERE p2.company_id = p_company_id AND p2.trips_completed > 0
    ),
    'total_co2_saved', (
      SELECT COALESCE(SUM(p3.total_co2_saved), 0)
      FROM public.profiles p3
      WHERE p3.company_id = p_company_id
    ),
    'total_trips', (
      SELECT COALESCE(SUM(p4.trips_completed), 0)
      FROM public.profiles p4
      WHERE p4.company_id = p_company_id
    ),
    'dept_breakdown', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'dept_id', d.id,
        'dept_name', d.name,
        'employee_count', COUNT(DISTINCT p5.id),
        'co2_saved', COALESCE(SUM(p5.total_co2_saved), 0),
        'trips_completed', COALESCE(SUM(p5.trips_completed), 0)
      )), '[]'::jsonb)
      FROM public.departments d
      LEFT JOIN public.profiles p5 ON p5.department_id = d.id
      WHERE d.company_id = p_company_id
      GROUP BY d.id, d.name
    ),
    'transport_mode_distribution', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'mode', transport_mode,
        'trip_count', cnt
      )), '[]'::jsonb)
      FROM (
        SELECT r.transport_mode, COUNT(*) AS cnt
        FROM public.rides r
        JOIN public.profiles p6 ON (r.rider_id = p6.id OR r.driver_id = p6.id)
        WHERE p6.company_id = p_company_id
          AND r.status = 'completed'
          AND r.transport_mode IS NOT NULL
        GROUP BY r.transport_mode
        ORDER BY cnt DESC
      ) mode_counts
    ),
    'active_challenges', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'title', cc.title,
        'type', cc.challenge_type,
        'target', cc.target_value,
        'current', cc.current_value,
        'ends_at', cc.ends_at
      )), '[]'::jsonb)
      FROM public.company_challenges cc
      WHERE cc.company_id = p_company_id AND cc.is_active = true
    )
  ) INTO result
  FROM public.companies c
  WHERE c.id = p_company_id;

  RETURN result;
END;
$function$;

-- CREATE OR REPLACE keeps existing grants; restate them so this file is
-- self-describing (039b model: authenticated + service_role, never anon).
revoke all on function public.get_department_leaderboard(uuid) from public, anon;
revoke all on function public.get_company_breakdown(uuid) from public, anon;
revoke all on function public.get_company_stats(uuid) from public, anon;
grant execute on function public.get_department_leaderboard(uuid) to authenticated, service_role;
grant execute on function public.get_company_breakdown(uuid) to authenticated, service_role;
grant execute on function public.get_company_stats(uuid) to authenticated, service_role;

-- ─── B2: ride writes from the app ────────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user is then the real caller. PostgREST
-- requests from the app run as `authenticated`; edge functions run as
-- `service_role`; cron and SECURITY DEFINER routines run as the owner — all
-- of those are server-side and trusted.
create or replace function public.guard_ride_client_writes()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
BEGIN
  IF current_user <> 'authenticated' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status IS DISTINCT FROM 'scheduled' OR NEW.completed_at IS NOT NULL THEN
      RAISE EXCEPTION 'A new ride must start as scheduled'
        USING ERRCODE = '42501';
    END IF;
    -- Carpool rides pair two users; only respond-to-match (server) creates them.
    IF NEW.driver_id IS NOT NULL AND NEW.rider_id IS NOT NULL THEN
      RAISE EXCEPTION 'Carpool rides are created by the server'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE: the only change the app may make is cancelling an unfinished ride.
  -- Completion goes through the complete-trip edge function.
  IF NEW.status IS DISTINCT FROM OLD.status
     AND (NEW.status IS DISTINCT FROM 'cancelled' OR OLD.status IN ('completed', 'cancelled')) THEN
    RAISE EXCEPTION 'Ride status can only be changed to cancelled from the app'
      USING ERRCODE = '42501';
  END IF;

  -- co2_saved / distance_km are recomputed by enforce_ride_co2 (which fires
  -- first, alphabetically) from immutable inputs, so they are excluded here.
  IF (to_jsonb(NEW) - 'status' - 'updated_at' - 'co2_saved' - 'distance_km')
     IS DISTINCT FROM
     (to_jsonb(OLD) - 'status' - 'updated_at' - 'co2_saved' - 'distance_km') THEN
    RAISE EXCEPTION 'Only a ride''s status can be changed from the app'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$function$;

revoke all on function public.guard_ride_client_writes() from public, anon, authenticated;

drop trigger if exists guard_ride_client_writes_trg on public.rides;
create trigger guard_ride_client_writes_trg
  before insert or update on public.rides
  for each row execute function public.guard_ride_client_writes();

-- baseline_co2 is written by the app (setup/week.tsx, Profile) as the weighted
-- kg/km of the user's usual commute. The catalog tops out at 0.192 (petrol
-- car); 0.3 leaves headroom without letting one client inflate every saving.
alter table public.profiles
  drop constraint if exists profiles_baseline_co2_range;
alter table public.profiles
  add constraint profiles_baseline_co2_range
  check (baseline_co2 is null or (baseline_co2 >= 0 and baseline_co2 <= 0.3));

-- Same function as 035 with the distance sanity cap lowered 1000 km -> 200 km
-- (no commute is longer; beyond it the ride earns no CO2 credit).
create or replace function public.enforce_ride_co2()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
DECLARE
  v_owner       uuid := COALESCE(NEW.rider_id, NEW.driver_id);
  v_baseline    double precision;
  v_mode_factor double precision;
  v_dist        double precision;
BEGIN
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ride must have rider_id or driver_id' USING ERRCODE = '23514';
  END IF;

  IF NEW.origin_lat IS NULL OR NEW.origin_long IS NULL
     OR NEW.dest_lat IS NULL OR NEW.dest_long IS NULL THEN
    v_dist := 0;
  ELSE
    v_dist := 6371 * 2 * asin(sqrt(
        power(sin(radians(NEW.dest_lat - NEW.origin_lat) / 2), 2)
      + cos(radians(NEW.origin_lat)) * cos(radians(NEW.dest_lat))
        * power(sin(radians(NEW.dest_long - NEW.origin_long) / 2), 2)
    ));
  END IF;
  IF v_dist IS NULL OR v_dist > 200 THEN
    v_dist := 0;
  END IF;
  NEW.distance_km := round(v_dist::numeric, 3);

  SELECT COALESCE(baseline_co2, 0.192) INTO v_baseline
  FROM public.profiles WHERE id = v_owner;
  v_baseline := COALESCE(v_baseline, 0.192);

  SELECT co2_per_km INTO v_mode_factor
  FROM public.transport_mode_catalog WHERE id = NEW.transport_mode;
  v_mode_factor := COALESCE(v_mode_factor, v_baseline);

  NEW.co2_saved := round(GREATEST(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);

  RETURN NEW;
END
$function$;
