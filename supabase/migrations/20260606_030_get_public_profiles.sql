-- 030 — Peer-visible public profile fields (map radar names + public profile
-- screen). profiles SELECT RLS is own-row + managers-only, so this SECURITY
-- DEFINER function gated by is_peer_visible() is the canonical way to expose
-- safe peer fields to the client.
create or replace function public.get_public_profiles(p_ids uuid[])
returns table (
  id uuid, first_name text, last_name text, avatar_url text, department text,
  total_co2_saved numeric, trips_completed int, level int
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select p.id, p.first_name, p.last_name, p.avatar_url, p.department,
         p.total_co2_saved, p.trips_completed, p.level
  from public.profiles p
  where p.id = any(p_ids)
    and public.is_peer_visible(auth.uid(), p.id);
$$;

revoke all on function public.get_public_profiles(uuid[]) from public;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;
