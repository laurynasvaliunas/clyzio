-- Company admin tools and domain claims (migration 059).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Records every check; the final message lists failures, or
-- "COMPANY ADMIN: ALL n PASSED".
--
-- Cast: company A (verified domain qa-ca-a.invalid) with admin adm, manager
-- mgr, employees e1, e2 and departments Ops / Sales; company B with admin
-- b_adm and department B-Ops; company C with admin c_adm.

do $test$
declare
  co_a uuid := gen_random_uuid(); co_b uuid := gen_random_uuid(); co_c uuid := gen_random_uuid();
  ops uuid := gen_random_uuid(); sales uuid := gen_random_uuid(); b_ops uuid := gen_random_uuid();
  adm uuid := gen_random_uuid(); mgr uuid := gen_random_uuid();
  e1 uuid := gen_random_uuid(); e2 uuid := gen_random_uuid();
  b_adm uuid := gen_random_uuid(); c_adm uuid := gen_random_uuid();
  hire uuid := gen_random_uuid();
  dom_b uuid; tok_b text; dom_c uuid; tok_c text; dom_c2 uuid; tok_c2 text;
  ok boolean;
  txt text;
  passed int := 0;
  failed text[] := '{}';
begin
  insert into public.companies (id, name, domain) values
    (co_a, 'QA CA A', 'qa-ca-a.invalid'), (co_b, 'QA CA B', 'qa-ca-b.invalid'), (co_c, 'QA CA C', 'qa-ca-c.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values (co_a, 'qa-ca-a.invalid', now());
  insert into public.departments (id, company_id, name) values (ops, co_a, 'Ops'), (sales, co_a, 'Sales'), (b_ops, co_b, 'B-Ops');
  insert into auth.users (id, email) values
    (adm, 'adm@qa-ca-a.invalid'), (mgr, 'mgr@qa-ca-a.invalid'), (e1, 'e1@qa-ca-a.invalid'), (e2, 'e2@qa-ca-a.invalid'),
    (b_adm, 'adm@qa-ca-b.invalid'), (c_adm, 'adm@qa-ca-c.invalid');
  update public.profiles set company_id = co_b, is_solo_user = false where id = b_adm;
  update public.profiles set company_id = co_c, is_solo_user = false where id = c_adm;
  update public.profiles set is_manager = true where id = mgr;
  update public.companies set admin_user_id = adm where id = co_a;
  update public.companies set admin_user_id = b_adm where id = co_b;
  update public.companies set admin_user_id = c_adm where id = co_c;
  insert into public.user_roles (user_id, role, company_id) values
    (adm, 'admin', co_a), (b_adm, 'admin', co_b), (c_adm, 'admin', co_c) on conflict do nothing;

  -- ── Team page: department ────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_department(e1, ops);
  reset role;
  if (select department_id from public.profiles where id = e1) = ops then passed := passed + 1;
  else failed := failed || 'company admin cannot set a colleague''s department'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', mgr, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_department(e1, sales);
  perform public.set_member_department(e2, null);
  reset role;
  if (select department_id from public.profiles where id = e1) = sales then passed := passed + 1;
  else failed := failed || 'manager cannot set a colleague''s department'::text; end if;

  foreach txt in array array['employee', 'other-company department', 'other company admin'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case txt when 'employee' then e2 when 'other-company department' then adm else b_adm end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.set_member_department(e1, case txt when 'other-company department' then b_ops else ops end);
      ok := true;
    exception when others then ok := false;
    end;
    reset role;
    if not ok and (select department_id from public.profiles where id = e1) = sales then passed := passed + 1;
    else failed := failed || format('set_member_department allowed: %s', txt); end if;
  end loop;

  -- ── Team page: manager role ──────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.set_member_manager(e1, true);
  -- The caller's identity is restored after the server-side update.
  if auth.uid() = adm and auth.role() = 'authenticated' then passed := passed + 1;
  else failed := failed || 'set_member_manager leaves the request running as the server'::text; end if;
  begin
    update public.profiles set is_manager = true where id = adm;
    ok := true;
  exception when others then ok := false;
  end;
  reset role;
  if (select is_manager from public.profiles where id = e1) then passed := passed + 1;
  else failed := failed || 'company admin cannot make a colleague a manager'::text; end if;
  if not ok then passed := passed + 1;
  else failed := failed || 'after set_member_manager the caller can change protected columns directly'::text; end if;

  foreach txt in array array['manager', 'own role', 'other company admin'] loop
    perform set_config('request.jwt.claims', json_build_object('sub',
      case txt when 'manager' then mgr when 'own role' then adm else b_adm end, 'role', 'authenticated')::text, true);
    set local role authenticated;
    begin
      perform public.set_member_manager(case txt when 'own role' then adm else e2 end, true);
      ok := true;
    exception when others then ok := false;
    end;
    reset role;
    if not ok then passed := passed + 1;
    else failed := failed || format('set_member_manager allowed: %s', txt); end if;
  end loop;
  if not (select is_manager from public.profiles where id = e2) then passed := passed + 1;
  else failed := failed || 'a refused set_member_manager still changed the role'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.set_member_department(e1, ops);
    ok := true;
  exception when others then ok := false;
  end;
  -- The app's login screen and the website's sign-up name the company before
  -- anyone is signed in.
  if public.lookup_company_by_email_domain('x@qa-ca-a.invalid') = 'QA CA A' then passed := passed + 1;
  else failed := failed || 'signed-out visitors can no longer use the sign-up name lookup'::text; end if;
  reset role;
  if not ok then passed := passed + 1; else failed := failed || 'anon can call set_member_department'::text; end if;

  -- ── Domain claims: only a verified domain is taken ───────────────────────
  -- Two companies claim the same unproven domain (the website's add-domain).
  perform set_config('request.jwt.claims', json_build_object('sub', b_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.company_domains (company_id, domain) values (co_b, 'qa-bigcorp.invalid') returning id, verification_token into dom_b, tok_b;
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', c_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    insert into public.company_domains (company_id, domain) values (co_c, 'qa-bigcorp.invalid') returning id, verification_token into dom_c, tok_c;
  exception when others then dom_c := null;
  end;
  reset role;
  if dom_c is not null then passed := passed + 1;
  else failed := failed || 'an unproven claim blocks another company from claiming the domain'::text; end if;

  -- A second company row with the same legacy domain (admin-create-company).
  begin
    insert into public.companies (name, domain) values ('QA CA dup', 'qa-ca-b.invalid');
    passed := passed + 1;
  exception when unique_violation then failed := failed || 'companies.domain still has to be unique'::text;
  end;

  -- The name lookup shows only verified owners.
  if public.lookup_company_by_email_domain('x@qa-bigcorp.invalid') is null
     and public.lookup_company_by_email_domain('x@qa-ca-b.invalid') is null
     and public.lookup_company_by_email_domain('x@qa-ca-a.invalid') = 'QA CA A' then passed := passed + 1;
  else failed := failed || 'lookup_company_by_email_domain names a company whose domain is not verified'::text; end if;

  -- C proves it (admin-verify-domain, service role): B's claim is dropped.
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
  ok := public.verify_company_domain(dom_c, tok_c);
  reset role;
  if ok and (select verified_at is not null from public.company_domains where id = dom_c)
     and not exists (select 1 from public.company_domains where id = dom_b) then passed := passed + 1;
  else failed := failed || 'verifying a domain does not drop the other companies'' unproven claims'::text; end if;

  -- B claims it again and tries to verify: refused, C keeps it.
  insert into public.company_domains (company_id, domain) values (co_b, 'qa-bigcorp.invalid') returning id, verification_token into dom_b, tok_b;
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  set local role service_role;
  begin
    ok := public.verify_company_domain(dom_b, tok_b);
  exception when others then ok := false;
  end;
  reset role;
  if not ok and (select verified_at is null from public.company_domains where id = dom_b) then passed := passed + 1;
  else failed := failed || 'a second company verifies a domain someone already proved'::text; end if;

  -- One company can't hold the same domain twice.
  begin
    insert into public.company_domains (company_id, domain) values (co_c, 'qa-bigcorp.invalid') returning id, verification_token into dom_c2, tok_c2;
    failed := failed || 'a company holds the same domain twice'::text;
  exception when unique_violation then passed := passed + 1;
  end;

  -- New sign-ups join the proven owner.
  perform set_config('request.jwt.claims', '{}', true);
  insert into auth.users (id, email) values (hire, 'new.hire@qa-bigcorp.invalid');
  if (select company_id from public.profiles where id = hire) = co_c
     and public.lookup_company_by_email_domain('x@qa-bigcorp.invalid') = 'QA CA C' then passed := passed + 1;
  else failed := failed || 'a sign-up does not join the company that proved the domain'::text; end if;

  if array_length(failed, 1) is null then
    raise exception 'COMPANY ADMIN: ALL % PASSED', passed;
  end if;
  raise exception 'COMPANY ADMIN: %/% PASSED; FAILED: %', passed, passed + array_length(failed, 1), array_to_string(failed, ' | ');
end;
$test$;
