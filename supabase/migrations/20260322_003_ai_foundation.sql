-- Migration: AI Features Foundation
-- Date: 2026-03-22
-- Adds commute location data, AI caching, manager role, new tables for AI suggestions,
-- company challenges, and app config. Also extends companies/departments with aggregated stats
-- and adds RPC helper functions used by Supabase Edge Functions.

-- ============================================
-- 1. PROFILES — new commute + AI columns
-- ============================================

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

COMMENT ON COLUMN public.profiles.home_address IS 'Human-readable home address for AI commute suggestions';
COMMENT ON COLUMN public.profiles.work_address IS 'Human-readable work address for AI commute suggestions';
COMMENT ON COLUMN public.profiles.preferred_departure_time IS 'Usual morning departure time for commute suggestions';
COMMENT ON COLUMN public.profiles.preferred_departure_days IS '7-element boolean array, Mon–Sun, for working days';
COMMENT ON COLUMN public.profiles.commuting_habits IS 'JSON array of {modeId, days[7]} objects tracking weekly transport habits';
COMMENT ON COLUMN public.profiles.baseline_co2 IS 'Weighted average CO2 kg/km based on commuting habits';
COMMENT ON COLUMN public.profiles.is_manager IS 'Grants access to the Sustainability Manager Dashboard';
COMMENT ON COLUMN public.profiles.ai_suggestions_cache IS 'Cached response from ai-commute-planner edge function';
COMMENT ON COLUMN public.profiles.ai_cache_updated_at IS 'Timestamp of last AI cache update — used to decide stale cache';

-- ============================================
-- 2. RIDES — new address + transport columns
-- ============================================

ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS origin_address TEXT,
  ADD COLUMN IF NOT EXISTS dest_address TEXT,
  ADD COLUMN IF NOT EXISTS transport_mode TEXT,
  ADD COLUMN IF NOT EXISTS transport_label TEXT,
  ADD COLUMN IF NOT EXISTS distance_km DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ai_matched BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.rides.origin_address IS 'Human-readable origin address';
COMMENT ON COLUMN public.rides.dest_address IS 'Human-readable destination address';
COMMENT ON COLUMN public.rides.transport_mode IS 'Mode ID used for this trip (e.g. car_gas, bus, bike)';
COMMENT ON COLUMN public.rides.distance_km IS 'Haversine distance in km between origin and destination';
COMMENT ON COLUMN public.rides.ai_matched IS 'True if this ride was created via AI carpool matcher';

-- ============================================
-- 3. COMPANIES — add aggregated stats columns
-- ============================================

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS green_commute_score INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.companies
  ADD CONSTRAINT IF NOT EXISTS companies_green_score_range
  CHECK (green_commute_score BETWEEN 0 AND 100);

COMMENT ON COLUMN public.companies.green_commute_score IS '0-100 score representing company commuting sustainability';

-- ============================================
-- 4. DEPARTMENTS — add aggregated stats columns
-- ============================================

ALTER TABLE public.departments
  ADD COLUMN IF NOT EXISTS total_co2_saved DECIMAL(12,3) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS employee_count INTEGER DEFAULT 0;

-- ============================================
-- 5. NEW TABLE: ai_suggestions
-- Logs all Claude AI responses per user for auditing and replay
-- ============================================

CREATE TABLE IF NOT EXISTS public.ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  suggestion_type TEXT NOT NULL CHECK (suggestion_type IN ('commute_plan', 'carpool_match', 'sustainability_insight')),
  input_context JSONB NOT NULL DEFAULT '{}',
  ai_response JSONB NOT NULL DEFAULT '{}',
  tokens_used INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ,
  acted_on_at TIMESTAMPTZ
);

ALTER TABLE public.ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own AI suggestions" ON public.ai_suggestions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own AI suggestions" ON public.ai_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own AI suggestions" ON public.ai_suggestions
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ai_suggestions_user_type
  ON public.ai_suggestions(user_id, suggestion_type);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_created
  ON public.ai_suggestions(created_at DESC);

-- ============================================
-- 6. NEW TABLE: company_challenges
-- Manager-created commuting challenges with rewards
-- ============================================

CREATE TABLE IF NOT EXISTS public.company_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  challenge_type TEXT CHECK (challenge_type IN ('co2_reduction', 'carpool_days', 'green_trips', 'distance')),
  target_value DECIMAL(10,2),
  current_value DECIMAL(10,2) DEFAULT 0,
  reward_xp INTEGER DEFAULT 0,
  starts_at TIMESTAMPTZ DEFAULT NOW(),
  ends_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.company_challenges ENABLE ROW LEVEL SECURITY;

-- Employees can read their company's challenges
CREATE POLICY "Employees can view own company challenges" ON public.company_challenges
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = company_challenges.company_id
    )
  );

-- Only managers can create/update challenges
CREATE POLICY "Managers can create challenges" ON public.company_challenges
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = company_challenges.company_id
        AND profiles.is_manager = true
    )
  );

CREATE POLICY "Managers can update challenges" ON public.company_challenges
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.company_id = company_challenges.company_id
        AND profiles.is_manager = true
    )
  );

CREATE INDEX IF NOT EXISTS idx_company_challenges_company
  ON public.company_challenges(company_id, is_active);

-- ============================================
-- 7. NEW TABLE: app_config
-- Admin-configurable constants for cost calculations
-- ============================================

CREATE TABLE IF NOT EXISTS public.app_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read config
CREATE POLICY "Authenticated users can read app config" ON public.app_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Seed cost calculation constants
INSERT INTO public.app_config (key, value, description) VALUES
  ('fuel_cost_per_liter_eur', '1.80', 'EU average petrol price per litre (EUR)'),
  ('avg_fuel_consumption_per_km', '0.07', 'Average car fuel consumption per km (litres)'),
  ('avg_parking_cost_eur', '8.00', 'Average daily workplace parking cost (EUR)'),
  ('co2_cost_per_kg_eur', '0.05', 'Social cost of carbon per kg CO2 (EUR)'),
  ('working_days_per_month', '22', 'Average working days per month for monthly savings calc'),
  ('tree_co2_absorption_kg', '20.0', 'kg CO2 absorbed by one tree per year (for equivalency display)')
ON CONFLICT (key) DO NOTHING;

-- ============================================
-- 8. RPC: get_user_commute_context
-- Returns all data needed by ai-commute-planner edge function
-- ============================================

CREATE OR REPLACE FUNCTION public.get_user_commute_context(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
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
    'ai_cache_updated_at', p.ai_cache_updated_at,
    'recent_trips', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'transport_mode', r.transport_mode,
        'transport_label', r.transport_label,
        'co2_saved', r.co2_saved,
        'distance_km', r.distance_km,
        'created_at', r.created_at
      ) ORDER BY r.created_at DESC), '[]'::jsonb)
      FROM public.rides r
      WHERE (r.rider_id = p_user_id OR r.driver_id = p_user_id)
        AND r.status = 'completed'
      LIMIT 10
    )
  ) INTO result
  FROM public.profiles p
  WHERE p.id = p_user_id;

  RETURN result;
END;
$$;

COMMENT ON FUNCTION public.get_user_commute_context IS 'Returns full commute profile context for the AI commute planner edge function';

-- ============================================
-- 9. RPC: get_company_stats
-- Returns aggregated company data for the ai-sustainability-report edge function
-- ============================================

CREATE OR REPLACE FUNCTION public.get_company_stats(p_company_id UUID)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
BEGIN
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
$$;

COMMENT ON FUNCTION public.get_company_stats IS 'Returns full company sustainability stats for the AI sustainability report edge function';

-- ============================================
-- 10. RPC: find_carpool_candidates
-- Finds nearby active rides compatible with the user's request
-- ============================================

CREATE OR REPLACE FUNCTION public.find_carpool_candidates(
  p_origin_lat DOUBLE PRECISION,
  p_origin_long DOUBLE PRECISION,
  p_dest_lat DOUBLE PRECISION,
  p_dest_long DOUBLE PRECISION,
  p_departure_time TIMESTAMPTZ DEFAULT NOW(),
  p_role TEXT DEFAULT 'rider',       -- find opposite role
  p_radius_km DOUBLE PRECISION DEFAULT 5.0,
  p_exclude_user_id UUID DEFAULT NULL
)
RETURNS TABLE(
  ride_id UUID,
  user_id UUID,
  first_name TEXT,
  origin_lat DOUBLE PRECISION,
  origin_long DOUBLE PRECISION,
  dest_lat DOUBLE PRECISION,
  dest_long DOUBLE PRECISION,
  distance_to_origin_km DOUBLE PRECISION,
  scheduled_at TIMESTAMPTZ,
  transport_mode TEXT,
  co2_saved DOUBLE PRECISION
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  lat_delta DOUBLE PRECISION;
  long_delta DOUBLE PRECISION;
BEGIN
  -- Approximate degrees for radius (1 degree lat ~ 111 km)
  lat_delta := p_radius_km / 111.0;
  long_delta := p_radius_km / (111.0 * COS(RADIANS(p_origin_lat)));

  RETURN QUERY
  SELECT
    r.id AS ride_id,
    CASE WHEN p_role = 'rider' THEN r.driver_id ELSE r.rider_id END AS user_id,
    COALESCE(p.first_name, SPLIT_PART(p.email, '@', 1)) AS first_name,
    r.origin_lat,
    r.origin_long,
    r.dest_lat,
    r.dest_long,
    -- Haversine approximation (degrees * 111 km)
    SQRT(
      POWER((r.origin_lat - p_origin_lat) * 111.0, 2) +
      POWER((r.origin_long - p_origin_long) * 111.0 * COS(RADIANS(p_origin_lat)), 2)
    ) AS distance_to_origin_km,
    r.scheduled_at,
    r.transport_mode,
    r.co2_saved
  FROM public.rides r
  JOIN public.profiles p ON p.id = CASE WHEN p_role = 'rider' THEN r.driver_id ELSE r.rider_id END
  WHERE
    r.status IN ('scheduled', 'requested')
    AND r.origin_lat BETWEEN (p_origin_lat - lat_delta) AND (p_origin_lat + lat_delta)
    AND r.origin_long BETWEEN (p_origin_long - long_delta) AND (p_origin_long + long_delta)
    AND (p_exclude_user_id IS NULL OR (r.rider_id != p_exclude_user_id AND r.driver_id != p_exclude_user_id))
    -- Only show rides departing within 2 hours of requested time
    AND (r.scheduled_at IS NULL OR ABS(EXTRACT(EPOCH FROM (r.scheduled_at - p_departure_time))) < 7200)
  ORDER BY distance_to_origin_km ASC
  LIMIT 5;
END;
$$;

COMMENT ON FUNCTION public.find_carpool_candidates IS 'Finds nearby scheduled rides for AI carpool matching within radius km';

-- ============================================
-- 11. TRIGGER: update_company_green_score
-- Recalculates company Green Commute Score when a ride is completed
-- ============================================

CREATE OR REPLACE FUNCTION public.update_company_green_score()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id UUID;
  v_total_co2 DECIMAL;
  v_total_trips INTEGER;
  v_green_trips INTEGER;
  v_carpool_trips INTEGER;
  v_employee_count INTEGER;
  new_score INTEGER;
BEGIN
  -- Only fire on status change TO 'completed'
  IF NEW.status != 'completed' OR OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- Find the company via the rider
  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = COALESCE(NEW.rider_id, NEW.driver_id)
  LIMIT 1;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Aggregate metrics for the company
  SELECT
    COALESCE(SUM(p.total_co2_saved), 0),
    COALESCE(SUM(p.trips_completed), 0),
    COUNT(DISTINCT p.id)
  INTO v_total_co2, v_total_trips, v_employee_count
  FROM public.profiles p
  WHERE p.company_id = v_company_id;

  SELECT COUNT(*) INTO v_green_trips
  FROM public.rides r
  JOIN public.profiles p ON (r.rider_id = p.id OR r.driver_id = p.id)
  WHERE p.company_id = v_company_id
    AND r.status = 'completed'
    AND r.transport_mode NOT IN ('car_gas', 'car_diesel', 'Car (Gasoline)');

  SELECT COUNT(*) INTO v_carpool_trips
  FROM public.rides r
  JOIN public.profiles p ON (r.rider_id = p.id OR r.driver_id = p.id)
  WHERE p.company_id = v_company_id
    AND r.status = 'completed'
    AND r.driver_id IS NOT NULL
    AND r.rider_id IS NOT NULL;

  -- Score formula (0-100):
  -- 40% green trip ratio, 30% avg CO2 saved per employee, 30% carpool ratio
  new_score := LEAST(100, GREATEST(0, ROUND(
    0.40 * CASE WHEN v_total_trips > 0 THEN (v_green_trips::DECIMAL / v_total_trips) * 100 ELSE 0 END +
    0.30 * LEAST(100, CASE WHEN v_employee_count > 0 THEN (v_total_co2 / v_employee_count) * 5 ELSE 0 END) +
    0.30 * CASE WHEN v_total_trips > 0 THEN (v_carpool_trips::DECIMAL / v_total_trips) * 100 ELSE 0 END
  )));

  UPDATE public.companies
  SET
    green_commute_score = new_score,
    total_co2_saved = v_total_co2,
    employee_count = v_employee_count,
    updated_at = NOW()
  WHERE id = v_company_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS update_green_score_on_ride_complete ON public.rides;
CREATE TRIGGER update_green_score_on_ride_complete
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.update_company_green_score();

COMMENT ON FUNCTION public.update_company_green_score IS 'Auto-updates company Green Commute Score when a ride is completed';

-- ============================================
-- 12. Indexes for performance
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_company_manager
  ON public.profiles(company_id, is_manager) WHERE is_manager = true;

CREATE INDEX IF NOT EXISTS idx_profiles_home_location
  ON public.profiles(home_lat, home_long) WHERE home_lat IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rides_transport_mode
  ON public.rides(transport_mode);

CREATE INDEX IF NOT EXISTS idx_rides_scheduled_location
  ON public.rides(origin_lat, origin_long, status)
  WHERE status IN ('scheduled', 'requested');
