-- Migration 018: Lock down direct client writes to security-sensitive
-- profile columns.
-- Date: 2026-05-26
--
-- Background (audit C1):
--   The original UPDATE policy on `profiles` was `USING (auth.uid() = id)` only
--   — no WITH CHECK and no column allowlist. That let any authenticated user
--   self-promote to `is_manager = true` and reassign their `company_id` to
--   another tenant, then read that tenant's data via the cross-org visibility
--   chain (migration 015) and corrupt its aggregate stats via the
--   "Managers can update own company" policy. Also opened the door to client
--   tampering with gamification counters (`xp_points`, `total_co2_saved`,
--   `trips_completed`, `badges`) used in leaderboards and ESG reports.
--
-- Fix:
--   1) Re-create the UPDATE policy with an explicit WITH CHECK matching the
--      USING clause (still own-row only).
--   2) Add a BEFORE-UPDATE trigger that rejects any direct client write to a
--      protected column. The trigger's WHEN clause skips it when the request
--      comes from the `service_role` (or another non-`authenticated` role),
--      so legitimate server-side flows (the `complete-trip` edge function,
--      the `award_referral_on_first_trip` trigger from migration 013, the
--      `handle_new_user` trigger from migration 001) keep working.
--
-- Idempotent: DROP IF EXISTS + CREATE OR REPLACE everywhere.

BEGIN;

-- 1) Tighten the UPDATE policy.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2) BEFORE UPDATE trigger that blocks writes to protected columns when the
--    caller is an end user (`authenticated`). Service role bypasses RLS *and*
--    runs with `role = 'service_role'`, so the WHEN clause excludes it.
--
--    Definition uses SECURITY DEFINER + an explicit search_path so a hostile
--    schema can't shadow `public.*` references (same hardening pattern as
--    migration 010).
CREATE OR REPLACE FUNCTION public.guard_profile_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dept_company UUID;
BEGIN
  -- Hard-blocked columns: never writable by the client.
  IF NEW.is_manager         IS DISTINCT FROM OLD.is_manager
     OR NEW.company_id      IS DISTINCT FROM OLD.company_id
     OR NEW.xp_points       IS DISTINCT FROM OLD.xp_points
     OR NEW.total_co2_saved IS DISTINCT FROM OLD.total_co2_saved
     OR NEW.trips_completed IS DISTINCT FROM OLD.trips_completed
     OR NEW.badges          IS DISTINCT FROM OLD.badges
     OR NEW.email           IS DISTINCT FROM OLD.email
  THEN
    RAISE EXCEPTION
      'Protected profile column changed from the client — write via server (service role) only'
      USING ERRCODE = '42501';  -- insufficient_privilege
  END IF;

  -- `department_id` is user-changeable BUT only within the user's own company.
  -- Otherwise a user in company A could move themselves into company B's
  -- department, appearing on B's department leaderboard / reports.
  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    IF NEW.department_id IS NOT NULL THEN
      SELECT d.company_id INTO v_dept_company
      FROM public.departments d
      WHERE d.id = NEW.department_id;
      IF v_dept_company IS NULL OR v_dept_company IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION
          'department_id must belong to your own company'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  -- `pending_referral_code` is deliberately NOT protected: it is a
  -- user-supplied claim (typed during onboarding) that the server-side
  -- `award_referral_on_first_trip` trigger from migration 013 validates and
  -- clears. A fake value is harmless — the validating trigger just clears
  -- it. No PII or privilege is at stake.

  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION public.guard_profile_protected_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.guard_profile_protected_columns() FROM anon;

DROP TRIGGER IF EXISTS guard_profile_protected_columns_trg ON public.profiles;
CREATE TRIGGER guard_profile_protected_columns_trg
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (
    -- Skip when running as service_role (edge functions, scheduled jobs,
    -- SQL editor logged-in as project owner). The JWT claim is absent for
    -- service_role connections; treat NULL as "not a user" → skip the guard.
    coalesce(
      current_setting('request.jwt.claims', true)::jsonb ->> 'role',
      'service_role'
    ) <> 'service_role'
  )
  EXECUTE FUNCTION public.guard_profile_protected_columns();

COMMENT ON TRIGGER guard_profile_protected_columns_trg ON public.profiles IS
  'Audit C1: blocks direct client writes to protected columns (is_manager, company_id, department_id, xp_points, total_co2_saved, trips_completed, badges, email, pending_referral_code). Service role bypasses.';

COMMIT;
