-- Instant matching guard: a driver intent + passenger intent pair must produce
-- at most one trip_intent_matches row, even under concurrent submits that each
-- fire the targeted matcher. The matcher uses upsert + ignoreDuplicates
-- (ON CONFLICT DO NOTHING) against this unique index.

CREATE UNIQUE INDEX IF NOT EXISTS trip_intent_matches_pair_uniq
  ON public.trip_intent_matches (driver_intent_id, passenger_intent_id);
