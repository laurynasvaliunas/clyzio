-- Migration 011: Ratings & safety incidents
-- Date: 2026-04-17

BEGIN;

-- ─── Ratings ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  rater_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rated_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  score SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
  tags TEXT[] NOT NULL DEFAULT '{}',
  comment TEXT CHECK (char_length(comment) <= 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ride_id, rater_id, rated_id)
);

CREATE INDEX IF NOT EXISTS ratings_rated_idx ON public.ratings (rated_id);
CREATE INDEX IF NOT EXISTS ratings_ride_idx ON public.ratings (ride_id);

ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;

-- Insert: only trip participant rating the OTHER participant
DROP POLICY IF EXISTS "Participants can insert rating" ON public.ratings;
CREATE POLICY "Participants can insert rating" ON public.ratings
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = rater_id
    AND auth.uid() <> rated_id
    AND EXISTS (
      SELECT 1 FROM public.rides r
      WHERE r.id = ride_id
        AND (r.driver_id = auth.uid() OR r.rider_id = auth.uid())
        AND (r.driver_id = rated_id OR r.rider_id = rated_id)
        AND r.status = 'completed'
    )
  );

-- Read: the rater, the ratee, or anyone (authenticated) viewing the ratee's
-- aggregated profile should be able to read the row. We allow authenticated
-- users to read all ratings so aggregate cards (avg, count) can be rendered.
DROP POLICY IF EXISTS "Authenticated users can read ratings" ON public.ratings;
CREATE POLICY "Authenticated users can read ratings" ON public.ratings
  FOR SELECT TO authenticated USING (true);

-- Update/Delete: only the rater within 24h
DROP POLICY IF EXISTS "Raters can update own rating" ON public.ratings;
CREATE POLICY "Raters can update own rating" ON public.ratings
  FOR UPDATE TO authenticated
  USING (auth.uid() = rater_id AND created_at > NOW() - INTERVAL '24 hours')
  WITH CHECK (auth.uid() = rater_id);

DROP POLICY IF EXISTS "Raters can delete own rating" ON public.ratings;
CREATE POLICY "Raters can delete own rating" ON public.ratings
  FOR DELETE TO authenticated
  USING (auth.uid() = rater_id AND created_at > NOW() - INTERVAL '24 hours');

-- Aggregate view used by the client
CREATE OR REPLACE VIEW public.profile_ratings_summary
  WITH (security_invoker = true) AS
  SELECT
    rated_id AS profile_id,
    ROUND(AVG(score)::numeric, 2) AS avg_score,
    COUNT(*)::int AS rating_count
  FROM public.ratings
  GROUP BY rated_id;

-- ─── Safety incidents (SOS upgrade) ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.safety_incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ride_id UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('sos', 'harassment', 'accident', 'other')),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.safety_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own incident" ON public.safety_incidents;
CREATE POLICY "Users insert own incident" ON public.safety_incidents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own incidents" ON public.safety_incidents;
CREATE POLICY "Users read own incidents" ON public.safety_incidents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

COMMIT;
