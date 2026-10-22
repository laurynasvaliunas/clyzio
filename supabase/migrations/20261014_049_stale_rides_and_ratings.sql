-- 049: close stale rides automatically; make ratings submittable.
--
-- Found while finishing the 2026-10-14 cancel/complete review:
--   1. Rides close only when someone taps complete or cancel, so a trip the
--      driver never ended stayed in Activity → Upcoming forever. The new
--      close-stale-rides edge function runs hourly (scheduled below) and closes
--      rides 24 h after their scheduled time. Its cancels have no caller, so the
--      048 release trigger now closes a PAST trip's match and intents as expired
--      instead of reopening them for matching.
--   2. Rating never worked: RatingSheet doesn't send rater_id (NOT NULL, no
--      default), so every insert failed — production had zero ratings. And a
--      passenger who tapped "I've arrived" before the driver ended the trip was
--      shown the rating sheet but refused by the policy (ride not completed).

-- ── 1a. Release trigger: past trips close, future ones reopen ───────────────
create or replace function public.release_cancelled_ride()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  canceller    uuid := auth.uid();           -- null for server / cron cancels
  by_passenger boolean := canceller is not null and canceller = new.rider_id;
  by_driver    boolean := canceller is not null and canceller = new.driver_id;
  m            record;
  past         boolean;
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
       set status = case
                      when by_passenger then 'cancelled_by_passenger'
                      when by_driver then 'cancelled_by_driver'
                      when trip_date < current_date then 'expired'   -- closed by the stale-ride job
                      else 'cancelled_by_driver'
                    end,
           updated_at = now()
     where ride_id = new.id
       and status = 'confirmed'
    returning driver_intent_id, passenger_intent_id, trip_date
  loop
    past := m.trip_date < current_date;

    -- Whoever cancelled starts over (their intent is closed); the other side
    -- goes back into matching, as the "we'll keep looking" push promises. A
    -- trip whose day has passed has nothing left to match.
    update public.trip_intents
       set status = case when by_passenger or past then 'expired' else 'pending' end
     where id = m.passenger_intent_id;

    -- A driver with other confirmed passengers keeps driving them.
    if not exists (select 1 from public.trip_intent_matches
                    where driver_intent_id = m.driver_intent_id and status = 'confirmed') then
      update public.trip_intents
         set status = case when by_driver or past then 'expired' else 'pending' end
       where id = m.driver_intent_id;
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.release_cancelled_ride() from public, anon, authenticated;

-- ── 1b. Hourly stale-ride close (idempotent re-schedule) ────────────────────
do $$
declare j record;
begin
  for j in select jobid from cron.job where jobname = 'clyzio-close-stale-rides' loop
    perform cron.unschedule(j.jobid);
  end loop;
end $$;

select cron.schedule(
  'clyzio-close-stale-rides',
  '40 * * * *',
  $$
  select net.http_post(
    url := 'https://qvevbbqcrizfywqexlkw.supabase.co/functions/v1/close-stale-rides',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_shared_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- ── 2. Ratings ──────────────────────────────────────────────────────────────
-- The rater is always the caller; the policy still checks it.
alter table public.ratings alter column rater_id set default auth.uid();

-- "I confirmed this trip" — ride_completions is closed to clients, so the
-- policy asks through this definer function, which only answers for the caller.
create or replace function public.has_completed_ride(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.ride_completions
     where ride_id = p_ride_id and user_id = auth.uid()
  );
$$;

revoke all on function public.has_completed_ride(uuid) from public, anon;
grant execute on function public.has_completed_ride(uuid) to authenticated;

drop policy if exists "Participants can insert rating" on public.ratings;
create policy "Participants can insert rating" on public.ratings
  for insert to authenticated
  with check (
    auth.uid() = rater_id
    and auth.uid() <> rated_id
    and exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = auth.uid() or r.rider_id = auth.uid())
        and (r.driver_id = rated_id or r.rider_id = rated_id)
        -- The trip is over for the rater: ended by the driver, or the rater
        -- confirmed it ("I've arrived") while the driver hasn't ended it yet.
        and (r.status = 'completed' or public.has_completed_ride(r.id))
    )
  );
