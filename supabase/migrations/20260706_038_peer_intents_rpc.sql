-- 038 — Peer trip-intent radar for the Map screen.
--
-- trip_intents RLS is owner-only ("own intents": user_id = auth.uid()), so the
-- map cannot read peers' carpool intents directly. This SECURITY DEFINER RPC
-- (modeled on get_visible_peer_ids, migration 015) exposes the ACTIVE intents
-- of peers the caller is allowed to see — gated by the canonical
-- is_peer_visible(caller, target) predicate — so they can be rendered as
-- tappable avatar markers and chosen for a carpool request.
--
-- Privacy: home coordinates are snapped to a 0.005° grid (~±280 m latitude,
-- ~±160 m longitude at Lithuanian latitudes) — enough to judge "they're near
-- me", never the exact address. Exact coords stay server-side (the matcher
-- and request-carpool use the trip_intents rows directly).
--
-- Statuses: 'pending' and 'unmatched' are choosable; 'matched' users already
-- have a confirmed partner and 'expired' intents are stale — both excluded.

create or replace function public.get_peer_trip_intents(p_trip_date date default null)
returns table (
  user_id uuid,
  role text,
  trip_date date,
  departure_time time,
  approx_home_lat double precision,
  approx_home_long double precision,
  first_name text,
  last_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ti.user_id,
    ti.role,
    ti.trip_date,
    ti.departure_time,
    (round((ti.home_lat  / 0.005)::numeric) * 0.005)::double precision,
    (round((ti.home_long / 0.005)::numeric) * 0.005)::double precision,
    p.first_name,
    p.last_name,
    p.avatar_url
  from public.trip_intents ti
  join public.profiles p on p.id = ti.user_id
  where ti.user_id <> auth.uid()
    and ti.trip_date = coalesce(p_trip_date, current_date + 1)
    and ti.status in ('pending', 'unmatched')
    and ti.home_lat is not null
    and ti.home_long is not null
    and public.is_peer_visible(auth.uid(), ti.user_id);
$$;

revoke all on function public.get_peer_trip_intents(date) from public, anon;
grant execute on function public.get_peer_trip_intents(date) to authenticated;
