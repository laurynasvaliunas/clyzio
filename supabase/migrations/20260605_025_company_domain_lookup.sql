-- 025 — Company lookup by email domain (powers the sign-up "you'll join X" banner).
--
-- The mobile login screen (app/(auth)/login.tsx) calls this RPC PRE-AUTH (as the
-- `anon` role) while the user types a work email, to truthfully name the company
-- they'll be enrolled into. The function was referenced by the client but never
-- existed in the database, so the call always errored and the banner silently
-- degraded to the generic "ask your admin to register …" nudge.
--
-- It mirrors EXACTLY what the sign-up triggers do for linkage, so the banner is
-- truthful: a verified `company_domains` row (the source of truth used by
-- `auto_enroll_company`), then the legacy `companies.domain` column (used by
-- `assign_company_to_profile`). Returns the company name, or NULL when the
-- domain maps to no company (incl. free/consumer mail domains).
create or replace function public.lookup_company_by_email_domain(p_email text)
returns text
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_domain text := lower(split_part(coalesce(p_email, ''), '@', 2));
  v_name   text;
begin
  if v_domain = '' then
    return null;
  end if;

  -- Free/consumer mail domains never map to a company.
  if v_domain in (
    'gmail.com','yahoo.com','hotmail.com','outlook.com',
    'icloud.com','aol.com','protonmail.com'
  ) then
    return null;
  end if;

  -- 1) Verified custom domain — the source of truth for auto-enrolment.
  select c.name
    into v_name
  from public.company_domains cd
  join public.companies c on c.id = cd.company_id
  where cd.domain = v_domain
    and cd.verified_at is not null
  limit 1;

  if v_name is not null then
    return v_name;
  end if;

  -- 2) Legacy single-domain column on companies.
  select c.name
    into v_name
  from public.companies c
  where lower(c.domain) = v_domain
  limit 1;

  return v_name; -- NULL when no company matches
end;
$$;

-- Pre-auth call → must be callable by `anon`. SECURITY DEFINER bypasses RLS and
-- returns only the company name (no internal ids / PII).
revoke all on function public.lookup_company_by_email_domain(text) from public;
grant execute on function public.lookup_company_by_email_domain(text)
  to anon, authenticated, service_role;
