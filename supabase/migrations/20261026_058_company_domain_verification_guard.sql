-- 058: only the server marks a company domain verified (QA follow-up to 055).
--
-- A verified domain makes every new sign-up with that address join the
-- company (assign_company_to_profile, auto_enroll_company). Proof of owning
-- the domain is the DNS TXT record "clyzio-verify=<token>", which only the
-- website's admin-verify-domain function checks. But a company admin — and
-- anyone becomes one by signing up on clyzio.com with a company name — could
-- skip it three ways:
--   1. insert a company_domains row with verified_at already set,
--   2. update verified_at on their unverified row,
--   3. call verify_company_domain with the token the website shows them.
-- So anyone could claim a competitor's domain and collect its new sign-ups as
-- their employees (dashboards, and full profiles until 057).
--
-- Clients keep doing what the website does: add a domain (always unverified),
-- read its token, delete it. Verifying and backfilling run with the service
-- role after the DNS check (Lovable Prompt 13).

create or replace function public.guard_company_domain_verification()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- Server writes (service role, definer functions) are trusted.
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.verified_at := null;
    return new;
  end if;
  if new.verified_at is distinct from old.verified_at
     or new.company_id is distinct from old.company_id
     or new.domain is distinct from old.domain
     or new.verification_token is distinct from old.verification_token then
    raise exception 'Domains are verified on the server after the DNS check'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_company_domain_verification_trg on public.company_domains;
create trigger guard_company_domain_verification_trg
  before insert or update on public.company_domains
  for each row execute function public.guard_company_domain_verification();

revoke all on function public.guard_company_domain_verification() from public, anon, authenticated;

-- Server only. Called with the service role there is no auth.uid(), so the
-- admin check applies to callers that have one (admin-verify-domain checks the
-- admin itself before calling).
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

  update public.company_domains
     set verified_at = now()
   where id = _domain_id and verified_at is null;

  -- Keep legacy companies.domain in sync with the first verified domain
  update public.companies
     set domain = v_domain
   where id = v_company and (domain is null or domain = '');

  return true;
end;
$$;

create or replace function public.backfill_company_domain(_domain_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company uuid;
  v_domain  text;
  v_count   integer := 0;
begin
  select company_id, domain into v_company, v_domain
    from public.company_domains
   where id = _domain_id and verified_at is not null;

  if v_company is null then
    raise exception 'Domain not found or not verified';
  end if;

  if auth.uid() is not null and not public.is_company_admin(auth.uid(), v_company) then
    raise exception 'Only company admins can backfill';
  end if;

  with updated as (
    update public.profiles p
       set company_id = v_company, is_solo_user = false
     where p.company_id is null
       and lower(split_part(p.email, '@', 2)) = v_domain
    returning id
  )
  select count(*) into v_count from updated;

  -- Add employee role for newly absorbed users (skip those already admin)
  insert into public.user_roles (user_id, role, company_id)
  select p.id, 'employee', v_company
    from public.profiles p
   where p.company_id = v_company
     and lower(split_part(p.email, '@', 2)) = v_domain
     and not exists (
       select 1 from public.user_roles ur
        where ur.user_id = p.id and ur.company_id = v_company
     )
  on conflict do nothing;

  return v_count;
end;
$$;

revoke all on function public.verify_company_domain(uuid, text) from public, anon, authenticated;
grant execute on function public.verify_company_domain(uuid, text) to service_role;
revoke all on function public.backfill_company_domain(uuid) from public, anon, authenticated;
grant execute on function public.backfill_company_domain(uuid) to service_role;
