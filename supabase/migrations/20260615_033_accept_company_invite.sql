-- 033 — Token-based company-invite acceptance for an authenticated caller.
-- Complements accept_invite_on_signup (which fires only on signup, matching by
-- email): this lets an ALREADY-registered user redeem an invite by clicking its
-- link. Invited-email-only (the caller must be signed in with the invited email)
-- and DOMAIN-AGNOSTIC (the invite email can be any domain). Mirrors the linkage
-- accept_invite_on_signup performs (company_id, department_id, role, invite
-- bookkeeping). Domain auto-join triggers are intentionally left untouched.
create or replace function public.accept_company_invite(p_token text)
returns table (status text, company_name text)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_inv   public.company_invites%rowtype;
  v_email text;
  v_name  text;
begin
  if auth.uid() is null then
    return query select 'unauthenticated'::text, null::text;
    return;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = auth.uid();

  -- Table refs are aliased so unqualified `status`/`company_name` can only mean
  -- the RETURNS TABLE out-params (avoids a column/variable ambiguity error).
  select ci.* into v_inv
    from public.company_invites ci
   where ci.token = p_token and ci.status = 'pending' and ci.expires_at > now()
   order by ci.created_at desc
   limit 1;

  if v_inv.id is null then
    return query select 'invalid_or_expired'::text, null::text;
    return;
  end if;

  -- Invited-email-only: the bearer of the link must own the invited inbox.
  if lower(v_inv.email) <> v_email then
    return query select 'email_mismatch'::text, v_inv.email;
    return;
  end if;

  update public.profiles
     set company_id    = v_inv.company_id,
         department_id  = v_inv.department_id,
         is_solo_user   = false
   where id = auth.uid();

  delete from public.user_roles where user_id = auth.uid() and role = 'user';
  insert into public.user_roles (user_id, role, company_id)
  values (auth.uid(), coalesce(v_inv.role, 'employee'), v_inv.company_id)
  on conflict (user_id, role, company_id) do nothing;

  update public.company_invites ci
     set status = 'accepted', accepted_at = now(), accepted_by = auth.uid()
   where ci.id = v_inv.id;

  select c.name into v_name from public.companies c where c.id = v_inv.company_id;
  return query select 'joined'::text, v_name;
end;
$$;

revoke all on function public.accept_company_invite(text) from public, anon;
grant execute on function public.accept_company_invite(text) to authenticated;
