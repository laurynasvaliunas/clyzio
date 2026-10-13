-- 047 — Live carpool updates + carpool CO₂ counted against driving alone.
--
-- 1. Realtime: the supabase_realtime publication only contained `messages`, so
--    the app's subscriptions to trip_intent_matches (daily-commute review /
--    waiting screens), rides (map live search) and carpool_suggestions never
--    fired — a rider stayed on "waiting for them" after the driver approved.
--    Subscribers still only receive rows their RLS SELECT policies allow.
--
-- 2. CO₂: carpool savings were distance × (passenger's weekly baseline − the
--    carpool factor), which is 0 for anyone whose weekly mix is below 0.096
--    kg/km. A carpool now saves one car's emissions — distance × the driver's
--    car factor (emission_factor by profiles.car_fuel_type, petrol default) —
--    split 50/50 by complete-trip, which already halves co2_saved for carpools.
--    Solo rides are unchanged.
--
-- 3. Backfill scheduled/active carpool rides created before respond-to-match
--    copied addresses, and recompute their co2_saved.

begin;

-- ── 1. Realtime ──────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['trip_intent_matches', 'rides', 'carpool_suggestions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ── 2. Carpool CO₂ ───────────────────────────────────────────────────────────
create or replace function public.enforce_ride_co2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner       uuid := coalesce(new.rider_id, new.driver_id);
  v_baseline    double precision;
  v_mode_factor double precision;
  v_car_factor  double precision;
  v_dist        double precision;
begin
  if v_owner is null then
    raise exception 'ride must have rider_id or driver_id' using errcode = '23514';
  end if;

  if new.origin_lat is null or new.origin_long is null
     or new.dest_lat is null or new.dest_long is null then
    v_dist := 0;
  else
    v_dist := 6371 * 2 * asin(sqrt(
        power(sin(radians(new.dest_lat - new.origin_lat) / 2), 2)
      + cos(radians(new.origin_lat)) * cos(radians(new.dest_lat))
        * power(sin(radians(new.dest_long - new.origin_long) / 2), 2)
    ));
  end if;
  if v_dist is null or v_dist > 200 then
    v_dist := 0;
  end if;
  new.distance_km := round(v_dist::numeric, 3);

  -- Carpool: one car instead of two — the saving is the driver's car on this
  -- distance (complete-trip credits each participant half).
  if new.transport_mode = 'carpool' or (new.driver_id is not null and new.rider_id is not null) then
    select ef.co2_per_km into v_car_factor
    from public.profiles p
    join public.emission_factor ef on ef.kind = 'fuel' and ef.key = p.car_fuel_type
    where p.id = new.driver_id;
    new.co2_saved := round((v_dist * coalesce(v_car_factor, 0.192))::numeric, 3);
    return new;
  end if;

  select coalesce(baseline_co2, 0.192) into v_baseline
  from public.profiles where id = v_owner;
  v_baseline := coalesce(v_baseline, 0.192);

  select co2_per_km into v_mode_factor
  from public.transport_mode_catalog where id = new.transport_mode;
  v_mode_factor := coalesce(v_mode_factor, v_baseline);

  new.co2_saved := round(greatest(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);

  return new;
end
$$;

-- ── 3. Backfill open carpool rides ───────────────────────────────────────────
-- Addresses (and the trip's own destination) from the match that created the
-- ride; the BEFORE UPDATE trigger above recomputes co2_saved on the same write.
update public.rides r
   set origin_address = coalesce(r.origin_address, m.pickup_address, pi.origin_address),
       dest_address   = coalesce(r.dest_address, di.dest_address, dp.work_address),
       dest_lat       = coalesce(di.work_lat, r.dest_lat),
       dest_long      = coalesce(di.work_long, r.dest_long)
  from public.trip_intent_matches m
  join public.trip_intents di on di.id = m.driver_intent_id
  join public.trip_intents pi on pi.id = m.passenger_intent_id
  join public.profiles dp on dp.id = m.driver_user_id
 where m.ride_id = r.id
   and r.status in ('scheduled', 'active');

-- Any other open carpool ride: recompute co2_saved only.
update public.rides
   set co2_saved = co2_saved
 where status in ('scheduled', 'active')
   and (transport_mode = 'carpool' or (driver_id is not null and rider_id is not null));

commit;
