-- 035 — Make ride emissions server-authoritative (audit C1 + H1).
--
-- Problem: `rides.co2_saved` (and `distance_km`) were written by the CLIENT
-- (components/TripPlannerModal.tsx) and then TRUSTED by complete-trip
-- (co2_saved credited straight into profiles.total_co2_saved) and by the
-- company green-score trigger. The rides RLS only checks ownership, so any
-- authenticated user could PATCH their own ride's co2_saved to an arbitrary
-- value and inflate personal stats, leaderboards, and the company's ESG
-- (Scope-3) numbers. Additionally, carpool rides created by respond-to-match
-- had NO co2_saved at all, so carpoolers earned zero credit (H1).
--
-- Fix: a BEFORE INSERT/UPDATE trigger that RECOMPUTES distance_km and co2_saved
-- from the ride's coordinates + transport_mode + the ride owner's fuel baseline,
-- reproducing the exact client formula
--   co2_saved = max(0, distance_km * (baseline_co2 - mode_factor))
-- using the canonical `transport_mode_catalog` factors (migration 027). Unlike
-- the profile-column guard (018), this runs for EVERYONE — including service_role
-- — so the number is always derived, never client-authored, and carpool rides
-- (inserted by the respond-to-match edge fn) get a correct co2_saved for free.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_ride_co2()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_owner       uuid := COALESCE(NEW.rider_id, NEW.driver_id);
  v_baseline    double precision;
  v_mode_factor double precision;
  v_dist        double precision;
BEGIN
  -- Server-authoritative straight-line distance (km) from the ride coordinates,
  -- mirroring the client's Haversine. Missing/degenerate coords → 0.
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
  -- Sanity cap: a single commute leg over 1000 km is a data error (e.g. an
  -- unset (0,0) endpoint) — treat as 0 rather than mint huge phantom savings.
  IF v_dist IS NULL OR v_dist > 1000 THEN
    v_dist := 0;
  END IF;
  NEW.distance_km := round(v_dist::numeric, 3);

  -- Owner's per-km baseline (their car fuel type); default petrol 0.192.
  SELECT COALESCE(baseline_co2, 0.192) INTO v_baseline
  FROM public.profiles WHERE id = v_owner;
  v_baseline := COALESCE(v_baseline, 0.192);

  -- Chosen mode's factor from the canonical catalog. Unknown/missing mode →
  -- fall back to the baseline so savings compute to 0 (never inflate).
  SELECT co2_per_km INTO v_mode_factor
  FROM public.transport_mode_catalog WHERE id = NEW.transport_mode;
  v_mode_factor := COALESCE(v_mode_factor, v_baseline);

  NEW.co2_saved := round(GREATEST(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.enforce_ride_co2() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_ride_co2_trg ON public.rides;
CREATE TRIGGER enforce_ride_co2_trg
  BEFORE INSERT OR UPDATE ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ride_co2();

COMMENT ON TRIGGER enforce_ride_co2_trg ON public.rides IS
  'Audit C1/H1: recomputes distance_km + co2_saved server-side from coords + transport_mode + owner baseline (transport_mode_catalog). co2_saved is never client-authored; carpool rides get correct savings.';

COMMIT;
