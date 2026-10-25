-- Scenario test for migration 052 (partners see each other on the map).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Success is "PARTNER LOCATIONS: ALL n CHECKS PASSED"; a
-- failure names the broken check. Assumes 052 is applied (or runs in the same
-- transaction).
--
-- Fixtures: a driver and a rider with a confirmed carpool whose pickup is in
-- 10 minutes (live window open), a second ride of theirs in 2 hours (window
-- not open yet), and an outsider.

do $test$
declare
  drv  uuid := gen_random_uuid();
  pax  uuid := gen_random_uuid();
  outs uuid := gen_random_uuid();
  d    date := current_date;
  i_drv uuid; i_pax uuid; m1 uuid; r_now uuid; r_later uuid;
  pt   record;
  cnt  int;
  ok   boolean;
  n    int := 0;
begin
  -- ── Fixtures (server context) ─────────────────────────────────────────────
  insert into auth.users (id, email) values
    (drv,  'drv@clyzio-test-live.invalid'),
    (pax,  'pax@clyzio-test-live.invalid'),
    (outs, 'outs@clyzio-test-live.invalid');

  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status, passenger_capacity)
  values (drv, 'driver', d, 54.68712, 25.27961, 54.70, 25.30, 'matched', 2) returning id into i_drv;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (pax, 'passenger', d, 54.66431, 25.25118, 54.70, 25.30, 'matched') returning id into i_pax;

  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, pax, 'scheduled', 54.6650, 25.2520, 54.70, 25.30, 'carpool', 'Carpool', now() + interval '10 minutes') returning id into r_now;
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, pax, 'scheduled', 54.6650, 25.2520, 54.70, 25.30, 'carpool', 'Carpool', now() + interval '2 hours') returning id into r_later;

  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status,
                                          driver_approved, passenger_approved, ride_id, pickup_lat, pickup_long, pickup_address)
  values (i_drv, i_pax, drv, pax, d, 'confirmed', true, true, r_now, 54.6650, 25.2520, 'Pickup St 1')
  returning id into m1;

  -- ── Static: meeting points, partner start only approximate ────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', pax, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pt from public.get_match_points(p_ride_id => r_now);
  reset role;
  assert pt.partner_id = drv and pt.partner_role = 'driver', 'points: rider does not get the driver as partner';
  assert pt.pickup_lat = 54.6650 and pt.pickup_long = 25.2520, 'points: pickup point missing';
  assert abs(pt.partner_start_lat - 54.685) < 1e-9 and abs(pt.partner_start_long - 25.28) < 1e-9,
    format('points: driver start not snapped to the 0.005° grid (%s, %s)', pt.partner_start_lat, pt.partner_start_long);
  n := n + 3;

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into pt from public.get_match_points(p_match_id => m1);
  reset role;
  assert pt.partner_id = pax and pt.partner_role = 'rider', 'points: driver does not get the rider as partner';
  n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', outs, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_match_points(p_match_id => m1);
  reset role;
  assert cnt = 0, 'points: outsider sees the meeting points';
  n := n + 1;

  -- ── Live: rider shares inside the window, driver follows ─────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', pax, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.ride_live_locations (ride_id, user_id, lat, lng) values (r_now, pax, 54.6649, 25.2519)
  on conflict (ride_id, user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  -- Upsert again (what the app does every few seconds).
  insert into public.ride_live_locations (ride_id, user_id, lat, lng) values (r_now, pax, 54.6651, 25.2521)
  on conflict (ride_id, user_id) do update set lat = excluded.lat, lng = excluded.lng, updated_at = now();
  -- Not before the window opens.
  begin
    insert into public.ride_live_locations (ride_id, user_id, lat, lng) values (r_later, pax, 54.6649, 25.2519);
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  assert not ok, 'live: shared before the 15-minute window opened';
  n := n + 2;

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.ride_live_locations where ride_id = r_now and user_id = pax and lat = 54.6651;
  -- Nobody writes someone else's position.
  begin
    insert into public.ride_live_locations (ride_id, user_id, lat, lng) values (r_now, pax, 0, 0)
    on conflict (ride_id, user_id) do update set lat = excluded.lat, lng = excluded.lng;
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  assert cnt = 1, 'live: driver cannot see the rider''s latest position';
  assert not ok, 'live: driver overwrote the rider''s position';
  n := n + 2;

  perform set_config('request.jwt.claims', json_build_object('sub', outs, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.ride_live_locations where ride_id = r_now;
  reset role;
  assert cnt = 0, 'live: outsider sees live positions';
  n := n + 1;

  -- ── Ride over → positions gone ────────────────────────────────────────────
  perform set_config('request.jwt.claims', '{}', true);
  update public.rides set status = 'completed' where id = r_now;
  assert not exists (select 1 from public.ride_live_locations where ride_id = r_now), 'cleanup: positions kept after the ride ended';
  n := n + 1;

  raise exception 'PARTNER LOCATIONS: ALL % CHECKS PASSED', n;
end
$test$;
