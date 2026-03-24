-- Migration: Add terms and privacy policy acceptance tracking to profiles
-- Clyzio MB — created 2026-03-24

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS privacy_policy_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.terms_accepted_at
  IS 'Timestamp when the user accepted the Terms & Conditions (null = not yet accepted)';

COMMENT ON COLUMN public.profiles.privacy_policy_accepted_at
  IS 'Timestamp when the user accepted the Privacy Policy (null = not yet accepted)';
