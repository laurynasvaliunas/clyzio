-- 045 — Independent (no-company) users can match with each other, and with
-- employees who open a specific trip to people outside their company.
--
-- Rule (single source of truth — is_peer_visible + can_pair_intents):
--   same company                → always visible (unchanged)
--   two independents            → both profiles.is_public (chosen at setup)
--   two different companies     → unchanged: both public AND both companies
--                                 allow_cross_org_visibility
--   independent + employee      → the independent is public AND the employee's
--                                 trip is open (trip_intents.open_to_independents)
-- "Independent" = company_id IS NULL (solo users and corporate-domain users
-- whose company hasn't registered yet).
--
-- Before this, the cross-org branch let a company's allow_cross_org_visibility
-- expose every employee to independents. It is off for all companies, so no
-- existing visibility is lost.

begin;

-- 1. Per-trip opt-in for employees. Off by default; old app builds never send it.
alter table public.trip_intents
  add column if not exists open_to_independents boolean not null default false;

comment on column public.trip_intents.open_to_independents is
  'Employee opened this ride/drive to commuters outside their company. Ignored for independents.';

create index if not exists trip_intents_open_to_independents_idx
  on public.trip_intents (user_id, trip_date)
  where open_to_independents;

-- 2. Person-level predicate (radar, profiles, candidate search, rides RLS).
create or replace function public.is_peer_visible(p_caller uuid, p_target uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_caller_company uuid;
  v_caller_public  boolean;
  v_target_company uuid;
  v_target_public  boolean;
  v_employee       uuid;
  v_indep_public   boolean;
begin
  if p_caller is null or p_target is null then return false; end if;
  if p_caller = p_target then return true; end if;

  select company_id, coalesce(is_public, false)
    into v_caller_company, v_caller_public
    from public.profiles where id = p_caller;
  select company_id, coalesce(is_public, false)
    into v_target_company, v_target_public
    from public.profiles where id = p_target;

  -- Colleagues.
  if v_caller_company is not null and v_caller_company = v_target_company then
    return true;
  end if;

  -- Two independents: both opted in.
  if v_caller_company is null and v_target_company is null then
    return v_caller_public and v_target_public;
  end if;

  -- Two different companies: unchanged admin-controlled cross-org rule.
  if v_caller_company is not null and v_target_company is not null then
    if not (v_caller_public and v_target_public) then return false; end if;
    return exists (select 1 from public.companies c
                   where c.id = v_caller_company and c.allow_cross_org_visibility)
       and exists (select 1 from public.companies c
                   where c.id = v_target_company and c.allow_cross_org_visibility);
  end if;

  -- Independent + employee: the independent must be public, and the employee
  -- must have an open upcoming trip — or the two are already matched (so
  -- partners keep seeing each other's names).
  if v_caller_company is null then
    v_employee := p_target;  v_indep_public := v_caller_public;
  else
    v_employee := p_caller;  v_indep_public := v_target_public;
  end if;
  if not v_indep_public then return false; end if;

  return exists (
           select 1 from public.trip_intent_matches m
           where (m.driver_user_id = p_caller and m.passenger_user_id = p_target)
              or (m.driver_user_id = p_target and m.passenger_user_id = p_caller))
      or exists (
           select 1 from public.trip_intents ti
           where ti.user_id = v_employee
             and ti.open_to_independents
             and ti.trip_date >= current_date
             and ti.status in ('pending', 'unmatched'));
end;
$$;

-- 3. Trip-level predicate for pairing two specific intents (matcher and
--    request-carpool). For independent + employee it checks the employee's
--    OWN intent, not just "some open trip".
create or replace function public.can_pair_intents(p_driver_intent uuid, p_passenger_intent uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_driver_user     uuid;
  v_driver_company  uuid;
  v_driver_public   boolean;
  v_driver_open     boolean;
  v_pass_user       uuid;
  v_pass_company    uuid;
  v_pass_public     boolean;
  v_pass_open       boolean;
begin
  select ti.user_id, p.company_id, coalesce(p.is_public, false), ti.open_to_independents
    into v_driver_user, v_driver_company, v_driver_public, v_driver_open
    from public.trip_intents ti join public.profiles p on p.id = ti.user_id
    where ti.id = p_driver_intent;
  select ti.user_id, p.company_id, coalesce(p.is_public, false), ti.open_to_independents
    into v_pass_user, v_pass_company, v_pass_public, v_pass_open
    from public.trip_intents ti join public.profiles p on p.id = ti.user_id
    where ti.id = p_passenger_intent;

  if v_driver_user is null or v_pass_user is null or v_driver_user = v_pass_user then
    return false;
  end if;

  -- Independent driver + employee passenger, or the reverse.
  if v_driver_company is null and v_pass_company is not null then
    return v_driver_public and v_pass_open;
  end if;
  if v_driver_company is not null and v_pass_company is null then
    return v_pass_public and v_driver_open;
  end if;

  -- Colleagues, two independents, two companies: the person-level rule.
  return public.is_peer_visible(v_driver_user, v_pass_user);
end;
$$;

revoke all on function public.can_pair_intents(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_pair_intents(uuid, uuid) to service_role;

-- 4. Map radar of peers' intents: adds the trip-level filter for independent +
--    employee, and is_colleague for the "Outside your company" label.
drop function if exists public.get_peer_trip_intents(date);
create function public.get_peer_trip_intents(p_trip_date date default null)
returns table (
  user_id uuid,
  role text,
  trip_date date,
  departure_time time,
  approx_home_lat double precision,
  approx_home_long double precision,
  first_name text,
  last_name text,
  avatar_url text,
  is_colleague boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select company_id from public.profiles where id = auth.uid()
  ), day as (
    select coalesce(p_trip_date, current_date + 1) as d
  )
  select
    ti.user_id,
    ti.role,
    ti.trip_date,
    ti.departure_time,
    (round((ti.home_lat  / 0.005)::numeric) * 0.005)::double precision,
    (round((ti.home_long / 0.005)::numeric) * 0.005)::double precision,
    p.first_name,
    p.last_name,
    p.avatar_url,
    (me.company_id is not null and me.company_id = p.company_id) as is_colleague
  from public.trip_intents ti
  join public.profiles p on p.id = ti.user_id
  cross join day
  left join me on true
  where ti.user_id <> auth.uid()
    and ti.trip_date = day.d
    and ti.status in ('pending', 'unmatched')
    and ti.home_lat is not null
    and ti.home_long is not null
    and public.is_peer_visible(auth.uid(), ti.user_id)
    and (
      -- Same type (colleagues / independents / two companies): person rule only.
      (me.company_id is null) = (p.company_id is null)
      -- Independent looking at an employee: that trip must be open.
      or (p.company_id is not null and ti.open_to_independents)
      -- Employee looking at an independent: their own trip that day is open.
      or (me.company_id is not null and exists (
            select 1 from public.trip_intents mine
            where mine.user_id = auth.uid()
              and mine.trip_date = day.d
              and mine.open_to_independents
              and mine.status in ('pending', 'unmatched')))
    );
$$;

revoke all on function public.get_peer_trip_intents(date) from public, anon;
grant execute on function public.get_peer_trip_intents(date) to authenticated;

-- 5. Public profile card: adds is_colleague.
drop function if exists public.get_public_profiles(uuid[]);
create function public.get_public_profiles(p_ids uuid[])
returns table (
  id uuid, first_name text, last_name text, avatar_url text, department text,
  total_co2_saved numeric, trips_completed int, level int, is_colleague boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.last_name, p.avatar_url, p.department,
         p.total_co2_saved, p.trips_completed, p.level,
         (me.company_id is not null and me.company_id = p.company_id) as is_colleague
  from public.profiles p
  left join (select company_id from public.profiles where id = auth.uid()) me on true
  where p.id = any(p_ids)
    and public.is_peer_visible(auth.uid(), p.id);
$$;

revoke all on function public.get_public_profiles(uuid[]) from public, anon;
grant execute on function public.get_public_profiles(uuid[]) to authenticated;

commit;
