-- Migration 023: transit-route cache.
-- Date: 2026-05-29
--
-- Caches Google Directions (transit) results for 6h, keyed by commute corridor
-- + departure hour, so colleagues on the same route share a lookup and we stay
-- well under Google's free tier. Written/read only by the `transit-routes` edge
-- function (service role); no direct client access.

create table if not exists public.transit_route_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.transit_route_cache enable row level security;

drop policy if exists "no client access to transit_route_cache" on public.transit_route_cache;
create policy "no client access to transit_route_cache"
  on public.transit_route_cache for all
  using (false) with check (false);
