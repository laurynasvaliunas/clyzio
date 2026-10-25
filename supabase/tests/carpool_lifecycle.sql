-- Scenario test for migration 053 (one carpool lifecycle for every path).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- (and every queued pg_net call) is rolled back. Success is
-- "CARPOOL LIFECYCLE: ALL n CHECKS PASSED"; a failure names the broken check.
-- Assumes 053 is applied (or runs in the same transaction).
--
-- Cast: driver D (2 seats), riders R1–R3 for tomorrow; driver D2 (1 seat) and
-- rider R4 for completion; S_d / S_r for the hourly clean-up.

do $test$
declare
  drv  uuid := gen_random_uuid();
  r1   uuid := gen_random_uuid();
  r2   uuid := gen_random_uuid();
  r3   uuid := gen_random_uuid();
  drv2 uuid := gen_random_uuid();
  r4   uuid := gen_random_uuid();
  s_d  uuid := gen_random_uuid();
  s_r  uuid := gen_random_uuid();
  d    date := current_date + 1;
  i_drv uuid; i_r1 uuid; i_r2 uuid; i_r3 uuid; i_drv2 uuid; i_r4 uuid; i_sd uuid; i_sr uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid; m5 uuid; m6 uuid; m7 uuid; m_s uuid;
  ride1 uuid; ride6 uuid; ride7 uuid;
  res  jsonb;
  ok   boolean;
  msg  text;
  det  text;
  cnt  int;
  n    int := 0;
  ride jsonb := jsonb_build_object(
    'origin_lat', 54.681, 'origin_long', 25.271, 'origin_address', 'Pickup St 1',
    'dest_lat', 54.70, 'dest_long', 25.30, 'dest_address', 'Work Ave 2',
    'scheduled_at', ((d + time '08:10') at time zone 'Europe/Vilnius'));
  driver_fields jsonb := jsonb_build_object(
    'role', 'driver', 'passenger_capacity', 2, 'departure_time', '08:00', 'tz_offset_minutes', -180,
    'home_lat', 54.68, 'home_long', 25.27, 'work_lat', 54.70, 'work_long', 25.30);
  rider_fields jsonb := jsonb_build_object(
    'role', 'passenger', 'departure_time', '08:05',
    'home_lat', 54.681, 'home_long', 25.271, 'work_lat', 54.70, 'work_long', 25.30);
begin
  insert into auth.users (id, email) values
    (drv,  'drv@clyzio-test-cl.invalid'),  (r1, 'r1@clyzio-test-cl.invalid'),
    (r2,   'r2@clyzio-test-cl.invalid'),   (r3, 'r3@clyzio-test-cl.invalid'),
    (drv2, 'drv2@clyzio-test-cl.invalid'), (r4, 'r4@clyzio-test-cl.invalid'),
    (s_d,  'sd@clyzio-test-cl.invalid'),   (s_r, 'sr@clyzio-test-cl.invalid');
  update public.profiles set is_public = true, company_id = null where id in (drv, r2);

  -- ── 1. Submitting: pending, leaving moment, matcher called ────────────────
  res := public.submit_trip_intent(drv, d, driver_fields);
  i_drv := (res->'intent'->>'id')::uuid;
  i_r1 := (public.submit_trip_intent(r1, d, rider_fields)->'intent'->>'id')::uuid;
  i_r2 := (public.submit_trip_intent(r2, d, rider_fields)->'intent'->>'id')::uuid;
  i_r3 := (public.submit_trip_intent(r3, d, rider_fields)->'intent'->>'id')::uuid;

  assert res->'intent'->>'status' = 'pending' and (res->'intent'->>'generation')::int = 1,
         'a new trip starts pending, generation 1';                                                              n := n + 1;
  assert (select departs_at from public.trip_intents where id = i_drv) = ((d + time '05:00') at time zone 'UTC'),
         'departs_at uses the phone''s UTC offset (08:00 at UTC+3 = 05:00 UTC)';                                 n := n + 1;
  assert (select departs_at from public.trip_intents where id = i_r1) = ((d + time '08:05') at time zone 'Europe/Vilnius'),
         'without an offset, departs_at falls back to Vilnius time';                                             n := n + 1;
  select count(*) into cnt from net.http_request_queue q
   where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' in (i_drv::text, i_r1::text, i_r2::text, i_r3::text)
     and q.url like '%/functions/v1/daily-commute-matcher';
  assert cnt = 4, format('every new trip queues the matcher for itself (queued %s of 4)', cnt);                 n := n + 1;

  -- ── 2. Offers: seats, one live match per rider, once per generation ──────
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, pickup_kind, pickup_lat, pickup_long, pickup_address)
  values (i_drv, i_r1, drv, r1, d, 'pending', 'route', 54.681, 25.271, 'Pickup St 1') returning id into m1;
  assert (select count(*) from public.trip_intents where id in (i_drv, i_r1) and status = 'matched') = 2,
         'an offer marks both trips matched';                                                                    n := n + 1;

  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv, i_r1, drv, r1, d, 'pending');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'the same pair is not offered twice in the same generations';                                       n := n + 1;

  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r2, drv, r2, d, 'pending') returning id into m2;

  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv, i_r3, drv, r3, d, 'pending');
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'no_seats_left', format('a 2-seat driver gets no third offer (got %s)', coalesce(msg, 'no error')); n := n + 1;

  i_drv2 := (public.submit_trip_intent(drv2, d, driver_fields || jsonb_build_object('passenger_capacity', 1))->'intent'->>'id')::uuid;
  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv2, i_r1, drv2, r1, d, 'pending');
  exception when unique_violation then ok := true;
  end;
  assert ok, 'a rider has only one live match at a time';                                                        n := n + 1;

  -- Route pickups are meeting points: kept even when the rider hides their address.
  update public.profiles set share_pickup_address = false where id = r1;
  update public.trip_intent_matches set updated_at = now() where id = m1;
  assert (select pickup_lat from public.trip_intent_matches where id = m1) = 54.681,
         'a pickup on the driver''s route stays when the rider doesn''t share their address';                    n := n + 1;
  update public.profiles set share_pickup_address = true where id = r1;

  -- ── 3. Approving, in either order, confirms exactly once ─────────────────
  res := public.respond_carpool_match(m1, r1, true, ride);
  assert res->>'status' = 'awaiting_other' and (res->>'changed')::boolean, 'first approval waits for the other'; n := n + 1;
  res := public.respond_carpool_match(m1, r1, true, ride);
  assert res->>'status' = 'awaiting_other' and not (res->>'changed')::boolean, 're-approving is a no-op';        n := n + 1;
  res := public.respond_carpool_match(m1, drv, true, ride);
  ride1 := (res->>'ride_id')::uuid;
  assert res->>'status' = 'confirmed' and ride1 is not null, 'the second approval confirms and creates the ride'; n := n + 1;
  assert (select scheduled_at from public.rides where id = ride1) = (ride->>'scheduled_at')::timestamptz
     and (select ride_id from public.trip_intent_matches where id = m1) = ride1,
         'the ride carries the pickup time and is linked to the match';                                         n := n + 1;
  res := public.respond_carpool_match(m1, drv, true, ride);
  assert res->>'status' = 'confirmed' and not (res->>'changed')::boolean and (res->>'ride_id')::uuid = ride1,
         'approving a confirmed match changes nothing (no second ride)';                                         n := n + 1;

  ok := false;
  begin
    perform public.respond_carpool_match(m1, r3, true, ride);
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'not_a_participant', 'only the two people can answer a match';                            n := n + 1;

  -- ── 4. Declining releases both: rider searches again, seat frees up ──────
  res := public.respond_carpool_match(m2, drv, false);
  assert res->>'status' = 'cancelled_by_driver', 'a driver decline closes the offer';                            n := n + 1;
  assert (select status from public.trip_intents where id = i_r2) = 'pending',
         'the declined rider goes back to searching (was stuck matched)';                                        n := n + 1;
  assert (select status from public.trip_intents where id = i_drv) = 'matched',
         'the driver with a confirmed passenger stays matched';                                                  n := n + 1;
  select count(*) into cnt from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_r2::text;
  assert cnt = 2, format('the released rider is re-matched straight away (queued %s, want 2)', cnt);            n := n + 1;
  select count(*) into cnt from net.http_request_queue q where convert_from(q.body, 'UTF8')::jsonb->>'new_intent_id' = i_drv::text;
  assert cnt = 2, format('the driver''s freed seat is offered again (queued %s, want 2)', cnt);                 n := n + 1;

  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r3, drv, r3, d, 'pending') returning id into m3;
  assert m3 is not null, 'the freed seat can take another rider';                                                n := n + 1;

  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv, i_r2, drv, r2, d, 'pending');
  exception when others then ok := true;
  end;
  assert ok, 'a declined pair is not re-offered within the same trips';                                          n := n + 1;

  -- ── 5. Stop looking ───────────────────────────────────────────────────────
  select count(*) into cnt from public.close_trip_intent(i_r3, r3) c where c.partner_user_id = drv and c.match_id = m3;
  assert cnt = 1, 'stopping returns the released match and partner to notify';                                  n := n + 1;
  assert (select status from public.trip_intents where id = i_r3) = 'expired'
     and (select status from public.trip_intent_matches where id = m3) = 'cancelled_by_passenger',
         'stopping closes the trip and its open offer';                                                          n := n + 1;
  select count(*) into cnt from public.close_trip_intent(i_r3, r3);
  assert cnt = 0, 'stopping twice is a no-op';                                                                   n := n + 1;

  ok := false; det := null;
  begin
    perform public.close_trip_intent(i_drv, drv);
  exception when others then
    get stacked diagnostics msg = message_text, det = pg_exception_detail;
    ok := true;
  end;
  assert ok and msg = 'has_confirmed_ride' and det = ride1::text,
         'a trip with a confirmed carpool can''t just stop (cancel the ride instead)';                         n := n + 1;

  ok := false;
  begin
    perform public.submit_trip_intent(r1, d, rider_fields);
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'has_confirmed_ride', 're-submitting over a confirmed carpool is refused (no double booking)'; n := n + 1;

  -- ── 6. Re-submitting starts a new generation: the pair can match again ────
  res := public.submit_trip_intent(r2, d, rider_fields || jsonb_build_object('departure_time', '08:10'));
  assert (res->'intent'->>'generation')::int = 2 and res->'intent'->>'status' = 'pending'
     and (res->'intent'->>'departure_time') = '08:10:00',
         're-submitting reopens the trip as generation 2 with the new details';                                 n := n + 1;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r2, drv, r2, d, 'pending') returning id into m4;
  assert (select passenger_generation from public.trip_intent_matches where id = m4) = 2,
         'after a new trip the same driver can be offered again';                                                n := n + 1;

  -- ── 7. The rider cancels the confirmed ride, then plans again at once ─────
  perform set_config('request.jwt.claims', json_build_object('sub', r1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride1;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert (select status from public.trip_intent_matches where id = m1) = 'cancelled_by_passenger'
     and (select status from public.trip_intents where id = i_r1) = 'expired',
         'the cancelling rider''s trip closes';                                                                  n := n + 1;
  assert (select status from public.trip_intents where id = i_drv) = 'matched',
         'the driver keeps the other live offer';                                                                n := n + 1;

  res := public.submit_trip_intent(r1, d, rider_fields);
  assert res->'intent'->>'status' = 'pending' and (res->'intent'->>'generation')::int = 2,
         'whoever cancelled can create a new trip immediately';                                                  n := n + 1;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv, i_r1, drv, r1, d, 'pending') returning id into m5;
  assert m5 is not null, 'and can even be matched with the same driver again';                                  n := n + 1;

  -- Peer radar: a matched driver with no free seat is not choosable.
  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = drv;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert cnt = 0, 'a full driver is not offered on the map radar';                                              n := n + 1;

  -- ── 8. The driver replaces their trip: open offers are released ──────────
  select count(*) into cnt from jsonb_array_elements(public.submit_trip_intent(drv, d, driver_fields)->'released');
  assert cnt = 2, format('replacing a trip releases its open offers (released %s, want 2)', cnt);             n := n + 1;
  assert (select count(*) from public.trip_intent_matches where id in (m4, m5) and status = 'cancelled_by_driver') = 2
     and (select count(*) from public.trip_intents where id in (i_r1, i_r2) and status = 'pending') = 2,
         'the released riders search again';                                                                   n := n + 1;
  assert (select generation from public.trip_intents where id = i_drv) = 2, 'the driver''s trip is generation 2'; n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', r2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = drv;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert cnt = 1, 'a driver with free seats shows on the map radar';                                            n := n + 1;

  -- ── 9. Completing ends the trip; a second trip that day works ─────────────
  i_r4 := (public.submit_trip_intent(r4, d, rider_fields)->'intent'->>'id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv2, i_r4, drv2, r4, d, 'pending') returning id into m6;
  perform public.respond_carpool_match(m6, drv2, true, ride);
  ride6 := (public.respond_carpool_match(m6, r4, true, ride)->>'ride_id')::uuid;
  update public.rides set status = 'completed', completed_at = now() where id = ride6;
  assert (select count(*) from public.trip_intents where id in (i_drv2, i_r4) and status = 'expired') = 2,
         'a completed carpool closes both trips (was left matched)';                                            n := n + 1;

  ok := false;
  begin
    insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
    values (i_drv2, i_r1, drv2, r1, d, 'pending');
  exception when others then ok := true; msg := sqlerrm;
  end;
  assert ok and msg = 'intent_closed', 'a closed trip gets no new offers';                                       n := n + 1;

  res := public.submit_trip_intent(r4, d, rider_fields || jsonb_build_object('departure_time', '17:30'));
  assert res->'intent'->>'status' = 'pending',
         'the ride home the same day can be planned (old generation''s completed ride doesn''t close it)';      n := n + 1;

  -- ── 10. The driver cancels: driver closes, rider searches again ───────────
  perform public.submit_trip_intent(drv2, d, driver_fields || jsonb_build_object('passenger_capacity', 1, 'departure_time', '17:25'));
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status)
  values (i_drv2, i_r4, drv2, r4, d, 'pending') returning id into m7;
  perform public.respond_carpool_match(m7, r4, true, ride);
  ride7 := (public.respond_carpool_match(m7, drv2, true, ride)->>'ride_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', drv2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.rides set status = 'cancelled' where id = ride7;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  assert (select status from public.trip_intent_matches where id = m7) = 'cancelled_by_driver'
     and (select status from public.trip_intents where id = i_drv2) = 'expired'
     and (select status from public.trip_intents where id = i_r4) = 'pending',
         'a driver cancel closes the driver''s trip and reopens the rider''s';                                   n := n + 1;

  -- ── 11. Hourly clean-up ───────────────────────────────────────────────────
  -- S_r left "today" more than an hour ago (UTC+10 at midnight); S_d leaves tonight.
  i_sd := (public.submit_trip_intent(s_d, current_date, driver_fields || jsonb_build_object('departure_time', '23:59', 'tz_offset_minutes', 0))->'intent'->>'id')::uuid;
  i_sr := (public.submit_trip_intent(s_r, current_date, rider_fields || jsonb_build_object('departure_time', '00:00', 'tz_offset_minutes', -600))->'intent'->>'id')::uuid;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, pickup_at)
  values (i_sd, i_sr, s_d, s_r, current_date, 'pending', now() - interval '1 minute') returning id into m_s;
  perform public.expire_stale_carpool();
  assert (select status from public.trip_intent_matches where id = m_s) = 'expired',
         'an offer whose pickup time passed expires';                                                            n := n + 1;
  assert (select status from public.trip_intents where id = i_sr) = 'expired'
     and (select status from public.trip_intents where id = i_sd) = 'pending',
         'a trip whose leaving time passed closes; one still ahead keeps searching';                             n := n + 1;

  raise exception 'CARPOOL LIFECYCLE: ALL % CHECKS PASSED', n;
end;
$test$;
