-- Scenario test for migrations 046 (restored 011/012) and 047 (live carpool
-- updates + carpool CO₂ against driving alone).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Success is "CARPOOL FLOW: ALL n CHECKS PASSED"; a failure
-- names the broken check. Assumes 046 and 047 are applied.

do $test$
declare
  drv      uuid := gen_random_uuid();
  rdr      uuid := gen_random_uuid();
  referrer uuid := gen_random_uuid();
  r_carpool uuid;
  r_solo    uuid;
  r_done    uuid;
  dist  double precision;
  v     numeric;
  code  text;
  ok    boolean;
  n     int := 0;
begin
  -- ── Realtime (047) ────────────────────────────────────────────────────────
  assert (select count(*) from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public'
            and tablename in ('trip_intent_matches', 'rides', 'carpool_suggestions')) = 3,
         'realtime must broadcast trip_intent_matches, rides and carpool_suggestions';         n := n + 1;

  -- ── Profiles get 012's columns ────────────────────────────────────────────
  insert into auth.users (id, email) values
    (drv,      'drv@clyzio-test-solo.invalid'),
    (rdr,      'rdr@clyzio-test-solo.invalid'),
    (referrer, 'ref@clyzio-test-solo.invalid');

  select referral_code into code from public.profiles where id = referrer;
  assert code is not null and length(code) = 6, 'a new profile must get a 6-character referral code'; n := n + 1;
  assert (select notification_prefs ->> 'matches' from public.profiles where id = drv) = 'true',
         'notification_prefs must default to allowing match pushes';                            n := n + 1;

  -- Low weekly baselines (like the user's test accounts) used to zero carpools.
  update public.profiles set car_fuel_type = 'diesel', baseline_co2 = 0.032 where id = drv;
  update public.profiles set baseline_co2 = 0.09 where id = rdr;

  -- ── Carpool CO₂ = distance × driver's car factor (047) ────────────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long,
                            transport_mode, transport_label, scheduled_at)
  values (drv, rdr, 'scheduled', 54.6872, 25.2797, 54.7000, 25.3000, 'carpool', 'Carpool', now() + interval '1 day')
  returning id, distance_km, co2_saved into r_carpool, dist, v;
  assert dist > 1 and abs(v - round((dist * 0.171)::numeric, 3)) < 0.002,
         format('carpool co2 must be distance × diesel 0.171 (got %s for %s km)', v, dist);    n := n + 1;

  update public.profiles set car_fuel_type = null where id = drv;
  update public.rides set co2_saved = co2_saved where id = r_carpool returning co2_saved into v;
  assert abs(v - round((dist * 0.192)::numeric, 3)) < 0.002,
         'a carpool driver without a fuel type defaults to petrol 0.192';                        n := n + 1;

  -- Solo rides keep baseline − mode factor (rider baseline 0.09, bike 0).
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long,
                            transport_mode, transport_label, scheduled_at)
  values (rdr, 'scheduled', 54.6872, 25.2797, 54.7000, 25.3000, 'bike', 'Bike', now())
  returning id, co2_saved into r_solo, v;
  assert abs(v - round((dist * 0.09)::numeric, 3)) < 0.002, 'solo ride CO₂ formula must be unchanged'; n := n + 1;

  -- ── Ratings + SOS work for signed-in users (046) ──────────────────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long,
                            transport_mode, transport_label, scheduled_at, completed_at)
  values (drv, rdr, 'completed', 54.6872, 25.2797, 54.7000, 25.3000, 'carpool', 'Carpool', now(), now())
  returning id into r_done;

  perform set_config('request.jwt.claims', json_build_object('sub', rdr, 'role', 'authenticated')::text, true);
  set local role authenticated;

  insert into public.ratings (ride_id, rater_id, rated_id, score) values (r_done, rdr, drv, 5);
  assert (select count(*) from public.ratings where ride_id = r_done) = 1,
         'the rider must be able to rate the driver of a completed ride';                       n := n + 1;

  ok := false;
  begin
    insert into public.ratings (ride_id, rater_id, rated_id, score) values (r_carpool, rdr, drv, 4);
  exception when others then ok := true;
  end;
  assert ok, 'rating a ride that is not completed must be refused';                             n := n + 1;

  insert into public.safety_incidents (user_id, ride_id, kind) values (rdr, r_done, 'sos');
  assert (select count(*) from public.safety_incidents where user_id = rdr) = 1,
         'a signed-in user must be able to log an SOS incident';                                n := n + 1;

  update public.profiles set notification_prefs = notification_prefs || '{"matches": false}' where id = rdr;
  assert (select notification_prefs ->> 'matches' from public.profiles where id = rdr) = 'false',
         'users must be able to save their notification preferences';                          n := n + 1;

  reset role;
  perform set_config('request.jwt.claims', '{}', true);  -- no role = server context

  -- ── Referral award on first completed trip (013 + 046) ────────────────────
  update public.profiles set pending_referral_code = code where id = rdr;
  update public.rides set status = 'completed', completed_at = now() where id = r_carpool;
  assert exists (select 1 from public.referrals
                 where referee_id = rdr and referrer_id = referrer and status = 'completed'),
         'completing a referred user''s first trip must award the referral (used to error)';   n := n + 1;

  raise exception 'CARPOOL FLOW: ALL % CHECKS PASSED (fixtures rolled back)', n;
end
$test$;
