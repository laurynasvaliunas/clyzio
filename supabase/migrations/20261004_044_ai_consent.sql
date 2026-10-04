-- 044 — Opt-in consent for AI features (App Store Guideline 5.1.2(i), GDPR art. 6(1)(a)).
--
-- ai-commute-planner sent the user's first name, home/work addresses and
-- 4-decimal coordinates to Anthropic on every Map focus, and
-- ai-carpool-matcher sent other commuters' names and ride coordinates — with
-- no disclosure or consent. The functions now (a) send only derived,
-- anonymous numbers (distance, timing) and (b) require this timestamp, set
-- when the user agrees on the in-app AI consent card. Clearing it (Settings →
-- AI suggestions) withdraws consent.
--
-- Deploy order: this migration BEFORE the updated edge functions — they treat
-- a missing column as "no consent", so the reverse order only switches AI off.

alter table public.profiles
  add column if not exists ai_consent_at timestamptz;

comment on column public.profiles.ai_consent_at is
  'When the user opted in to AI suggestions (data sent to Anthropic, minimised). NULL = not consented / withdrawn.';
