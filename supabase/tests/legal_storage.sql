-- Who can read and change files in the "legal" storage bucket (migration 062).
--
-- Side-effect free: ONE DO block that always ends by raising, so every fixture
-- is rolled back. Records every check; the final message lists failures, or
-- "LEGAL STORAGE: ALL n PASSED".
--
-- Cast: company A (verified qa-legal-a.invalid) with admin a_adm and employee
-- a_emp; company B (verified qa-legal-b.invalid) with admin b_adm; x has an
-- account but no company. Files: shared/terms.pdf, <A>/dpa.pdf, <B>/dpa.pdf.
--
-- Deletes are not tested here: storage refuses direct DELETE statements and
-- only allows them through the Storage API.

do $test$
declare
  co_a uuid := gen_random_uuid(); co_b uuid := gen_random_uuid();
  a_adm uuid := gen_random_uuid(); a_emp uuid := gen_random_uuid();
  b_adm uuid := gen_random_uuid(); x uuid := gen_random_uuid();
  f_shared text := 'shared/qa-legal-terms.pdf';
  f_a text; f_b text;
  fixtures text[];
  seen text[];
  n int;
  ok boolean;
  passed int := 0;
  failed text[] := '{}';
begin
  f_a := co_a || '/qa-legal-dpa.pdf';
  f_b := co_b || '/qa-legal-dpa.pdf';
  fixtures := array[f_shared, f_a, f_b];

  insert into public.companies (id, name, domain) values (co_a, 'QA LEGAL A', 'qa-legal-a.invalid'), (co_b, 'QA LEGAL B', 'qa-legal-b.invalid');
  insert into public.company_domains (company_id, domain, verified_at) values
    (co_a, 'qa-legal-a.invalid', now()), (co_b, 'qa-legal-b.invalid', now());
  insert into auth.users (id, email) values
    (a_adm, 'adm@qa-legal-a.invalid'), (a_emp, 'emp@qa-legal-a.invalid'),
    (b_adm, 'adm@qa-legal-b.invalid'), (x, 'x@qa-legal-out.invalid');
  insert into public.user_roles (user_id, role, company_id) values (a_adm, 'admin', co_a), (b_adm, 'admin', co_b)
    on conflict do nothing;
  insert into storage.objects (bucket_id, name) select 'legal', unnest(fixtures);

  if (select company_id from public.profiles where id = a_emp) = co_a
     and (select company_id from public.profiles where id = x) is null then passed := passed + 1;
  else failed := failed || 'fixture: the employee did not join company A by domain, or x joined a company'::text; end if;

  -- ── Reading ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select coalesce(array_agg(name order by name), '{}') into seen from storage.objects where bucket_id = 'legal' and name = any(fixtures);
  reset role;
  if seen = (select array_agg(v order by v) from unnest(array[f_shared, f_a]) v) then passed := passed + 1;
  else failed := failed || ('an admin should read shared/ and their own company folder only, read ' || seen::text); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', b_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'legal' and name = f_a;
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || 'an admin reads another company''s legal folder'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'legal' and name = any(fixtures);
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || ('an employee reads ' || n || ' legal file(s), including their company''s'); end if;

  perform set_config('request.jwt.claims', json_build_object('sub', x, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'legal' and name = any(fixtures);
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || ('a signed-in user with no company reads ' || n || ' legal file(s)'); end if;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'legal';
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || 'a visitor who is not signed in reads legal files'::text; end if;

  -- The bucket's real file at the root stays out of every signed-in user's reach.
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from storage.objects where bucket_id = 'legal' and name not like '%/%';
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || 'an admin reads files at the root of the legal bucket'::text; end if;

  -- ── Uploading ────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('legal', co_a || '/qa-legal-new.pdf');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  if ok then passed := passed + 1;
  else failed := failed || 'an admin cannot upload to their own company folder'::text; end if;

  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('legal', 'shared/qa-legal-new.pdf');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  if not ok then passed := passed + 1;
  else failed := failed || 'an admin can upload to shared/'::text; end if;

  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('legal', co_b || '/qa-legal-new.pdf');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  if not ok then passed := passed + 1;
  else failed := failed || 'an admin can upload to another company''s folder'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_emp, 'role', 'authenticated')::text, true);
  begin
    set local role authenticated;
    insert into storage.objects (bucket_id, name) values ('legal', co_a || '/qa-legal-emp.pdf');
    ok := true;
  exception when insufficient_privilege then ok := false;
  end;
  reset role;
  if not ok then passed := passed + 1;
  else failed := failed || 'an employee can upload to their company''s legal folder'::text; end if;

  -- ── Editing ──────────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', a_emp, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update storage.objects set metadata = '{"qa":"emp"}' where bucket_id = 'legal' and name = f_a;
  get diagnostics n = row_count;
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || 'an employee can change their company''s legal file'::text; end if;

  perform set_config('request.jwt.claims', json_build_object('sub', a_adm, 'role', 'authenticated')::text, true);
  set local role authenticated;
  update storage.objects set metadata = '{"qa":"adm"}' where bucket_id = 'legal' and name = f_a;
  get diagnostics n = row_count;
  reset role;
  if n = 1 then passed := passed + 1;
  else failed := failed || 'an admin cannot change their own company''s legal file'::text; end if;

  set local role authenticated;
  update storage.objects set metadata = '{"qa":"adm"}' where bucket_id = 'legal' and name = f_shared;
  get diagnostics n = row_count;
  reset role;
  if n = 0 then passed := passed + 1;
  else failed := failed || 'an admin can change a shared/ file'::text; end if;

  if cardinality(failed) = 0 then
    raise exception 'LEGAL STORAGE: ALL % PASSED', passed;
  else
    raise exception 'LEGAL STORAGE: %/% PASSED; FAILED: %', passed, passed + cardinality(failed), array_to_string(failed, '; ');
  end if;
end
$test$;
