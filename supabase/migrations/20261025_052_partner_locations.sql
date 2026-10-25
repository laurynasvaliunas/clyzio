-- 052: matched driver and rider see each other on the map.
--
--   Static (from the moment they're matched): the pickup point and the
--   partner's APPROXIMATE start area — their trip intent's home snapped to the
--   same 0.005° grid (~±280 m) the Map's commuter pins use (038). Never an exact
--   home. The pickup point is null when the passenger doesn't share it (the
--   enforce_pickup_address_sharing trigger clears it on the match).
--
--   Live (a confirmed carpool, from 15 min before pickup): each participant's
--   phone posts its position while Clyzio is open; the partner reads it over
--   Realtime. Positions can only be written inside the window
--   [scheduled_at − 15 min, scheduled_at + 3 h] of a live ride, are readable
--   only by the two people on the ride and only inside that window, and are
--   deleted as soon as the ride is completed or cancelled.

-- ── Static: meeting points ───────────────────────────────────────────────────
create or replace function public.get_match_points(
  p_match_id uuid default null,
  p_ride_id  uuid default null
)
returns table (
  match_id           uuid,
  ride_id            uuid,
  partner_id         uuid,
  partner_role       text,      -- 'driver' | 'rider', from the caller's side
  pickup_lat         double precision,
  pickup_long        double precision,
  partner_start_lat  double precision,
  partner_start_long double precision
)
language sql
stable security definer
set search_path to 'public'
as $$
  select m.id,
         m.ride_id,
         case when m.driver_user_id = auth.uid() then m.passenger_user_id else m.driver_user_id end,
         case when m.driver_user_id = auth.uid() then 'rider' else 'driver' end,
         coalesce(m.custom_pickup_lat, m.pickup_lat),
         coalesce(m.custom_pickup_long, m.pickup_long),
         (round((pi.home_lat  / 0.005)::numeric) * 0.005)::double precision,
         (round((pi.home_long / 0.005)::numeric) * 0.005)::double precision
    from public.trip_intent_matches m
    join public.trip_intents pi
      on pi.id = case when m.driver_user_id = auth.uid() then m.passenger_intent_id else m.driver_intent_id end
   where (m.id = p_match_id or m.ride_id = p_ride_id)
     and auth.uid() in (m.driver_user_id, m.passenger_user_id)
     and m.status in ('pending', 'awaiting_other', 'confirmed');
$$;

revoke execute on function public.get_match_points(uuid, uuid) from public, anon;
grant execute on function public.get_match_points(uuid, uuid) to authenticated;

-- ── Live: positions inside the trip window ───────────────────────────────────
create table if not exists public.ride_live_locations (
  ride_id    uuid not null references public.rides(id) on delete cascade,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  lat        double precision not null check (lat between -90 and 90),
  lng        double precision not null check (lng between -180 and 180),
  heading    double precision,
  accuracy   double precision,
  updated_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

/** The caller is on this carpool ride and its live window is open. */
create or replace function public.ride_live_window_open(p_ride_id uuid)
returns boolean
language sql
stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.rides r
     where r.id = p_ride_id
       and r.driver_id is not null and r.rider_id is not null
       and auth.uid() in (r.driver_id, r.rider_id)
       and r.status in ('scheduled', 'accepted', 'in_progress')
       and now() between r.scheduled_at - interval '15 minutes'
                     and r.scheduled_at + interval '3 hours'
  );
$$;

revoke execute on function public.ride_live_window_open(uuid) from public, anon;
grant execute on function public.ride_live_window_open(uuid) to authenticated;

alter table public.ride_live_locations enable row level security;

drop policy if exists "ride partners read live locations" on public.ride_live_locations;
create policy "ride partners read live locations" on public.ride_live_locations
  for select to authenticated
  using (public.ride_live_window_open(ride_id));

drop policy if exists "share own live location" on public.ride_live_locations;
create policy "share own live location" on public.ride_live_locations
  for insert to authenticated
  with check (user_id = auth.uid() and public.ride_live_window_open(ride_id));

drop policy if exists "update own live location" on public.ride_live_locations;
create policy "update own live location" on public.ride_live_locations
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.ride_live_window_open(ride_id));

drop policy if exists "stop sharing own live location" on public.ride_live_locations;
create policy "stop sharing own live location" on public.ride_live_locations
  for delete to authenticated
  using (user_id = auth.uid());

grant select, insert, update, delete on public.ride_live_locations to authenticated;

-- Forget positions as soon as the ride is over.
create or replace function public.clear_live_locations_on_ride_end()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.status in ('completed', 'cancelled') and old.status is distinct from new.status then
    delete from public.ride_live_locations where ride_id = new.id;
  end if;
  return new;
end;
$$;

revoke execute on function public.clear_live_locations_on_ride_end() from public, anon, authenticated;

drop trigger if exists clear_live_locations_on_ride_end_trg on public.rides;
create trigger clear_live_locations_on_ride_end_trg
  after update of status on public.rides
  for each row execute function public.clear_live_locations_on_ride_end();

-- The partner follows position updates over Realtime.
do $$
begin
  if not exists (select 1 from pg_publication_tables
                  where pubname = 'supabase_realtime' and schemaname = 'public'
                    and tablename = 'ride_live_locations') then
    alter publication supabase_realtime add table public.ride_live_locations;
  end if;
end $$;
