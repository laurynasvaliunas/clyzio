-- 036 — Per-participant trip-completion ledger (audit H1).
--
-- complete-trip previously guarded double-credit via the ride's *status*
-- (`if status='completed' AND end_trip → zeros`). That was wrong for carpools:
--   • passengers call complete-trip with end_trip=false, which skipped the guard
--     entirely → a passenger could tap "complete" repeatedly and farm XP/CO₂;
--   • when status-based, the 2nd participant was blocked from any credit.
-- This ledger makes crediting exactly-once PER (ride, user): complete-trip
-- claims a row before crediting, so each of the driver and rider gets their
-- credit once, in any order, and retries/double-taps are no-ops.
--
-- Server-only: RLS on + explicit deny-all so no client can read/write it;
-- the complete-trip edge function uses the service-role key (bypasses RLS).

BEGIN;

CREATE TABLE IF NOT EXISTS public.ride_completions (
  ride_id    uuid        NOT NULL REFERENCES public.rides(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, user_id)
);

ALTER TABLE public.ride_completions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "no client access to ride_completions" ON public.ride_completions;
CREATE POLICY "no client access to ride_completions"
  ON public.ride_completions FOR ALL
  USING (false) WITH CHECK (false);

COMMIT;
