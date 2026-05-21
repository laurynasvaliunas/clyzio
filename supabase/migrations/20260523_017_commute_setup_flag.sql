-- First-run setup flag. New accounts must set their average weekly commute mix
-- (baseline) and complete their profile before reaching the Map. Set to true the
-- first time the baseline is saved; second+ logins skip the setup flow.
--
-- Existing users default to false and will be guided through setup once. To skip
-- prompting current users, run after applying:
--   UPDATE public.profiles SET commute_setup_done = true
--   WHERE commuting_habits IS NOT NULL AND commuting_habits <> '[]'::jsonb;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS commute_setup_done BOOLEAN NOT NULL DEFAULT false;
