-- 048: cancelling a carpool releases it; Impact weeks count credited shares.
--
-- Found in the 2026-10-14 cancel/complete review:
--   1. Cancelling a confirmed carpool ride (trip screen / Activity) only set
--      rides.status. The trip_intent_matches row stayed 'confirmed' and both
--      trip_intents stayed 'matched', so the Map kept saying "Riding with …"
--      for a cancelled ride and neither person could be matched again.
--   2. A participant could cancel a ride after collecting its credit, voiding
--      the other person's completion while keeping their own XP / CO₂.
--   3. get_user_impact's weekly totals summed every completed ride's full
--      co2_saved, but complete-trip credits each carpool participant half — so
--      "this week" disagreed with the all-time total.
--
-- The release lives in a trigger, so every cancel path (cancel-ride, the
-- direct client update older builds use, SQL) leaves the same state.

create or replace function public.release_cancelled_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canceller    uuid := auth.uid();           -- null for server / SQL cancels
  by_passenger boolean := canceller is not null and canceller = new.rider_id;
  by_driver    boolean := canceller is not null and canceller = new.driver_id;
  m            record;
begin
  -- A trip someone already completed happened: end it, don't cancel it.
  if exists (select 1 from public.ride_completions where ride_id = new.id) then
    raise exception 'ride_already_completed'
      using errcode = 'P0001', hint = 'End the trip instead of cancelling it.';
  end if;

  -- Solo and search rides have no match to release.
  if new.driver_id is null or new.rider_id is null then
    return new;
  end if;

  for m in
    update public.trip_intent_matches
       set status = case when by_passenger then 'cancelled_by_passenger' else 'cancelled_by_driver' end,
           updated_at = now()
     where ride_id = new.id
       and status = 'confirmed'
    returning driver_intent_id, passenger_intent_id
  loop
    -- Whoever cancelled starts over (their intent is closed); the other side
    -- goes back into matching, as the "we'll keep looking" push promises.
    update public.trip_intents
       set status = case when by_passenger then 'expired' else 'pending' end
     where id = m.passenger_intent_id;

    -- A driver with other confirmed passengers keeps driving them.
    if not exists (select 1 from public.trip_intent_matches
                    where driver_intent_id = m.driver_intent_id and status = 'confirmed') then
      update public.trip_intents
         set status = case when by_driver then 'expired' else 'pending' end
       where id = m.driver_intent_id;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.release_cancelled_ride() from public, anon, authenticated;

drop trigger if exists release_cancelled_ride_trg on public.rides;
create trigger release_cancelled_ride_trg
  after update of status on public.rides
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.release_cancelled_ride();

-- Weekly totals from what was actually credited to this user (ride_completions),
-- with the carpool half complete-trip credits — consistent with total_co2_saved.
create or replace function public.get_user_impact(user_uuid uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  result          jsonb;
  week_start      timestamptz := date_trunc('week', now());
  last_week_start timestamptz := date_trunc('week', now()) - interval '1 week';
begin
  if auth.uid() is null or auth.uid() <> user_uuid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  with credited as (
    select c.created_at,
           case when r.driver_id is not null and r.rider_id is not null
                then coalesce(r.co2_saved, 0) / 2
                else coalesce(r.co2_saved, 0) end as share
      from public.ride_completions c
      join public.rides r on r.id = c.ride_id
     where c.user_id = user_uuid
       and c.created_at >= last_week_start
  )
  select jsonb_build_object(
    'total_co2_saved', coalesce(p.total_co2_saved, 0),
    'total_trips',     coalesce(p.trips_completed, 0),
    'this_week_co2',   coalesce((select sum(share) from credited where created_at >= week_start), 0),
    'last_week_co2',   coalesce((select sum(share) from credited where created_at < week_start), 0)
  )
  into result
  from public.profiles p
  where p.id = user_uuid;

  return coalesce(result, '{}'::jsonb);
end;
$$;

-- Backfill: confirmed matches whose ride was already cancelled (the bug above).
-- Who cancelled is unknown, so close them neutrally as expired. Intents first,
-- while the stale matches still read as confirmed; a driver intent stays
-- matched if it still has a live confirmed passenger.
update public.trip_intents i
   set status = 'expired'
 where i.status = 'matched'
   and exists (select 1
                 from public.trip_intent_matches m
                 join public.rides r on r.id = m.ride_id
                where r.status = 'cancelled'
                  and m.status = 'confirmed'
                  and i.id in (m.passenger_intent_id, m.driver_intent_id))
   and not exists (select 1
                     from public.trip_intent_matches m2
                     left join public.rides r2 on r2.id = m2.ride_id
                    where m2.driver_intent_id = i.id
                      and m2.status = 'confirmed'
                      and r2.status is distinct from 'cancelled');

update public.trip_intent_matches m
   set status = 'expired', updated_at = now()
  from public.rides r
 where r.id = m.ride_id
   and r.status = 'cancelled'
   and m.status = 'confirmed';
