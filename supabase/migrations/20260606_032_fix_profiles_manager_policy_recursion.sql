-- 032 — HOTFIX: infinite recursion in profiles RLS.
-- The "Managers can view same-company profiles" SELECT policy contained an inline
-- `EXISTS (SELECT FROM profiles …)` which re-invokes profiles' SELECT policies →
-- "infinite recursion detected in policy for relation profiles" (broke edit-profile
-- Save, and any query evaluating profiles SELECT policies). Replace the inline
-- self-reference with a SECURITY DEFINER helper that bypasses RLS.
create or replace function public.current_user_is_manager()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce((select is_manager from public.profiles where id = auth.uid()), false)
$$;

revoke all on function public.current_user_is_manager() from public;
grant execute on function public.current_user_is_manager() to authenticated;

drop policy if exists "Managers can view same-company profiles" on public.profiles;
create policy "Managers can view same-company profiles" on public.profiles
  for select to authenticated
  using (
    company_id is not null
    and company_id = public.get_user_company_id(auth.uid())
    and public.current_user_is_manager()
  );
