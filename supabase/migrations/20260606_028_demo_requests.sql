-- 028 — Demo / contact request log (also powers anti-abuse rate limiting for the
-- public request-demo edge function). Service-role only; no client access.
create table if not exists public.demo_requests (
  id         uuid primary key default gen_random_uuid(),
  type       text not null default 'demo' check (type in ('demo','contact')),
  name       text,
  email      text not null,
  company    text,
  employees  text,
  message    text,
  ip         text,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.demo_requests enable row level security;
drop policy if exists "no client access to demo_requests" on public.demo_requests;
create policy "no client access to demo_requests" on public.demo_requests
  for all using (false) with check (false);
create index if not exists demo_requests_email_idx on public.demo_requests (email, created_at);
