/**
 * close-stale-rides — hourly cron (migration 049). Closes rides nobody ended.
 *
 * Rides only close when someone taps complete or cancel, so a trip the driver
 * never ended sat in Activity → Upcoming forever (a 12 Oct ride was still
 * there on 14 Oct). 24 h after a ride's scheduled time:
 *   • someone confirmed it (a ride_completions claim) → the trip happened:
 *     mark it completed at the first confirmation and credit whoever is still
 *     owed, with a push so they know (and can rate their partner).
 *   • nobody confirmed it → close it as cancelled. Migration 048/049's trigger
 *     releases a carpool match and closes past-dated intents.
 *
 * Auth: the x-cron-secret header only (verify_jwt = false), as for the
 * scheduled daily-commute-matcher runs.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { sendPush } from '../_shared/expoPush.ts';
import { RIDE_COLUMNS, type RideRow, carpoolPushToken, creditOnBehalf } from '../_shared/credit.ts';

const STALE_AFTER_HOURS = 24;
const BATCH = 200;
const OPEN_STATUSES = ['scheduled', 'requested', 'accepted', 'in_progress'];

Deno.serve(async (req) => {
  const secret = Deno.env.get('CRON_SHARED_SECRET');
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    return respondError(401, 'unauthorized');
  }
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const cutoff = new Date(Date.now() - STALE_AFTER_HOURS * 60 * 60 * 1000).toISOString();
    const { data: rides, error } = await supabase
      .from('rides')
      .select(RIDE_COLUMNS)
      .in('status', OPEN_STATUSES)
      .lt('scheduled_at', cutoff)
      .order('scheduled_at', { ascending: true })
      .limit(BATCH);
    if (error) return respondInternalError('close-stale-rides', error, 'ride_fetch_failed');

    let completed = 0;
    let cancelled = 0;
    let credited = 0;

    for (const ride of (rides ?? []) as RideRow[]) {
      const { data: claims, error: claimsErr } = await supabase
        .from('ride_completions')
        .select('user_id, created_at')
        .eq('ride_id', ride.id)
        .order('created_at', { ascending: true });
      if (claimsErr) {
        console.error('[close-stale-rides] claims read failed:', claimsErr.message);
        continue;
      }

      // `.in(status, OPEN)` on every write: a participant acting in the
      // meantime wins, and this run leaves the ride alone.
      if (!claims || claims.length === 0) {
        const { error: e } = await supabase
          .from('rides')
          .update({ status: 'cancelled' })
          .eq('id', ride.id)
          .in('status', OPEN_STATUSES);
        if (e) console.error('[close-stale-rides] cancel failed:', e.message);
        else cancelled++;
        continue;
      }

      const { error: e } = await supabase
        .from('rides')
        .update({ status: 'completed', completed_at: claims[0].created_at })
        .eq('id', ride.id)
        .in('status', OPEN_STATUSES);
      if (e) {
        console.error('[close-stale-rides] complete failed:', e.message);
        continue;
      }
      completed++;

      const claimed = new Set(claims.map((c: { user_id: string }) => c.user_id));
      const isCarpool = !!(ride.driver_id && ride.rider_id);
      const tripDate = (ride.scheduled_at ?? '').split('T')[0];
      for (const uid of [ride.driver_id, ride.rider_id]) {
        if (!uid || claimed.has(uid)) continue;
        const credit = await creditOnBehalf(supabase, ride, uid, 'close-stale-rides');
        if (!credit || !credit.ok) continue;
        credited++;
        const token = await carpoolPushToken(supabase, uid);
        if (token) {
          const confirmer = uid === ride.driver_id ? 'Your passenger' : 'Your driver';
          await sendPush({
            to: token,
            title: 'Trip completed',
            body: `${confirmer} confirmed your carpool${tripDate ? ` on ${tripDate}` : ''}: +${credit.xpEarned} XP and ${credit.co2Saved.toFixed(2)} kg CO₂ saved.`,
            data: isCarpool ? { screen: 'rating', rideId: ride.id } : { screen: 'trip', rideId: ride.id },
          });
        }
      }
    }

    return respondJSON({ checked: rides?.length ?? 0, completed, cancelled, credited });
  } catch (err) {
    return respondInternalError('close-stale-rides', err);
  }
});
