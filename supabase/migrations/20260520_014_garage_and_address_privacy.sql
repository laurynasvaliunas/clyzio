-- "My Garage" (multi-vehicle) + passenger pickup-address privacy.
--
-- The legacy single-car flat columns (car_make/model/color/plate,
-- car_fuel_type, baseline_co2) are KEPT and stay synced from the primary
-- vehicle by the client save logic, so TripPlanner / useTripStore /
-- ai-planner / the ai-commute-planner edge function need no changes.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vehicles JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS primary_vehicle_id TEXT,
  ADD COLUMN IF NOT EXISTS share_pickup_address BOOLEAN NOT NULL DEFAULT true;

-- Per-ride resolved consent (set at trip creation from the rider's choice /
-- profile default). NULL on legacy rows = treated as "shared" (default true).
ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS share_origin_address BOOLEAN;

-- Backfill: seed one car into the garage from existing flat columns for
-- users who have a car and an empty garage. Idempotent.
UPDATE public.profiles p
SET
  vehicles = jsonb_build_array(
    jsonb_build_object(
      'id',        'v_legacy_' || p.id,
      'type',      'car',
      'make',      COALESCE(p.car_make, ''),
      'model',     COALESCE(p.car_model, ''),
      'color',     COALESCE(p.car_color, ''),
      'plate',     COALESCE(p.car_plate, ''),
      'fuel_type', COALESCE(p.car_fuel_type, 'petrol')
    )
  ),
  primary_vehicle_id = 'v_legacy_' || p.id
WHERE p.vehicles = '[]'::jsonb
  AND (
    COALESCE(p.car_make, '')  <> '' OR
    COALESCE(p.car_model, '') <> ''
  );

COMMIT;
