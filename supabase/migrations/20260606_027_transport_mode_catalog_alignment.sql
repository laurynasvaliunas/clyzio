-- 027 — Single source of truth for transport modes + emission factors, and a
-- green-score fix.
--
-- Problem: mobile writes trip modes as `walking/bike/ebike/moto/public/taxi/
-- my_car/wfh`, but `update_company_green_score()` defined "green" as
-- `transport_mode NOT IN ('car_gas','car_diesel','Car (Gasoline)')`. So solo-car
-- (`my_car`), `taxi`, and `moto` trips were wrongly counted as GREEN, inflating
-- `companies.green_commute_score` in both the app and the website.
--
-- Fix: a catalog the web + DB both read (mobile keeps its hardcoded mirror in
-- lib/commuteUtils.ts for now), and define "green" via the catalog. Seeded
-- exactly from lib/commuteUtils.ts.

-- ── Canonical transport-mode catalog (what rides.transport_mode contains) ──────
create table if not exists public.transport_mode_catalog (
  id          text primary key,        -- the id mobile writes to rides.transport_mode
  label       text not null,
  co2_per_km  numeric not null default 0,  -- kg CO2e/km (default factor; my_car varies by fuel)
  is_green    boolean not null default false,
  canonical   boolean not null default true,  -- false = legacy alias (kept for scoring/back-compat)
  sort        int not null default 100,
  active      boolean not null default true
);

insert into public.transport_mode_catalog (id, label, co2_per_km, is_green, canonical, sort) values
  ('walking','Walking',              0,     true,  true, 1),
  ('bike',   'Bicycle',              0,     true,  true, 2),
  ('ebike',  'E-Bike / E-Scooter',   0.023, true,  true, 3),
  ('public', 'Public Transport',     0.040, true,  true, 4),
  ('carpool','Carpool',              0.096, true,  true, 5),
  ('wfh',    'Working from home',     0,     true,  true, 6),
  ('taxi',   'Taxi',                  0.120, false, true, 7),
  ('moto',   'Motorbike',            0.090, false, true, 8),
  ('my_car', 'My Car',               0.192, false, true, 9),
  -- legacy aliases so scoring covers existing data; not shown as canonical choices
  ('bus',           'Bus (transit)',  0.10,  true,  false, 50),
  ('escooter',      'E-Scooter',      0.023, true,  false, 51),
  ('car_gas',       'Car (Gasoline)', 0.192, false, false, 52),
  ('car_diesel',    'Car (Diesel)',   0.171, false, false, 53),
  ('Car (Gasoline)','Car (Gasoline)', 0.192, false, false, 54)
on conflict (id) do nothing;

-- ── Emission-factor library (fuel types + transit sub-modes), with sources ─────
create table if not exists public.emission_factor (
  key         text primary key,
  kind        text not null check (kind in ('fuel','transit')),
  label       text not null,
  co2_per_km  numeric not null,
  source      text
);

insert into public.emission_factor (key, kind, label, co2_per_km, source) values
  ('petrol',  'fuel','Petrol',                0.192,'DEFRA 2024'),
  ('diesel',  'fuel','Diesel',                0.171,'DEFRA 2024'),
  ('hybrid',  'fuel','Hybrid (HEV)',          0.110,'EEA'),
  ('phev',    'fuel','Plug-in Hybrid (PHEV)', 0.075,'EEA'),
  ('electric','fuel','Electric (BEV)',        0.053,'EU grid avg 2024 (EEA)'),
  ('lpg',     'fuel','LPG / Autogas',         0.162,'DEFRA 2024'),
  ('hydrogen','fuel','Hydrogen (green)',      0.020,'IEA'),
  ('cng',     'fuel','CNG',                   0.157,'DEFRA 2024'),
  ('bus',        'transit','Bus',           0.10, 'EEA'),
  ('trolleybus', 'transit','Trolleybus',    0.025,'EEA'),
  ('tram',       'transit','Tram',          0.035,'EEA'),
  ('subway',     'transit','Subway / Metro',0.04, 'EEA'),
  ('rail',       'transit','Rail',          0.035,'EEA'),
  ('mixed',      'transit','Mixed transit', 0.06, 'EEA')
on conflict (key) do nothing;

-- ── Reference data: readable by everyone (anon + authenticated), no writes ─────
alter table public.transport_mode_catalog enable row level security;
alter table public.emission_factor        enable row level security;
drop policy if exists "read transport_mode_catalog" on public.transport_mode_catalog;
drop policy if exists "read emission_factor"        on public.emission_factor;
create policy "read transport_mode_catalog" on public.transport_mode_catalog for select using (true);
create policy "read emission_factor"        on public.emission_factor        for select using (true);
grant select on public.transport_mode_catalog to anon, authenticated;
grant select on public.emission_factor        to anon, authenticated;

-- ── Catalog-driven green-score recompute (extracted + reusable) ────────────────
create or replace function public.recompute_company_green_score(p_company uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_total_co2      numeric;
  v_total_trips    int;
  v_green_trips    int;
  v_carpool_trips  int;
  v_employee_count int;
  new_score        int;
begin
  if p_company is null then return; end if;

  select coalesce(sum(p.total_co2_saved),0), coalesce(sum(p.trips_completed),0), count(distinct p.id)
    into v_total_co2, v_total_trips, v_employee_count
    from public.profiles p where p.company_id = p_company;

  -- GREEN now defined via the catalog (fixes my_car/taxi/moto being counted green)
  select count(*) into v_green_trips
    from public.rides r
    join public.profiles p on (r.rider_id = p.id or r.driver_id = p.id)
   where p.company_id = p_company and r.status = 'completed'
     and exists (select 1 from public.transport_mode_catalog c
                  where c.id = r.transport_mode and c.is_green);

  select count(*) into v_carpool_trips
    from public.rides r
    join public.profiles p on (r.rider_id = p.id or r.driver_id = p.id)
   where p.company_id = p_company and r.status = 'completed'
     and r.driver_id is not null and r.rider_id is not null;

  new_score := least(100, greatest(0, round(
    0.40 * case when v_total_trips > 0 then (v_green_trips::numeric / v_total_trips) * 100 else 0 end +
    0.30 * least(100, case when v_employee_count > 0 then (v_total_co2 / v_employee_count) * 5 else 0 end) +
    0.30 * case when v_total_trips > 0 then (v_carpool_trips::numeric / v_total_trips) * 100 else 0 end
  )));

  update public.companies
     set green_commute_score = new_score,
         total_co2_saved     = v_total_co2,
         employee_count      = v_employee_count,
         updated_at          = now()
   where id = p_company;
end;
$$;

-- Trigger now just delegates to the reusable function.
create or replace function public.update_company_green_score()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_company_id uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  select p.company_id into v_company_id
    from public.profiles p where p.id = coalesce(new.rider_id, new.driver_id) limit 1;
  perform public.recompute_company_green_score(v_company_id);
  return new;
end;
$$;

-- ── Backfill: recompute every company's score under the corrected definition ───
do $$
declare r record;
begin
  for r in select distinct company_id from public.profiles where company_id is not null loop
    perform public.recompute_company_green_score(r.company_id);
  end loop;
end $$;

comment on column public.rides.transport_mode is
  'Mode id — must match public.transport_mode_catalog.id (canonical: walking, bike, ebike, public, carpool, wfh, taxi, moto, my_car).';
