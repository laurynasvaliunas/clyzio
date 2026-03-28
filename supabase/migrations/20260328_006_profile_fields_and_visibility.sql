-- Migration 006: Add missing profile columns + map visibility flag
-- Date: 2026-03-28

-- ============================================
-- 1. Add missing profile columns referenced in code
-- ============================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS car_model TEXT,
  ADD COLUMN IF NOT EXISTS car_fuel_type TEXT DEFAULT 'gasoline',
  ADD COLUMN IF NOT EXISTS xp_points INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;

-- ============================================
-- 2. RLS: allow other authenticated users to read public profiles
--    (needed for map markers — previously only self-read was allowed)
-- ============================================
DROP POLICY IF EXISTS "Public profiles are visible to authenticated users" ON public.profiles;
CREATE POLICY "Public profiles are visible to authenticated users" ON public.profiles
  FOR SELECT USING (is_public = true OR auth.uid() = id);

-- ============================================
-- 3. RLS on rides: allow other users to see rides from public profiles
--    (map markers query rides from other users)
-- ============================================
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
