-- 053: one carpool lifecycle for every path, and riders along the driver's route.
--
-- Found in the 2026-10-25 matching review:
--   1. A decline / withdraw closed the match but left both trip intents
--      'matched', and only 'pending' intents are matched — so neither person
--      was ever matched again. Same for a driver with seats left: one match and
--      the matcher never offered them anyone else.
--   2. A cancelled pair could never match again: the (driver_intent_id,
--      passenger_intent_id) unique index plus intent rows reused per date.
--   3. Re-submitting a date reset the intent to 'pending' but left its old
--      matches — even a confirmed ride — alive.
--   4. Both people approving at the same moment each saw the other "not yet",
--      so the match stuck in awaiting_other with no ride.
--   5. A completed trip left both intents 'matched': no second carpool that day.
--   6. Nothing re-ran matching when someone was released, except cancel-ride.
--
-- The rules now live in the database (as 048 did for cancels), so the edge
-- functions, old app builds and SQL all leave the same state:
--   • intent: pending = searching, matched = has a live match, expired = closed
--     (cancelled, replaced, trip done or its time passed). 'unmatched' retired.
--   • a match is live while pending / awaiting_other, or confirmed until its
--     ride is completed or cancelled.
--   • reopening a closed intent starts a new GENERATION: its old matches stop
--     counting, and a pair that didn't work out can be matched again later.
--   • whenever an intent starts searching (new, re-submitted, released) or a
--     driver's seat frees up, the matcher is called for it straight away.
--
-- Also adds what mid-route matching needs: the leaving moment (departs_at),
-- the pickup kind (walk to the route / driver comes to the door), the drop-off
-- and the pickup time as a timestamp.

-- ── 1. Columns ──────────────────────────────────────────────────────────────
alter table public.trip_intents
  add column if not exists generation        int not null default 1,
  add column if not exists tz_offset_minutes int,
  add column if not exists departs_at        timestamptz;

alter table public.trip_intent_matches
  add column if not exists driver_generation    int not null default 1,
  add column if not exists passenger_generation int not null default 1,
  add column if not exists pickup_kind          text check (pickup_kind in ('route', 'door')),
  add column if not exists pickup_at            timestamptz,
  add column if not exists walk_to_pickup_m     int,
  add column if not exists detour_km            double precision,
  add column if not exists detour_min           int,
  add column if not exists dropoff_lat          double precision,
  add column if not exists dropoff_long         double precision,
  add column if not exists dropoff_address      text,
  add column if not exists walk_from_dropoff_m  int,
  add column if not exists proposed_dropoff_time time,
  add column if not exists shared_km            double precision;

-- ── 2. Helpers ──────────────────────────────────────────────────────────────
-- The leaving moment: trip_date + departure_time on the phone's clock.
-- tz_offset_minutes is Date.getTimezoneOffset() (+ve west of UTC); older
-- builds don't send it, and the app's commuters are in Lithuania.
create or replace function public.intent_departs_at(p_date date, p_time time, p_offset int)
returns timestamptz
language sql
stable
as $$
  select case
           when p_date is null or p_time is null then null
           when p_offset is null then (p_date + p_time) at time zone 'Europe/Vilnius'
           else ((p_date + p_time) at time zone 'UTC') + make_interval(mins => p_offset)
         end;
$$;

create or replace function public.carpool_match_is_live(p_status text, p_ride uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_status in ('pending', 'awaiting_other')
      or (p_status = 'confirmed'
          and coalesce((select r.status from public.rides r where r.id = p_ride), 'scheduled')
              not in ('completed', 'cancelled'));
$$;

-- Live matches of an intent's current generation (offers count: they hold a seat).
create or replace function public.carpool_live_matches(p_intent uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
    from public.trip_intents i
    join public.trip_intent_matches m
      on (m.driver_intent_id = i.id and m.driver_generation = i.generation)
      or (m.passenger_intent_id = i.id and m.passenger_generation = i.generation)
   where i.id = p_intent
     and public.carpool_match_is_live(m.status, m.ride_id);
$$;

create or replace function public.carpool_free_seats(p_intent uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case when i.role = 'driver'
              then greatest(coalesce(i.passenger_capacity, 1) - public.carpool_live_matches(i.id), 0)
              else 0 end
    from public.trip_intents i
   where i.id = p_intent;
$$;

-- ── 3. Backfill what the constraints below rely on ──────────────────────────
update public.trip_intents
   set departs_at = public.intent_departs_at(trip_date, departure_time, tz_offset_minutes)
 where departs_at is null and departure_time is not null;

-- Offers from days that have passed (the hourly job only did this for some).
update public.trip_intent_matches
   set status = 'expired', updated_at = now()
 where status in ('pending', 'awaiting_other')
   and trip_date < current_date;

-- ── 4. Constraints ──────────────────────────────────────────────────────────
-- One trip per person per day (always assumed by the app's .maybeSingle()).
alter table public.trip_intents
  drop constraint if exists trip_intents_user_date_key;
alter table public.trip_intents
  add constraint trip_intents_user_date_key unique (user_id, trip_date);

-- A pair is offered once per pair of generations, not once forever.
drop index if exists public.trip_intent_matches_pair_uniq;
create unique index if not exists trip_intent_matches_pair_gen_uniq
  on public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_generation, passenger_generation);

-- A rider has at most one live match: one offer to answer, or one ride.
create unique index if not exists trip_intent_matches_one_live_per_rider
  on public.trip_intent_matches (passenger_intent_id, passenger_generation)
  where status in ('pending', 'awaiting_other', 'confirmed');

-- ── 5. Intent writes: leaving moment + generations ─────────────────────────
create or replace function public.trip_intent_before_write()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.departs_at := public.intent_departs_at(new.trip_date, new.departure_time, new.tz_offset_minutes);
  -- Reopening a closed trip starts a new generation: its old matches
  -- (declined, cancelled, done) no longer count.
  if tg_op = 'UPDATE' and old.status = 'expired' and new.status <> 'expired' then
    new.generation := old.generation + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trip_intent_before_write_trg on public.trip_intents;
create trigger trip_intent_before_write_trg
  before insert or update on public.trip_intents
  for each row execute function public.trip_intent_before_write();

-- ── 6. Immediate re-match ───────────────────────────────────────────────────
-- Same call the cron jobs make (049): the matcher's targeted mode for one
-- intent. pg_net sends it after commit; a rolled-back change sends nothing.
create or replace function public.queue_carpool_rematch(p_intent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i      public.trip_intents;
  secret text;
begin
  select * into i from public.trip_intents where id = p_intent;
  if i.id is null
     or i.status = 'expired'
     or i.trip_date < current_date
     or i.departs_at < now() - interval '15 minutes' then
    return;
  end if;

  select decrypted_secret into secret from vault.decrypted_secrets where name = 'cron_shared_secret';
  if secret is null then
    return;
  end if;

  perform net.http_post(
    url := 'https://qvevbbqcrizfywqexlkw.supabase.co/functions/v1/daily-commute-matcher',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', secret),
    body := jsonb_build_object('trip_date', i.trip_date, 'new_intent_id', i.id),
    timeout_milliseconds := 60000
  );
end;
$$;

create or replace function public.after_trip_intent_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending'
     and (tg_op = 'INSERT'
          or old.status is distinct from 'pending'
          or old.generation is distinct from new.generation) then
    perform public.queue_carpool_rematch(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists after_trip_intent_write_trg on public.trip_intents;
create trigger after_trip_intent_write_trg
  after insert or update of status, generation on public.trip_intents
  for each row execute function public.after_trip_intent_write();

-- ── 7. Intent status follows its matches ────────────────────────────────────
-- Never reopens a closed intent: closing is a person's decision (cancel, stop
-- looking, replace) or the trip being over.
create or replace function public.refresh_intent_status(p_intent uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  i      public.trip_intents;
  v_done boolean;
  v_next text;
begin
  select * into i from public.trip_intents where id = p_intent;
  if i.id is null or i.status = 'expired' then
    return;
  end if;

  v_done := exists (
    select 1
      from public.trip_intent_matches m
      join public.rides r on r.id = m.ride_id
     where ((m.driver_intent_id = i.id and m.driver_generation = i.generation)
         or (m.passenger_intent_id = i.id and m.passenger_generation = i.generation))
       and m.status = 'confirmed'
       and r.status = 'completed'
  );

  v_next := case
            when public.carpool_live_matches(i.id) > 0 then 'matched'
            when v_done
              or i.trip_date < current_date
              or i.departs_at < now() - interval '1 hour' then 'expired'
            else 'pending'
          end;

  if v_next is distinct from i.status then
    update public.trip_intents set status = v_next where id = i.id;
  end if;
end;
$$;

create or replace function public.after_carpool_match_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_intent_status(new.driver_intent_id);
  perform public.refresh_intent_status(new.passenger_intent_id);

  -- A seat came free on a trip that still has other passengers: look for
  -- another rider. (A driver left with nobody is back to 'pending', which
  -- queues the same call through after_trip_intent_write.)
  if tg_op = 'UPDATE'
     and old.status in ('pending', 'awaiting_other', 'confirmed')
     and new.status not in ('pending', 'awaiting_other', 'confirmed')
     and (select status from public.trip_intents where id = new.driver_intent_id) = 'matched' then
    perform public.queue_carpool_rematch(new.driver_intent_id);
  end if;
  return null;
end;
$$;

drop trigger if exists after_carpool_match_change_trg on public.trip_intent_matches;
create trigger after_carpool_match_change_trg
  after insert or update of status on public.trip_intent_matches
  for each row execute function public.after_carpool_match_change();

-- A completed ride ends the trip for both (the match stays 'confirmed').
create or replace function public.refresh_intents_for_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  m record;
begin
  for m in
    select driver_intent_id, passenger_intent_id from public.trip_intent_matches where ride_id = new.id
  loop
    perform public.refresh_intent_status(m.driver_intent_id);
    perform public.refresh_intent_status(m.passenger_intent_id);
  end loop;
  return null;
end;
$$;

drop trigger if exists refresh_intents_on_ride_done_trg on public.rides;
create trigger refresh_intents_on_ride_done_trg
  after update of status on public.rides
  for each row
  when (new.status = 'completed' and old.status is distinct from 'completed')
  execute function public.refresh_intents_for_ride();

-- ── 8. New matches: generations, seats, open trips only ─────────────────────
create or replace function public.guard_carpool_match()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d public.trip_intents;
  p public.trip_intents;
begin
  -- Lock the driver's trip so two offers can't take the last seat together.
  select * into d from public.trip_intents where id = new.driver_intent_id for update;
  select * into p from public.trip_intents where id = new.passenger_intent_id;

  if d.id is null or p.id is null then
    raise exception 'intent_missing' using errcode = 'P0001';
  end if;
  if d.role <> 'driver' or p.role <> 'passenger'
     or d.user_id <> new.driver_user_id or p.user_id <> new.passenger_user_id then
    raise exception 'match_parties_mismatch' using errcode = 'P0001';
  end if;
  if d.status = 'expired' or p.status = 'expired' then
    raise exception 'intent_closed' using errcode = 'P0001';
  end if;
  if d.trip_date <> p.trip_date then
    raise exception 'trip_date_mismatch' using errcode = 'P0001';
  end if;

  new.trip_date            := d.trip_date;
  new.driver_generation    := d.generation;
  new.passenger_generation := p.generation;

  if new.status in ('pending', 'awaiting_other', 'confirmed')
     and public.carpool_live_matches(d.id) >= coalesce(d.passenger_capacity, 1) then
    raise exception 'no_seats_left' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_carpool_match_trg on public.trip_intent_matches;
create trigger guard_carpool_match_trg
  before insert on public.trip_intent_matches
  for each row execute function public.guard_carpool_match();

-- A pickup ON the driver's route is a meeting point, not the rider's home, so
-- it stays visible when the rider doesn't share their address (it used to be
-- cleared too, leaving the ride without an origin). Door pickups and older
-- rows keep the rule.
create or replace function public.enforce_pickup_address_sharing()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_share boolean;
begin
  if new.pickup_kind = 'route' then
    return new;
  end if;

  select share_pickup_address into v_share from public.profiles where id = new.passenger_user_id;

  if coalesce(v_share, true) = false then
    new.pickup_lat := null;
    new.pickup_long := null;
    new.pickup_address := null;
    new.custom_pickup_lat := null;
    new.custom_pickup_long := null;
  end if;

  return new;
end;
$$;

-- ── 9. Cancelling a carpool ride (replaces 048/049) ─────────────────────────
-- Whoever cancelled starts over: their trip closes (a driver with other live
-- passengers keeps it). The match is released, and after_carpool_match_change
-- puts the other person back into matching — or closes their trip when its day
-- or time has passed. A cancel with no caller (cron, SQL) closes nobody.
create or replace function public.release_cancelled_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canceller uuid := auth.uid();
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

  -- Close the canceller's trip first, so releasing the match below can't
  -- reopen it.
  if canceller is not null and canceller in (new.driver_id, new.rider_id) then
    update public.trip_intents i
       set status = 'expired'
     where i.status <> 'expired'
       and i.id in (select case when canceller = new.driver_id then m.driver_intent_id else m.passenger_intent_id end
                      from public.trip_intent_matches m
                     where m.ride_id = new.id and m.status = 'confirmed')
       and not exists (select 1
                         from public.trip_intent_matches o
                        where ((o.driver_intent_id = i.id and o.driver_generation = i.generation)
                            or (o.passenger_intent_id = i.id and o.passenger_generation = i.generation))
                          and o.ride_id is distinct from new.id
                          and public.carpool_match_is_live(o.status, o.ride_id));
  end if;

  update public.trip_intent_matches
     set status = case
                    when canceller = new.rider_id then 'cancelled_by_passenger'
                    when canceller = new.driver_id then 'cancelled_by_driver'
                    when trip_date < current_date then 'expired'   -- closed by the stale-ride job
                    else 'cancelled_by_driver'
                  end,
         updated_at = now()
   where ride_id = new.id
     and status = 'confirmed';

  return new;
end;
$$;

-- ── 10. Answering a match, atomically ───────────────────────────────────────
-- Called by respond-to-match (service role) with the ride it would create.
-- The match row is locked, so two approvals at the same moment confirm once.
create or replace function public.respond_carpool_match(
  p_match  uuid,
  p_user   uuid,
  p_accept boolean,
  p_ride   jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m          public.trip_intent_matches;
  d          public.trip_intents;
  is_driver  boolean;
  first_time boolean;
  v_ride     uuid;
begin
  select * into m from public.trip_intent_matches where id = p_match for update;
  if m.id is null then
    raise exception 'match_not_found' using errcode = 'P0002';
  end if;
  if p_user is distinct from m.driver_user_id and p_user is distinct from m.passenger_user_id then
    raise exception 'not_a_participant' using errcode = '42501';
  end if;
  is_driver := p_user = m.driver_user_id;

  -- Already answered (confirmed, cancelled, expired): report it, change nothing.
  if m.status not in ('pending', 'awaiting_other') then
    return jsonb_build_object('status', m.status, 'ride_id', m.ride_id, 'changed', false);
  end if;

  if not p_accept then
    update public.trip_intent_matches
       set status = case when is_driver then 'cancelled_by_driver' else 'cancelled_by_passenger' end,
           updated_at = now()
     where id = m.id
    returning * into m;
    return jsonb_build_object('status', m.status, 'changed', true);
  end if;

  first_time := not (case when is_driver then m.driver_approved else m.passenger_approved end);
  if is_driver then m.driver_approved := true; else m.passenger_approved := true; end if;

  if not (m.driver_approved and m.passenger_approved) then
    update public.trip_intent_matches
       set driver_approved = m.driver_approved,
           passenger_approved = m.passenger_approved,
           status = 'awaiting_other',
           updated_at = now()
     where id = m.id;
    return jsonb_build_object('status', 'awaiting_other', 'changed', first_time);
  end if;

  -- Both have approved. Seats are re-checked against confirmed passengers; if
  -- the car filled up meanwhile, the offer lapses and the rider is re-matched.
  select * into d from public.trip_intents where id = m.driver_intent_id for update;
  if (select count(*)
        from public.trip_intent_matches o
       where o.driver_intent_id = d.id
         and o.driver_generation = d.generation
         and o.id <> m.id
         and o.status = 'confirmed'
         and public.carpool_match_is_live(o.status, o.ride_id)) >= coalesce(d.passenger_capacity, 1) then
    update public.trip_intent_matches set status = 'expired', updated_at = now() where id = m.id;
    return jsonb_build_object('status', 'expired', 'reason', 'no_seats_left', 'changed', true);
  end if;

  if p_ride is null then
    raise exception 'ride_payload_missing' using errcode = 'P0001';
  end if;

  insert into public.rides (
    driver_id, rider_id, status,
    origin_lat, origin_long, origin_address,
    dest_lat, dest_long, dest_address,
    share_origin_address, scheduled_at, transport_mode, transport_label
  ) values (
    m.driver_user_id, m.passenger_user_id, 'scheduled',
    (p_ride->>'origin_lat')::double precision, (p_ride->>'origin_long')::double precision, p_ride->>'origin_address',
    (p_ride->>'dest_lat')::double precision, (p_ride->>'dest_long')::double precision, p_ride->>'dest_address',
    coalesce((p_ride->>'share_origin_address')::boolean, true),
    (p_ride->>'scheduled_at')::timestamptz, 'carpool', 'Carpool'
  )
  returning id into v_ride;

  update public.trip_intent_matches
     set driver_approved = true,
         passenger_approved = true,
         status = 'confirmed',
         ride_id = v_ride,
         updated_at = now()
   where id = m.id;

  return jsonb_build_object('status', 'confirmed', 'ride_id', v_ride, 'changed', true);
end;
$$;

-- ── 11. Closing a trip (stop looking / replace) ─────────────────────────────
-- Refused while a carpool on it is confirmed: that is cancelled through the
-- ride, which tells the partner. Returns the open matches it released.
create or replace function public.close_trip_intent(p_intent uuid, p_user uuid)
returns table (match_id uuid, partner_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  i      public.trip_intents;
  v_ride uuid;
begin
  select * into i from public.trip_intents where id = p_intent for update;
  if i.id is null or i.user_id <> p_user then
    raise exception 'intent_not_found' using errcode = 'P0002';
  end if;
  if i.status = 'expired' then
    return;
  end if;

  select m.ride_id into v_ride
    from public.trip_intent_matches m
   where ((m.driver_intent_id = i.id and m.driver_generation = i.generation)
       or (m.passenger_intent_id = i.id and m.passenger_generation = i.generation))
     and m.status = 'confirmed'
     and public.carpool_match_is_live(m.status, m.ride_id)
   limit 1;
  if found then
    raise exception 'has_confirmed_ride' using errcode = 'P0001', detail = v_ride::text;
  end if;

  -- Close first so releasing the matches can't reopen it.
  update public.trip_intents set status = 'expired' where id = i.id;

  return query
    update public.trip_intent_matches m
       set status = case when i.role = 'driver' then 'cancelled_by_driver' else 'cancelled_by_passenger' end,
           updated_at = now()
     where ((m.driver_intent_id = i.id and m.driver_generation = i.generation)
         or (m.passenger_intent_id = i.id and m.passenger_generation = i.generation))
       and m.status in ('pending', 'awaiting_other')
    returning m.id, case when i.role = 'driver' then m.passenger_user_id else m.driver_user_id end;
end;
$$;

-- ── 12. Submitting a trip ───────────────────────────────────────────────────
-- Creates the day's trip, or replaces it: the old one is closed (its open
-- matches released) and the row reopens as a new generation. One transaction,
-- serialised per person and day, so a double tap can't create two.
create or replace function public.submit_trip_intent(p_user uuid, p_trip_date date, p_fields jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  existing public.trip_intents;
  saved    public.trip_intents;
  released jsonb := '[]'::jsonb;
  v_role   text := p_fields->>'role';
begin
  perform pg_advisory_xact_lock(hashtext('trip_intent:' || p_user::text || ':' || p_trip_date::text));

  select * into existing from public.trip_intents where user_id = p_user and trip_date = p_trip_date for update;

  if existing.id is not null then
    select coalesce(jsonb_agg(jsonb_build_object('match_id', c.match_id, 'partner_user_id', c.partner_user_id)), '[]'::jsonb)
      into released
      from public.close_trip_intent(existing.id, p_user) c;

    update public.trip_intents
       set role                  = v_role,
           status                = 'pending',
           passenger_capacity    = case when v_role = 'driver' then (p_fields->>'passenger_capacity')::int end,
           departure_time        = (p_fields->>'departure_time')::time,
           required_arrival_time = case when v_role = 'passenger' then (p_fields->>'required_arrival_time')::time end,
           tz_offset_minutes     = (p_fields->>'tz_offset_minutes')::int,
           open_to_independents  = coalesce((p_fields->>'open_to_independents')::boolean, false),
           home_lat              = (p_fields->>'home_lat')::double precision,
           home_long             = (p_fields->>'home_long')::double precision,
           work_lat              = (p_fields->>'work_lat')::double precision,
           work_long             = (p_fields->>'work_long')::double precision,
           origin_lat            = (p_fields->>'origin_lat')::double precision,
           origin_long           = (p_fields->>'origin_long')::double precision,
           dest_lat              = (p_fields->>'dest_lat')::double precision,
           dest_long             = (p_fields->>'dest_long')::double precision,
           origin_address        = p_fields->>'origin_address',
           dest_address          = p_fields->>'dest_address'
     where id = existing.id
    returning * into saved;
  else
    insert into public.trip_intents (
      user_id, trip_date, role, status, passenger_capacity, departure_time, required_arrival_time,
      tz_offset_minutes, open_to_independents, home_lat, home_long, work_lat, work_long,
      origin_lat, origin_long, dest_lat, dest_long, origin_address, dest_address
    ) values (
      p_user, p_trip_date, v_role, 'pending',
      case when v_role = 'driver' then (p_fields->>'passenger_capacity')::int end,
      (p_fields->>'departure_time')::time,
      case when v_role = 'passenger' then (p_fields->>'required_arrival_time')::time end,
      (p_fields->>'tz_offset_minutes')::int,
      coalesce((p_fields->>'open_to_independents')::boolean, false),
      (p_fields->>'home_lat')::double precision, (p_fields->>'home_long')::double precision,
      (p_fields->>'work_lat')::double precision, (p_fields->>'work_long')::double precision,
      (p_fields->>'origin_lat')::double precision, (p_fields->>'origin_long')::double precision,
      (p_fields->>'dest_lat')::double precision, (p_fields->>'dest_long')::double precision,
      p_fields->>'origin_address', p_fields->>'dest_address'
    )
    returning * into saved;
  end if;

  return jsonb_build_object('intent', to_jsonb(saved), 'released', released);
end;
$$;

-- ── 13. Hourly clean-up (replaces the inline clyzio-expire-stale command) ───
create or replace function public.expire_stale_carpool()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Offers whose pickup time (or day) has passed.
  update public.trip_intent_matches
     set status = 'expired', updated_at = now()
   where status in ('pending', 'awaiting_other')
     and (trip_date < current_date or pickup_at < now());

  -- Trips still searching an hour after leaving time, or from a past day.
  update public.trip_intents
     set status = 'expired'
   where status in ('pending', 'unmatched')
     and (trip_date < current_date or departs_at < now() - interval '1 hour');

  -- Backstop for past trips whose ride nobody closed (close-stale-rides closes
  -- rides a day after their time; their intents follow through the triggers).
  update public.trip_intents
     set status = 'expired'
   where status = 'matched'
     and trip_date < current_date - 2;
end;
$$;

do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'clyzio-expire-stale' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule('clyzio-expire-stale', '15 * * * *', $$ select public.expire_stale_carpool(); $$);

-- ── 14. Map radar: drivers with a free seat are still choosable ─────────────
-- 045's version, with "searching" no longer meaning only status 'pending'.
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
  avatar_url text,
  is_colleague boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select company_id from public.profiles where id = auth.uid()
  ), day as (
    select coalesce(p_trip_date, current_date + 1) as d
  )
  select
    ti.user_id,
    ti.role,
    ti.trip_date,
    ti.departure_time,
    (round((ti.home_lat  / 0.005)::numeric) * 0.005)::double precision,
    (round((ti.home_long / 0.005)::numeric) * 0.005)::double precision,
    p.first_name,
    p.last_name,
    p.avatar_url,
    (me.company_id is not null and me.company_id = p.company_id) as is_colleague
  from public.trip_intents ti
  join public.profiles p on p.id = ti.user_id
  cross join day
  left join me on true
  where ti.user_id <> auth.uid()
    and ti.trip_date = day.d
    -- Searching riders, and drivers who still have a free seat.
    and (ti.status = 'pending'
         or (ti.role = 'driver' and ti.status = 'matched' and public.carpool_free_seats(ti.id) > 0))
    and ti.home_lat is not null
    and ti.home_long is not null
    and public.is_peer_visible(auth.uid(), ti.user_id)
    and (
      -- Same type (colleagues / independents / two companies): person rule only.
      (me.company_id is null) = (p.company_id is null)
      -- Independent looking at an employee: that trip must be open.
      or (p.company_id is not null and ti.open_to_independents)
      -- Employee looking at an independent: their own trip that day is open.
      or (me.company_id is not null and exists (
            select 1 from public.trip_intents mine
            where mine.user_id = auth.uid()
              and mine.trip_date = day.d
              and mine.open_to_independents
              and mine.status in ('pending', 'matched')))
    );
$$;

-- ── 15. Backfill statuses under the new rules ───────────────────────────────
-- 'unmatched' riders are searching again (the matcher is called for each).
update public.trip_intents
   set status = 'pending'
 where status = 'unmatched'
   and trip_date >= current_date;

-- 'matched' intents left behind by declines become searching (or closed).
select public.refresh_intent_status(id)
  from public.trip_intents
 where status in ('pending', 'matched');

update public.trip_intents
   set status = 'expired'
 where status <> 'expired'
   and trip_date < current_date;

-- ── 16. Privileges ──────────────────────────────────────────────────────────
revoke all on function public.intent_departs_at(date, time, int) from public, anon;
grant execute on function public.intent_departs_at(date, time, int) to authenticated, service_role;
revoke all on function public.carpool_match_is_live(text, uuid) from public, anon, authenticated;
revoke all on function public.carpool_live_matches(uuid) from public, anon, authenticated;
revoke all on function public.carpool_free_seats(uuid) from public, anon, authenticated;
revoke all on function public.queue_carpool_rematch(uuid) from public, anon, authenticated;
revoke all on function public.refresh_intent_status(uuid) from public, anon, authenticated;
revoke all on function public.respond_carpool_match(uuid, uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.close_trip_intent(uuid, uuid) from public, anon, authenticated;
revoke all on function public.submit_trip_intent(uuid, date, jsonb) from public, anon, authenticated;
revoke all on function public.expire_stale_carpool() from public, anon, authenticated;
revoke all on function public.trip_intent_before_write() from public, anon, authenticated;
revoke all on function public.after_trip_intent_write() from public, anon, authenticated;
revoke all on function public.after_carpool_match_change() from public, anon, authenticated;
revoke all on function public.refresh_intents_for_ride() from public, anon, authenticated;
revoke all on function public.guard_carpool_match() from public, anon, authenticated;
revoke all on function public.enforce_pickup_address_sharing() from public, anon, authenticated;
revoke all on function public.release_cancelled_ride() from public, anon, authenticated;

grant execute on function public.carpool_free_seats(uuid) to service_role;
grant execute on function public.carpool_live_matches(uuid) to service_role;
grant execute on function public.respond_carpool_match(uuid, uuid, boolean, jsonb) to service_role;
grant execute on function public.close_trip_intent(uuid, uuid) to service_role;
grant execute on function public.submit_trip_intent(uuid, date, jsonb) to service_role;

revoke all on function public.get_peer_trip_intents(date) from public, anon;
grant execute on function public.get_peer_trip_intents(date) to authenticated;
