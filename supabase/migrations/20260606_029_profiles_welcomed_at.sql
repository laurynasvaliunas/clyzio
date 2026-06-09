-- 029 — Idempotency flag for the welcome email (welcome-self edge function).
alter table public.profiles add column if not exists welcomed_at timestamptz;
