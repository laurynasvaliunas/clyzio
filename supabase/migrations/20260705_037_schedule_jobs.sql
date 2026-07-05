-- 037 — Scheduler (review-v2 gap): pg_cron + pg_net jobs, and a NULL-owner
-- guard in enforce_ride_co2.
--
-- Finding: no scheduler existed at all — pg_cron/pg_net were not installed,
-- matcher_runs was empty (the daily batch matcher had NEVER run), the 3:30 PM
-- nudge never fired, and nothing expired stale intents/matches (pending intents
-- accumulated past their trip_date, leaving users in a "waiting" dead-end).
--
-- Prereqs provisioned OUTSIDE this file (secrets never live in the repo):
--   * edge secret CRON_SHARED_SECRET (Management API)
--   * the same value in Vault:  select vault.create_secret('<value>', 'cron_shared_secret');
--
-- Jobs (UTC): 18:00 daily batch matcher (pairs tomorrow's intents that the
-- instant path missed + resolves 'unmatched'); 13:30 "plan tomorrow" nudge
-- (≈15:30/16:30 Lithuania); hourly sweep expiring stale intents/matches.

BEGIN;

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 1) NULL-owner guard (self-review nit): a ride must have a participant; a
--    both-NULL row is an upstream bug — fail loudly instead of silently
--    computing against the default baseline. Full function re-stated.
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
  IF v_owner IS NULL THEN
    RAISE EXCEPTION 'ride must have rider_id or driver_id' USING ERRCODE = '23514';
  END IF;

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
  IF v_dist IS NULL OR v_dist > 1000 THEN
    v_dist := 0;
  END IF;
  NEW.distance_km := round(v_dist::numeric, 3);

  SELECT COALESCE(baseline_co2, 0.192) INTO v_baseline
  FROM public.profiles WHERE id = v_owner;
  v_baseline := COALESCE(v_baseline, 0.192);

  SELECT co2_per_km INTO v_mode_factor
  FROM public.transport_mode_catalog WHERE id = NEW.transport_mode;
  v_mode_factor := COALESCE(v_mode_factor, v_baseline);

  NEW.co2_saved := round(GREATEST(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);

  RETURN NEW;
END
$$;

-- 2) Cron jobs (idempotent: unschedule same-named jobs first).
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid FROM cron.job
    WHERE jobname IN ('clyzio-batch-matcher','clyzio-plan-nudge','clyzio-expire-stale')
  LOOP
    PERFORM cron.unschedule(j.jobid);
  END LOOP;
END $$;

-- 18:00 UTC daily: batch matcher for tomorrow (catches intents the instant
-- path missed; marks leftover passengers 'unmatched' + notifies).
SELECT cron.schedule(
  'clyzio-batch-matcher',
  '0 18 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qvevbbqcrizfywqexlkw.supabase.co/functions/v1/daily-commute-matcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- 13:30 UTC daily: "plan tomorrow's commute" push nudge (PDF D7).
SELECT cron.schedule(
  'clyzio-plan-nudge',
  '30 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://qvevbbqcrizfywqexlkw.supabase.co/functions/v1/daily-commute-matcher',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_shared_secret')
    ),
    body := '{"nudge": true}'::jsonb
  );
  $$
);

-- Hourly: expire stale intents + open matches whose trip_date has passed, so
-- nobody is left in a "waiting" dead-end and the pools stay clean.
SELECT cron.schedule(
  'clyzio-expire-stale',
  '15 * * * *',
  $$
  UPDATE public.trip_intents
     SET status = 'expired'
   WHERE status = 'pending' AND trip_date < current_date;
  UPDATE public.trip_intent_matches
     SET status = 'expired', updated_at = now()
   WHERE status IN ('pending','awaiting_other') AND trip_date < current_date;
  $$
);

COMMIT;
