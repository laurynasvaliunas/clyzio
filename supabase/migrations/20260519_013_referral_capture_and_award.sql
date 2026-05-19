-- Referral capture + automatic 250-XP award.
--
-- The `referrals` table + `profiles.referral_code` already exist
-- (20260417_012). This migration adds:
--   1. profiles.pending_referral_code  — set by the client at signup from
--      the `clyzio://invite/<code>` deep link. The user can write their own
--      profile (existing self-update RLS), but NOT the referrals table.
--   2. A SECURITY DEFINER trigger on `rides` that, when a ride is completed,
--      finalises the referral for the acting user's FIRST completed trip and
--      credits the referrer with REFERRAL_XP (250). Trigger-only — no edge
--      function — so no function deploy is required.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pending_referral_code TEXT;

CREATE OR REPLACE FUNCTION public.award_referral_on_first_trip()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_referee   UUID;
  v_code      TEXT;
  v_referrer  UUID;
BEGIN
  -- Only act on the transition into 'completed'.
  IF NEW.status <> 'completed' OR OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  -- Both roles on the ride are candidate referees.
  FOR v_referee IN
    SELECT u FROM (VALUES (NEW.rider_id), (NEW.driver_id)) AS t(u)
    WHERE u IS NOT NULL
  LOOP
    -- Referee must have a pending code and not already have a referral row.
    SELECT p.pending_referral_code INTO v_code
    FROM public.profiles p
    WHERE p.id = v_referee
      AND p.pending_referral_code IS NOT NULL
      AND p.pending_referral_code <> '';

    IF v_code IS NULL THEN
      CONTINUE;
    END IF;

    IF EXISTS (SELECT 1 FROM public.referrals r WHERE r.referee_id = v_referee) THEN
      -- Already referred once (UNIQUE(referee_id)) — just clear the pending code.
      UPDATE public.profiles SET pending_referral_code = NULL WHERE id = v_referee;
      CONTINUE;
    END IF;

    -- Resolve referrer by code; block self-referral.
    SELECT p.id INTO v_referrer
    FROM public.profiles p
    WHERE p.referral_code = v_code
      AND p.id <> v_referee
    LIMIT 1;

    IF v_referrer IS NULL THEN
      -- Bad / self code — clear it so we don't retry forever.
      UPDATE public.profiles SET pending_referral_code = NULL WHERE id = v_referee;
      CONTINUE;
    END IF;

    INSERT INTO public.referrals
      (referrer_id, referee_id, code, status, awarded_xp, completed_at)
    VALUES
      (v_referrer, v_referee, v_code, 'completed', 250, NOW())
    ON CONFLICT (referee_id) DO NOTHING;

    UPDATE public.profiles
      SET xp_points = COALESCE(xp_points, 0) + 250
      WHERE id = v_referrer;

    UPDATE public.profiles
      SET pending_referral_code = NULL
      WHERE id = v_referee;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS award_referral_on_first_trip_trg ON public.rides;
CREATE TRIGGER award_referral_on_first_trip_trg
  AFTER UPDATE OF status ON public.rides
  FOR EACH ROW
  EXECUTE FUNCTION public.award_referral_on_first_trip();

COMMIT;
