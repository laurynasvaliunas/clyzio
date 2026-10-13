-- 046 — Restore migrations 011 and 012, which were never applied to production.
--
-- Found by a repo-vs-production schema audit (13 Oct 2026). Missing on prod:
--   011: ratings, safety_incidents (+ profile_ratings_summary view)
--   012: referrals, profiles.notification_prefs, profiles.referral_code,
--        ensure_referral_code() + trigger
-- Consequences: rating and SOS failed in the app; notification settings errored;
-- respond-to-match / request-carpool selected the missing notification_prefs
-- column, so every carpool push was silently skipped; and 013's
-- award_referral_on_first_trip trigger (applied) referenced the missing objects.
--
-- Same definitions as 011/012, idempotent, with one fix: pgcrypto lives in the
-- `extensions` schema on Supabase, so gen_random_bytes is schema-qualified.

begin;

-- ── 011: ratings ────────────────────────────────────────────────────────────
create table if not exists public.ratings (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  rater_id uuid not null references public.profiles(id) on delete cascade,
  rated_id uuid not null references public.profiles(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  tags text[] not null default '{}',
  comment text check (char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (ride_id, rater_id, rated_id)
);
create index if not exists ratings_rated_idx on public.ratings (rated_id);
create index if not exists ratings_ride_idx on public.ratings (ride_id);
alter table public.ratings enable row level security;

drop policy if exists "Participants can insert rating" on public.ratings;
create policy "Participants can insert rating" on public.ratings
  for insert to authenticated
  with check (
    auth.uid() = rater_id
    and auth.uid() <> rated_id
    and exists (
      select 1 from public.rides r
      where r.id = ride_id
        and (r.driver_id = auth.uid() or r.rider_id = auth.uid())
        and (r.driver_id = rated_id or r.rider_id = rated_id)
        and r.status = 'completed'
    )
  );

drop policy if exists "Authenticated users can read ratings" on public.ratings;
create policy "Authenticated users can read ratings" on public.ratings
  for select to authenticated using (true);

drop policy if exists "Raters can update own rating" on public.ratings;
create policy "Raters can update own rating" on public.ratings
  for update to authenticated
  using (auth.uid() = rater_id and created_at > now() - interval '24 hours')
  with check (auth.uid() = rater_id);

drop policy if exists "Raters can delete own rating" on public.ratings;
create policy "Raters can delete own rating" on public.ratings
  for delete to authenticated
  using (auth.uid() = rater_id and created_at > now() - interval '24 hours');

create or replace view public.profile_ratings_summary
  with (security_invoker = true) as
  select
    rated_id as profile_id,
    round(avg(score)::numeric, 2) as avg_score,
    count(*)::int as rating_count
  from public.ratings
  group by rated_id;

-- ── 011: safety incidents (SOS) ─────────────────────────────────────────────
create table if not exists public.safety_incidents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  kind text not null check (kind in ('sos', 'harassment', 'accident', 'other')),
  latitude double precision,
  longitude double precision,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.safety_incidents enable row level security;

drop policy if exists "Users insert own incident" on public.safety_incidents;
create policy "Users insert own incident" on public.safety_incidents
  for insert to authenticated with check (auth.uid() = user_id);

drop policy if exists "Users read own incidents" on public.safety_incidents;
create policy "Users read own incidents" on public.safety_incidents
  for select to authenticated using (auth.uid() = user_id);

-- ── 012: notification preferences ───────────────────────────────────────────
alter table public.profiles
  add column if not exists notification_prefs jsonb not null default jsonb_build_object(
    'matches', true,
    'chat', true,
    'weekly_digest', true,
    'marketing', false
  );

-- ── 012: referral codes ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists referral_code text unique;

create or replace function public.ensure_referral_code()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.referral_code is null then
    new.referral_code := upper(substring(encode(extensions.gen_random_bytes(4), 'base64') from 1 for 6));
    new.referral_code := translate(new.referral_code, '+/=IO01l', 'XYZABCDE');
  end if;
  return new;
end $$;

drop trigger if exists ensure_referral_code_trg on public.profiles;
create trigger ensure_referral_code_trg
  before insert on public.profiles
  for each row execute function public.ensure_referral_code();

update public.profiles
  set referral_code = translate(
        upper(substring(encode(extensions.gen_random_bytes(4), 'base64') from 1 for 6)),
        '+/=IO01l', 'XYZABCDE')
  where referral_code is null;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles(id) on delete cascade,
  referee_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'rejected')),
  awarded_xp int not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (referee_id)  -- a user can only be referred once
);
alter table public.referrals enable row level security;

drop policy if exists "Users read own referrals" on public.referrals;
create policy "Users read own referrals" on public.referrals
  for select to authenticated
  using (auth.uid() = referrer_id or auth.uid() = referee_id);

commit;
