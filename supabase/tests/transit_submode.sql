-- Public-transport trips credited with the vehicle actually taken (migration 060).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Records every check; the final message lists failures, or
-- "TRANSIT SUBMODE: ALL n PASSED".
--
-- Cast: commuter u (petrol baseline 0.192) in company Q (verified domain).

do $test$
declare
  co uuid := gen_random_uuid();
  u  uuid := gen_random_uuid();
  r_tram uuid; r_plain uuid; r_bike uuid; r_done uuid;
  d numeric; v numeric; sub text;
  inv jsonb;
  ok boolean;
  passed int := 0;
  failed text[] := '{}';
begin
  insert into public.companies (id, name, domain) values (co, 'QA Transit Co', 'qa-transit.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values (co, 'qa-transit.invalid', now());
  insert into auth.users (id, email) values (u, 'u@qa-transit.invalid');
  update public.profiles set baseline_co2 = 0.192, car_fuel_type = 'petrol' where id = u;

  -- ── Factors: every transit vehicle cited, no unsourced blend ──────────────
  if (select count(*) from public.emission_factor
       where kind = 'transit' and key in ('bus', 'trolleybus', 'tram', 'subway', 'rail')
         and source ~ '20[0-9]{2}') = 5
     and not exists (select 1 from public.emission_factor where kind = 'transit' and key = 'mixed')
  then passed := passed + 1; else failed := failed || 'a transit factor has no cited source, or "mixed" is still there'::text; end if;

  -- ── The app saves trips (client role) ─────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, transit_submode, scheduled_at)
  values (u, 'scheduled', 54.68, 25.27, 54.74, 25.32, 'public', 'T1', 'tram', now())
  returning id, distance_km, co2_saved into r_tram, d, v;
  if abs(v - round((d * (0.192 - 0.029))::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || format('tram trip credited %s kg, expected the tram factor (%s)', v, round((d * (0.192 - 0.029))::numeric, 3)); end if;

  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (u, 'scheduled', 54.68, 25.27, 54.74, 25.32, 'public', 'Public transport', now())
  returning id, co2_saved into r_plain, v;
  if abs(v - round((d * (0.192 - 0.097))::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || format('public trip without a vehicle credited %s kg, expected the public factor', v); end if;

  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, transit_submode, scheduled_at)
  values (u, 'scheduled', 54.68, 25.27, 54.74, 25.32, 'bike', 'Bike', 'tram', now())
  returning id, co2_saved, transit_submode into r_bike, v, sub;
  if sub is null and abs(v - round((d * 0.192)::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || 'a non-transit trip keeps a transit vehicle'::text; end if;

  begin
    insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, transit_submode, scheduled_at)
    values (u, 'scheduled', 54.68, 25.27, 54.74, 25.32, 'public', 'Ferry', 'ferry', now());
    ok := true;
  exception when check_violation then ok := false;
  end;
  if not ok then passed := passed + 1; else failed := failed || 'an unknown transit vehicle is accepted'::text; end if;

  -- The vehicle is fixed once saved (only the status changes from the app).
  begin
    update public.rides set transit_submode = 'subway' where id = r_plain;
    ok := true;
  exception when others then ok := false;
  end;
  if not ok then passed := passed + 1; else failed := failed || 'the app can change a saved trip''s vehicle'::text; end if;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  -- ── Website ESG inventory uses the same factor ────────────────────────────
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, transit_submode, scheduled_at, completed_at)
  values (u, 'completed', 54.68, 25.27, 54.74, 25.32, 'public', 'T1', 'tram', now(), now())
  returning id, distance_km into r_done, d;
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  set local role authenticated;
  inv := public.get_company_inventory(co, current_date - 1, current_date + 1);
  reset role;
  if abs((inv ->> 'gross_kg')::numeric - round((d * 0.029)::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || format('inventory counts the tram trip as %s kg, expected %s', inv ->> 'gross_kg', round((d * 0.029)::numeric, 3)); end if;

  -- A company's own public-transport factor still wins.
  insert into public.company_emission_factors (company_id, transport_mode, factor_kg_per_km, effective_from, source, source_year)
  values (co, 'public', 0.050, current_date - 30, 'QA override', 2026);
  set local role authenticated;
  inv := public.get_company_inventory(co, current_date - 1, current_date + 1);
  reset role;
  if abs((inv ->> 'gross_kg')::numeric - round((d * 0.050)::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || format('a company public-transport override is ignored (%s kg)', inv ->> 'gross_kg'); end if;
  perform set_config('request.jwt.claims', '{}', true);

  if array_length(failed, 1) is null then
    raise exception 'TRANSIT SUBMODE: ALL % PASSED', passed;
  end if;
  raise exception 'TRANSIT SUBMODE: %/% PASSED; FAILED: %', passed, passed + array_length(failed, 1), array_to_string(failed, ' | ');
end;
$test$;
