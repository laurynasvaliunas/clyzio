-- 042 — get_company_stats has never worked.
--
-- Found while exploit-testing 041 (as service_role): every call fails with
--   ERROR: aggregate function calls cannot be nested
-- because the dept_breakdown block wraps COUNT()/SUM() inside jsonb_agg() in
-- the same query level. Postgres rejects that at plan time, so the function
-- errored for every caller since 003 — the manager dashboard
-- (store/useManagerStore.ts) and ai-sustainability-report both depend on it.
--
-- Fix: aggregate per department in a subquery, then jsonb_agg the rows.
-- The 041 authorization gate is unchanged.

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
        'dept_id', s.id,
        'dept_name', s.name,
        'employee_count', s.employee_count,
        'co2_saved', s.co2_saved,
        'trips_completed', s.trips_completed
      ) ORDER BY s.co2_saved DESC), '[]'::jsonb)
      FROM (
        SELECT
          d.id,
          d.name,
          COUNT(DISTINCT p5.id) AS employee_count,
          COALESCE(SUM(p5.total_co2_saved), 0) AS co2_saved,
          COALESCE(SUM(p5.trips_completed), 0) AS trips_completed
        FROM public.departments d
        LEFT JOIN public.profiles p5 ON p5.department_id = d.id
        WHERE d.company_id = p_company_id
        GROUP BY d.id, d.name
      ) s
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
