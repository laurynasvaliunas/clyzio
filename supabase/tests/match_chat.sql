-- Scenario test for migration 051 (chat between matched commuters).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Success is "MATCH CHAT: ALL n CHECKS PASSED"; a failure names
-- the broken check. Assumes 051 is applied (or runs in the same transaction).
--
-- Fixtures: two independents matched for tomorrow — the driver has approved,
-- the passenger hasn't yet — and the passenger has matching turned OFF
-- (is_public = false), which used to hide them from their own match. Plus an
-- outsider who must see nothing.

do $test$
declare
  drv  uuid := gen_random_uuid();
  pax  uuid := gen_random_uuid();
  outs uuid := gen_random_uuid();
  d    date := current_date + 1;
  i_drv uuid; i_pax uuid; m1 uuid; r1 uuid; msg_id bigint;
  cnt int;
  ok  boolean;
  n   int := 0;
begin
  -- ── Fixtures (server context) ─────────────────────────────────────────────
  insert into auth.users (id, email) values
    (drv,  'drv@clyzio-test-chat.invalid'),
    (pax,  'pax@clyzio-test-chat.invalid'),
    (outs, 'outs@clyzio-test-chat.invalid');
  update public.profiles set is_public = true  where id in (drv, outs);
  update public.profiles set is_public = false where id = pax;

  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status, passenger_capacity)
  values (drv, 'driver', d, 54.68, 25.27, 54.70, 25.30, 'pending', 2) returning id into i_drv;
  insert into public.trip_intents (user_id, role, trip_date, home_lat, home_long, work_lat, work_long, status)
  values (pax, 'passenger', d, 54.68, 25.27, 54.70, 25.30, 'pending') returning id into i_pax;
  insert into public.trip_intent_matches (driver_intent_id, passenger_intent_id, driver_user_id, passenger_user_id, trip_date, status, driver_approved)
  values (i_drv, i_pax, drv, pax, d, 'awaiting_other', true) returning id into m1;

  -- ── Matched partners see each other, even with matching switched off ─────
  assert public.is_peer_visible(drv, pax), 'visibility: driver cannot see a matched, non-public passenger';
  assert public.is_peer_visible(pax, drv), 'visibility: passenger cannot see their matched driver';
  assert not public.is_peer_visible(outs, pax), 'visibility: outsider sees a non-public independent';
  n := n + 3;

  -- ── Passenger writes before approving (no ride yet) ───────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', pax, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.messages (match_id, sender_id, content) values (m1, pax, 'Can you pick me up at 8:10?')
    returning id into msg_id;
  reset role;
  n := n + 1;

  -- Driver reads it.
  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.messages where match_id = m1;
  reset role;
  assert cnt = 1, format('read: driver sees %s match messages, expected 1', cnt);
  n := n + 1;

  -- Outsider neither reads nor writes.
  perform set_config('request.jwt.claims', json_build_object('sub', outs, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.messages where match_id = m1;
  begin
    insert into public.messages (match_id, sender_id, content) values (m1, outs, 'hi');
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  assert cnt = 0, 'read: outsider sees the match thread';
  assert not ok, 'write: outsider posted into the match thread';
  n := n + 2;

  -- Nobody posts as someone else.
  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.messages (match_id, sender_id, content) values (m1, pax, 'spoofed');
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  assert not ok, 'write: driver posted as the passenger';
  n := n + 1;
  perform set_config('request.jwt.claims', '{}', true);

  -- ── Confirmation: the conversation moves onto the ride ────────────────────
  insert into public.rides (driver_id, rider_id, status, origin_lat, origin_long, dest_lat, dest_long, transport_mode, transport_label, scheduled_at)
  values (drv, pax, 'scheduled', 54.68, 25.27, 54.70, 25.30, 'carpool', 'Carpool', d + time '08:00') returning id into r1;
  update public.trip_intent_matches set status = 'confirmed', passenger_approved = true, ride_id = r1 where id = m1;
  assert (select ride_id from public.messages where id = msg_id) = r1, 'carry-over: match message not tied to the ride';
  n := n + 1;

  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into cnt from public.messages where ride_id = r1;
  reset role;
  assert cnt = 1, format('carry-over: ride thread shows %s messages, expected 1', cnt);
  n := n + 1;

  -- ── A closed match takes no new messages; history stays readable ──────────
  perform set_config('request.jwt.claims', '{}', true);
  update public.trip_intent_matches set status = 'cancelled_by_passenger', ride_id = null where id = m1;
  perform set_config('request.jwt.claims', json_build_object('sub', drv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.messages (match_id, sender_id, content) values (m1, drv, 'still there?');
    ok := true;
  exception when others then ok := false;
  end;
  select count(*) into cnt from public.messages where match_id = m1;
  reset role;
  assert not ok, 'write: posted into a cancelled match';
  assert cnt = 1, 'read: history of a cancelled match disappeared';
  n := n + 2;
  perform set_config('request.jwt.claims', '{}', true);

  raise exception 'MATCH CHAT: ALL % CHECKS PASSED', n;
end
$test$;
