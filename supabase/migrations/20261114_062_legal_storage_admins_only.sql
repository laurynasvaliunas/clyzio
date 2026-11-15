-- 062: legal documents are readable by company admins only.
--
-- Found 14 November 2026, when Lovable's test of clyzio.com flagged it. The
-- "legal" storage bucket (created on the website side in April 2026) let:
--  * every signed-in user, with or without a company, read anything under
--    shared/;
--  * every employee read their company's folder, where an admin would keep
--    the company's contracts.
-- Neither the app nor the website reads this bucket today, and its only file
-- (privacy-policy.html, at the root) falls outside both rules, so nothing was
-- exposed. This closes the rules before anyone uploads a contract.
--
-- Now an admin reads their own company's folder and shared/; nobody else
-- reads anything. Uploads, edits and deletes are unchanged (admins, their own
-- company's folder, never shared/). Server functions (service role) are not
-- affected by these rules.
--
-- The folder name is compared as text: casting it to uuid would raise an
-- error on shared/ instead of simply not matching.

drop policy if exists "Authenticated users can read legal documents" on storage.objects;
drop policy if exists "Company admins can read legal documents" on storage.objects;

create policy "Company admins can read legal documents" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'legal'
    and exists (
      select 1
        from public.user_roles r
       where r.user_id = (select auth.uid())
         and r.role = 'admin'
         and r.company_id is not null
         and (storage.foldername(name))[1] in ('shared', r.company_id::text)
    )
  );
