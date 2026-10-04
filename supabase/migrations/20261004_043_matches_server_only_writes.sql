-- 043 — Carpool approvals can't be forged from the client.
--
-- Policy "participants update open match" let either participant UPDATE any
-- column of a pending / awaiting_other trip_intent_matches row. Mutual
-- approval is tracked in driver_approved / passenger_approved, so a passenger
-- could PATCH driver_approved = true and then call respond-to-match: the
-- function saw both flags set, created the ride and confirmed the carpool
-- without the driver ever agreeing (and vice versa). The same hole allowed
-- rewriting pickup_lat/long, proposed_departure and ride_id.
--
-- The app never writes this table directly — every transition goes through
-- the respond-to-match / request-carpool / daily-commute-matcher edge
-- functions, which use the service role. So participants keep SELECT and lose
-- UPDATE. Withdrawing a request is respond-to-match with accepted=false.

drop policy if exists "participants update open match" on public.trip_intent_matches;
