-- 051: matched commuters can chat from the moment they're matched.
--
-- Until now a chat thread was a ride (messages.ride_id), and in the daily-commute
-- flow the ride only exists once BOTH people approve — so two people who were
-- matched couldn't agree on a pickup time or place before committing. And the
-- trip screen hid its Chat button whenever the partner's name didn't resolve,
-- which is_peer_visible refused for some already-matched pairs (an independent
-- who later turned matching off; two companies without cross-org visibility).
--
--   1. messages.match_id: a thread can be a match. Either participant may read;
--      posting is open while the match is live (pending / awaiting_other /
--      confirmed). Ride threads keep their existing rules.
--   2. When the match's ride is created, its messages are tied to the ride too,
--      so the conversation continues on the trip screen.
--   3. is_peer_visible: people who share a live match or a ride always see each
--      other's display fields (first name, avatar) — everything else unchanged.

-- ── 1. Match threads ──────────────────────────────────────────────────────────
alter table public.messages
  add column if not exists match_id uuid references public.trip_intent_matches(id) on delete cascade;

create index if not exists idx_messages_match_id on public.messages (match_id, created_at);

alter table public.messages drop constraint if exists messages_thread_check;
alter table public.messages
  add constraint messages_thread_check check (ride_id is not null or match_id is not null);

drop policy if exists "Users can select messages" on public.messages;
create policy "Users can select messages" on public.messages
  for select to authenticated
  using (
    exists (select 1 from public.rides r
             where r.id = messages.ride_id
               and (r.rider_id = auth.uid() or r.driver_id = auth.uid()))
    or exists (select 1 from public.trip_intent_matches m
                where m.id = messages.match_id
                  and (m.driver_user_id = auth.uid() or m.passenger_user_id = auth.uid()))
  );

drop policy if exists "Users can insert messages" on public.messages;
create policy "Users can insert messages" on public.messages
  for insert to authenticated
  with check (
    auth.uid() = sender_id
    and (
      exists (select 1 from public.rides r
               where r.id = messages.ride_id
                 and (r.rider_id = auth.uid() or r.driver_id = auth.uid()))
      or exists (select 1 from public.trip_intent_matches m
                  where m.id = messages.match_id
                    and (m.driver_user_id = auth.uid() or m.passenger_user_id = auth.uid())
                    and m.status in ('pending', 'awaiting_other', 'confirmed'))
    )
  );

-- ── 2. Carry a match's conversation over to its ride ──────────────────────────
create or replace function public.carry_match_chat_to_ride()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.ride_id is not null and new.ride_id is distinct from old.ride_id then
    update public.messages set ride_id = new.ride_id
     where match_id = new.id and ride_id is null;
  end if;
  return new;
end;
$$;

-- Trigger-only, like the other definer triggers (031).
revoke execute on function public.carry_match_chat_to_ride() from public, anon, authenticated;

drop trigger if exists carry_match_chat_to_ride_trg on public.trip_intent_matches;
create trigger carry_match_chat_to_ride_trg
  after update of ride_id on public.trip_intent_matches
  for each row execute function public.carry_match_chat_to_ride();

-- ── 3. Matched / riding partners always see each other ────────────────────────
create or replace function public.is_peer_visible(p_caller uuid, p_target uuid)
returns boolean
language plpgsql
stable security definer
set search_path to 'public'
as $function$
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

  -- Partners: a live match or a shared ride (051). Checked before the
  -- opt-in rules, which only govern discovering new people.
  if exists (select 1 from public.trip_intent_matches m
              where ((m.driver_user_id = p_caller and m.passenger_user_id = p_target)
                  or (m.driver_user_id = p_target and m.passenger_user_id = p_caller))
                and m.status in ('pending', 'awaiting_other', 'confirmed'))
     or exists (select 1 from public.rides r
                 where (r.driver_id = p_caller and r.rider_id = p_target)
                    or (r.driver_id = p_target and r.rider_id = p_caller)) then
    return true;
  end if;

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
             -- Searching, or matched with a seat still open (053): not closed.
             and ti.status <> 'expired');
end;
$function$;
