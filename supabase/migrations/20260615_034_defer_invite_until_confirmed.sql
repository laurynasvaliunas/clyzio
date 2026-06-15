-- 034 — Defer company-invite acceptance until the email is confirmed.
-- With email confirmation enabled (mailer_autoconfirm=false), the AFTER INSERT
-- accept_invite_on_signup trigger previously consumed the invite at signup —
-- before the inbox was proven — letting anyone who knows an invited address burn
-- the invite (no data access, but a griefing/DoS vector). This extracts the
-- acceptance into a shared helper and gates it on email confirmation:
--   * autoconfirm ON  → email_confirmed_at is set at signup → claim immediately
--     (behavior unchanged)
--   * confirmation ON → claim is deferred to the auth.users confirmation UPDATE
-- Acceptance stays email-matched + domain-agnostic, and still skips when a
-- company is already set (domain auto-join — assign_company_to_profile /
-- auto_enroll_company — is intentionally left as-is per product decision).

-- 1) Shared, idempotent acceptance helper (email-matched, domain-agnostic).
--    Table refs aliased to avoid any column/variable ambiguity.
create or replace function public.claim_pending_invite(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_existing uuid;
  v_inv public.company_invites%rowtype;
begin
  if p_user_id is null or p_email is null then return; end if;

  select company_id into v_existing from public.profiles where id = p_user_id;
  if v_existing is not null then return; end if;  -- domain join already won

  select ci.* into v_inv from public.company_invites ci
   where ci.email = lower(p_email) and ci.status = 'pending' and ci.expires_at > now()
   order by ci.created_at desc limit 1;
  if v_inv.id is null then return; end if;

  update public.profiles
     set company_id = v_inv.company_id, department_id = v_inv.department_id, is_solo_user = false
   where id = p_user_id;

  delete from public.user_roles where user_id = p_user_id and role = 'user';
  insert into public.user_roles (user_id, role, company_id)
  values (p_user_id, coalesce(v_inv.role, 'employee'), v_inv.company_id)
  on conflict do nothing;

  update public.company_invites ci
     set status = 'accepted', accepted_at = now(), accepted_by = p_user_id
   where ci.id = v_inv.id;
end; $$;
revoke all on function public.claim_pending_invite(uuid, text) from public, anon, authenticated;

-- 2) Signup trigger: claim immediately only if the email is already confirmed
--    (preserves the autoconfirm path); otherwise defer to confirmation.
--    Wrapped so an invite failure never rolls back the signup.
create or replace function public.accept_invite_on_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    if exists (select 1 from auth.users u where u.id = new.id and u.email_confirmed_at is not null) then
      perform public.claim_pending_invite(new.id, new.email);
    end if;
  exception when others then
    raise warning 'accept_invite_on_signup failed for %: %', new.id, sqlerrm;
  end;
  return new;
end; $$;

-- 3) Confirmation trigger: claim the pending invite the moment the email is
--    confirmed (null → non-null). Wrapped so a failure never blocks confirmation.
create or replace function public.accept_invite_on_confirm()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  begin
    perform public.claim_pending_invite(new.id, new.email);
  exception when others then
    raise warning 'accept_invite_on_confirm failed for %: %', new.id, sqlerrm;
  end;
  return new;
end; $$;
revoke all on function public.accept_invite_on_confirm() from public, anon, authenticated;

drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed
  after update on auth.users
  for each row
  when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.accept_invite_on_confirm();
