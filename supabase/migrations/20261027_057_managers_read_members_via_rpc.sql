-- 057: APPLY ONLY AFTER clyzio.com reads its team list through
-- get_company_members (055; Lovable Prompt 13) — the website's Dashboard →
-- Settings → Team still reads profiles directly until then.
--
-- Managers could read their colleagues' whole profile rows, home and work
-- addresses and coordinates included, which the privacy policy says employers
-- don't get. Team lists now come from get_company_members (no locations); the
-- app's manager screens only use aggregate RPCs.
drop policy if exists "Managers can view same-company profiles" on public.profiles;
