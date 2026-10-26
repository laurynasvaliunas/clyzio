-- App ↔ website alignment suite (migration 055): the same people, the same
-- period, the same numbers on both clients, and one emission-factor table.
--
-- Side-effect free: ONE DO block that always ends by raising (everything rolls
-- back). Records every check; the final message lists failures, or
-- "APP/WEB ALIGNMENT: ALL n PASSED".
--
-- Cast: company Q with departments Ops and Sales; Dana (Ops, petrol driver),
-- Rui (Sales), Ola (no department). This week: Dana drives Rui (carpool,
-- both confirmed), Rui walks, Ola takes public transport, Dana bikes.

do $test$
declare
  co   uuid := gen_random_uuid();
  ops  uuid := gen_random_uuid();
  sales uuid := gen_random_uuid();
  dana uuid := gen_random_uuid();
  rui  uuid := gen_random_uuid();
  ola  uuid := gen_random_uuid();
  r_pool uuid; r_walk uuid; r_pt uuid; r_bike uuid;
  d_pool numeric; d_walk numeric; d_pt numeric; d_bike numeric;
  c_pool numeric; c_walk numeric; c_pt numeric; c_bike numeric;
  inv jsonb;
  app_week numeric;
  web_kg numeric;
  v numeric;
  cnt int;
  passed int := 0;
  failed text[] := '{}';
  week_start date := date_trunc('week', now())::date;
begin
  insert into public.companies (id, name, domain) values (co, 'QA Align Co', 'qa-align.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values (co, 'qa-align.invalid', now());
  insert into public.departments (id, company_id, name) values (ops, co, 'Ops'), (sales, co, 'Sales');
  insert into auth.users (id, email) values
    (dana, 'dana@qa-align.invalid'), (rui, 'rui@qa-align.invalid'), (ola, 'ola@qa-align.invalid');
  update public.profiles set department_id = ops, car_fuel_type = 'petrol', baseline_co2 = 0.192 where id = dana;
  update public.profiles set department_id = sales, baseline_co2 = 0.192 where id = rui;
  update public.profiles set baseline_co2 = 0.192 where id = ola;

  -- ── Joined through the verified domain ────────────────────────────────────
  select count(*) into cnt from public.profiles where id in (dana, rui, ola) and company_id = co;
  if cnt = 3 then passed := passed + 1; else failed := failed || format('verified-domain sign-up joined %s of 3', cnt); end if;

  -- ── Rides this week, confirmed the way complete-trip does it ─────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (dana, rui, 'completed', 54.68, 25.27, 54.72, 25.30, 'carpool', 'Carpool', now(), now()) returning id, distance_km, co2_saved into r_pool, d_pool, c_pool;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (rui, 'completed', 54.68, 25.27, 54.69, 25.28, 'walking', 'Walking', now(), now()) returning id, distance_km, co2_saved into r_walk, d_walk, c_walk;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (ola, 'completed', 54.68, 25.27, 54.74, 25.32, 'public', 'Public transport', now(), now()) returning id, distance_km, co2_saved into r_pt, d_pt, c_pt;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (dana, 'completed', 54.68, 25.27, 54.70, 25.29, 'bike', 'Bike', now(), now()) returning id, distance_km, co2_saved into r_bike, d_bike, c_bike;
  insert into public.ride_completions (ride_id, user_id) values (r_pool, dana), (r_pool, rui), (r_walk, rui), (r_pt, ola), (r_bike, dana);
  -- Profile counters as complete-trip credits them (half a carpool each).
  update public.profiles set total_co2_saved = c_pool / 2 + c_bike, trips_completed = 2 where id = dana;
  update public.profiles set total_co2_saved = c_pool / 2 + c_walk, trips_completed = 2 where id = rui;
  update public.profiles set total_co2_saved = c_pt, trips_completed = 1 where id = ola;

  -- ── One factor table, matching the app's constants ───────────────────────
  if (select co2_per_km from public.transport_mode_catalog where id = 'public') = 0.097
     and (select co2_per_km from public.transport_mode_catalog where id = 'ebike') = 0.005
     and (select co2_per_km from public.transport_mode_catalog where id = 'moto') = 0.103
     and (select co2_per_km from public.transport_mode_catalog where id = 'my_car') = 0.192
     and (select co2_per_km from public.emission_factor where kind = 'fuel' and key = 'electric') = 0.047
  then passed := passed + 1; else failed := failed || 'catalog / emission_factor values differ from the cited set the app uses'::text; end if;
  if not exists (select 1 from public.transport_mode_catalog where canonical and (source is null or source = '') and id not in ('wfh')) then
    passed := passed + 1; else failed := failed || 'a canonical mode has no cited source'::text; end if;
  if abs(c_pt - round((d_pt * (0.192 - 0.097))::numeric, 3)) < 0.002 then passed := passed + 1;
  else failed := failed || format('public transport saving uses %s, not 0.192 − 0.097', c_pt / nullif(d_pt, 0)); end if;

  -- ── Website per-employee coverage = app credited shares ──────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', dana, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for v, web_kg in
    select (case when c.user_id = dana then c_pool / 2 + c_bike when c.user_id = rui then c_pool / 2 + c_walk else c_pt end), c.primary_kg
      from public.get_employee_coverage(co, week_start, current_date + 1) c
  loop
    if abs(v - web_kg) < 0.002 then passed := passed + 1;
    else failed := failed || format('coverage %s kg vs app %s kg', web_kg, v); end if;
  end loop;
  app_week := ((public.get_user_impact(dana)) ->> 'this_week_co2')::numeric;
  select primary_kg into web_kg from public.get_employee_coverage(co, week_start, current_date + 1) where user_id = dana;
  if abs(app_week - web_kg) < 0.002 then passed := passed + 1;
  else failed := failed || format('Dana this week: app %s kg, website %s kg', app_week, web_kg); end if;

  -- Company totals (both clients) = sum of what each person sees.
  select total_co2_saved into v from public.get_company_totals(dana);
  if abs(v - (c_pool + c_bike + c_walk + c_pt)) < 0.003 then passed := passed + 1;
  else failed := failed || format('company total %s vs people %s', v, c_pool + c_bike + c_walk + c_pt); end if;

  -- Department breakdown by department_id, Ola as Unassigned.
  select count(*) into cnt from public.get_company_breakdown(dana) b
   where (b.department_name = 'Ops' and abs(b.total_co2_saved - (c_pool / 2 + c_bike)) < 0.002)
      or (b.department_name = 'Sales' and abs(b.total_co2_saved - (c_pool / 2 + c_walk)) < 0.002)
      or (b.department_name = 'Unassigned' and abs(b.total_co2_saved - c_pt) < 0.002);
  if cnt = 3 then passed := passed + 1; else failed := failed || format('department breakdown matched %s of 3 rows', cnt); end if;

  -- ── ESG inventory: emissions with the same factors ───────────────────────
  inv := public.get_company_inventory(co, week_start, current_date + 1);
  reset role;
  perform set_config('request.jwt.claims', '{}', true);

  -- Expected: carpool = petrol car split two ways, counted once per person;
  -- walking and bike 0; public transport 0.097 / km.
  v := round(d_pool * 0.192, 3) + round(d_pt * 0.097, 3);
  if abs((inv ->> 'gross_kg')::numeric - v) < 0.005 then passed := passed + 1;
  else failed := failed || format('inventory gross %s kg, expected %s', inv ->> 'gross_kg', v); end if;
  if coalesce((select sum((m ->> 'kg')::numeric) from jsonb_array_elements(inv -> 'by_mode') m), -1) between (inv ->> 'gross_kg')::numeric - 0.005 and (inv ->> 'gross_kg')::numeric + 0.005
  then passed := passed + 1; else failed := failed || 'inventory by_mode does not add up to gross'::text; end if;
  if coalesce((select (m ->> 'kg')::numeric from jsonb_array_elements(inv -> 'by_mode') m where m ->> 'mode' = 'walking'), 0) = 0
  then passed := passed + 1; else failed := failed || 'walking is reported with emissions'::text; end if;
  if coalesce((select sum((dd ->> 'gross_kg')::numeric) from jsonb_array_elements(inv -> 'by_department') dd), -1) between (inv ->> 'gross_kg')::numeric - 0.005 and (inv ->> 'gross_kg')::numeric + 0.005
  then passed := passed + 1; else failed := failed || 'inventory by_department gross does not add up to gross (it summed savings)'::text; end if;
  if (inv ->> 'employees_with_primary_data')::int = 3 then passed := passed + 1;
  else failed := failed || format('inventory sees %s of 3 employees with trips', inv ->> 'employees_with_primary_data'); end if;
  if exists (select 1 from jsonb_array_elements(inv -> 'factor_table') f where f ->> 'mode' = 'public' and (f ->> 'factor_kg_per_km')::numeric = 0.097 and f ->> 'source' like 'EEA%')
  then passed := passed + 1; else failed := failed || 'inventory factor table does not show public 0.097 (EEA)'::text; end if;

  -- ── Company counters follow membership ────────────────────────────────────
  if (select employee_count from public.companies where id = co) = 3 then passed := passed + 1;
  else failed := failed || format('company employee_count %s, expected 3', (select employee_count from public.companies where id = co)); end if;

  if array_length(failed, 1) is null then
    raise exception 'APP/WEB ALIGNMENT: ALL % PASSED', passed;
  end if;
  raise exception 'APP/WEB ALIGNMENT: %/% PASSED; FAILED: %', passed, passed + array_length(failed, 1), array_to_string(failed, ' | ');
end;
$test$;
