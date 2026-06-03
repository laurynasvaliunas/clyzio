-- 024 — Per-trip origin/destination on trip_intents.
--
-- The planner now lets Driver/Rider submit a carpool intent inline with a
-- TYPED origin + destination (not just their profile Home↔Work commute). We
-- store the typed coordinates as the intent's matching endpoints (home_/work_
-- columns, which the matcher already compares) AND record them here for honest
-- semantics + display. Nullable: daily-commute-screen intents leave these null.
alter table public.trip_intents
  add column if not exists origin_lat     double precision,
  add column if not exists origin_long    double precision,
  add column if not exists dest_lat       double precision,
  add column if not exists dest_long      double precision,
  add column if not exists origin_address text,
  add column if not exists dest_address   text;
