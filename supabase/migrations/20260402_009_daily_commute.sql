-- Daily Commute Planning Flow
-- Adds push token storage, trip intents, intent matches, and cron idempotency

-- Push token (needed by server cron to deliver notifications)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- Trip intent: a user's daily commute declaration (before 17:00)
CREATE TABLE IF NOT EXISTS trip_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('driver','passenger')),
  passenger_capacity INTEGER CHECK (passenger_capacity BETWEEN 0 AND 9),
  departure_time TIME,
  required_arrival_time TIME,
  trip_date DATE NOT NULL DEFAULT CURRENT_DATE + 1,
  home_lat DOUBLE PRECISION NOT NULL,
  home_long DOUBLE PRECISION NOT NULL,
  work_lat DOUBLE PRECISION NOT NULL,
  work_long DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','unmatched','expired')),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT ((CURRENT_DATE + 1 + TIME '17:00:00') AT TIME ZONE 'Europe/Vilnius'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Match between one driver intent and one passenger intent
CREATE TABLE IF NOT EXISTS trip_intent_matches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_intent_id UUID NOT NULL REFERENCES trip_intents(id) ON DELETE CASCADE,
  passenger_intent_id UUID NOT NULL REFERENCES trip_intents(id) ON DELETE CASCADE,
  driver_user_id UUID NOT NULL REFERENCES profiles(id),
  passenger_user_id UUID NOT NULL REFERENCES profiles(id),
  trip_date DATE NOT NULL,
  ai_compatibility_score DOUBLE PRECISION,
  ai_reasoning TEXT,
  proposed_departure TIME,
  proposed_pickup_time TIME,
  pickup_lat DOUBLE PRECISION,
  pickup_long DOUBLE PRECISION,
  pickup_address TEXT,
  detour_preference TEXT CHECK (detour_preference IN ('flexible','fixed')),
  custom_pickup_lat DOUBLE PRECISION,
  custom_pickup_long DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending_driver_review' CHECK (status IN (
    'pending_driver_review',
    'driver_accepted',
    'pending_passenger_confirm',
    'confirmed',
    'cancelled_by_driver',
    'cancelled_by_passenger',
    'expired'
  )),
  ride_id UUID REFERENCES rides(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Idempotency guard: cron inserts a row before starting; second run is a no-op
CREATE TABLE IF NOT EXISTS matcher_runs (
  run_date DATE PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  intents_processed INTEGER DEFAULT 0,
  matches_created INTEGER DEFAULT 0
);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE trip_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_intent_matches ENABLE ROW LEVEL SECURITY;

-- Users manage only their own intents
CREATE POLICY "own intents" ON trip_intents
  FOR ALL USING (user_id = auth.uid());

-- Both driver and passenger can read their matches
CREATE POLICY "see own matches" ON trip_intent_matches
  FOR SELECT USING (driver_user_id = auth.uid() OR passenger_user_id = auth.uid());

-- Driver can accept/decline pending matches
CREATE POLICY "driver updates pending match" ON trip_intent_matches
  FOR UPDATE USING (driver_user_id = auth.uid() AND status = 'pending_driver_review');

-- Passenger can confirm/decline driver-accepted matches
CREATE POLICY "passenger updates accepted match" ON trip_intent_matches
  FOR UPDATE USING (passenger_user_id = auth.uid() AND status IN ('driver_accepted','confirmed'));

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_trip_intents_date_status ON trip_intents(trip_date, status);
CREATE INDEX IF NOT EXISTS idx_trip_intents_user ON trip_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_trip_intent_matches_driver_intent ON trip_intent_matches(driver_intent_id);
CREATE INDEX IF NOT EXISTS idx_trip_intent_matches_passenger_intent ON trip_intent_matches(passenger_intent_id);
CREATE INDEX IF NOT EXISTS idx_trip_intent_matches_driver_date ON trip_intent_matches(driver_user_id, trip_date);
CREATE INDEX IF NOT EXISTS idx_trip_intent_matches_passenger_date ON trip_intent_matches(passenger_user_id, trip_date);

-- ─── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE trip_intent_matches;
ALTER PUBLICATION supabase_realtime ADD TABLE trip_intents;
