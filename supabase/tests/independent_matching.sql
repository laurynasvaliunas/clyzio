-- Scenario test for migration 045 (independent matching).
--
-- Side-effect free: everything runs in ONE DO block that always ends by
-- raising, so the fixtures (and anything else) are rolled back. Success is the
-- error message "INDEPENDENT MATCHING: ALL n CHECKS PASSED"; a failure names
-- the check that broke. Assumes migrations 045 and 053 are applied.
--
-- Fixtures: companies A and B; independents ind1, ind2 (public) and
-- ind_private (not public); employees emp_a (A, open trip), emp_a2 (A, closed
-- trip) and emp_b (B, closed trip). All trips are for tomorrow.

do $test$
declare
  co_a        uuid := gen_random_uuid();
  co_b        uuid := gen_random_uuid();
  ind1        uuid := gen_random_uuid();
  ind2        uuid := gen_random_uuid();
  ind_private uuid := gen_random_uuid();
  emp_a       uuid := gen_random_uuid();
  emp_a2      uuid := gen_random_uuid();
  emp_b       uuid := gen_random_uuid();
  d           date := current_date + 1;
  i_ind1 uuid; i_ind2 uuid; i_private uuid; i_emp_a uuid; i_emp_a2 uuid; i_emp_b uuid;
  n   int := 0;
  cnt int;
  col boolean;
begin
  -- ── Fixtures ──────────────────────────────────────────────────────────────
  -- Company is assigned from the email domain by assign_company_to_profile
  -- (verified domains only, since 055).
  insert into public.companies (id, name, domain) values
    (co_a, 'Test Co A', 'clyzio-test-a.invalid'),
    (co_b, 'Test Co B', 'clyzio-test-b.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values
    (co_a, 'clyzio-test-a.invalid', now()),
    (co_b, 'clyzio-test-b.invalid', now());

  insert into auth.users (id, email) values
    (ind1,        'ind1@clyzio-test-solo.invalid'),
    (ind2,        'ind2@clyzio-test-solo.invalid'),
    (ind_private, 'private@clyzio-test-solo.invalid'),
    (emp_a,       'emp.a@clyzio-test-a.invalid'),
    (emp_a2,      'emp.a2@clyzio-test-a.invalid'),
    (emp_b,       'emp.b@clyzio-test-b.invalid');

  update public.profiles set is_public = true
   where id in (ind1, ind2, emp_a, emp_a2, emp_b);

  assert (select company_id from public.profiles where id = emp_a) = co_a, 'fixture: emp_a not in company A';
  assert (select company_id from public.profiles where id = ind1) is null, 'fixture: ind1 has a company';

  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (ind1,        'passenger', d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, false) returning id into i_ind1;
  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (ind2,        'driver',    d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, false) returning id into i_ind2;
  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (ind_private, 'passenger', d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, false) returning id into i_private;
  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (emp_a,       'driver',    d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, true)  returning id into i_emp_a;
  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (emp_a2,      'passenger', d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, false) returning id into i_emp_a2;
  insert into public.trip_intents (user_id, role, trip_date, departure_time, home_lat, home_long, work_lat, work_long, open_to_independents)
  values (emp_b,       'driver',    d, '08:00', 54.6872, 25.2797, 54.7000, 25.3000, false) returning id into i_emp_b;

  -- ── Person-level: is_peer_visible ─────────────────────────────────────────
  assert public.is_peer_visible(emp_a, emp_a2),           'colleagues must see each other';                n := n + 1;
  assert public.is_peer_visible(ind1, ind2),              'two public independents must see each other';   n := n + 1;
  assert not public.is_peer_visible(ind1, ind_private),   'a non-public independent must be hidden';       n := n + 1;
  assert public.is_peer_visible(ind1, emp_a),             'independent must see employee with open trip';  n := n + 1;
  assert public.is_peer_visible(emp_a, ind1),             'employee with open trip must see independent';  n := n + 1;
  assert not public.is_peer_visible(ind1, emp_b),         'employee without open trip must be hidden';     n := n + 1;
  assert not public.is_peer_visible(ind1, emp_a2),        'closed colleague of an open employee hidden';   n := n + 1;
  assert not public.is_peer_visible(ind_private, emp_a),  'non-public independent hidden from open trip';  n := n + 1;
  assert not public.is_peer_visible(emp_a, emp_b),        'other companies hidden while cross-org is off'; n := n + 1;

  update public.companies set allow_cross_org_visibility = true where id in (co_a, co_b);
  assert public.is_peer_visible(emp_a, emp_b),            'other companies visible when both allow it';    n := n + 1;
  assert not public.is_peer_visible(ind1, emp_b),         'company cross-org must NOT expose employees to independents'; n := n + 1;
  update public.companies set allow_cross_org_visibility = false where id in (co_a, co_b);

  -- ── Trip-level: can_pair_intents ──────────────────────────────────────────
  assert public.can_pair_intents(i_ind2, i_ind1),         'two independents can pair';                     n := n + 1;
  assert public.can_pair_intents(i_emp_a, i_ind1),        'open employee drive + independent can pair';    n := n + 1;
  assert not public.can_pair_intents(i_emp_b, i_ind1),    'closed employee drive cannot pair with independent'; n := n + 1;
  assert not public.can_pair_intents(i_emp_a, i_private), 'non-public independent cannot pair';            n := n + 1;
  assert public.can_pair_intents(i_emp_a, i_emp_a2),      'colleagues can pair';                           n := n + 1;
  assert not public.can_pair_intents(i_emp_b, i_emp_a2),  'other companies cannot pair (cross-org off)';   n := n + 1;
  assert not public.can_pair_intents(i_ind1, i_ind1),     'an intent cannot pair with itself';             n := n + 1;

  -- A match row links emp_b and ind1: profiles become visible, but the closed
  -- trip still can't be paired.
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date)
  values (i_emp_b, i_ind1, emp_b, ind1, d);
  assert public.is_peer_visible(ind1, emp_b),             'matched partners must see each other';          n := n + 1;
  assert not public.can_pair_intents(i_emp_b, i_ind1),    'a match link must not open a closed trip';      n := n + 1;

  -- ── Radar: get_peer_trip_intents (as each user) ───────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', ind1, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = ind2;
  assert cnt = 1, 'ind1 must see ind2''s intent';                                                         n := n + 1;
  select count(*), bool_and(not is_colleague) into cnt, col from public.get_peer_trip_intents(d) where user_id = emp_a;
  assert cnt = 1 and col, 'ind1 must see emp_a''s open intent, labelled not a colleague';                n := n + 1;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id in (emp_b, emp_a2, ind_private);
  assert cnt = 0, 'ind1 must not see closed employee trips or the private independent';                  n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', emp_a, 'role', 'authenticated')::text, true);
  select count(*), bool_and(is_colleague) into cnt, col from public.get_peer_trip_intents(d) where user_id = emp_a2;
  assert cnt = 1 and col, 'emp_a must see colleague emp_a2, labelled colleague';                         n := n + 1;
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = ind2;
  assert cnt = 1, 'employee with an open trip that day must see independents';                           n := n + 1;
  -- ind1 already has an open offer (the emp_b match above): off the radar since 053.
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = ind1;
  assert cnt = 0, 'a rider with an open offer is not offered on the radar';                              n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', emp_b, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id in (ind1, ind2);
  assert cnt = 0, 'employee without an open trip must not see independents (even if matched)';         n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', emp_a2, 'role', 'authenticated')::text, true);
  select count(*) into cnt from public.get_peer_trip_intents(d) where user_id = ind1;
  assert cnt = 0, 'closed colleague of an open employee must not see independents';                     n := n + 1;

  -- ── Profiles: get_public_profiles ─────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', ind1, 'role', 'authenticated')::text, true);
  select count(*), bool_and(not is_colleague) into cnt, col from public.get_public_profiles(array[emp_a]);
  assert cnt = 1 and col, 'ind1 must get emp_a''s card, not a colleague';                               n := n + 1;
  select count(*) into cnt from public.get_public_profiles(array[emp_a2, ind_private]);
  assert cnt = 0, 'hidden users must not be returned';                                                  n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', emp_a, 'role', 'authenticated')::text, true);
  select count(*), bool_and(is_colleague) into cnt, col from public.get_public_profiles(array[emp_a2]);
  assert cnt = 1 and col, 'emp_a must get emp_a2''s card as a colleague';                               n := n + 1;

  raise exception 'INDEPENDENT MATCHING: ALL % CHECKS PASSED (fixtures rolled back)', n;
end
$test$;
