-- 059: company admin tools and domain claims (QA follow-ups W-05 and S-09).
--
-- W-05  The website's Team page changed a colleague's department or manager
--       role by updating their profile row directly. People may only update
--       their own profile, so nothing changed while the page said "saved"
--       (the controls are hidden until these functions exist).
--         set_member_department — company admins and managers
--         set_member_manager    — company admins only (not their own role)
--
-- S-09  A company domain had to be unique even before anyone proved it, so
--       whoever registered "bigcorp.com" first (no DNS proof needed) blocked
--       BigCorp from ever signing up with it. Now only a VERIFIED domain is
--       unique; companies may claim the same domain while unverified, and when
--       one proves it through DNS the other claims are dropped. The sign-up
--       name lookup (app and website) only names companies with a verified
--       domain — the only ones a sign-up actually joins.

-- ── 1. Team page ────────────────────────────────────────────────────────────
create or replace function public.set_member_department(p_user_id uuid, p_department_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
begin
  select company_id into v_company from public.profiles where id = p_user_id;
  if v_company is null
     or not (public.is_company_admin(auth.uid(), v_company)
             or exists (select 1 from public.profiles me
                         where me.id = auth.uid() and me.company_id = v_company and me.is_manager)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_department_id is not null
     and not exists (select 1 from public.departments d where d.id = p_department_id and d.company_id = v_company) then
    raise exception 'department_not_in_company' using errcode = '22023';
  end if;

  update public.profiles set department_id = p_department_id where id = p_user_id;
end;
$$;

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

  -- is_manager is a protected profile column: guard_profile_protected_columns
  -- only lets server requests change it. This one update runs as the server,
  -- then the caller's identity is restored.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles set is_manager = p_is_manager where id = p_user_id;
  perform set_config('request.jwt.claims', coalesce(nullif(v_claims, ''), '{}'), true);
end;
$$;

revoke all on function public.set_member_department(uuid, uuid) from public, anon;
grant execute on function public.set_member_department(uuid, uuid) to authenticated;
revoke all on function public.set_member_manager(uuid, boolean) from public, anon;
grant execute on function public.set_member_manager(uuid, boolean) to authenticated;

-- ── 2. Only a verified domain is taken ──────────────────────────────────────
alter table public.company_domains drop constraint if exists company_domains_domain_unique;
drop index if exists public.company_domains_domain_unique;
create unique index if not exists company_domains_verified_domain_unique
  on public.company_domains (domain) where verified_at is not null;
create unique index if not exists company_domains_company_domain_unique
  on public.company_domains (company_id, domain);

-- companies.domain is the legacy copy of the domain typed at sign-up; nothing
-- matches on it any more (sign-up joins through verified company_domains).
alter table public.companies drop constraint if exists companies_domain_key;
drop index if exists public.idx_companies_domain_unique;

-- The proven owner wins: verifying refuses a domain another company already
-- proved, and drops the other companies' unproven claims.
create or replace function public.verify_company_domain(_domain_id uuid, _token text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_domain  text;
begin
  select company_id, domain into v_company, v_domain
    from public.company_domains
   where id = _domain_id and verification_token = _token;

  if v_company is null then
    return false;
  end if;

  if auth.uid() is not null and not public.is_company_admin(auth.uid(), v_company) then
    raise exception 'Only company admins can verify domains';
  end if;

  if exists (select 1 from public.company_domains
              where domain = v_domain and verified_at is not null and company_id <> v_company) then
    raise exception 'domain_already_verified' using errcode = '23505';
  end if;

  update public.company_domains
     set verified_at = now()
   where id = _domain_id and verified_at is null;

  delete from public.company_domains
   where domain = v_domain and verified_at is null and company_id <> v_company;

  -- Keep legacy companies.domain in sync with the first verified domain
  update public.companies
     set domain = v_domain
   where id = v_company and (domain is null or domain = '');

  return true;
end;
$$;

revoke all on function public.verify_company_domain(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_company_domain(uuid, text) to service_role;

-- Sign-up name lookup: only companies a sign-up would actually join, and the
-- same personal-mail list as sign-up itself.
create or replace function public.lookup_company_by_email_domain(p_email text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_domain text := lower(split_part(coalesce(p_email, ''), '@', 2));
  v_name   text;
begin
  if v_domain = '' or v_domain in (
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','protonmail.com',
    'live.com','msn.com','me.com','mac.com','yandex.com','gmx.com','zoho.com','mail.com',
    'fastmail.com','tutanota.com','pm.me','proton.me','hey.com'
  ) then
    return null;
  end if;

  select c.name into v_name
    from public.company_domains cd
    join public.companies c on c.id = cd.company_id
   where cd.domain = v_domain and cd.verified_at is not null
   limit 1;

  return v_name;
end;
$$;
