-- Migration 021: Symmetric mutual approval for carpool matches.
-- Date: 2026-05-27
--
-- Background:
--   trip_intent_matches used a driver-first status chain
--   (pending_driver_review → driver_accepted → confirmed). The product now
--   requires SYMMETRIC approval: when matched, both driver and passenger get a
--   request and either can approve first; the trip is confirmed only when BOTH
--   have approved (order-independent). This also lets the Map radar funnel into
--   the same table with the initiator pre-approved.
--
-- Changes:
--   1. Per-side approval flags (driver_approved / passenger_approved).
--   2. New status set: pending → awaiting_other → confirmed (+ cancellations).
--   3. RLS: each participant may update their own row while not yet terminal.
--      (Edge functions use the service role; this is defense-in-depth.)
--
-- Pre-launch: redefining the status set + backfilling stray rows is safe.
-- Idempotent: ADD COLUMN IF NOT EXISTS, DROP CONSTRAINT/POLICY IF EXISTS.

BEGIN;

-- 1) Per-side approval flags.
ALTER TABLE public.trip_intent_matches
  ADD COLUMN IF NOT EXISTS driver_approved    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS passenger_approved BOOLEAN NOT NULL DEFAULT false;

-- 2) Migrate any existing rows onto the new status vocabulary BEFORE swapping
--    the CHECK constraint (so the constraint add doesn't fail on legacy values).
--    Map the old chain to the new flags + status.
UPDATE public.trip_intent_matches SET
  driver_approved = (status IN ('driver_accepted','confirmed')),
  passenger_approved = (status = 'confirmed')
WHERE status IN ('pending_driver_review','driver_accepted','pending_passenger_confirm','confirmed');

UPDATE public.trip_intent_matches SET status = CASE
  WHEN status = 'confirmed' THEN 'confirmed'
  WHEN status = 'cancelled_by_driver' THEN 'cancelled_by_driver'
  WHEN status = 'cancelled_by_passenger' THEN 'cancelled_by_passenger'
  WHEN status = 'expired' THEN 'expired'
  WHEN status = 'driver_accepted' THEN 'awaiting_other'   -- driver approved, waiting on passenger
  ELSE 'pending'                                           -- pending_driver_review / pending_passenger_confirm
END
WHERE status IN ('pending_driver_review','driver_accepted','pending_passenger_confirm','confirmed','cancelled_by_driver','cancelled_by_passenger','expired');

-- 3) Swap the CHECK constraint to the symmetric set.
ALTER TABLE public.trip_intent_matches
  DROP CONSTRAINT IF EXISTS trip_intent_matches_status_check;
ALTER TABLE public.trip_intent_matches
  ADD CONSTRAINT trip_intent_matches_status_check CHECK (status IN (
    'pending',          -- neither side approved yet
    'awaiting_other',   -- exactly one side approved
    'confirmed',        -- both approved → ride created
    'cancelled_by_driver',
    'cancelled_by_passenger',
    'expired'
  ));

ALTER TABLE public.trip_intent_matches
  ALTER COLUMN status SET DEFAULT 'pending';

-- 4) RLS: replace the old driver-first / passenger-second policies with a
--    symmetric one — either participant may update their row while it is still
--    open (pending / awaiting_other).
DROP POLICY IF EXISTS "driver updates pending match"   ON public.trip_intent_matches;
DROP POLICY IF EXISTS "passenger updates accepted match" ON public.trip_intent_matches;
DROP POLICY IF EXISTS "participants update open match"  ON public.trip_intent_matches;
CREATE POLICY "participants update open match" ON public.trip_intent_matches
  FOR UPDATE
  USING (
    (driver_user_id = auth.uid() OR passenger_user_id = auth.uid())
    AND status IN ('pending', 'awaiting_other')
  );

COMMIT;
