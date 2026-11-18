-- A driver who offers two seats: both can be filled, one rider at a time.
--
-- Written 15 November 2026 after a real test where a 2-seat driver got one
-- passenger and a second rider was never offered the other seat. The seat
-- rules were not the cause (that rider's leaving time was more than 15 min
-- from when the driver passes); this walks the whole seat story so it stays
-- that way.
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- (and every queued pg_net call) is rolled back. Success is
-- "CARPOOL SEATS: ALL n CHECKS PASSED"; a failure names the broken check.
--
-- Cast: driver D (2 seats) and riders R1, R2, R3 for tomorrow, all visible to
-- each other.

do $test$
declare
  drv uuid := gen_random_uuid();
  r1  uuid := gen_random_uuid();
  r2  uuid := gen_random_uuid();
  r3  uuid := gen_random_uuid();
  d   date := current_date + 1;
  i_drv uuid; i_r1 uuid; i_r2 uuid; i_r3 uuid;
  m1 uuid; m2 uuid; m3 uuid;
  ride1 uuid; ride2 uuid;
  res jsonb;
  ok  boolean;
  msg text;
  cnt int;
  queued int;
  n   int := 0;
  ride jsonb := jsonb_build_object(
    'origin_lat', 54.681, 'origin_long', 25.271, 'origin_address', 'Pickup St 1',
    'dest_lat', 54.70, 'dest_long', 25.30, 'dest_address', 'Work Ave 2',
    'scheduled_at', ((d + time '08:10') at time zone 'Europe/Vilnius'));
  driver_fields jsonb := jsonb_build_object(
    'role', 'driver', 'passenger_capacity', 2, 'departure_time', '08:00', 'tz_offset_minutes', -120,
    'home_lat', 54.68, 'home_long', 25.27, 'work_lat', 54.70, 'work_long', 25.30);
  rider_fields jsonb := jsonb_build_object(
    'role', 'passenger', 'departure_time', '08:05', 'tz_offset_minutes', -120,
    'home_lat', 54.681, 'home_long', 25.271, 'work_lat', 54.70, 'work_long', 25.30);
begin
  insert into auth.users (id, email) values
    (drv, 'drv@clyzio-test-seats.invalid'), (r1, 'r1@clyzio-test-seats.invalid'),
    (r2,  'r2@clyzio-test-seats.invalid'),  (r3, 'r3@clyzio-test-seats.invalid');
  update public.profiles set is_public = true, company_id = null where id in (drv, r1, r2, r3);

  -- ── 1. Two seats offered ──────────────────────────────────────────────────
  i_drv := (public.submit_trip_intent(drv, d, driver_fields)->'intent'->>'id')::uuid;
  i_r1  := (public.submit_trip_intent(r1, d, rider_fields)->'intent'->>'id')::uuid;
  i_r2  := (public.submit_trip_intent(r2, d, rider_fields)->'intent'->>'id')::uuid;
  i_r3  := (public.submit_trip_intent(r3, d, rider_fields)->'intent'->>'id')::uuid;

  assert (select passenger_capacity from public.trip_intents where id = i_drv) = 2
     and public.carpool_free_seats(i_drv) = 2,
         'the driver''s trip stores 2 seats, both free';                                                         n := n + 1;

  -- ── 2. First passenger: offered, then confirmed ───────────────────────────
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r1, drv, r1, d, 'pending') returning id into m1;
  assert public.carpool_free_seats(i_drv) = 1, 'an offer holds one seat, the other stays free';                 n := n + 1;

  perform public.respond_carpool_match(m1, r1, true, ride);
  res := public.respond_carpool_match(m1, drv, true, ride);
  ride1 := (res->>'ride_id')::uuid;
  assert res->>'status' = 'confirmed' and ride1 is not null, 'the first passenger is confirmed with a ride';    n := n + 1;
  assert public.carpool_free_seats(i_drv) = 1
     and (select status from public.trip_intents where id = i_drv) = 'matched',
         'with one passenger confirmed, one seat is still free';                                                 n := n + 1;

  -- ── 3. The second seat stays on offer to other riders ─────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = drv and role = 'driver';
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert cnt = 1, 'another rider still sees the driver on the map (a seat is free)';                           n := n + 1;

  -- What the matcher reads to pick drivers with room (daily-commute-matcher, openPool).
  select count(*) into cnt from public.trip_intents ti
   where ti.trip_date = d and ti.id = i_drv and ti.status in ('pending', 'matched')
     and public.carpool_free_seats(ti.id) > 0;
  assert cnt = 1, 'the matcher still counts the driver as having room';                                         n := n + 1;

  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r2, drv, r2, d, 'pending') returning id into m2;
  assert m2 is not null and public.carpool_free_seats(i_drv) = 0,
         'a second rider can be offered the second seat while the first is confirmed';                          n := n + 1;
  assert (select status from public.trip_intent_matches where id = m1) = 'confirmed'
     and (select status from public.rides where id = ride1) = 'scheduled',
         'the first passenger''s ride is untouched by the second offer';                                        n := n + 1;

  -- ── 4. Both seats held: nobody else gets in ───────────────────────────────
  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv, i_r3, drv, r3, d, 'pending');
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'no_seats_left', format('a third rider is refused while both seats are held (got %s)', coalesce(msg, 'no error')); n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', r3, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = drv;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert cnt = 0, 'a driver with every seat held is not offered on the map';                                    n := n + 1;

  -- ── 5. Second passenger confirmed: two passengers, two rides ──────────────
  perform public.respond_carpool_match(m2, drv, true, ride);
  res := public.respond_carpool_match(m2, r2, true, ride);
  ride2 := (res->>'ride_id')::uuid;
  assert res->>'status' = 'confirmed' and ride2 is not null and ride2 <> ride1,
         'the second passenger is confirmed with their own ride';                                               n := n + 1;
  assert (select count(*) from public.trip_intent_matches
           where driver_intent_id = i_drv and status = 'confirmed') = 2
     and (select count(*) from public.rides where driver_id = drv and status = 'scheduled') = 2
     and public.carpool_free_seats(i_drv) = 0,
         'the driver has two confirmed passengers and no free seat';                                            n := n + 1;

  -- ── 6. A passenger cancels: their seat is offered again ───────────────────
  select count(*) into queued from net.http_request_queue q
   where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_drv::text;
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride2;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select status from public.trip_intent_matches where id = m2) = 'cancelled_by_passenger'
     and public.carpool_free_seats(i_drv) = 1,
         'a passenger cancelling frees their seat';                                                             n := n + 1;
  assert (select status from public.trip_intent_matches where id = m1) = 'confirmed'
     and (select status from public.rides where id = ride1) = 'scheduled'
     and (select status from public.trip_intents where id = i_drv) = 'matched',
         'the other passenger''s carpool carries on';                                                           n := n + 1;
  select count(*) into cnt from net.http_request_queue q
   where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_drv::text;
  assert cnt = queued + 1, format('the matcher is called for the freed seat (queued %s, want %s)', cnt, queued + 1); n := n + 1;

  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r3, drv, r3, d, 'pending') returning id into m3;
  assert m3 is not null and public.carpool_free_seats(i_drv) = 0,
         'the freed seat goes to the next rider';                                                               n := n + 1;

  raise exception 'CARPOOL SEATS: ALL % CHECKS PASSED', n;
end;
$test$;
