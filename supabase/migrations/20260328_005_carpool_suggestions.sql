-- Migration: Carpool Suggestions
-- Date: 2026-03-28
-- Fixes rides table gaps (scheduled_at column + 'scheduled' status) and adds
-- carpool_suggestions table for the AI-powered accept/decline flow.

-- ============================================
-- 1. RIDES — add scheduled_at + fix status constraint
-- find_carpool_candidates() (migration 003) references both, but neither
-- existed in the original rides schema (migration 002).
-- ============================================

ALTER TABLE public.rides ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;

COMMENT ON COLUMN public.rides.scheduled_at IS 'When the ride is scheduled to depart — used by find_carpool_candidates()';

-- Drop and recreate the status constraint to add 'scheduled'
ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS rides_status_check;
ALTER TABLE public.rides ADD CONSTRAINT rides_status_check
  CHECK (status IN ('requested', 'accepted', 'in_progress', 'completed', 'cancelled', 'scheduled'));

CREATE INDEX IF NOT EXISTS idx_rides_scheduled_at
  ON public.rides(scheduled_at)
  WHERE status IN ('scheduled', 'requested');

-- ============================================
-- 2. NEW TABLE: carpool_suggestions
-- Persists AI-generated carpool proposals with full lifecycle tracking.
-- Separate from ai_suggestions (generic AI log) — this drives the UI flow.
-- ============================================

CREATE TABLE IF NOT EXISTS public.carpool_suggestions (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Parties
  from_user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Optional link to a specific ride posting
  ride_id              UUID REFERENCES public.rides(id) ON DELETE SET NULL,
  -- AI scoring data
  compatibility_score  DECIMAL(4,2),       -- 0.00 – 1.00
  co2_saving_kg        DECIMAL(8,3),
  estimated_detour_min INTEGER,
  ai_reasoning         TEXT,
  -- Scheduling
  suggested_departure  TIMESTAMPTZ,
  -- Lifecycle
  status               TEXT NOT NULL DEFAULT 'pending'
                         CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  responded_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '48 hours'),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.carpool_suggestions IS 'AI-generated carpool proposals — drives the accept/decline UI and push notification flow';
COMMENT ON COLUMN public.carpool_suggestions.compatibility_score IS '0.00–1.00 score from ai-carpool-matcher edge function';
COMMENT ON COLUMN public.carpool_suggestions.expires_at IS 'Suggestion auto-expires after 48h if not responded to';

-- ============================================
-- 3. RLS
-- ============================================

ALTER TABLE public.carpool_suggestions ENABLE ROW LEVEL SECURITY;

-- Sender sees their sent suggestions
CREATE POLICY "Sender can view own suggestions" ON public.carpool_suggestions
  FOR SELECT USING (auth.uid() = from_user_id);

-- Recipient sees suggestions addressed to them
CREATE POLICY "Recipient can view own suggestions" ON public.carpool_suggestions
  FOR SELECT USING (auth.uid() = to_user_id);

-- Authenticated users can send suggestions (edge function uses service role, bypasses RLS anyway)
CREATE POLICY "Users can create suggestions" ON public.carpool_suggestions
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Only the recipient can respond
CREATE POLICY "Recipient can respond" ON public.carpool_suggestions
  FOR UPDATE USING (auth.uid() = to_user_id)
  WITH CHECK (status IN ('accepted', 'declined'));

-- ============================================
-- 4. Indexes
-- ============================================

-- Fast lookup of pending suggestions for a recipient (most common query)
CREATE INDEX IF NOT EXISTS idx_carpool_suggestions_to_user
  ON public.carpool_suggestions(to_user_id, status)
  WHERE status = 'pending';

-- Sender history
CREATE INDEX IF NOT EXISTS idx_carpool_suggestions_from_user
  ON public.carpool_suggestions(from_user_id, created_at DESC);

-- Expiry cleanup (cron job or edge function can use this)
CREATE INDEX IF NOT EXISTS idx_carpool_suggestions_expires
  ON public.carpool_suggestions(expires_at)
  WHERE status = 'pending';

-- ============================================
-- 5. Realtime
-- So the app receives incoming suggestions reactively
-- ============================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.carpool_suggestions;
