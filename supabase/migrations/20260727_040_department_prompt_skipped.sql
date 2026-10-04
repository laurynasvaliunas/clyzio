-- 040 — Fix the onboarding dead-end for company-invited users.
--
-- (Backfilled into the repo 2026-10-04: this was applied to production on
-- 2026-07-27 via the Supabase MCP connector but the file was never committed.
-- Content is verbatim from supabase_migrations.schema_migrations.)
--
-- /(auth)/onboarding is shown when: company_id IS NOT NULL AND department_id
-- IS NULL AND NOT is_solo_user (lib/permissionsPriming.nextRouteAfterAuth).
-- Its "Skip for now" called nextRouteAfterAuth again, which — because none of
-- those conditions changed — returned /(auth)/onboarding. router.replace to
-- the same route is a no-op, so Skip did nothing for 100% of the users who saw
-- it. If the company had no departments yet, the list was empty, "Join Team"
-- was disabled, and there was no back or sign-out: a hard dead-end.
--
-- This flag records the skip so the routing gate stops re-showing the screen.
-- The user can still pick a department later from Profile.

alter table public.profiles
  add column if not exists department_prompt_skipped boolean not null default false;

comment on column public.profiles.department_prompt_skipped is
  'True once the user dismissed the department picker during onboarding. Read by nextRouteAfterAuth so the prompt is not shown again.';
