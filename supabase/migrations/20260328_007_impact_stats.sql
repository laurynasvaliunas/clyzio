-- Migration 007: Impact statistics foundation
-- Date: 2026-03-28
-- Adds missing profile columns referenced in app code, completed_at on rides,
-- and all RPC functions needed by the impact/stats screen.

-- ============================================
-- 1. PROFILES — missing gamification & personal columns
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trips_completed  INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badges           TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS car_make         TEXT,
  ADD COLUMN IF NOT EXISTS car_color        TEXT,
  ADD COLUMN IF NOT EXISTS car_plate        TEXT,
  ADD COLUMN IF NOT EXISTS phone            TEXT;

COMMENT ON COLUMN public.profiles.total_co2_saved IS 'Lifetime CO2 saved in kg — incremented on every trip completion';
COMMENT ON COLUMN public.profiles.trips_completed  IS 'Total number of completed trips — incremented on every trip completion';
COMMENT ON COLUMN public.profiles.badges           IS 'Array of unlocked badge IDs (e.g. first_trip, walker_5, co2_50)';
COMMENT ON COLUMN public.profiles.car_make         IS 'Vehicle make (e.g. Toyota, BMW)';
COMMENT ON COLUMN public.profiles.car_color        IS 'Vehicle color — shown to carpool partners';
COMMENT ON COLUMN public.profiles.car_plate        IS 'Vehicle license plate — shown to carpool partners';
COMMENT ON COLUMN public.profiles.phone            IS 'User phone number — shown to carpool partners on accepted rides';

-- Backfill existing users from their completed rides
-- (safe to run multiple times; 0 + 0 = 0 for users with no rides)
UPDATE public.profiles p
SET
  total_co2_saved = COALESCE((
    SELECT SUM(r.co2_saved)
    FROM public.rides r
    WHERE (r.rider_id = p.id OR r.driver_id = p.id)
      AND r.status = 'completed'
  ), 0),
  trips_completed = COALESCE((
    SELECT COUNT(*)
    FROM public.rides r
    WHERE (r.rider_id = p.id OR r.driver_id = p.id)
      AND r.status = 'completed'
  ), 0)
WHERE total_co2_saved = 0 AND trips_completed = 0;

-- ============================================
-- 2. RIDES — add completed_at timestamp
-- ============================================

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.rides.completed_at IS 'Timestamp when the ride was marked as completed — used for weekly CO2 calculations';

-- Backfill existing completed rides (use updated_at as proxy)
UPDATE public.rides
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rides_completed_at
  ON public.rides(completed_at)
  WHERE status = 'completed';

-- ============================================
-- 3. RPC: get_user_impact
-- Returns total and weekly CO2 stats for the personal impact view
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_impact(user_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result      JSONB;
  week_start  TIMESTAMPTZ := DATE_TRUNC('week', NOW());
BEGIN
  SELECT jsonb_build_object(
    'total_co2_saved', COALESCE(p.total_co2_saved, 0),
    'total_trips',     COALESCE(p.trips_completed, 0),
    'this_week_co2', COALESCE((
      SELECT SUM(r.co2_saved)
      FROM public.rides r
      WHERE (r.rider_id = user_uuid OR r.driver_id = user_uuid)
        AND r.status = 'completed'
        AND r.completed_at >= week_start
    ), 0),
    'last_week_co2', COALESCE((
      SELECT SUM(r.co2_saved)
      FROM public.rides r
      WHERE (r.rider_id = user_uuid OR r.driver_id = user_uuid)
        AND r.status = 'completed'
        AND r.completed_at >= (week_start - INTERVAL '7 days')
        AND r.completed_at < week_start
    ), 0)
  ) INTO result
  FROM public.profiles p
  WHERE p.id = user_uuid;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

COMMENT ON FUNCTION public.get_user_impact IS 'Returns total and weekly CO2 impact stats for the personal impact/stats screen';

-- ============================================
-- 4. RPC: get_company_leaderboard
-- Returns ranked list of employees in the same company by total CO2 saved
-- ============================================

CREATE OR REPLACE FUNCTION public.get_company_leaderboard(user_uuid UUID)
RETURNS TABLE(
  id              UUID,
  name            TEXT,
  department      TEXT,
  total_saved     DECIMAL,
  is_current_user BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = user_uuid;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      SPLIT_PART(p.email, '@', 1)
    )::TEXT AS name,
    COALESCE(p.department, '')::TEXT AS department,
    COALESCE(p.total_co2_saved, 0)::DECIMAL AS total_saved,
    (p.id = user_uuid) AS is_current_user
  FROM public.profiles p
  WHERE p.company_id = v_company_id
  ORDER BY p.total_co2_saved DESC NULLS LAST
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION public.get_company_leaderboard IS 'Returns company-wide leaderboard ranked by total CO2 saved';

-- ============================================
-- 5. RPC: get_department_leaderboard
-- Returns ranked list of users in the same department
-- ============================================

CREATE OR REPLACE FUNCTION public.get_department_leaderboard(user_uuid UUID)
RETURNS TABLE(
  user_id        UUID,
  user_name      TEXT,
  total_co2_saved DECIMAL,
  total_trips    INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_department_id UUID;
BEGIN
  SELECT department_id INTO v_department_id
  FROM public.profiles
  WHERE id = user_uuid;

  IF v_department_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    COALESCE(
      NULLIF(TRIM(COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')), ''),
      SPLIT_PART(p.email, '@', 1)
    )::TEXT AS user_name,
    COALESCE(p.total_co2_saved, 0)::DECIMAL AS total_co2_saved,
    COALESCE(p.trips_completed, 0)::INTEGER AS total_trips
  FROM public.profiles p
  WHERE p.department_id = v_department_id
  ORDER BY p.total_co2_saved DESC NULLS LAST
  LIMIT 20;
END;
$$;

COMMENT ON FUNCTION public.get_department_leaderboard IS 'Returns department leaderboard ranked by total CO2 saved';

-- ============================================
-- 6. RPC: get_company_breakdown
-- Returns per-department CO2 totals for the company view bar chart
-- ============================================

CREATE OR REPLACE FUNCTION public.get_company_breakdown(user_uuid UUID)
RETURNS TABLE(
  department_id   UUID,
  department_name TEXT,
  total_co2_saved DECIMAL,
  employee_count  BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = user_uuid;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    d.id AS department_id,
    d.name::TEXT AS department_name,
    COALESCE(SUM(p.total_co2_saved), 0)::DECIMAL AS total_co2_saved,
    COUNT(DISTINCT p.id) AS employee_count
  FROM public.departments d
  LEFT JOIN public.profiles p ON p.department_id = d.id
  WHERE d.company_id = v_company_id
  GROUP BY d.id, d.name
  ORDER BY total_co2_saved DESC;
END;
$$;

COMMENT ON FUNCTION public.get_company_breakdown IS 'Returns CO2 impact breakdown by department for the company stats view';

-- ============================================
-- 7. RPC: get_company_totals
-- Returns aggregate company stats (used in the company header card)
-- ============================================

CREATE OR REPLACE FUNCTION public.get_company_totals(user_uuid UUID)
RETURNS TABLE(
  company_name    TEXT,
  total_co2_saved DECIMAL,
  total_trips     BIGINT,
  employee_count  BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_company_id UUID;
BEGIN
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = user_uuid;

  IF v_company_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    c.name::TEXT AS company_name,
    COALESCE(SUM(p.total_co2_saved), 0)::DECIMAL AS total_co2_saved,
    COALESCE(SUM(p.trips_completed), 0)::BIGINT AS total_trips,
    COUNT(DISTINCT p.id) AS employee_count
  FROM public.companies c
  LEFT JOIN public.profiles p ON p.company_id = c.id
  WHERE c.id = v_company_id
  GROUP BY c.id, c.name;
END;
$$;

COMMENT ON FUNCTION public.get_company_totals IS 'Returns aggregate company sustainability stats for the company impact view';

-- ============================================
-- 8. Performance indexes
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_total_co2
  ON public.profiles(total_co2_saved DESC NULLS LAST)
  WHERE total_co2_saved > 0;

CREATE INDEX IF NOT EXISTS idx_profiles_company_co2
  ON public.profiles(company_id, total_co2_saved DESC NULLS LAST)
  WHERE company_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_dept_co2
  ON public.profiles(department_id, total_co2_saved DESC NULLS LAST)
  WHERE department_id IS NOT NULL;
