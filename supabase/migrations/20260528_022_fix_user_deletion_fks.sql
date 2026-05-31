-- Migration 022: Fix foreign keys that block user deletion.
-- Date: 2026-05-28
--
-- Symptom: deleting a user (Supabase dashboard OR the delete-account edge fn)
-- fails for any user who is a company admin or who has a carpool match. The
-- `auth.users` delete cascades to `profiles` (profiles_id_fkey = CASCADE), but
-- three FKs use ON DELETE NO ACTION and abort the transaction:
--   • companies.admin_user_id            → auth.users   (NO ACTION)
--   • trip_intent_matches.driver_user_id → public.profiles (NO ACTION)
--   • trip_intent_matches.passenger_user_id → public.profiles (NO ACTION)
--
-- Fix:
--   • trip_intent_matches.*_user_id → ON DELETE CASCADE (a deleted user's match
--     rows should go with them).
--   • companies.admin_user_id → ON DELETE SET NULL (deleting an admin must NOT
--     destroy the company; just clear the admin pointer). Column made nullable.
--
-- Idempotent: drop-if-exists + re-add. Safe to re-run.

BEGIN;

-- 1) trip_intent_matches → profiles : CASCADE on both participant FKs.
ALTER TABLE public.trip_intent_matches
  DROP CONSTRAINT IF EXISTS trip_intent_matches_driver_user_id_fkey,
  DROP CONSTRAINT IF EXISTS trip_intent_matches_passenger_user_id_fkey;

ALTER TABLE public.trip_intent_matches
  ADD CONSTRAINT trip_intent_matches_driver_user_id_fkey
    FOREIGN KEY (driver_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT trip_intent_matches_passenger_user_id_fkey
    FOREIGN KEY (passenger_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2) companies.admin_user_id → auth.users : SET NULL (keep the company).
ALTER TABLE public.companies
  ALTER COLUMN admin_user_id DROP NOT NULL;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_admin_user_id_fkey;

ALTER TABLE public.companies
  ADD CONSTRAINT companies_admin_user_id_fkey
    FOREIGN KEY (admin_user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

COMMIT;
