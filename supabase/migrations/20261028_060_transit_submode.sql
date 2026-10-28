-- 060: credit a public-transport trip with the vehicle actually taken.
--
-- The planner shows each Google transit option with its own factor (tram
-- 0.029, trolleybus, metro, train, bus 0.097 kg/km), but the trip was saved
-- only as transport_mode 'public', so the server credited every trip at the
-- bus factor. A 10 km tram commute showed one CO₂ figure and saved another.
-- Now the app saves the option's vehicle in rides.transit_submode, and the
-- trip's CO₂ (enforce_ride_co2) and the website's ESG inventory use its
-- factor. Trips without it (older app builds, "public" without picking an
-- option) keep the public-transport factor.

alter table public.rides add column if not exists transit_submode text;
alter table public.rides drop constraint if exists rides_transit_submode_check;
alter table public.rides add constraint rides_transit_submode_check
  check (transit_submode is null or transit_submode in ('bus', 'trolleybus', 'tram', 'subway', 'rail'));

-- Every transit factor cited (055 did bus, tram and subway). There is no
-- published trolleybus figure in the set we use; it takes the electric tram
-- value. "mixed" was an unsourced blend: a route now counts as the vehicle
-- that covers most of its distance (transit-routes).
update public.emission_factor set co2_per_km = 0.035, source = 'EEA 2023'
 where kind = 'transit' and key = 'rail';
update public.emission_factor set co2_per_km = 0.029, source = 'EEA 2023 (tram; electric trolleybus)'
 where kind = 'transit' and key = 'trolleybus';
delete from public.emission_factor where kind = 'transit' and key = 'mixed';

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

  -- The vehicle only means something for a public-transport trip.
  if new.transport_mode is distinct from 'public' then
    new.transit_submode := null;
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
  select coalesce(
           (select ef.co2_per_km from public.emission_factor ef
             where ef.kind = 'transit' and ef.key = new.transit_submode),
           (select c.co2_per_km from public.transport_mode_catalog c where c.id = new.transport_mode))
    into v_mode_factor;
  v_mode_factor := coalesce(v_mode_factor, v_baseline);
  new.co2_saved := round(greatest(0, v_dist * (v_baseline - v_mode_factor))::numeric, 3);
  return new;
end;
$$;

revoke all on function public.enforce_ride_co2() from public, anon, authenticated;

-- The website's ESG inventory: a public-transport trip's emissions use its
-- vehicle's factor too, unless the company set its own public-transport factor.
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
           coalesce(o.factor_kg_per_km, c.co2_per_km) as factor,
           (o.factor_kg_per_km is not null) as overridden
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
           r.rider_id, r.driver_id, r.transit_submode,
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
                else coalesce(
                       case when rp.mode = 'public' and rp.transit_submode is not null
                                 and not coalesce((select overridden from factors where mode = 'public'), false)
                            then (select ef.co2_per_km from public.emission_factor ef
                                   where ef.kind = 'transit' and ef.key = rp.transit_submode)
                       end,
                       (select f.factor from factors f where f.mode = rp.mode),
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
