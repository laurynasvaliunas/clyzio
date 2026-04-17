import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, DriverRespondSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  let supabase;
  try {
    ({ userId, supabase } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, DriverRespondSchema);
  if (!parsed.ok) return parsed.response;
  const { accepted_ids, declined_ids, detour_preference, custom_pickups } = parsed.data;

  try {
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .single();
    const driverName = driverProfile?.first_name ?? 'Your driver';

    for (const matchId of accepted_ids) {
      const updates: Record<string, unknown> = {
        status: 'driver_accepted',
        detour_preference,
        updated_at: new Date().toISOString(),
      };
      if (detour_preference === 'fixed') {
        const cp = (custom_pickups ?? []).find((p) => p.match_id === matchId);
        if (cp) {
          updates.custom_pickup_lat = cp.lat;
          updates.custom_pickup_long = cp.lng;
        }
      }
      const { data: match, error } = await supabase
        .from('trip_intent_matches')
        .update(updates)
        .eq('id', matchId)
        .eq('driver_user_id', userId)
        .eq('status', 'pending_driver_review')
        .select('passenger_user_id')
        .single();

      if (error || !match) { console.error('accept match err:', error?.message); continue; }

      const { data: passengerProfile } = await supabase
        .from('profiles')
        .select('expo_push_token, notification_prefs')
        .eq('id', match.passenger_user_id)
        .single();
      const matchesPref = (passengerProfile?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
      if (passengerProfile?.expo_push_token && matchesPref) {
        await sendPush({
          to: passengerProfile.expo_push_token,
          title: 'Match accepted!',
          body: `${driverName} accepted your commute match. Tap to confirm your ride.`,
          data: { screen: 'daily-commute' },
        });
      }
    }

    for (const matchId of declined_ids) {
      await supabase
        .from('trip_intent_matches')
        .update({ status: 'cancelled_by_driver', updated_at: new Date().toISOString() })
        .eq('id', matchId)
        .eq('driver_user_id', userId)
        .eq('status', 'pending_driver_review');
    }

    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('driver-respond-to-matches', err);
  }
});
