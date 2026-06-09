-- 031 — Pre-launch hardening: revoke EXECUTE on SECURITY DEFINER *trigger*
-- functions (+ the internal score-recompute helper). Trigger functions are
-- invoked by the trigger system, not callers, so EXECUTE is not needed for them
-- to fire — removing the grant stops a signed-in user invoking them directly
-- (e.g. promote_company_admin, award_referral_on_first_trip, guard_*).
-- RLS helpers (is_peer_visible/is_company_admin/get_user_company_id) and client
-- RPCs (get_company_*, find_carpool_candidates, get_public_profiles,
-- lookup_company_by_email_domain, …) are intentionally left callable.
do $$
declare fn text;
begin
  foreach fn in array array[
    'accept_invite_on_signup','assign_company_to_profile','auto_enroll_company',
    'award_referral_on_first_trip','company_methodology_bump_version',
    'enforce_pickup_address_sharing','esg_reports_prevent_locked_update',
    'guard_company_domain_blocklist','guard_company_protected_columns',
    'guard_profile_protected_columns','handle_new_user','promote_company_admin',
    'touch_updated_at','update_company_green_score'
  ] loop
    execute format('revoke execute on function public.%I() from public, anon, authenticated', fn);
  end loop;
  revoke execute on function public.recompute_company_green_score(uuid) from public, anon, authenticated;
end $$;
