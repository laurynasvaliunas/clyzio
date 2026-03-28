-- Migration: Missing columns catch-up
-- Date: 2026-03-28
-- Safely adds all columns that may not exist yet due to migrations
-- not being applied. Run this once in the Supabase SQL editor at:
-- https://supabase.com/dashboard/project/qvevbbqcrizfywqexlkw/sql/new

-- ============================================================
-- 1. PROFILES — AI caching columns (from migration 003)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS home_address TEXT,
  ADD COLUMN IF NOT EXISTS home_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS home_long DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_address TEXT,
  ADD COLUMN IF NOT EXISTS work_lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS work_long DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS preferred_departure_time TIME DEFAULT '08:00',
  ADD COLUMN IF NOT EXISTS preferred_departure_days BOOLEAN[] DEFAULT '{true,true,true,true,true,false,false}',
  ADD COLUMN IF NOT EXISTS commuting_habits JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS baseline_co2 DECIMAL(10,4) DEFAULT 0.192,
  ADD COLUMN IF NOT EXISTS is_manager BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_suggestions_cache JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_cache_updated_at TIMESTAMPTZ DEFAULT NULL;

-- ============================================================
-- 2. PROFILES — User identity & car columns (from migration 006)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS car_model TEXT,
  ADD COLUMN IF NOT EXISTS car_fuel_type TEXT DEFAULT 'gasoline',
  ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- ============================================================
-- 3. PROFILES — Impact stats columns (from migration 007)
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(12,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trips_completed INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS badges TEXT[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS car_make TEXT,
  ADD COLUMN IF NOT EXISTS car_color TEXT,
  ADD COLUMN IF NOT EXISTS car_plate TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;

-- ============================================================
-- 4. RLS policies (from migration 006)
-- ============================================================
DROP POLICY IF EXISTS "Public profiles are visible to authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are visible to authenticated users" ON public.profiles
  FOR SELECT USING (is_public = true OR auth.uid() = id);

DROP POLICY IF EXISTS "Users can view their own rides" ON public.rides;
DROP POLICY IF EXISTS "Authenticated users can view scheduled rides" ON public.rides;

CREATE POLICY "Users can view their own rides" ON public.rides
  FOR SELECT USING (auth.uid() = rider_id OR auth.uid() = driver_id);

CREATE POLICY "Authenticated users can view scheduled rides" ON public.rides
  FOR SELECT USING (
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

-- ============================================================
-- 5. RIDES — Address + transport columns (from migration 003)
-- ============================================================
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS origin_address TEXT,
  ADD COLUMN IF NOT EXISTS dest_address TEXT,
  ADD COLUMN IF NOT EXISTS transport_mode TEXT,
  ADD COLUMN IF NOT EXISTS transport_label TEXT,
  ADD COLUMN IF NOT EXISTS co2_saved DECIMAL(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS waypoints TEXT,
  ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- ============================================================
-- 6. BACKFILL — total_co2_saved and trips_completed from rides
-- ============================================================
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
WHERE p.total_co2_saved = 0 AND p.trips_completed = 0;

-- ============================================================
-- 7. BACKFILL — completed_at for rides that lack it
-- ============================================================
UPDATE public.rides
SET completed_at = updated_at
WHERE status = 'completed' AND completed_at IS NULL;

-- ============================================================
-- 8. RPC — get_user_commute_context (required by ai-commute-planner edge function)
-- ============================================================
DROP FUNCTION IF EXISTS get_user_commute_context(UUID);
CREATE OR REPLACE FUNCTION public.get_user_commute_context(p_user_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'home_address', p.home_address, 'home_lat', p.home_lat, 'home_long', p.home_long,
    'work_address', p.work_address, 'work_lat', p.work_lat, 'work_long', p.work_long,
    'preferred_departure_time', p.preferred_departure_time,
    'preferred_departure_days', p.preferred_departure_days,
    'baseline_co2_mode', p.baseline_co2_mode, 'baseline_co2', p.baseline_co2,
    'total_co2_saved', p.total_co2_saved, 'trips_completed', p.trips_completed,
    'is_driver', p.is_driver, 'car_make', p.car_make, 'car_model', p.car_model,
    'first_name', p.first_name, 'ai_cache_updated_at', p.ai_cache_updated_at,
    'recent_trips', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'transport_mode', r.transport_mode, 'transport_label', r.transport_label,
        'co2_saved', r.co2_saved, 'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.rides r
      WHERE (r.rider_id = p_user_id OR r.driver_id = p_user_id) AND r.status = 'completed'
      LIMIT 10
    )
  ) INTO result FROM public.profiles p WHERE p.id = p_user_id;
  RETURN result;
END;
$$;

-- ============================================================
-- 9. RPC — get_user_impact
-- ============================================================
DROP FUNCTION IF EXISTS get_user_impact(UUID);
CREATE OR REPLACE FUNCTION get_user_impact(user_uuid UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  result JSONB;
  week_start TIMESTAMPTZ := date_trunc('week', now());
  last_week_start TIMESTAMPTZ := date_trunc('week', now()) - INTERVAL '1 week';
BEGIN
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
$$;

-- ============================================================
-- 9. RPC — get_company_leaderboard
-- ============================================================
DROP FUNCTION IF EXISTS get_company_leaderboard(UUID);
CREATE OR REPLACE FUNCTION get_company_leaderboard(user_uuid UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  department TEXT,
  total_saved DECIMAL,
  is_current_user BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE profiles.id = user_uuid;
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
$$;

-- ============================================================
-- 10. RPC — get_department_leaderboard
-- ============================================================
DROP FUNCTION IF EXISTS get_department_leaderboard(UUID);
CREATE OR REPLACE FUNCTION get_department_leaderboard(user_uuid UUID)
RETURNS TABLE(
  user_id UUID,
  user_name TEXT,
  total_co2_saved DECIMAL,
  total_trips BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  user_dept TEXT;
  user_company UUID;
BEGIN
  SELECT department, company_id INTO user_dept, user_company
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
$$;

-- ============================================================
-- 11. RPC — get_company_breakdown
-- ============================================================
DROP FUNCTION IF EXISTS get_company_breakdown(UUID);
CREATE OR REPLACE FUNCTION get_company_breakdown(user_uuid UUID)
RETURNS TABLE(
  department_id TEXT,
  department_name TEXT,
  total_co2_saved DECIMAL,
  employee_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE profiles.id = user_uuid;
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
$$;

-- ============================================================
-- 12. RPC — get_company_totals
-- ============================================================
DROP FUNCTION IF EXISTS get_company_totals(UUID);
CREATE OR REPLACE FUNCTION get_company_totals(user_uuid UUID)
RETURNS TABLE(
  company_name TEXT,
  total_co2_saved DECIMAL,
  total_trips BIGINT,
  employee_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  company UUID;
BEGIN
  SELECT company_id INTO company FROM public.profiles WHERE profiles.id = user_uuid;
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
$$;

-- ============================================================
-- 13. Performance indexes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_rides_completed_at ON public.rides(completed_at);
CREATE INDEX IF NOT EXISTS idx_profiles_company_co2 ON public.profiles(company_id, total_co2_saved DESC);
CREATE INDEX IF NOT EXISTS idx_profiles_company_dept ON public.profiles(company_id, department);
