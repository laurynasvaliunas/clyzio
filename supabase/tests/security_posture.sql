-- Security posture suite: who can read and change what (RLS matrix, definer
-- functions, protected columns, company membership), as the real roles.
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Unlike the scenario suites it doesn't stop at the first
-- failure: every check is recorded and the final message lists the failures,
-- "SECURITY POSTURE: n/m PASSED; FAILED: …" (or "ALL m PASSED").
--
-- Cast (all fixtures):
--   company A (verified domain qa-a.invalid): admin a_adm (user_roles admin +
--     companies.admin_user_id), manager a_mgr (profiles.is_manager), employees
--     a1, a2; company B: employee b1; public independents i1, i2; private
--     independent ip. A completed carpool a1 (driver) + a2, a scheduled solo ride
--     of a1, a rating a2 → a1, chat on the carpool.

do $test$
declare
  co_a uuid := gen_random_uuid();
  co_b uuid := gen_random_uuid();
  a_adm uuid := gen_random_uuid(); a_mgr uuid := gen_random_uuid();
  a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid();
  b1 uuid := gen_random_uuid();
  i1 uuid := gen_random_uuid(); i2 uuid := gen_random_uuid(); ip uuid := gen_random_uuid();
  victim uuid := gen_random_uuid();
  hires uuid[] := array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid()];
  dom_b uuid; dom_c uuid; tok_c text;
  r_pool uuid; r_solo uuid; r_i uuid;
  cnt int;
  ok_cnt int;
  ok boolean;
  txt text;
  passed int := 0;
  failed text[] := '{}';
begin
  -- ── Fixtures (server context) ─────────────────────────────────────────────
  insert into public.companies (id, name, domain) values (co_a, 'QA Co A', 'qa-a.invalid'), (co_b, 'QA Co B', 'qa-b.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values (co_a, 'qa-a.invalid', now()), (co_b, 'qa-b.invalid', now());
  insert into auth.users (id, email) values
    (a_adm, 'adm@qa-a.invalid'), (a_mgr, 'mgr@qa-a.invalid'), (a1, 'a1@qa-a.invalid'), (a2, 'a2@qa-a.invalid'),
    (b1, 'b1@qa-b.invalid'),
    (i1, 'i1@clyzio-test-sec.invalid'), (i2, 'i2@clyzio-test-sec.invalid'), (ip, 'ip@clyzio-test-sec.invalid');
  update public.profiles set company_id = co_a, is_solo_user = false where id in (a_adm, a_mgr, a1, a2);
  update public.profiles set company_id = co_b, is_solo_user = false where id = b1;
  update public.profiles set is_manager = true where id = a_mgr;
  update public.profiles set is_public = true where id in (i1, i2);
  update public.profiles set is_public = false where id = ip;
  update public.companies set admin_user_id = a_adm where id = co_a;
  insert into public.user_roles (user_id, role, company_id) values (a_adm, 'admin', co_a) on conflict do nothing;

  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at, completed_at)
  values (a1, a2, 'completed', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', now() - interval '1 day', now() - interval '1 day') returning id into r_pool;
  insert into public.ride_completions (ride_id, user_id) values (r_pool, a1), (r_pool, a2);
  insert into public.ratings (ride_id, rater_id, rated_id, score) values (r_pool, a2, a1, 2);
  insert into public.messages (ride_id, sender_id, content) values (r_pool, a2, 'qa message');
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (a1, 'scheduled', 54.6801, 25.2701, 54.70, 25.30, 'bike', 'Bike', now() + interval '1 hour') returning id into r_solo;
  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (i1, 'scheduled', 54.6802, 25.2702, 54.70, 25.30, 'bike', 'Bike', now() + interval '1 hour') returning id into r_i;

  -- ── Anonymous ─────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  cnt := 0;
  foreach txt in array array['profiles', 'rides', 'messages', 'ratings', 'trip_intents', 'trip_intent_matches', 'companies',
                             'ride_completions', 'user_roles', 'company_invites', 'referrals', 'safety_incidents'] loop
    begin
      execute format('select count(*) from public.%I', txt) into ok_cnt;
      cnt := cnt + ok_cnt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  if cnt = 0 then passed := passed + 1; else failed := failed || format('anon reads %s private rows', cnt); end if;
  begin
    insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
    values (a1, 'scheduled', 0, 0, 0, 0, 'bike', 'Bike', now());
    failed := failed || 'anon can insert a ride'::text;
  exception when others then passed := passed + 1;
  end;
  begin
    perform public.get_peer_rides('rider');
    failed := failed || 'anon can call the radar'::text;
  exception when others then passed := passed + 1;
  end;
  reset role;

  -- ── Profiles ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.profiles where id = a2;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'employee reads a colleague''s full profile'::text; end if;
  select count(*) into cnt from public.profiles where id = b1;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'employee reads another company''s profile'::text; end if;
  -- Protected columns: company, manager flag, counters.
  foreach txt in array array['company_id', 'is_manager', 'total_co2_saved', 'trips_completed', 'xp_points', 'email'] loop
    begin
      execute format('update public.profiles set %I = %s where id = %L', txt,
        case txt when 'company_id' then quote_literal(co_b) when 'is_manager' then 'true' when 'email' then quote_literal('x@evil.invalid') else '99999' end, a1);
      failed := failed || format('employee changes own protected column %s', txt);
    exception
      when insufficient_privilege then passed := passed + 1;
      when others then failed := failed || format('inconclusive (%s) changing %s: %s', sqlstate, txt, sqlerrm);
    end;
  end loop;
  -- The CO₂ baseline drives every solo ride's saving: it must stay plausible
  -- (profiles_baseline_co2_range, 0–0.3 kg/km).
  begin
    update public.profiles set baseline_co2 = 1000 where id = a1;
    failed := failed || 'baseline_co2 can be set to 1000 kg/km (inflates CO₂ saved)'::text;
  exception when others then passed := passed + 1;
  end;
  reset role;

  -- Manager sees colleagues through the team list (no locations, 055/057),
  -- not their whole profile rows, and not other companies.
  perform set_config('request.jwt.claims', json_build_object('sub', a_mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_company_members(co_a) where id in (a1, a2);
  if cnt = 2 then passed := passed + 1; else failed := failed || format('manager team list shows %s of 2 colleagues', cnt); end if;
  select count(*) into cnt from public.profiles where id in (a1, a2);
  if cnt = 0 then passed := passed + 1; else failed := failed || 'manager reads colleagues'' full profiles (home and work locations)'::text; end if;
  select count(*) into cnt from public.get_company_members(co_b);
  if cnt = 0 then passed := passed + 1; else failed := failed || 'manager lists another company''s team'::text; end if;
  select count(*) into cnt from public.profiles where id = b1;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'manager sees another company''s employee'::text; end if;
  reset role;

  -- ── Rides, ratings, messages ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.rides where id in (r_pool, r_solo);
  if cnt = 0 then passed := passed + 1; else failed := failed || 'outsider reads another company''s rides'::text; end if;
  select count(*) into cnt from public.messages where ride_id = r_pool;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'outsider reads a carpool chat'::text; end if;
  select count(*) into cnt from public.ratings where ride_id = r_pool;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'anyone signed in reads every rating (who rated whom, score)'::text; end if;
  update public.rides set status = 'cancelled' where id = r_solo;
  get diagnostics cnt = row_count;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'outsider cancels someone''s ride'::text; end if;
  select count(*) into cnt from public.get_peer_rides('rider') where ride_id = r_solo;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'radar shows another company''s ride'::text; end if;
  reset role;

  perform set_config('request.jwt.claims', json_build_object('sub', a2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.rides where id = r_solo;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'colleague reads exact start/destination of an upcoming ride (closed by 056)'::text; end if;
  -- The Map radar (055) shows the same ride at ~300 m precision instead.
  select count(*) into cnt from public.get_peer_rides('rider') where ride_id = r_solo and approx_origin_lat = 54.68 and approx_origin_long = 25.27;
  if cnt = 1 then passed := passed + 1; else failed := failed || 'radar does not show a colleague''s ride at ~300 m precision'::text; end if;
  -- Ratings stay readable for the two people involved.
  select count(*) into cnt from public.ratings where ride_id = r_pool;
  if cnt = 1 then passed := passed + 1; else failed := failed || 'the rater cannot read their own rating'::text; end if;
  reset role;

  -- The rated driver must not be able to wipe the ride (and the rating, chat
  -- and completions with it).
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  delete from public.rides where id = r_pool;
  get diagnostics cnt = row_count;
  reset role;
  if cnt = 0 and exists (select 1 from public.ratings where ride_id = r_pool) then passed := passed + 1;
  else failed := failed || 'participant deletes a completed carpool ride, erasing the partner''s rating and chat'::text; end if;

  -- ── Server-only tables ────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  cnt := 0;
  foreach txt in array array['ride_completions', 'matcher_runs', 'demo_requests', 'app_config', 'transit_route_cache'] loop
    begin
      execute format('select count(*) from public.%I', txt) into ok_cnt;
      cnt := cnt + ok_cnt;
    exception when insufficient_privilege then null;
    end;
  end loop;
  if cnt = 0 then passed := passed + 1; else failed := failed || format('employee reads %s server-only rows', cnt); end if;
  begin
    insert into public.user_roles (user_id, role, company_id) values (a1, 'admin', co_a);
    failed := failed || 'employee grants themselves company admin'::text;
  exception
    when insufficient_privilege then passed := passed + 1;
    when others then failed := failed || format('inconclusive (%s) employee grants themselves company admin: %s', sqlstate, sqlerrm);
  end;
  begin
    insert into public.company_invites (company_id, email, role, token, expires_at) values (co_a, 'x@qa-a.invalid', 'employee', 'qa-token', now() + interval '1 day');
    failed := failed || 'employee creates a company invite'::text;
  exception
    when insufficient_privilege then passed := passed + 1;
    when others then failed := failed || format('inconclusive (%s) employee creates a company invite: %s', sqlstate, sqlerrm);
  end;
  update public.companies set name = 'pwned' where id = co_a;
  get diagnostics cnt = row_count;
  if cnt = 0 then passed := passed + 1; else failed := failed || 'employee renames the company'::text; end if;
  reset role;

  -- ── Definer functions: no reading other companies / other people ─────────
  perform set_config('request.jwt.claims', json_build_object('sub', b1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  foreach txt in array array[
    format('select public.get_company_totals(%L)', a1),
    format('select public.get_company_breakdown(%L)', a1),
    format('select public.get_company_leaderboard(%L)', a1),
    format('select public.get_department_leaderboard(%L)', a1),
    format('select public.get_company_stats(%L)', co_a),
    format('select public.get_company_inventory(%L, current_date - 30, current_date)', co_a),
    format('select public.get_employee_coverage(%L, current_date - 30, current_date)', co_a),
    format('select public.get_user_impact(%L)', a1),
    format('select public.get_user_commute_context(%L)', a1)] loop
    begin
      execute txt;
      failed := failed || format('outsider runs: %s', txt);
    exception
      when insufficient_privilege then passed := passed + 1;
      when others then failed := failed || format('inconclusive (%s) %s: %s', sqlstate, txt, sqlerrm);
    end;
  end loop;
  -- find_carpool_candidates must not let a caller borrow someone else's view.
  begin
    select count(*) into cnt from public.find_carpool_candidates(54.68, 25.27, 54.70, 25.30, now(), 'driver', 5, b1, a2);
    if cnt = 0 then passed := passed + 1;
    else failed := failed || format('find_carpool_candidates with p_caller_id = someone else reveals %s of their visible rides', cnt); end if;
  exception when others then passed := passed + 1;
  end;
  reset role;

  -- ── Company domain → automatic membership ─────────────────────────────────
  -- A company admin must not be able to claim a domain they don't own: new
  -- sign-ups with that address would silently join their company.
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.companies set domain = 'victim-corp.invalid' where id = co_a;
    get diagnostics cnt = row_count;
  exception when others then cnt := 0;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  insert into auth.users (id, email) values (victim, 'new.hire@victim-corp.invalid');
  if (select company_id from public.profiles where id = victim) is null then passed := passed + 1;
  else failed := failed || 'a company admin claims an unverified domain and new sign-ups join their company'::text; end if;

  -- Nor can they mark a domain verified without the DNS check (058). The
  -- website's flow — add a domain, read its token — keeps working.
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.company_domains (company_id, domain, verified_at) values (co_a, 'victim-a.invalid', now());
  exception when others then null;
  end;
  begin
    insert into public.company_domains (company_id, domain) values (co_a, 'victim-b.invalid') returning id into dom_b;
    insert into public.company_domains (company_id, domain) values (co_a, 'victim-c.invalid') returning id, verification_token into dom_c, tok_c;
  exception when others then null;
  end;
  begin
    update public.company_domains set verified_at = now() where id = dom_b;
  exception when others then null;
  end;
  begin
    perform public.verify_company_domain(dom_c, tok_c);
  exception when others then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '{}', true);
  if dom_c is not null and tok_c is not null then passed := passed + 1;
  else failed := failed || 'company admin can no longer add a domain and read its DNS token (website settings)'::text; end if;
  if not exists (select 1 from public.company_domains where domain = 'victim-a.invalid' and verified_at is not null) then passed := passed + 1;
  else failed := failed || 'company admin adds a domain already marked verified'::text; end if;
  if not exists (select 1 from public.company_domains where id = dom_b and verified_at is not null) then passed := passed + 1;
  else failed := failed || 'company admin sets verified_at on their domain'::text; end if;
  if not exists (select 1 from public.company_domains where id = dom_c and verified_at is not null) then passed := passed + 1;
  else failed := failed || 'company admin verifies a domain through verify_company_domain without DNS'::text; end if;
  insert into auth.users (id, email) values
    (hires[1], 'new.hire@victim-a.invalid'), (hires[2], 'new.hire@victim-b.invalid'), (hires[3], 'new.hire@victim-c.invalid');
  if not exists (select 1 from public.profiles where id = any(hires) and company_id = co_a) then passed := passed + 1;
  else failed := failed || 'new sign-ups join a company through a domain it never proved'::text; end if;

  -- Company counters (score, CO₂, employees) are computed, not admin-editable.
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    update public.companies set green_commute_score = 100, total_co2_saved = 99999 where id = co_a;
    get diagnostics cnt = row_count;
  exception when others then cnt := 0;
  end;
  -- …while the website's company settings (name, logo, colour) keep working.
  update public.companies set name = 'QA Co A renamed' where id = co_a;
  get diagnostics ok_cnt = row_count;
  reset role;
  if cnt = 0 then passed := passed + 1;
  else failed := failed || 'company admin sets their own green score and CO₂ total'::text; end if;
  if ok_cnt = 1 then passed := passed + 1;
  else failed := failed || 'company admin can no longer rename their company (website settings)'::text; end if;
  perform set_config('request.jwt.claims', '{}', true);

  -- ── Independents ──────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', i2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.get_public_profiles(array[ip, a1]);
  if cnt = 0 then passed := passed + 1; else failed := failed || 'independent sees a private user or a company employee'::text; end if;
  reset role;

  perform set_config('request.jwt.claims', '{}', true);
  if array_length(failed, 1) is null then
    raise exception 'SECURITY POSTURE: ALL % PASSED', passed;
  end if;
  raise exception 'SECURITY POSTURE: %/% PASSED; FAILED: %', passed, passed + array_length(failed, 1), array_to_string(failed, ' | ');
end;
$test$;
