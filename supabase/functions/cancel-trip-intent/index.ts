/**
 * cancel-trip-intent — "Stop looking" for a carpool (migration 053).
 *
 * Closes the caller's trip and releases its open matches; the people on the
 * other side get a push and the database puts them straight back into
 * matching. A trip with a confirmed carpool is refused (409
 * has_confirmed_ride): cancelling the ride is what tells the partner.
 * The caller can plan a new trip for the same day right away.
 */

import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, CancelTripIntentSchema } from '../_shared/validate.ts';
import { notifyReleased } from '../_shared/carpool.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  // deno-lint-ignore no-explicit-any
  let supabase: any;
  try {
    ({ userId, supabase } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, CancelTripIntentSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const { data, error } = await supabase.rpc('close_trip_intent', {
      p_intent: parsed.data.intent_id,
      p_user: userId,
    });
    if (error) {
      if (error.message === 'has_confirmed_ride') {
        return respondJSON(
          { error: 'conflict', code: 'has_confirmed_ride', ride_id: error.details ?? null },
          { status: 409 },
        );
      }
      if (error.message === 'intent_not_found') return respondError(404, 'not_found', 'intent_not_found');
      return respondInternalError('cancel-trip-intent', error, 'close_failed');
    }

    const released = (data ?? []) as Array<{ partner_user_id: string }>;
    await notifyReleased(supabase, userId, released);
    return respondJSON({ ok: true, released: released.length });
  } catch (err) {
    return respondInternalError('cancel-trip-intent', err);
  }
});
