/**
 * cancel-ride — cancels a ride and tells a carpool partner.
 *
 * The status change runs as the CALLER (their JWT, not the service role), so
 * the usual rules apply: RLS limits it to participants, the client-write guard
 * only allows → cancelled from a live status, and migration 048's trigger
 * refuses a ride someone already completed and releases the carpool match
 * (cancelled_by_<role>; the canceller's intent closes, the partner's goes back
 * into matching) — using auth.uid() to know who cancelled.
 *
 * What this function adds on top of a plain update: the partner's push, and an
 * immediate re-match attempt for the partner when their intent reopened.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, CancelRideSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';

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

  const parsed = await parseBody(req, CancelRideSchema);
  if (!parsed.ok) return parsed.response;
  const { ride_id } = parsed.data;

  try {
    const { data: ride, error: rideErr } = await supabase
      .from('rides')
      .select('id, status, driver_id, rider_id, scheduled_at')
      .eq('id', ride_id)
      .maybeSingle();
    if (rideErr) return respondInternalError('cancel-ride', rideErr, 'ride_fetch_failed');
    if (!ride) return respondError(404, 'not_found', 'ride_not_found');
    if (ride.rider_id !== userId && ride.driver_id !== userId) {
      return respondError(403, 'forbidden', 'not_a_participant');
    }
    if (ride.status === 'cancelled') return respondJSON({ ok: true, already_cancelled: true });
    if (ride.status === 'completed') return respondError(409, 'conflict', 'ride_completed');

    // Matches this ride confirmed, read BEFORE the trigger releases them.
    const isCarpool = !!(ride.driver_id && ride.rider_id);
    const { data: matches } = isCarpool
      ? await supabase
          .from('trip_intent_matches')
          .select('id, trip_date, driver_intent_id, passenger_intent_id')
          .eq('ride_id', ride_id)
          .eq('status', 'confirmed')
      : { data: [] };

    // The cancel itself, as the caller.
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false },
    });
    const { error: updErr } = await userClient
      .from('rides')
      .update({ status: 'cancelled' })
      .eq('id', ride_id);
    if (updErr) {
      if (updErr.message?.includes('ride_already_completed')) {
        return respondError(409, 'conflict', 'ride_already_completed');
      }
      return respondInternalError('cancel-ride', updErr, 'ride_update_failed');
    }

    if (!isCarpool) return respondJSON({ ok: true });

    const partnerId = ride.driver_id === userId ? ride.rider_id : ride.driver_id;
    const partnerIntentIds = (matches ?? []).map((m: { driver_intent_id: string; passenger_intent_id: string }) =>
      ride.driver_id === userId ? m.passenger_intent_id : m.driver_intent_id,
    );
    const tripDate: string | null = matches?.[0]?.trip_date ?? null;
    const today = new Date().toISOString().split('T')[0];

    // Which partner intents the trigger reopened for matching (future dates only
    // are worth re-matching).
    const { data: reopened } = partnerIntentIds.length > 0 && tripDate && tripDate > today
      ? await supabase.from('trip_intents').select('id').in('id', partnerIntentIds).eq('status', 'pending')
      : { data: [] };

    const [{ data: me }, { data: partner, error: partnerErr }] = await Promise.all([
      supabase.from('profiles').select('first_name').eq('id', userId).maybeSingle(),
      supabase.from('profiles').select('expo_push_token, notification_prefs').eq('id', partnerId).maybeSingle(),
    ]);
    if (partnerErr) console.error('[cancel-ride] partner profile read failed:', partnerErr.message);

    const who = me?.first_name ?? 'Your carpool partner';
    const when = tripDate ? ` on ${tripDate}` : '';
    const keepLooking = (reopened ?? []).length > 0;
    const matchesPref = (partner?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
    if (partner?.expo_push_token && matchesPref) {
      await sendPush({
        to: partner.expo_push_token,
        title: 'Carpool cancelled',
        body: `${who} cancelled your carpool${when}.${keepLooking ? " We'll look for another match." : ''}`,
        data: keepLooking ? { screen: 'daily-commute' } : { screen: 'trip', rideId: ride_id },
      });
    }

    // Re-match the partner straight away (same targeted call submit-trip-intent
    // makes). Fire-and-forget; the nightly run is the fallback.
    for (const intent of reopened ?? []) {
      const fire = fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/daily-commute-matcher`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': Deno.env.get('CRON_SHARED_SECRET') ?? '',
        },
        body: JSON.stringify({ trip_date: tripDate, new_intent_id: intent.id }),
      }).catch((e) => { console.error('[cancel-ride] re-match failed:', e); });
      try {
        (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } })
          .EdgeRuntime?.waitUntil?.(fire);
      } catch { /* waitUntil unavailable — request still fires, just not awaited */ }
    }

    return respondJSON({ ok: true, partner_notified: !!partner?.expo_push_token && matchesPref });
  } catch (err) {
    return respondInternalError('cancel-ride', err);
  }
});
