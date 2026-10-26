-- Scenario test for migration 050 ("Other, no motor" transport mode).
--
-- Side-effect free: one DO block that always ends by raising, so the fixtures
-- (and, in a dry run, the migration itself) are rolled back. Success is the
-- error message "NOMOTOR MODE: ALL n CHECKS PASSED". Assumes migration 050.
--
-- Fixture: one employee of a test company with one completed solo trip. With
-- one trip and no CO₂ or carpools, the green score is 40 when the trip counts
-- as green (40% weight × 100% green trips) and 0 when it doesn't.

do $test$
declare
  co   uuid := gen_random_uuid();
  emp  uuid := gen_random_uuid();
  r    uuid;
  n    int := 0;
  score int;
begin
  -- ── Catalog row ───────────────────────────────────────────────────────────
  assert exists (select 1 from public.transport_mode_catalog
                  where id = 'nomotor' and is_green and canonical and active and co2_per_km = 0),
         'catalog: nomotor row missing or not green/canonical/zero-emission';
  n := n + 1;

  -- ── Fixtures ──────────────────────────────────────────────────────────────
  insert into public.companies (id, name, domain) values (co, 'Test Co NoMotor', 'clyzio-test-nomotor.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values (co, 'clyzio-test-nomotor.invalid', now());
  insert into auth.users (id, email) values (emp, 'emp@clyzio-test-nomotor.invalid');
  assert (select company_id from public.profiles where id = emp) = co, 'fixture: employee not in company';
  update public.profiles set trips_completed = 1, total_co2_saved = 0 where id = emp;

  insert into public.rides (rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (emp, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'nomotor', 'Other, no motor', now()) returning id into r;
  update public.rides set status = 'completed' where id = r;

  -- ── A no-motor trip counts as green ──────────────────────────────────────
  perform public.recompute_company_green_score(co);
  select green_commute_score into score from public.companies where id = co;
  assert score = 40, format('green score with a nomotor trip: expected 40, got %s', score);
  n := n + 1;

  -- ── Control: the same trip by car is not green ───────────────────────────
  update public.rides set transport_mode = 'my_car' where id = r;
  perform public.recompute_company_green_score(co);
  select green_commute_score into score from public.companies where id = co;
  assert score = 0, format('green score with a car trip: expected 0, got %s', score);
  n := n + 1;

  raise exception 'NOMOTOR MODE: ALL % CHECKS PASSED', n;
end
$test$;
