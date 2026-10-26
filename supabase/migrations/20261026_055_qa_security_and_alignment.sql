-- 055: fixes from the 2026-10-26 QA pass — security, and the app and the
-- website (clyzio.com) showing the same numbers.
--
-- Security
--   1. find_carpool_candidates trusted a p_caller_id argument: any signed-in
--      user could pass someone else's id and read the rides (exact start /
--      destination) visible to that person. Only ai-carpool-matcher (service
--      role) calls it.
--   2. Participants could hard-delete rides; the delete cascades to the
--      partner's rating, chat and completion record. Neither client deletes.
--   3. Every signed-in user could read every rating (who rated whom, score).
--   4. A company admin could change their company's domain, green score, CO₂
--      total and employee count directly. With the domain they could claim any
--      address (e.g. a competitor's): new sign-ups from it silently joined their
--      company, because sign-up matched companies.domain, which is never
--      verified.
--   5. Deleting a user any other way than the delete-account function failed
--      for drivers ("ride must have rider_id or driver_id"), and left
--      ownerless rides that the stale-ride job could never close.
--
-- App ↔ website alignment
--   6. One emission-factor table for both: transport_mode_catalog now carries
--      the cited factors (DEFRA 2024 / EEA 2023 / IPCC AR6) with their source,
--      and the website's ESG inventory reads it. Before, the inventory had its
--      own list keyed by ids the app never writes (car_gas, walk, motorcycle…),
--      so walking, public transport, no-motor and WFH trips were counted as
--      petrol-car emissions; its by-mode split used the petrol factor for every
--      mode; and its by-department "gross_kg" summed CO₂ *saved*.
--   7. The website's per-employee coverage summed rides.co2_saved by rider only:
--      carpools counted in full and drivers not at all (Laurynas 0 kg on the
--      web vs 2.62 kg in the app). It now uses the same credited shares as the
--      app (ride_completions, half each for a carpool).
--   8. Department breakdown grouped by the legacy free-text profiles.department
--      on the website and by department_id in the app.
--   9. Company counters (employee_count, total_co2_saved, green score) only
--      refreshed when a ride completed, so they drifted when people joined,
--      left or were deleted (DemoCo showed 6 employees / 65 kg with none).
--  10. car_fuel_type defaulted to 'gasoline', which no emission factor knows
--      (the app and the factors say 'petrol').
--
-- Privacy
--  11. get_peer_rides: the Map's "nearby commuters" radar gets peers' rides at
--      ~300 m precision with no addresses (like get_peer_trip_intents), instead
--      of reading exact coordinates from the rides table. The broad rides
--      policy stays until the app build that uses this RPC is live (056).
--
-- Performance
--  12. Indexes for the 16 foreign keys the advisor lists without one.

-- ── 1. find_carpool_candidates: service role only ───────────────────────────
revoke all on function public.find_carpool_candidates(double precision, double precision, double precision, double precision, timestamptz, text, double precision, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.find_carpool_candidates(double precision, double precision, double precision, double precision, timestamptz, text, double precision, uuid, uuid)
  to service_role;

-- ── 2. Rides are cancelled, never deleted, from the clients ─────────────────
drop policy if exists "Users can delete their rides" on public.rides;

-- ── 3. Ratings: only the two people involved ────────────────────────────────
drop policy if exists "Authenticated users can read ratings" on public.ratings;
drop policy if exists "Raters and rated read their ratings" on public.ratings;
create policy "Raters and rated read their ratings" on public.ratings
  for select to authenticated
  using (auth.uid() = rater_id or auth.uid() = rated_id);

-- ── 4. Company counters and domain: server only ─────────────────────────────
-- SECURITY INVOKER on purpose: current_user is then the client role for API
-- writes, and the function owner for writes made inside server functions
-- (verify_company_domain syncing the verified domain, recompute_… counters).
create or replace function public.guard_company_protected_columns()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if (new.admin_user_id is distinct from old.admin_user_id
      or new.domain is distinct from old.domain
      or new.green_commute_score is distinct from old.green_commute_score
      or new.total_co2_saved is distinct from old.total_co2_saved
      or new.employee_count is distinct from old.employee_count)
     and current_user in ('authenticated', 'anon') then
    raise exception 'Protected company column changed — only the server may modify this field'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Sign-up joins a company only through a VERIFIED domain (company_domains),
-- the same rule auto_enroll_company and the website use.
create or replace function public.assign_company_to_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  user_domain text := lower(split_part(coalesce(new.email, ''), '@', 2));
  matched uuid;
begin
  if user_domain in (
    'gmail.com','yahoo.com','hotmail.com','outlook.com','icloud.com','aol.com','protonmail.com',
    'live.com','msn.com','me.com','mac.com','yandex.com','gmx.com','zoho.com','mail.com',
    'fastmail.com','tutanota.com','pm.me','proton.me','hey.com'
  ) then
    new.is_solo_user := true;
    new.company_id := null;
    return new;
  end if;

  select cd.company_id into matched
    from public.company_domains cd
   where cd.domain = user_domain and cd.verified_at is not null
   limit 1;

  new.company_id := matched;
  new.is_solo_user := false;
  return new;
end;
$$;

-- ── 5. Deleting a user leaves rides valid ──────────────────────────────────
-- rides.driver_id is ON DELETE SET NULL: a ride whose only person was the
-- deleted driver is removed with them (it's their data); a carpool keeps its
-- passenger. The CO₂ trigger no longer rejects the FK's own update.
create or replace function public.delete_ownerless_rides()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.rides where driver_id = old.id and rider_id is null;
  return old;
end;
$$;

drop trigger if exists delete_ownerless_rides_trg on auth.users;
create trigger delete_ownerless_rides_trg
  before delete on auth.users
  for each row execute function public.delete_ownerless_rides();

create or replace function public.enforce_ride_co2()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner uuid := coalesce(new.rider_id, new.driver_id);
  v_baseline double precision;
  v_mode_factor double precision;
  v_car_factor double precision;
  v_dist double precision;
begin
  if v_owner is null then
    -- An existing ride whose people were deleted: leave it as it was.
    if tg_op = 'UPDATE' then
      return new;
    end if;
    raise exception 'ride must have rider_id or driver_id' using errcode = '23514';
  end if;

  if new.origin_lat is null or new.origin_long is null or new.dest_lat is null or new.dest_long is null then
    v_dist := 0;
  else
    v_dist := 6371 * 2 * asin(sqrt(
      power(sin(radians(new.dest_lat - new.origin_lat) / 2), 2) +
      cos(radians(new.origin_lat)) * cos(radians(new.dest_lat)) *
      power(sin(radians(new.dest_long - new.origin_long) / 2), 2)
    ));
  end if;
  if v_dist is null or v_dist > 200 then v_dist := 0; end if;
  new.distance_km := round(v_dist::numeric, 3);

  -- Carpool: one car instead of two — the saving is the driver's car on this
  -- distance (complete-trip credits each participant half).
  if new.transport_mode = 'carpool' or (new.driver_id is not null and new.rider_id is not null) then
    select ef.co2_per_km into v_car_factor
      from public.profiles p
      join public.emission_factor ef on ef.kind = 'fuel' and ef.key = p.car_fuel_type
     where p.id = new.driver_id;
    new.co2_saved := round((v_dist * coalesce(v_car_factor, 0.192))::numeric, 3);
    return new;
  end if;

  select coalesce(baseline_co2, 0.192) into v_baseline from public.profiles where id = v_owner;
  v_baseline := coalesce(v_baseline, 0.192);
  select co2_per_km into v_mode_factor from public.transport_mode_catalog where id = new.transport_mode;
  v_mode_factor := coalesce(v_mode_factor, v_baseline);
  new.co2_saved := round(greatest(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);
  return new;
end;
$$;

-- ── 6. One cited emission-factor table ──────────────────────────────────────
alter table public.transport_mode_catalog
  add column if not exists source text,
  add column if not exists source_year int;

update public.transport_mode_catalog t
   set co2_per_km = v.factor, source = v.src, source_year = v.yr
  from (values
    ('walking',        0.000, 'IPCC AR6',              2023),
    ('bike',           0.000, 'IPCC AR6',              2023),
    ('nomotor',        0.000, 'IPCC AR6',              2023),
    ('ebike',          0.005, 'EEA 2023',              2023),
    ('escooter',       0.020, 'EEA 2023',              2023),
    ('public',         0.097, 'EEA 2023 (bus)',        2023),
    ('bus',            0.097, 'EEA 2023',              2023),
    ('carpool',        0.096, 'DEFRA 2024 (petrol car shared by two)', 2024),
    ('wfh',            0.000, 'No commute',            null),
    ('taxi',           0.120, 'Clyzio estimate',       null),
    ('moto',           0.103, 'DEFRA 2024',            2024),
    ('my_car',         0.192, 'DEFRA 2024 (petrol)',   2024),
    ('car_gas',        0.192, 'DEFRA 2024',            2024),
    ('Car (Gasoline)', 0.192, 'DEFRA 2024',            2024),
    ('car_diesel',     0.171, 'DEFRA 2024',            2024)
  ) as v(id, factor, src, yr)
 where t.id = v.id;

-- Ids the website's ESG list used that aren't app modes: kept as inactive rows
-- (the website's mode lists only show active ones) so old rides still resolve.
insert into public.transport_mode_catalog (id, label, co2_per_km, is_green, canonical, sort, active, source, source_year)
values
  ('car_electric', 'Car (Electric)', 0.047, false, false, 60, false, 'DEFRA 2024', 2024),
  ('train',        'Train',          0.035, true,  false, 61, false, 'EEA 2023',   2023),
  ('metro',        'Metro',          0.028, true,  false, 62, false, 'EEA 2023',   2023),
  ('tram',         'Tram',           0.029, true,  false, 63, false, 'EEA 2023',   2023),
  ('walk',         'Walking',        0.000, true,  false, 64, false, 'IPCC AR6',   2023),
  ('motorcycle',   'Motorbike',      0.103, false, false, 65, false, 'DEFRA 2024', 2024)
on conflict (id) do update
  set co2_per_km = excluded.co2_per_km, source = excluded.source, source_year = excluded.source_year;

update public.emission_factor set co2_per_km = 0.047, source = 'DEFRA 2024' where kind = 'fuel' and key = 'electric';
update public.emission_factor set co2_per_km = 0.097, source = 'EEA 2023'   where kind = 'transit' and key = 'bus';
update public.emission_factor set co2_per_km = 0.029, source = 'EEA 2023'   where kind = 'transit' and key = 'tram';
update public.emission_factor set co2_per_km = 0.028, source = 'EEA 2023'   where kind = 'transit' and key = 'subway';

-- The same names on both clients (the website lists the catalog's labels).
update public.transport_mode_catalog t
   set label = v.label
  from (values
    ('bike',   'Bike'),
    ('ebike',  'E-bike / E-scooter'),
    ('public', 'Public transport'),
    ('moto',   'Motorcycle / Moped'),
    ('my_car', 'Car')
  ) as v(id, label)
 where t.id = v.id;

-- The website's ESG inventory, reading the catalog (plus a company's own
-- overrides). Same shape as before; the numbers are now emissions throughout.
create or replace function public.get_company_inventory(p_company_id uuid, p_period_start date, p_period_end date)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_company uuid;
  v_primary_kg numeric := 0;
  v_employee_count integer := 0;
  v_employees_with_primary integer := 0;
  v_employees_with_coords integer := 0;
  v_by_mode jsonb;
  v_by_department jsonb;
  v_factor_table jsonb;
begin
  select company_id into v_caller_company from public.profiles where id = auth.uid();
  if not (v_caller_company = p_company_id or public.is_company_admin(auth.uid(), p_company_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  with factors as (
    select c.id as mode,
           coalesce(o.factor_kg_per_km, c.co2_per_km) as factor
      from public.transport_mode_catalog c
      left join lateral (
        select f.factor_kg_per_km from public.company_emission_factors f
         where f.company_id = p_company_id and f.transport_mode = c.id
           and f.effective_from <= p_period_end
           and (f.effective_to is null or f.effective_to >= p_period_start)
         order by f.effective_from desc limit 1
      ) o on true
  ),
  rides_in_period as (
    select r.id, coalesce(r.transport_mode, 'my_car') as mode, coalesce(r.distance_km, 0) as distance_km,
           r.rider_id, r.driver_id,
           (r.rider_id is not null and r.driver_id is not null) as shared
      from public.rides r
     where r.status = 'completed'
       and r.completed_at::date between p_period_start and p_period_end
  ),
  priced as (
    -- A carpool is one car: the driver's car factor, split between the two.
    select rp.*,
           case when rp.shared or rp.mode = 'carpool'
                then coalesce((select ef.co2_per_km from public.profiles dp
                                 join public.emission_factor ef on ef.kind = 'fuel' and ef.key = dp.car_fuel_type
                                where dp.id = rp.driver_id),
                              (select factor from factors where mode = 'my_car'), 0.192)
                     / (case when rp.shared then 2 else 1 end)
                else coalesce((select f.factor from factors f where f.mode = rp.mode),
                              (select factor from factors where mode = 'my_car'), 0.192)
           end as per_person_factor
      from rides_in_period rp
  ),
  e as (
    select p.id as user_id, p.department_id, x.mode, (x.distance_km * x.per_person_factor)::numeric as kg
      from (
        select rider_id as user_id, mode, distance_km, per_person_factor from priced where rider_id is not null
        union all
        select driver_id, mode, distance_km, per_person_factor from priced where driver_id is not null
      ) x
      join public.profiles p on p.id = x.user_id and p.company_id = p_company_id
  ),
  dep as (
    select d.id as did,
           coalesce(d.id::text, 'unassigned') as dept_id,
           coalesce(d.name, 'Unassigned') as dept_name,
           count(distinct p.id) as employees,
           coalesce(sum(p.total_co2_saved), 0) as saved_kg
      from public.profiles p
      left join public.departments d on d.id = p.department_id
     where p.company_id = p_company_id
     group by d.id, d.name
  )
  select coalesce((select sum(kg) from e), 0),
         (select count(distinct user_id) from e)::int,
         coalesce((select jsonb_agg(jsonb_build_object('mode', mode, 'kg', kg) order by kg desc)
                     from (select mode, round(sum(kg), 3) as kg from e group by mode) m), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object(
                     'department_id', dep.dept_id, 'department_name', dep.dept_name, 'employees', dep.employees,
                     'gross_kg', coalesce((select round(sum(e.kg), 3) from e where e.department_id is not distinct from dep.did), 0),
                     'saved_kg', dep.saved_kg))
                     from dep), '[]'::jsonb)
    into v_primary_kg, v_employees_with_primary, v_by_mode, v_by_department;

  select count(*) into v_employee_count from public.profiles where company_id = p_company_id;
  select count(*) into v_employees_with_coords
    from public.profiles
   where company_id = p_company_id
     and home_lat is not null and home_long is not null and work_lat is not null and work_long is not null;

  select jsonb_agg(jsonb_build_object(
           'mode', c.id, 'factor_kg_per_km', coalesce(o.factor_kg_per_km, c.co2_per_km),
           'source', coalesce(o.source, c.source), 'source_year', coalesce(o.source_year, c.source_year),
           'version', coalesce(o.version, 'v1'), 'overridden', (o.id is not null)) order by c.sort)
    into v_factor_table
    from public.transport_mode_catalog c
    left join lateral (
      select f.* from public.company_emission_factors f
       where f.company_id = p_company_id and f.transport_mode = c.id
         and f.effective_from <= p_period_end
         and (f.effective_to is null or f.effective_to >= p_period_start)
       order by f.effective_from desc limit 1
    ) o on true
   where c.canonical or o.id is not null;

  return jsonb_build_object(
    'period_start', p_period_start,
    'period_end', p_period_end,
    'employee_count', v_employee_count,
    'employees_with_primary_data', v_employees_with_primary,
    'employees_with_coords', v_employees_with_coords,
    'coverage_pct', case when v_employee_count > 0
                         then round((v_employees_with_primary::numeric / v_employee_count) * 100, 1) else 0 end,
    'gross_kg', round(v_primary_kg, 3),
    'gross_tco2e', round(v_primary_kg / 1000.0, 4),
    'intensity_kg_per_employee', case when v_employee_count > 0 then round(v_primary_kg / v_employee_count, 2) else 0 end,
    'primary_kg', round(v_primary_kg, 3),
    'modeled_kg', 0,
    'by_mode', v_by_mode,
    'by_department', v_by_department,
    'factor_table', coalesce(v_factor_table, '[]'::jsonb)
  );
end;
$$;

-- ── 7. Per-employee coverage = the app's credited shares ────────────────────
create or replace function public.get_employee_coverage(p_company_id uuid, p_period_start date, p_period_end date)
returns table(user_id uuid, display_name text, department_id uuid, department_name text,
              primary_trips integer, primary_kg numeric, has_primary_data boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_company uuid;
begin
  select company_id into v_caller_company from public.profiles where id = auth.uid();
  if not (v_caller_company = p_company_id or public.is_company_admin(auth.uid(), p_company_id)) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with members as (
    select p.id as user_id,
           coalesce(nullif(trim(concat_ws(' ', p.first_name, p.last_name)), ''), p.email, 'Employee') as display_name,
           p.department_id, d.name as department_name
      from public.profiles p
      left join public.departments d on d.id = p.department_id
     where p.company_id = p_company_id
  ),
  -- Credited trips, as in the app (get_user_impact): one row per person per
  -- ride they confirmed; a carpool's CO₂ is shared half and half.
  trips as (
    select c.user_id,
           count(*)::int as trip_count,
           coalesce(sum(case when r.driver_id is not null and r.rider_id is not null
                             then coalesce(r.co2_saved, 0) / 2 else coalesce(r.co2_saved, 0) end), 0)::numeric as saved_kg
      from public.ride_completions c
      join public.rides r on r.id = c.ride_id
     where c.user_id in (select m.user_id from members m)
       and c.created_at::date between p_period_start and p_period_end
     group by c.user_id
  )
  select m.user_id, m.display_name, m.department_id, m.department_name,
         coalesce(t.trip_count, 0)::int, round(coalesce(t.saved_kg, 0), 3)::numeric,
         (coalesce(t.trip_count, 0) > 0)
    from members m
    left join trips t on t.user_id = m.user_id;
end;
$$;

-- ── 8. Departments by department_id on both clients ─────────────────────────
create or replace function public.get_company_breakdown(user_uuid uuid)
returns table(department_id text, department_name text, total_co2_saved numeric, employee_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  company uuid;
begin
  company := public.assert_same_company(user_uuid);
  return query
  select coalesce(d.id::text, 'unassigned'),
         coalesce(d.name, 'Unassigned')::text,
         coalesce(sum(p.total_co2_saved), 0)::numeric,
         count(p.id)
    from public.profiles p
    left join public.departments d on d.id = p.department_id
   where p.company_id = company
   group by d.id, d.name
   order by 3 desc;
end;
$$;

-- ── 9. Company counters follow membership ───────────────────────────────────
create or replace function public.refresh_company_counters()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and old.company_id is not null then
    perform public.recompute_company_green_score(old.company_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') and new.company_id is not null
     and (tg_op = 'INSERT' or new.company_id is distinct from old.company_id) then
    perform public.recompute_company_green_score(new.company_id);
  end if;
  return null;
end;
$$;

drop trigger if exists refresh_company_counters_trg on public.profiles;
create trigger refresh_company_counters_trg
  after insert or delete or update of company_id on public.profiles
  for each row execute function public.refresh_company_counters();

-- A completed carpool counts for both people's companies.
create or replace function public.update_company_green_score()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c uuid;
begin
  if new.status <> 'completed' or old.status = 'completed' then
    return new;
  end if;
  for c in
    select distinct p.company_id from public.profiles p
     where p.id in (new.rider_id, new.driver_id) and p.company_id is not null
  loop
    perform public.recompute_company_green_score(c);
  end loop;
  return new;
end;
$$;

-- ── 10. Fuel vocabulary ─────────────────────────────────────────────────────
alter table public.profiles alter column car_fuel_type set default 'petrol';
update public.profiles set car_fuel_type = 'petrol' where car_fuel_type = 'gasoline';

-- ── 11. Map radar at ~300 m precision ───────────────────────────────────────
create or replace function public.get_peer_rides(p_role text)
returns table (
  ride_id uuid,
  user_id uuid,
  status text,
  scheduled_at timestamptz,
  transport_mode text,
  approx_origin_lat double precision,
  approx_origin_long double precision,
  approx_dest_lat double precision,
  approx_dest_long double precision
)
language sql
stable
security definer
set search_path = public
as $$
  select r.id,
         case when p_role = 'driver' then r.driver_id else r.rider_id end,
         r.status,
         r.scheduled_at,
         r.transport_mode,
         (round((r.origin_lat  / 0.005)::numeric) * 0.005)::double precision,
         (round((r.origin_long / 0.005)::numeric) * 0.005)::double precision,
         (round((r.dest_lat    / 0.005)::numeric) * 0.005)::double precision,
         (round((r.dest_long   / 0.005)::numeric) * 0.005)::double precision
    from public.rides r
   where auth.uid() is not null
     and p_role in ('driver', 'rider')
     and r.status in ('scheduled', 'active', 'requested')
     and (r.scheduled_at is null or r.scheduled_at > now() - interval '2 hours')
     and case when p_role = 'driver' then r.driver_id else r.rider_id end is not null
     and case when p_role = 'driver' then r.driver_id else r.rider_id end <> auth.uid()
     and public.is_peer_visible(auth.uid(), case when p_role = 'driver' then r.driver_id else r.rider_id end)
   order by r.scheduled_at nulls last
   limit 20;
$$;

revoke all on function public.get_peer_rides(text) from public, anon;
grant execute on function public.get_peer_rides(text) to authenticated;

-- Company team list for managers and admins: names, email, avatar, department
-- and role only — never home or work locations (managers could read whole
-- profile rows, home coordinates included, through the profiles policy; 057
-- drops that once the website reads the team through this).
create or replace function public.get_company_members(p_company_id uuid)
returns table (
  id uuid,
  first_name text,
  last_name text,
  email text,
  avatar_url text,
  department_id uuid,
  is_manager boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.email, p.avatar_url, p.department_id, p.is_manager, p.created_at
    from public.profiles p
   where p.company_id = p_company_id
     and (public.is_company_admin(auth.uid(), p_company_id)
          or exists (select 1 from public.profiles me
                      where me.id = auth.uid() and me.company_id = p_company_id and me.is_manager))
   order by p.first_name nulls last;
$$;

revoke all on function public.get_company_members(uuid) from public, anon;
grant execute on function public.get_company_members(uuid) to authenticated;

-- ── 12. Foreign-key indexes ─────────────────────────────────────────────────
create index if not exists idx_carpool_suggestions_ride_id on public.carpool_suggestions (ride_id);
create index if not exists idx_companies_admin_user_id on public.companies (admin_user_id);
create index if not exists idx_company_challenges_created_by on public.company_challenges (created_by);
create index if not exists idx_company_invites_accepted_by on public.company_invites (accepted_by);
create index if not exists idx_company_invites_department_id on public.company_invites (department_id);
create index if not exists idx_company_invites_invited_by on public.company_invites (invited_by);
create index if not exists idx_esg_reports_generated_by on public.esg_reports (generated_by);
create index if not exists idx_messages_sender_id on public.messages (sender_id);
create index if not exists idx_profiles_department_id on public.profiles (department_id);
create index if not exists idx_ratings_rater_id on public.ratings (rater_id);
create index if not exists idx_referrals_referrer_id on public.referrals (referrer_id);
create index if not exists idx_ride_completions_user_id on public.ride_completions (user_id);
create index if not exists idx_ride_live_locations_user_id on public.ride_live_locations (user_id);
create index if not exists idx_safety_incidents_ride_id on public.safety_incidents (ride_id);
create index if not exists idx_safety_incidents_user_id on public.safety_incidents (user_id);
create index if not exists idx_trip_intent_matches_ride_id on public.trip_intent_matches (ride_id);

-- ── Privileges for the new / replaced functions ─────────────────────────────
revoke all on function public.delete_ownerless_rides() from public, anon, authenticated;
revoke all on function public.refresh_company_counters() from public, anon, authenticated;
revoke all on function public.assign_company_to_profile() from public, anon, authenticated;
revoke all on function public.enforce_ride_co2() from public, anon, authenticated;
revoke all on function public.update_company_green_score() from public, anon, authenticated;

-- Counters recomputed once under the new rules.
select public.recompute_company_green_score(id) from public.companies;
