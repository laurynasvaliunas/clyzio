-- 061: any number of company admins, and invites that work for existing accounts.
--
-- Found 1 November 2026, when inviting a colleague on clyzio.com failed (403):
--  * No company had an admin. "Admin" was set once, when a company was created
--    (companies.admin_user_id, plus a user_roles row), and nothing could add or
--    remove one afterwards.
--  * A signed-in person opening an invite link (app /join, app sign-in with
--    ?invite=, website /join) always failed: accept_company_invite changed
--    protected profile columns as the user, which the profile guard refuses.
--  * Someone whose email domain had already joined them to the inviting
--    company left the invite pending forever and lost its department.
--
-- Now:
--  * user_roles (role 'admin', scoped to the company) is the only source of
--    truth, read by is_company_admin(). companies.admin_user_id is the primary
--    contact and always points at a current admin (null when there is none).
--  * set_member_admin(user, true/false): admins add and remove admins in their
--    own company, never the last one. Admins are always managers.
--  * When a company loses its last admin (account deleted, joined another
--    company), its longest-standing manager takes over. With no manager the
--    company waits for support, who run set_member_admin from the SQL editor.
--  * get_my_company_role() tells the website and app whether to show admin
--    controls; get_company_members() also returns is_admin.

-- ── 0. More than one admin ──────────────────────────────────────────────────
-- Created on the website side, not in these migrations; nothing references it.
drop index if exists public.one_admin_per_company;

-- ── 1. Grant (internal) ─────────────────────────────────────────────────────
create or replace function public.grant_company_admin(p_user_id uuid, p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claims text := current_setting('request.jwt.claims', true);
begin
  insert into public.user_roles (user_id, role, company_id)
  values (p_user_id, 'admin', p_company_id)
  on conflict (user_id, role, company_id) do nothing;

  -- is_manager is a protected profile column; this update runs as the server,
  -- then the caller's identity is restored.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles set is_manager = true where id = p_user_id and is_manager is distinct from true;
  perform set_config('request.jwt.claims', coalesce(nullif(v_claims, ''), '{}'), true);

  update public.companies set admin_user_id = p_user_id
   where id = p_company_id and admin_user_id is null;
end;
$$;

revoke all on function public.grant_company_admin(uuid, uuid) from public, anon, authenticated;
grant execute on function public.grant_company_admin(uuid, uuid) to service_role;

-- ── 2. Team page: add and remove admins ─────────────────────────────────────
create or replace function public.set_member_admin(p_user_id uuid, p_is_admin boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  if p_is_admin is null then
    raise exception 'is_admin_required' using errcode = '22023';
  end if;
  select company_id into v_company from public.profiles where id = p_user_id;
  -- No signed-in user means support (SQL editor) or a server function.
  if v_company is null
     or (auth.uid() is not null and not public.is_company_admin(auth.uid(), v_company)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- One change at a time per company, so two admins can't remove each other.
  perform 1 from public.companies where id = v_company for update;

  if p_is_admin then
    perform public.grant_company_admin(p_user_id, v_company);
    return;
  end if;

  if not exists (select 1 from public.user_roles
                  where company_id = v_company and role = 'admin' and user_id <> p_user_id) then
    raise exception 'last_admin' using errcode = '42501';
  end if;
  delete from public.user_roles
   where user_id = p_user_id and role = 'admin' and company_id = v_company;
end;
$$;

revoke all on function public.set_member_admin(uuid, boolean) from public, anon;
grant execute on function public.set_member_admin(uuid, boolean) to authenticated, service_role;

-- An admin stays a manager; remove the admin role first.
create or replace function public.set_member_manager(p_user_id uuid, p_is_manager boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_claims  text := current_setting('request.jwt.claims', true);
begin
  if p_is_manager is null then
    raise exception 'is_manager_required' using errcode = '22023';
  end if;
  select company_id into v_company from public.profiles where id = p_user_id;
  if v_company is null or not public.is_company_admin(auth.uid(), v_company) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = auth.uid() then
    raise exception 'cannot_change_own_role' using errcode = '42501';
  end if;
  if not p_is_manager and public.is_company_admin(p_user_id, v_company) then
    raise exception 'target_is_admin' using errcode = '42501';
  end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles set is_manager = p_is_manager where id = p_user_id;
  perform set_config('request.jwt.claims', coalesce(nullif(v_claims, ''), '{}'), true);
end;
$$;

-- ── 3. Never leave a company without an admin if a manager can take over ────
create or replace function public.keep_company_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next uuid;
begin
  if old.role <> 'admin' or old.company_id is null
     or not exists (select 1 from public.companies where id = old.company_id) then
    return null;
  end if;

  if not exists (select 1 from public.user_roles where company_id = old.company_id and role = 'admin') then
    select p.id into v_next
      from public.profiles p
     where p.company_id = old.company_id and p.is_manager and p.id <> old.user_id
     order by p.created_at, p.id
     limit 1;
    if v_next is not null then
      insert into public.user_roles (user_id, role, company_id)
      values (v_next, 'admin', old.company_id)
      on conflict (user_id, role, company_id) do nothing;
    end if;
  end if;

  update public.companies c
     set admin_user_id = (select r.user_id from public.user_roles r
                           where r.company_id = old.company_id and r.role = 'admin'
                           order by r.created_at, r.user_id
                           limit 1)
   where c.id = old.company_id and (c.admin_user_id is null or c.admin_user_id = old.user_id);
  return null;
end;
$$;

revoke all on function public.keep_company_admin() from public, anon, authenticated;

drop trigger if exists keep_company_admin_trg on public.user_roles;
create trigger keep_company_admin_trg
  after delete on public.user_roles
  for each row execute function public.keep_company_admin();

-- ── 4. What the website and app read ────────────────────────────────────────
create or replace function public.get_my_company_role()
returns table(company_id uuid, is_admin boolean, is_manager boolean, company_has_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id,
         p.company_id is not null and public.is_company_admin(p.id, p.company_id),
         coalesce(p.is_manager, false),
         exists (select 1 from public.user_roles r where r.company_id = p.company_id and r.role = 'admin')
    from public.profiles p
   where p.id = auth.uid();
$$;

revoke all on function public.get_my_company_role() from public, anon;
grant execute on function public.get_my_company_role() to authenticated;

drop function if exists public.get_company_members(uuid);
create function public.get_company_members(p_company_id uuid)
returns table(id uuid, first_name text, last_name text, email text, avatar_url text,
              department_id uuid, is_manager boolean, is_admin boolean, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.email, p.avatar_url, p.department_id, p.is_manager,
         exists (select 1 from public.user_roles r
                  where r.user_id = p.id and r.company_id = p_company_id and r.role = 'admin'),
         p.created_at
    from public.profiles p
   where p.company_id = p_company_id
     and (public.is_company_admin(auth.uid(), p_company_id)
          or exists (select 1 from public.profiles me
                      where me.id = auth.uid() and me.company_id = p_company_id and me.is_manager))
   order by p.first_name nulls last;
$$;

revoke all on function public.get_company_members(uuid) from public, anon;
grant execute on function public.get_company_members(uuid) to authenticated;

-- ── 5. Every admin, not only the primary contact ────────────────────────────
drop policy if exists "Admins can update their company" on public.companies;
create policy "Admins can update their company" on public.companies
  for update to authenticated
  using (public.is_company_admin(auth.uid(), id))
  with check (public.is_company_admin(auth.uid(), id));

drop policy if exists "Users can view their company" on public.companies;
create policy "Users can view their company" on public.companies
  for select to authenticated
  using (id = public.get_user_company_id(auth.uid()) or public.is_company_admin(auth.uid(), id));

-- Admins could demote any admin (even themselves, the last one) by updating
-- the role row; admin rows now change only through set_member_admin.
drop policy if exists "Admins can update company roles" on public.user_roles;
create policy "Admins can update company roles" on public.user_roles
  for update to authenticated
  using (public.is_company_admin(auth.uid(), company_id) and role <> 'admin')
  with check (public.is_company_admin(auth.uid(), company_id) and role <> 'admin');

-- ── 6. Invites ──────────────────────────────────────────────────────────────
-- Signed-in redeem (app /join, app sign-in, website /join).
create or replace function public.accept_company_invite(p_token text)
returns table(status text, company_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv    public.company_invites%rowtype;
  v_email  text;
  v_name   text;
  v_old    uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  -- Kept: auth.uid() reads the claims, which are swapped for one update below.
  v_uid    uuid := auth.uid();
begin
  if v_uid is null then
    return query select 'unauthenticated'::text, null::text;
    return;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_uid;

  -- Table refs are aliased so unqualified `status`/`company_name` can only mean
  -- the RETURNS TABLE out-params.
  select ci.* into v_inv
    from public.company_invites ci
   where ci.token = p_token and ci.status = 'pending' and ci.expires_at > now()
   order by ci.created_at desc
   limit 1;

  if v_inv.id is null then
    return query select 'invalid_or_expired'::text, null::text;
    return;
  end if;

  if lower(v_inv.email) <> v_email then
    return query select 'email_mismatch'::text, v_inv.email;
    return;
  end if;

  select p.company_id into v_old from public.profiles p where p.id = v_uid;

  -- Leaving another company: its roles go (keep_company_admin hands that
  -- company to a manager if this was its last admin).
  if v_old is not null and v_old <> v_inv.company_id then
    delete from public.user_roles ur where ur.user_id = v_uid and ur.company_id = v_old;
  end if;

  -- company_id, is_manager and is_solo_user are protected profile columns.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles p
     set company_id    = v_inv.company_id,
         department_id = case when v_old = v_inv.company_id
                              then coalesce(v_inv.department_id, p.department_id)
                              else v_inv.department_id end,
         is_manager    = case when v_old = v_inv.company_id then p.is_manager else false end,
         is_solo_user  = false
   where p.id = v_uid;
  perform set_config('request.jwt.claims', coalesce(nullif(v_claims, ''), '{}'), true);

  delete from public.user_roles ur where ur.user_id = v_uid and ur.role = 'user';
  if v_inv.role = 'admin' then
    perform public.grant_company_admin(v_uid, v_inv.company_id);
  else
    insert into public.user_roles (user_id, role, company_id)
    values (v_uid, v_inv.role, v_inv.company_id)
    on conflict (user_id, role, company_id) do nothing;
  end if;

  update public.company_invites ci
     set status = 'accepted', accepted_at = now(), accepted_by = v_uid
   where ci.id = v_inv.id;

  select c.name into v_name from public.companies c where c.id = v_inv.company_id;
  return query select 'joined'::text, v_name;
end;
$$;

-- Sign-up / email confirmation. A domain join to the SAME company no longer
-- leaves the invite pending (its department and role still apply); a domain
-- join to another company still wins.
create or replace function public.claim_pending_invite(p_user_id uuid, p_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing uuid;
  v_inv      public.company_invites%rowtype;
  v_claims   text := current_setting('request.jwt.claims', true);
begin
  if p_user_id is null or p_email is null then return; end if;

  select ci.* into v_inv from public.company_invites ci
   where ci.email = lower(p_email) and ci.status = 'pending' and ci.expires_at > now()
   order by ci.created_at desc limit 1;
  if v_inv.id is null then return; end if;

  select company_id into v_existing from public.profiles where id = p_user_id;
  if v_existing is not null and v_existing <> v_inv.company_id then return; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles
     set company_id = v_inv.company_id,
         department_id = coalesce(v_inv.department_id, department_id),
         is_solo_user = false
   where id = p_user_id;
  perform set_config('request.jwt.claims', coalesce(nullif(v_claims, ''), '{}'), true);

  delete from public.user_roles where user_id = p_user_id and role = 'user';
  if v_inv.role = 'admin' then
    perform public.grant_company_admin(p_user_id, v_inv.company_id);
  else
    insert into public.user_roles (user_id, role, company_id)
    values (p_user_id, v_inv.role, v_inv.company_id)
    on conflict do nothing;
  end if;

  update public.company_invites ci
     set status = 'accepted', accepted_at = now(), accepted_by = p_user_id
   where ci.id = v_inv.id;
end;
$$;

revoke all on function public.claim_pending_invite(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_pending_invite(uuid, text) to service_role;

-- ── 7. Backfill: every primary contact holds the admin role ─────────────────
insert into public.user_roles (user_id, role, company_id)
select c.admin_user_id, 'admin', c.id
  from public.companies c
 where c.admin_user_id is not null
on conflict (user_id, role, company_id) do nothing;
