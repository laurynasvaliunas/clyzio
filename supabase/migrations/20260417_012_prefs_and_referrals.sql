-- Migration 012: Notification preferences + referrals
-- Date: 2026-04-17

BEGIN;

-- ─── Notification preferences ──────────────────────────────────────────────
-- Stored as a single JSONB column so adding a new channel doesn't require
-- another migration. Edge functions consult this before sending push.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT jsonb_build_object(
    'matches', true,
    'chat', true,
    'weekly_digest', true,
    'marketing', false
  );

-- ─── Referrals ──────────────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Default referral code generator — short, uppercase, human-readable.
CREATE OR REPLACE FUNCTION public.ensure_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.referral_code IS NULL THEN
    NEW.referral_code := upper(substring(encode(gen_random_bytes(4), 'base64') from 1 for 6));
    -- Replace characters that look similar (1/l, 0/O, +/=)
    NEW.referral_code := translate(NEW.referral_code, '+/=IO01l', 'XYZABCDE');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ensure_referral_code_trg ON public.profiles;
CREATE TRIGGER ensure_referral_code_trg
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.ensure_referral_code();

-- Backfill existing rows
UPDATE public.profiles
  SET referral_code = upper(substring(encode(gen_random_bytes(4), 'base64') from 1 for 6))
  WHERE referral_code IS NULL;

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'rejected')),
  awarded_xp INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  UNIQUE (referee_id)  -- a user can only be referred once
);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own referrals" ON public.referrals;
CREATE POLICY "Users read own referrals" ON public.referrals
  FOR SELECT TO authenticated
  USING (auth.uid() = referrer_id OR auth.uid() = referee_id);

-- Writes are done by an edge function (service role) once the referee
-- completes their first trip. No client-side insert policy intentionally.

COMMIT;
