-- Same-company default + admin-controlled cross-org carpool visibility.
--
-- Canonical predicate (single source of truth — public.is_peer_visible):
--   same-company colleagues always see each other; otherwise both users
--   must have is_public=true AND both must be "opted in" — a user is
--   opted in iff they are solo (company_id IS NULL) OR their company has
--   companies.allow_cross_org_visibility = true.

BEGIN;

-- 1. Company-level admin toggle.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS allow_cross_org_visibility BOOLEAN NOT NULL DEFAULT false;

-- 2. RLS so authenticated users can read company settings + only managers of
--    their own company can flip the flag. (Companies had no UPDATE policy.)
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read companies" ON public.companies;
CREATE POLICY "Authenticated users can read companies" ON public.companies
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Managers can update own company" ON public.companies;
CREATE POLICY "Managers can update own company" ON public.companies
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.company_id = companies.id
        AND p.is_manager = true
    )
  );

-- 3. The canonical visibility predicate. SECURITY DEFINER so RLS doesn't
--    block its internal lookups when called from a non-superuser session.
CREATE OR REPLACE FUNCTION public.is_peer_visible(p_caller UUID, p_target UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_company UUID;
  v_caller_public  BOOLEAN;
  v_target_company UUID;
  v_target_public  BOOLEAN;
  v_caller_opt_in  BOOLEAN;
  v_target_opt_in  BOOLEAN;
BEGIN
  IF p_caller IS NULL OR p_target IS NULL THEN
    RETURN false;
  END IF;
  IF p_caller = p_target THEN
    RETURN true;
  END IF;

  SELECT company_id, COALESCE(is_public, false)
    INTO v_caller_company, v_caller_public
    FROM public.profiles WHERE id = p_caller;

  SELECT company_id, COALESCE(is_public, false)
    INTO v_target_company, v_target_public
    FROM public.profiles WHERE id = p_target;

  -- Same company (and both have a company): always visible.
  IF v_caller_company IS NOT NULL
     AND v_caller_company = v_target_company THEN
    RETURN true;
  END IF;

  -- Cross-org path: both must be opt-in AND both is_public.
  IF NOT (v_caller_public AND v_target_public) THEN
    RETURN false;
  END IF;

  v_caller_opt_in := v_caller_company IS NULL OR EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = v_caller_company AND c.allow_cross_org_visibility = true
  );
  v_target_opt_in := v_target_company IS NULL OR EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = v_target_company AND c.allow_cross_org_visibility = true
  );

  RETURN v_caller_opt_in AND v_target_opt_in;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_peer_visible(UUID, UUID) TO authenticated;

-- 4. Convenience: list of peer profile ids visible to the calling user.
--    Used by the home map's "nearby commuters" client query.
CREATE OR REPLACE FUNCTION public.get_visible_peer_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id
  FROM public.profiles p
  WHERE p.id <> auth.uid()
    AND public.is_peer_visible(auth.uid(), p.id);
$$;

GRANT EXECUTE ON FUNCTION public.get_visible_peer_ids() TO authenticated;

-- 5. Replace find_carpool_candidates to apply the visibility predicate.
--    Adds p_caller_id with a sensible default (auth.uid()) so existing
--    invocations remain valid (PostgREST supplies named args).
DROP FUNCTION IF EXISTS public.find_carpool_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TIMESTAMPTZ, TEXT, DOUBLE PRECISION, UUID
);

CREATE OR REPLACE FUNCTION public.find_carpool_candidates(
  p_origin_lat DOUBLE PRECISION,
  p_origin_long DOUBLE PRECISION,
  p_dest_lat DOUBLE PRECISION,
  p_dest_long DOUBLE PRECISION,
  p_departure_time TIMESTAMPTZ DEFAULT NOW(),
  p_role TEXT DEFAULT 'rider',           -- find the opposite role
  p_radius_km DOUBLE PRECISION DEFAULT 5.0,
  p_exclude_user_id UUID DEFAULT NULL,
  p_caller_id UUID DEFAULT NULL          -- visibility filter; defaults to auth.uid()
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  lat_delta  DOUBLE PRECISION;
  long_delta DOUBLE PRECISION;
  v_caller   UUID := COALESCE(p_caller_id, auth.uid());
BEGIN
  lat_delta  := p_radius_km / 111.0;
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
    SQRT(
      POWER((r.origin_lat - p_origin_lat) * 111.0, 2) +
      POWER((r.origin_long - p_origin_long) * 111.0 * COS(RADIANS(p_origin_lat)), 2)
    ) AS distance_to_origin_km,
    r.scheduled_at,
    r.transport_mode,
    r.co2_saved
  FROM public.rides r
  JOIN public.profiles p
    ON p.id = CASE WHEN p_role = 'rider' THEN r.driver_id ELSE r.rider_id END
  WHERE
    r.status IN ('scheduled', 'requested')
    AND r.origin_lat  BETWEEN (p_origin_lat  - lat_delta)  AND (p_origin_lat  + lat_delta)
    AND r.origin_long BETWEEN (p_origin_long - long_delta) AND (p_origin_long + long_delta)
    AND (p_exclude_user_id IS NULL OR (r.rider_id IS DISTINCT FROM p_exclude_user_id
                                   AND r.driver_id IS DISTINCT FROM p_exclude_user_id))
    AND (r.scheduled_at IS NULL
         OR ABS(EXTRACT(EPOCH FROM (r.scheduled_at - p_departure_time))) < 7200)
    -- Visibility predicate: caller must be allowed to see the other party.
    AND (v_caller IS NULL OR public.is_peer_visible(
          v_caller,
          CASE WHEN p_role = 'rider' THEN r.driver_id ELSE r.rider_id END
        ))
  ORDER BY distance_to_origin_km ASC
  LIMIT 5;
END;
$$;

GRANT EXECUTE ON FUNCTION public.find_carpool_candidates(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION,
  TIMESTAMPTZ, TEXT, DOUBLE PRECISION, UUID, UUID
) TO authenticated;

-- 6. Tighten the rides "view scheduled rides" RLS so an unscrupulous client
--    can't bypass the client-side filter. Mirrors the predicate above.
DROP POLICY IF EXISTS "Authenticated users can view scheduled rides" ON public.rides;
CREATE POLICY "Authenticated users can view scheduled rides" ON public.rides
  FOR SELECT TO authenticated USING (
    status IN ('scheduled', 'requested', 'active')
    AND (
      auth.uid() = rider_id
      OR auth.uid() = driver_id
      OR public.is_peer_visible(auth.uid(), rider_id)
      OR public.is_peer_visible(auth.uid(), driver_id)
    )
  );

COMMIT;
