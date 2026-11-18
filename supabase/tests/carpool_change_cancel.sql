-- Changing and cancelling carpool trips, for drivers and riders (migration 053).
--
-- Written 18 November 2026 for "a user should be able to cancel tomorrow's
-- drive or ride and request a new one, on both sides". Walks every way a
-- trip ends or changes and checks both people are left in a state they can
-- act on: the one who cancelled can plan again at once, the other is back to
-- searching (and the matcher is called), seats add up, nothing stays
-- half-confirmed.
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- (and every queued pg_net call) is rolled back. Success is
-- "CARPOOL CHANGE & CANCEL: ALL n CHECKS PASSED"; a failure names the check.
--
-- Cast (all tomorrow): driver D (2 seats), riders R1, R2, R3; driver D2
-- (2 seats) with riders R4, R5 for the "replace a trip with two passengers"
-- case.

do $test$
declare
  d_u  uuid := gen_random_uuid(); r1 uuid := gen_random_uuid(); r2 uuid := gen_random_uuid();
  r3   uuid := gen_random_uuid(); d2_u uuid := gen_random_uuid();
  r4   uuid := gen_random_uuid(); r5 uuid := gen_random_uuid();
  d    date := current_date + 1;
  i_d uuid; i_r1 uuid; i_r2 uuid; i_r3 uuid; i_d2 uuid; i_r4 uuid; i_r5 uuid;
  m1 uuid; m1b uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid;
  ride1 uuid; ride1b uuid; ride2 uuid; ride4 uuid; ride5 uuid;
  res  jsonb;
  ok   boolean;
  msg  text;
  det  text;
  cnt  int;
  q0   int;
  gen  int;
  n    int := 0;
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
    (d_u, 'd@clyzio-test-cc.invalid'), (r1, 'r1@clyzio-test-cc.invalid'), (r2, 'r2@clyzio-test-cc.invalid'),
    (r3, 'r3@clyzio-test-cc.invalid'), (d2_u, 'd2@clyzio-test-cc.invalid'),
    (r4, 'r4@clyzio-test-cc.invalid'), (r5, 'r5@clyzio-test-cc.invalid');
  update public.profiles set is_public = true, company_id = null where id in (d_u, r1, r2, r3, d2_u, r4, r5);

  i_d  := (public.submit_trip_intent(d_u, d, driver_fields)->'intent'->>'id')::uuid;
  i_r1 := (public.submit_trip_intent(r1, d, rider_fields)->'intent'->>'id')::uuid;
  i_r2 := (public.submit_trip_intent(r2, d, rider_fields)->'intent'->>'id')::uuid;
  i_r3 := (public.submit_trip_intent(r3, d, rider_fields)->'intent'->>'id')::uuid;

  -- ── A. A rider cancels a confirmed carpool, plans again, can ride with the same driver ──
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d, i_r1, d_u, r1, d, 'pending') returning id into m1;
  perform public.respond_carpool_match(m1, r1, true, ride);
  ride1 := (public.respond_carpool_match(m1, d_u, true, ride)->>'ride_id')::uuid;
  assert ride1 is not null, 'A0 setup: the first carpool is confirmed';                                           n := n + 1;

  select count(*) into q0 from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_d::text;
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride1;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select status from public.trip_intents where id = i_r1) = 'expired',
         'A1 the rider who cancelled has their trip closed (free to plan again)';                               n := n + 1;
  assert (select status from public.trip_intent_matches where id = m1) = 'cancelled_by_passenger',
         'A2 the match records that the passenger cancelled';                                                   n := n + 1;
  assert (select status from public.trip_intents where id = i_d) = 'pending' and public.carpool_free_seats(i_d) = 2,
         'A3 the driver is searching again with both seats free';                                               n := n + 1;
  select count(*) into cnt from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_d::text;
  assert cnt = q0 + 1, format('A4 the driver is put back into matching (queued %s, want %s)', cnt, q0 + 1);   n := n + 1;

  gen := (select generation from public.trip_intents where id = i_r1);
  res := public.submit_trip_intent(r1, d, rider_fields || jsonb_build_object('departure_time', '08:10'));
  assert res->'intent'->>'status' = 'pending' and (res->'intent'->>'generation')::int = gen + 1
     and res->'intent'->>'departure_time' = '08:10:00',
         'A5 the rider plans a new ride for the same day straight away (new time, new generation)';             n := n + 1;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d, i_r1, d_u, r1, d, 'pending') returning id into m1b;
  assert m1b is not null, 'A6 the same driver and rider can be matched again after the cancel';                  n := n + 1;

  -- ── B. A driver with two passengers drops one: the drive and the other carpool go on ──
  perform public.respond_carpool_match(m1b, r1, true, ride);
  ride1b := (public.respond_carpool_match(m1b, d_u, true, ride)->>'ride_id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d, i_r2, d_u, r2, d, 'pending') returning id into m2;
  perform public.respond_carpool_match(m2, d_u, true, ride);
  ride2 := (public.respond_carpool_match(m2, r2, true, ride)->>'ride_id')::uuid;
  assert ride1b is not null and ride2 is not null and public.carpool_free_seats(i_d) = 0,
         'B0 setup: the driver has two confirmed passengers and no free seat';                                  n := n + 1;

  select count(*) into q0 from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_d::text;
  perform set_config('request.jwt.claims', json_build_object('sub', d_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride2;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  assert (select status from public.trip_intents where id = i_d) = 'matched' and public.carpool_free_seats(i_d) = 1,
         'B1 dropping one passenger keeps the drive (still matched, one seat free)';                            n := n + 1;
  assert (select status from public.trip_intent_matches where id = m1b) = 'confirmed'
     and (select status from public.rides where id = ride1b) = 'scheduled',
         'B2 the other passenger''s carpool is untouched';                                                      n := n + 1;
  assert (select status from public.trip_intent_matches where id = m2) = 'cancelled_by_driver'
     and (select status from public.trip_intents where id = i_r2) = 'pending',
         'B3 the dropped passenger is searching again';                                                         n := n + 1;
  select count(*) into cnt from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_d::text;
  assert cnt = q0 + 1, format('B4 the freed seat is offered again (queued %s, want %s)', cnt, q0 + 1);        n := n + 1;

  -- ── C. Changing a trip with a confirmed carpool is refused, naming the ride ──
  ok := false; det := null;
  begin
    perform public.submit_trip_intent(d_u, d, driver_fields || jsonb_build_object('departure_time', '07:30'));
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail;
    ok := true;
  end;
  assert ok and msg = 'has_confirmed_ride' and det = ride1b::text,
         'C1 a driver can''t replace a trip that has a confirmed passenger (told which ride)';                  n := n + 1;
  ok := false;
  begin
    perform public.close_trip_intent(i_d, d_u);
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'has_confirmed_ride', 'C2 nor just stop looking while a passenger is confirmed';           n := n + 1;

  -- ── D. Cancelling the whole drive: every ride, then the trip; consistent even if
  --       the matcher already offered the freed seat in between ──
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d, i_r3, d_u, r3, d, 'pending') returning id into m3;           -- the matcher filled the free seat
  perform set_config('request.jwt.claims', json_build_object('sub', d_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride1b;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert (select status from public.trip_intents where id = i_d) = 'matched',
         'D1 with an offer still open, the drive is not closed by the last ride cancel alone';                  n := n + 1;
  select count(*) into cnt from public.close_trip_intent(i_d, d_u) c where c.partner_user_id = r3 and c.match_id = m3;
  assert cnt = 1, 'D2 closing the trip then releases the open offer and names who to tell';                      n := n + 1;
  assert (select status from public.trip_intents where id = i_d) = 'expired'
     and (select count(*) from public.trip_intent_matches m
           where m.driver_intent_id = i_d and public.carpool_match_is_live(m.status, m.ride_id)) = 0,
         'D3 afterwards the drive is closed and nothing on it is live';                                         n := n + 1;
  assert (select count(*) from public.trip_intents where id in (i_r1, i_r3) and status = 'pending') = 2,
         'D4 every passenger of the cancelled drive is searching again';                                        n := n + 1;
  assert (select count(*) from public.rides where driver_id = d_u and status = 'scheduled') = 0,
         'D5 no scheduled ride is left behind for the driver';                                                  n := n + 1;

  -- ── E. The driver plans a new drive for the same day straight away ──
  gen := (select generation from public.trip_intents where id = i_d);
  res := public.submit_trip_intent(d_u, d, driver_fields || jsonb_build_object('passenger_capacity', 3, 'departure_time', '07:45'));
  assert res->'intent'->>'status' = 'pending' and (res->'intent'->>'generation')::int = gen + 1
     and public.carpool_free_seats(i_d) = 3,
         'E1 a new drive the same day: searching, new generation, the new seat count';                          n := n + 1;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d, i_r2, d_u, r2, d, 'pending') returning id into m4;
  assert m4 is not null, 'E2 the new drive can be matched with a rider it dropped earlier';                      n := n + 1;

  -- ── F. Switching role for the same day (driver → passenger) releases the offers ──
  res := public.submit_trip_intent(d_u, d, rider_fields);
  select count(*) into cnt from jsonb_array_elements(res->'released') e where e->>'partner_user_id' = r2::text;
  assert res->'intent'->>'role' = 'passenger' and res->'intent'->>'status' = 'pending' and cnt = 1,
         'F1 becoming a passenger releases the open offer and names the rider to tell';                         n := n + 1;
  assert (select status from public.trip_intent_matches where id = m4) = 'cancelled_by_driver'
     and (select status from public.trip_intents where id = i_r2) = 'pending'
     and (select passenger_capacity from public.trip_intents where id = i_d) is null,
         'F2 the rider searches again; the new passenger trip has no seats';                                    n := n + 1;

  -- ── G. A rider declines after accepting (withdraw): both back to searching ──
  i_d2 := (public.submit_trip_intent(d2_u, d, driver_fields)->'intent'->>'id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d2, i_r3, d2_u, r3, d, 'pending') returning id into m5;
  perform public.respond_carpool_match(m5, r3, true, ride);
  res := public.respond_carpool_match(m5, r3, false);
  assert res->>'status' = 'cancelled_by_passenger'
     and (select status from public.trip_intents where id = i_r3) = 'pending'
     and (select status from public.trip_intents where id = i_d2) = 'pending',
         'G1 a rider withdrawing after accepting leaves both searching';                                        n := n + 1;
  res := public.respond_carpool_match(m5, d2_u, true, ride);
  assert res->>'status' = 'cancelled_by_passenger' and not (res->>'changed')::boolean,
         'G2 the driver accepting it afterwards changes nothing (no ride)';                                     n := n + 1;

  -- ── H. Replacing a trip that has two confirmed passengers: each ride is named in turn ──
  i_r4 := (public.submit_trip_intent(r4, d, rider_fields)->'intent'->>'id')::uuid;
  i_r5 := (public.submit_trip_intent(r5, d, rider_fields)->'intent'->>'id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d2, i_r4, d2_u, r4, d, 'pending') returning id into m6;
  perform public.respond_carpool_match(m6, r4, true, ride);
  ride4 := (public.respond_carpool_match(m6, d2_u, true, ride)->>'ride_id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_d2, i_r5, d2_u, r5, d, 'pending') returning id into m6;
  perform public.respond_carpool_match(m6, r5, true, ride);
  ride5 := (public.respond_carpool_match(m6, d2_u, true, ride)->>'ride_id')::uuid;

  ok := false; det := null;
  begin
    perform public.submit_trip_intent(d2_u, d, driver_fields);
  exception when others then get stacked diagnostics msg = message_text, det = pg_exception_detail; ok := true;
  end;
  assert ok and msg = 'has_confirmed_ride' and det in (ride4::text, ride5::text),
         'H1 replacing a trip with two passengers is refused, naming one ride';                                 n := n + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', d2_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = det::uuid;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  msg := null; ok := false;
  begin
    perform public.submit_trip_intent(d2_u, d, driver_fields);
  exception when others then get stacked diagnostics msg = message_text, det = pg_exception_detail; ok := true;
  end;
  assert ok and msg = 'has_confirmed_ride' and det in (ride4::text, ride5::text)
     and (select status from public.rides where id = det::uuid) = 'scheduled',
         'H2 after cancelling that ride, the refusal names the other one (cancel each, then replace)';          n := n + 1;
  perform set_config('request.jwt.claims', json_build_object('sub', d2_u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = det::uuid;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  res := public.submit_trip_intent(d2_u, d, driver_fields || jsonb_build_object('departure_time', '08:30'));
  assert res->'intent'->>'status' = 'pending' and res->'intent'->>'departure_time' = '08:30:00',
         'H3 with every ride cancelled, the new trip replaces the old one';                                     n := n + 1;
  assert (select count(*) from public.trip_intents where id in (i_r4, i_r5) and status = 'pending') = 2,
         'H4 both of its old passengers are searching again';                                                   n := n + 1;

  -- ── I. A cancelled ride can't be cancelled again or brought back by the user ──
  ok := false;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', d2_u, 'role', 'authenticated')::text, true);
    set local role authenticated;
    update public.rides set status = 'scheduled' where id = ride4;
    reset role;
  exception when others then ok := true;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert ok or (select status from public.rides where id = ride4) = 'cancelled',
         'I1 a cancelled carpool ride stays cancelled';                                                         n := n + 1;

  raise exception 'CARPOOL CHANGE & CANCEL: ALL % CHECKS PASSED', n;
end;
$test$;
