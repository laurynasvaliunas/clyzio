import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, PassengerRespondSchema } from '../_shared/validate.ts';
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

  const parsed = await parseBody(req, PassengerRespondSchema);
  if (!parsed.ok) return parsed.response;
  const { match_id, accepted } = parsed.data;

  try {
    const { data: match, error: matchError } = await supabase
      .from('trip_intent_matches')
      .select('driver_user_id, passenger_intent_id, driver_intent_id, trip_date, pickup_lat, pickup_long, proposed_departure')
      .eq('id', match_id)
      .eq('passenger_user_id', userId)
      .single();

    if (matchError || !match) {
      return respondError(404, 'not_found', 'match_not_found');
    }

    const { data: passengerProfile } = await supabase
      .from('profiles')
      .select('first_name')
      .eq('id', userId)
      .single();
    const passengerName = passengerProfile?.first_name ?? 'Your passenger';

    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('expo_push_token, work_lat, work_long, notification_prefs')
      .eq('id', match.driver_user_id)
      .single();

    if (accepted) {
      const { data: rideData } = await supabase
        .from('rides')
        .insert({
          driver_id: match.driver_user_id,
          rider_id: userId,
          status: 'scheduled',
          origin_lat: match.pickup_lat ?? 0,
          origin_long: match.pickup_long ?? 0,
          dest_lat: driverProfile?.work_lat ?? 0,
          dest_long: driverProfile?.work_long ?? 0,
          scheduled_at: new Date(`${match.trip_date}T${match.proposed_departure ?? '08:00'}:00`).toISOString(),
          transport_mode: 'carpool',
          transport_label: 'Carpool',
        })
        .select('id')
        .single();

      const { error: confirmError } = await supabase
        .from('trip_intent_matches')
        .update({
          status: 'confirmed',
          ride_id: rideData?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', match_id);

      if (confirmError) throw confirmError;

      await supabase.from('trip_intents').update({ status: 'matched' }).eq('id', match.passenger_intent_id);
      await supabase.from('trip_intents').update({ status: 'matched' }).eq('id', match.driver_intent_id);

      const matchesPref = (driverProfile?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
      if (driverProfile?.expo_push_token && matchesPref) {
        await sendPush({
          to: driverProfile.expo_push_token,
          title: 'Ride confirmed!',
          body: `${passengerName} confirmed your commute tomorrow. You're all set!`,
          data: { screen: 'daily-commute' },
        });
      }

      return respondJSON({ ok: true, ride_id: rideData?.id });
    }

    await supabase
      .from('trip_intent_matches')
      .update({ status: 'cancelled_by_passenger', updated_at: new Date().toISOString() })
      .eq('id', match_id);

    const matchesPref = (driverProfile?.notification_prefs as { matches?: boolean } | null)?.matches ?? true;
    if (driverProfile?.expo_push_token && matchesPref) {
      await sendPush({
        to: driverProfile.expo_push_token,
        title: 'Match declined',
        body: `${passengerName} declined the ride. Check for other matches.`,
        data: { screen: 'daily-commute' },
      });
    }

    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('passenger-respond-to-match', err);
  }
});
