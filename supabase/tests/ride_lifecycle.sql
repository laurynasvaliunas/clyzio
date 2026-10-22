-- Scenario test for ride cancellation, completion and rating rules (migrations
-- 048 and 049 on top of the client-write guard from 036/041).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Success is "RIDE LIFECYCLE: ALL n CHECKS PASSED"; a failure
-- names the broken check. Assumes 048 + 049 are applied (or are run in the same
-- transaction, which is how it was dry-run against production).

do $test$
declare
  drv   uuid := gen_random_uuid();
  p1    uuid := gen_random_uuid();
  p2    uuid := gen_random_uuid();
  d1    date := current_date + 1;
  d2    date := current_date + 2;
  d0    date := current_date - 1;
  i_drv3 uuid; i_p3 uuid; r9 uuid;
  i_drv uuid; i_p1 uuid; i_p2 uuid; i_drv2 uuid; i_p2b uuid;
  r1 uuid; r2 uuid; r3 uuid; r4 uuid; r5 uuid; r6 uuid; r7 uuid; r8 uuid; r_solo uuid;
  v5 numeric; v7 numeric; wk numeric;
  ok  boolean;
  msg text;
  n   int := 0;
begin
  -- ── Fixtures (server context) ─────────────────────────────────────────────
  insert into auth.users (id, email) values
    (drv, 'drv@clyzio-test-life.invalid'),
    (p1,  'p1@clyzio-test-life.invalid'),
    (p2,  'p2@clyzio-test-life.invalid');

  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status, passenger_capacity)
  values (drv, 'driver', d1, 54.68, 25.27, 54.70, 25.30, 'matched', 2) returning id into i_drv;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (p1, 'passenger', d1, 54.68, 25.27, 54.70, 25.30, 'matched') returning id into i_p1;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (p2, 'passenger', d1, 54.68, 25.27, 54.70, 25.30, 'matched') returning id into i_p2;

  -- One driver, two confirmed passengers, one ride each (as respond-to-match does).
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, p1, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', d1 + time '08:00') returning id into r1;
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, p2, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', d1 + time '08:00') returning id into r2;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, ride_id, driver_approved, passenger_approved)
  values (i_drv, i_p1, drv, p1, d1, 'confirmed', r1, true, true),
         (i_drv, i_p2, drv, p2, d1, 'confirmed', r2, true, true);

  -- ── 1. Passenger cancels: their side closes, the driver keeps the other passenger ─
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = r1;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select status from public.rides where id = r1) = 'cancelled', 'a passenger can cancel their carpool ride'; n := n + 1;
  assert (select status from public.trip_intent_matches where ride_id = r1) = 'cancelled_by_passenger',
         'the cancelled ride''s match must be released as cancelled_by_passenger (was left confirmed)';             n := n + 1;
  assert (select status from public.trip_intents where id = i_p1) = 'expired',
         'the cancelling passenger''s intent closes, so they start over';                                           n := n + 1;
  assert (select status from public.trip_intents where id = i_drv) = 'matched',
         'a driver with another confirmed passenger stays matched';                                                 n := n + 1;
  assert (select status from public.trip_intent_matches where ride_id = r2) = 'confirmed',
         'the other passenger''s carpool is untouched';                                                             n := n + 1;

  -- ── 2. Driver cancels the last one: driver closes, passenger reopens ──────
  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = r2;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select status from public.trip_intent_matches where ride_id = r2) = 'cancelled_by_driver',
         'a driver cancel marks the match cancelled_by_driver';                                                     n := n + 1;
  assert (select status from public.trip_intents where id = i_p2) = 'pending',
         'the passenger left behind goes back into matching';                                                       n := n + 1;
  assert (select status from public.trip_intents where id = i_drv) = 'expired',
         'the driver''s intent closes once no passenger is confirmed';                                              n := n + 1;

  -- ── 3. A trip someone already completed can't be cancelled ────────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, p1, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', now()) returning id into r3;
  insert into public.ride_completions (ride_id, user_id) values (r3, p1);   -- passenger tapped "I've arrived"

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin
    update public.rides set status = 'cancelled' where id = r3;
  exception when others then ok := true; msg := sqlerrm;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert ok and msg = 'ride_already_completed',
         format('cancelling a ride a participant already completed must be refused (got %s)', coalesce(msg, 'no error')); n := n + 1;
  assert (select status from public.rides where id = r3) = 'scheduled', 'the refused cancel leaves the ride as it was'; n := n + 1;

  -- ── 4. A server-side cancel (no caller) reopens both sides ────────────────
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status, passenger_capacity)
  values (drv, 'driver', d2, 54.68, 25.27, 54.70, 25.30, 'matched', 1) returning id into i_drv2;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (p2, 'passenger', d2, 54.68, 25.27, 54.70, 25.30, 'matched') returning id into i_p2b;
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, p2, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', d2 + time '08:00') returning id into r4;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, ride_id, driver_approved, passenger_approved)
  values (i_drv2, i_p2b, drv, p2, d2, 'confirmed', r4, true, true);
  update public.rides set status = 'cancelled' where id = r4;
  assert (select status from public.trip_intent_matches where ride_id = r4) = 'cancelled_by_driver'
     and (select count(*) from public.trip_intents where id in (i_drv2, i_p2b) and status = 'pending') = 2,
         'a server cancel releases the match and reopens both intents';                                             n := n + 1;

  -- ── 5. Solo rides: the client may only cancel a live ride ─────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (p1, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'bike', 'Bike', now()) returning id into r_solo;

  ok := false;
  begin
    update public.rides set status = 'completed' where id = r_solo;
  exception when others then ok := true;
  end;
  assert ok, 'the app cannot mark a ride completed directly (only complete-trip can)';                              n := n + 1;

  update public.rides set status = 'cancelled' where id = r_solo;
  assert (select status from public.rides where id = r_solo) = 'cancelled', 'a solo ride can be cancelled';         n := n + 1;

  ok := false;
  begin
    update public.rides set status = 'scheduled' where id = r_solo;
  exception when others then ok := true;
  end;
  assert ok, 'a cancelled ride cannot be revived from the app';                                                     n := n + 1;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (p1, 'completed', 54.68, 25.27, 54.70, 25.30, 'bike', 'Bike', now(), now()) returning id into r6;
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin
    update public.rides set status = 'cancelled' where id = r6;
  exception when others then ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert ok, 'a completed ride cannot be cancelled';                                                                n := n + 1;

  -- ── 6. Weekly impact counts this user's credited share ────────────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (drv, p2, 'completed', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', now(), now()) returning id, co2_saved into r5, v5;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (p2, 'completed', 54.68, 25.27, 54.80, 25.40, 'bike', 'Bike', now(), now()) returning id, co2_saved into r7, v7;
  -- Completed carpool p2 was never credited for: must not count.
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (drv, p2, 'completed', 54.68, 25.27, 54.90, 25.50, 'carpool', 'Carpool', now(), now()) returning id into r8;
  insert into public.ride_completions (ride_id, user_id) values (r5, p2), (r7, p2);

  perform set_config('request.jwt.claims', json_build_object('sub', p2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  wk := (public.get_user_impact(p2) ->> 'this_week_co2')::numeric;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert v5 > 0 and abs(wk - (v5 / 2 + v7)) < 0.001,
         format('this_week_co2 must be the carpool half + the solo ride = %s (got %s)', v5 / 2 + v7, wk);         n := n + 1;

  -- ── 7. No confirmed match points at a cancelled ride any more ─────────────
  assert not exists (select 1 from public.trip_intent_matches m join public.rides r on r.id = m.ride_id
                      where m.status = 'confirmed' and r.status = 'cancelled'),
         'no confirmed match may point at a cancelled ride (048 backfill)';                                         n := n + 1;

  -- ── 8. Ratings (049): rater defaults to the caller; "I've arrived" may rate ─
  -- r3: p1 confirmed it (ride_completions), the driver never ended it.
  perform set_config('request.jwt.claims', json_build_object('sub', p1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.ratings (ride_id, rated_id, score, tags) values (r3, drv, 5, '{rating.tag.safe}');
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert (select rater_id from public.ratings where ride_id = r3) = p1,
         'a rating without rater_id is saved as the caller''s (every rating used to fail)';                  n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ok := false;
  begin
    insert into public.ratings (ride_id, rated_id, score) values (r3, p1, 4);
  exception when others then ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert ok, 'a participant who has not finished the trip cannot rate yet';                                 n := n + 1;

  -- ── 9. A stale past carpool closed by the job (no caller) closes for good ─
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status, passenger_capacity)
  values (drv, 'driver', d0, 54.68, 25.27, 54.70, 25.30, 'matched', 1) returning id into i_drv3;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (p1, 'passenger', d0, 54.68, 25.27, 54.70, 25.30, 'matched') returning id into i_p3;
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, p1, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', d0 + time '08:00') returning id into r9;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, ride_id, driver_approved, passenger_approved)
  values (i_drv3, i_p3, drv, p1, d0, 'confirmed', r9, true, true);
  update public.rides set status = 'cancelled' where id = r9;
  assert (select status from public.trip_intent_matches where ride_id = r9) = 'expired'
     and (select count(*) from public.trip_intents where id in (i_drv3, i_p3) and status = 'expired') = 2,
         'closing a past carpool expires its match and intents instead of reopening them';                  n := n + 1;

  assert exists (select 1 from cron.job where jobname = 'clyzio-close-stale-rides' and active),
         'the hourly close-stale-rides job must be scheduled';                                                  n := n + 1;

  raise exception 'RIDE LIFECYCLE: ALL % CHECKS PASSED (fixtures rolled back)', n;
end
$test$;
