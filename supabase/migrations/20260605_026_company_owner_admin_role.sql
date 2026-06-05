-- 026 — Make the company owner a real company admin (so is_company_admin() works).
--
-- promote_company_admin() (AFTER INSERT ON companies) previously only set
-- profiles.is_manager for the owner. But is_company_admin() — which gates
-- company_domains RLS, verify_company_domain(), and backfill_company_domain() —
-- checks for a user_roles row with role='admin' scoped to that company. That row
-- was never created by the app flow, so every admin-gated feature was unreachable
-- for company owners.
--
-- Fix: on company creation, also grant the company-scoped 'admin' role
-- (idempotent), and backfill existing companies' owners. The admin grant lives
-- in user_roles (which has no protected-column guard); the migration's
-- profiles.is_manager backfill runs as service_role, which the
-- guard_profile_protected_columns trigger's WHEN clause already exempts.

create or replace function public.promote_company_admin()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.admin_user_id is not null then
    -- Owner becomes a manager of this company (dashboard + member management).
    update public.profiles
       set is_manager = true, company_id = new.id, is_solo_user = false
     where id = new.admin_user_id;

    -- ...and a company-scoped admin so is_company_admin() returns true
    -- (domain management, verify/backfill). Idempotent.
    if not exists (
      select 1 from public.user_roles
       where user_id = new.admin_user_id
         and role = 'admin'
         and company_id = new.id
    ) then
      insert into public.user_roles (user_id, role, company_id)
      values (new.admin_user_id, 'admin', new.id);
    end if;
  end if;
  return new;
end;
$$;

-- ── Backfill existing companies ──────────────────────────────────────────────

-- Owners → managers, linked to their company.
update public.profiles p
   set is_manager = true, is_solo_user = false, company_id = c.id
  from public.companies c
 where c.admin_user_id = p.id
   and (p.is_manager  is distinct from true
        or p.company_id is distinct from c.id
        or p.is_solo_user is distinct from false);

-- Owners → company-scoped admin role (idempotent).
insert into public.user_roles (user_id, role, company_id)
select c.admin_user_id, 'admin', c.id
  from public.companies c
 where c.admin_user_id is not null
   and not exists (
     select 1 from public.user_roles ur
      where ur.user_id = c.admin_user_id
        and ur.role = 'admin'
        and ur.company_id = c.id
   );
