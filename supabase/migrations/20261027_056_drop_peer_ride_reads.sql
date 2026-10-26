-- 056: APPLY ONLY AFTER the app build that uses get_peer_rides (055) is the
-- one in the stores — older builds read peers' rides directly for the Map's
-- "nearby commuters" radar and lose it when this runs.
--
-- Colleagues and matched peers could read each other's upcoming rides from the
-- rides table, exact start and destination coordinates and addresses included.
-- The radar now gets them at ~300 m precision through get_peer_rides; a ride's
-- own participants keep full access through the participant policies.
drop policy if exists "Authenticated users can view scheduled rides" on public.rides;
