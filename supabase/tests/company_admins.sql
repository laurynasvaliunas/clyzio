-- Several admins per company, and invites (migration 061).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Records every check; the final message lists failures, or
-- "COMPANY ADMINS: ALL n PASSED".
--
-- Cast: company A (verified qa-adm-a.invalid) with admin adm, managers mgr
-- (joined a year ago) and mgr2 (yesterday), employees e1, e2 and department
-- Ops; company B (verified qa-adm-b.invalid) with admin b_adm and employee
-- b_e1; x has an account but no company; hire signs up during the test.

do $test$
declare
  co_a uuid := gen_random_uuid(); co_b uuid := gen_random_uuid(); ops uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid(); mgr2 uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
  b_adm uuid := gen_random_uuid(); b_e1 uuid := gen_random_uuid();
  x uuid := gen_random_uuid(); hire uuid := gen_random_uuid();
  tok text; res text; err text; n int;
  ok boolean;
  txt text;
  r record;
  passed int := 0;
  failed text[] := '{}';
begin
  insert into public.companies (id, name, domain) values (co_a, 'QA ADM A', 'qa-adm-a.invalid'), (co_b, 'QA ADM B', 'qa-adm-b.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values
    (co_a, 'qa-adm-a.invalid', now()), (co_b, 'qa-adm-b.invalid', now());
  insert into public.departments (id, company_id, name) values (ops, co_a, 'Ops');
  insert into auth.users (id, email) values
    (adm, 'adm@qa-adm-a.invalid'), (mgr, 'mgr@qa-adm-a.invalid'), (mgr2, 'mgr2@qa-adm-a.invalid'),
    (e1, 'e1@qa-adm-a.invalid'), (e2, 'e2@qa-adm-a.invalid'),
    (b_adm, 'adm@qa-adm-b.invalid'), (b_e1, 'e1@qa-adm-b.invalid'), (x, 'x@qa-adm-out.invalid');
  update public.profiles set is_manager = true, created_at = now() - interval '1 year' where id = mgr;
  update public.profiles set is_manager = true, created_at = now() - interval '1 day' where id = mgr2;
  update public.profiles set is_manager = true where id in (adm, b_adm);
  update public.companies set admin_user_id = adm where id = co_a;
  update public.companies set admin_user_id = b_adm where id = co_b;
  insert into public.user_roles (user_id, role, company_id) values (adm, 'admin', co_a), (b_adm, 'admin', co_b)
    on conflict do nothing;

  -- ── Adding an admin ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_admin(e1, true);
  ok := auth.uid() = adm and auth.role() = 'authenticated';
  reset role;
  if public.is_company_admin(e1, co_a) and (select is_manager from public.profiles where id = e1) then passed := passed + 1;
  else failed := failed || 'an admin cannot make a colleague an admin (and manager)'::text; end if;
  if ok then passed := passed + 1;
  else failed := failed || 'set_member_admin leaves the request running as the server'::text; end if;

  -- The new admin manages the company like the first one.
  perform set_config('request.jwt.claims', json_build_object('sub', e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.companies set fy_start_month = 4 where id = co_a;
  select * into r from public.get_my_company_role();
  reset role;
  if (select fy_start_month from public.companies where id = co_a) = 4 then passed := passed + 1;
  else failed := failed || 'a second admin cannot edit company settings'::text; end if;
  if r.company_id = co_a and r.is_admin and r.is_manager and r.company_has_admin then passed := passed + 1;
  else failed := failed || 'get_my_company_role does not report a second admin'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.get_my_company_role();
  reset role;
  if r.company_id = co_a and not r.is_admin and not r.is_manager and r.company_has_admin then passed := passed + 1;
  else failed := failed || 'get_my_company_role calls an employee an admin'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) filter (where m.is_admin), bool_and(m.is_admin = (m.id in (adm, e1))) into n, ok
    from public.get_company_members(co_a) m;
  reset role;
  if n = 2 and ok then passed := passed + 1;
  else failed := failed || 'the team list does not mark exactly the admins'::text; end if;

  -- ── Who may not ──────────────────────────────────────────────────────────
  foreach txt in array array['manager', 'themselves', 'other company admin'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case txt when 'manager' then mgr when 'themselves' then e2 else b_adm end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.set_member_admin(e2, true);
      ok := true;
    exception when others then ok := false;
    end;
    reset role;
    if not ok then passed := passed + 1;
    else failed := failed || format('set_member_admin allowed: %s', txt); end if;
  end loop;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.set_member_admin(e2, true);
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if not ok then passed := passed + 1; else failed := failed || 'anon can call set_member_admin'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.user_roles (user_id, role, company_id) values (e2, 'admin', co_a);
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if not ok then passed := passed + 1; else failed := failed || 'an employee can grant themselves admin'::text; end if;
  if not public.is_company_admin(e2, co_a) then passed := passed + 1;
  else failed := failed || 'a refused grant still made someone an admin'::text; end if;

  -- An admin can't remove another admin around set_member_admin.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update public.user_roles set role = 'employee' where user_id = e1 and company_id = co_a and role = 'admin';
  delete from public.user_roles where user_id = e1 and company_id = co_a and role = 'admin';
  begin
    update public.companies set admin_user_id = e2 where id = co_a;
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if public.is_company_admin(e1, co_a) then passed := passed + 1;
  else failed := failed || 'an admin removed another admin by editing user_roles'::text; end if;
  if not ok then passed := passed + 1;
  else failed := failed || 'an admin can repoint companies.admin_user_id'::text; end if;

  -- An admin stays a manager.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.set_member_manager(e1, false);
    err := null;
  exception when others then err := sqlerrm;
  end;
  reset role;
  if err = 'target_is_admin' and (select is_manager from public.profiles where id = e1) then passed := passed + 1;
  else failed := failed || format('removing an admin''s manager role: %s', coalesce(err, 'allowed')); end if;

  -- ── Removing admins ──────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_admin(e1, false);
  begin
    perform public.set_member_admin(adm, false);
    err := null;
  exception when others then err := sqlerrm;
  end;
  reset role;
  if not public.is_company_admin(e1, co_a) and (select is_manager from public.profiles where id = e1) then passed := passed + 1;
  else failed := failed || 'an admin cannot remove another admin (or it also dropped their manager role)'::text; end if;
  if err = 'last_admin' and public.is_company_admin(adm, co_a) then passed := passed + 1;
  else failed := failed || format('the last admin removing themselves: %s', coalesce(err, 'allowed')); end if;

  -- Stepping down once someone else is admin; the primary contact moves on.
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_admin(e1, true);
  perform public.set_member_admin(adm, false);
  reset role;
  if not public.is_company_admin(adm, co_a) and (select admin_user_id from public.companies where id = co_a) = e1 then passed := passed + 1;
  else failed := failed || 'stepping down leaves the primary contact on a non-admin'::text; end if;

  -- ── A company keeps an admin ─────────────────────────────────────────────
  -- The last admin deletes their account: the longest-standing manager takes over.
  perform set_config('request.jwt.claims', '{}', true);
  delete from auth.users where id = e1;
  if public.is_company_admin(mgr, co_a) and not public.is_company_admin(mgr2, co_a)
     and (select admin_user_id from public.companies where id = co_a) = mgr then passed := passed + 1;
  else failed := failed || 'losing the last admin does not hand the company to its longest-standing manager'::text; end if;

  -- No manager to take over: the company waits, nothing breaks.
  delete from auth.users where id = b_adm;
  if not exists (select 1 from public.user_roles where company_id = co_b and role = 'admin')
     and (select admin_user_id from public.companies where id = co_b) is null then passed := passed + 1;
  else failed := failed || 'a company without managers did not end up without an admin cleanly'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b_e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select * into r from public.get_my_company_role();
  reset role;
  if r.company_id = co_b and not r.company_has_admin then passed := passed + 1;
  else failed := failed || 'get_my_company_role does not say the company has no admin'::text; end if;

  -- Support appoints one from the SQL editor (no signed-in user).
  perform set_config('request.jwt.claims', '{}', true);
  perform public.set_member_admin(b_e1, true);
  if public.is_company_admin(b_e1, co_b) and (select is_manager from public.profiles where id = b_e1)
     and (select admin_user_id from public.companies where id = co_b) = b_e1 then passed := passed + 1;
  else failed := failed || 'support cannot appoint an admin for a company without one'::text; end if;

  -- ── Invites ──────────────────────────────────────────────────────────────
  -- Someone with an account opens the link while signed in.
  insert into public.company_invites (company_id, email, department_id, invited_by)
    values (co_a, 'x@qa-adm-out.invalid', ops, mgr) returning token into tok;
  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    select a.status into res from public.accept_company_invite(tok) a;
  exception when others then res := sqlerrm;
  end;
  reset role;
  if res = 'joined' and (select company_id = co_a and department_id = ops from public.profiles where id = x)
     and (select status from public.company_invites where token = tok) = 'accepted' then passed := passed + 1;
  else failed := failed || format('a signed-in person cannot accept an invite: %s', res); end if;

  insert into public.company_invites (company_id, email, invited_by)
    values (co_a, 'someone.else@qa-adm-out.invalid', mgr) returning token into tok;
  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.status into res from public.accept_company_invite(tok) a;
  reset role;
  if res = 'email_mismatch' and (select status from public.company_invites where token = tok) = 'pending' then passed := passed + 1;
  else failed := failed || format('an invite for another email: %s', res); end if;

  -- The only admin of B accepts an invite to A: B's roles go, A starts fresh.
  insert into public.company_invites (company_id, email, invited_by)
    values (co_a, 'e1@qa-adm-b.invalid', mgr) returning token into tok;
  perform set_config('request.jwt.claims', json_build_object('sub', b_e1, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.status into res from public.accept_company_invite(tok) a;
  reset role;
  if res = 'joined' and (select company_id = co_a and not is_manager from public.profiles where id = b_e1)
     and not public.is_company_admin(b_e1, co_b) and not public.is_company_admin(b_e1, co_a)
     and (select admin_user_id from public.companies where id = co_b) is null then passed := passed + 1;
  else failed := failed || format('moving company via invite keeps the old company''s roles: %s', res); end if;

  -- An admin invite makes an admin (here a colleague already in the company).
  insert into public.company_invites (company_id, email, role, invited_by)
    values (co_a, 'e2@qa-adm-a.invalid', 'admin', mgr) returning token into tok;
  perform set_config('request.jwt.claims', json_build_object('sub', e2, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select a.status into res from public.accept_company_invite(tok) a;
  reset role;
  if res = 'joined' and public.is_company_admin(e2, co_a) and (select is_manager from public.profiles where id = e2) then passed := passed + 1;
  else failed := failed || format('an admin invite does not make an admin: %s', res); end if;

  -- A new sign-up whose domain already joins them still gets the invite's department.
  perform set_config('request.jwt.claims', '{}', true);
  insert into public.company_invites (company_id, email, department_id, invited_by)
    values (co_a, 'hire@qa-adm-a.invalid', ops, mgr) returning token into tok;
  insert into auth.users (id, email, email_confirmed_at) values (hire, 'hire@qa-adm-a.invalid', now());
  if (select company_id = co_a and department_id = ops from public.profiles where id = hire)
     and (select status from public.company_invites where token = tok) = 'accepted' then passed := passed + 1;
  else failed := failed || 'a domain sign-up leaves its invite pending and loses the department'::text; end if;

  if array_length(failed, 1) is null then
    raise exception 'COMPANY ADMINS: ALL % PASSED', passed;
  end if;
  raise exception 'COMPANY ADMINS: %/% PASSED; FAILED: %', passed, passed + array_length(failed, 1), array_to_string(failed, ' | ');
end;
$test$;
