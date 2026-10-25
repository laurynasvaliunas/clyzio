/**
 * send-message — chat between matched commuters (migration 051), with a push
 * to the other person.
 *
 * A thread is either a match (trip_intent_matches: open from the moment two
 * people are matched, before either approves) or a ride. Once a match's ride
 * exists the conversation lives on the ride — 051 moved the earlier messages
 * there — so posting to such a match writes to the ride thread.
 *
 * The insert runs as the CALLER (their JWT), so the messages RLS policies
 * decide who may post: the two participants, and a match only while it's live.
 * The admin client only reads the thread and the partner's push settings.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, SendMessageSchema } from '../_shared/validate.ts';
import { sendPush } from '../_shared/expoPush.ts';

const LIVE_MATCH = ['pending', 'awaiting_other', 'confirmed'];
const PREVIEW_CHARS = 140;

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

  const parsed = await parseBody(req, SendMessageSchema);
  if (!parsed.ok) return parsed.response;
  const { match_id, ride_id, content } = parsed.data;

  try {
    // Resolve the thread and the other participant.
    let thread: { ride_id?: string; match_id?: string };
    let partnerId: string;
    if (match_id) {
      const { data: m, error } = await supabase
        .from('trip_intent_matches')
        .select('id, driver_user_id, passenger_user_id, status, ride_id')
        .eq('id', match_id)
        .maybeSingle();
      if (error) return respondInternalError('send-message', error, 'match_fetch_failed');
      if (!m) return respondError(404, 'not_found', 'match_not_found');
      if (m.driver_user_id !== userId && m.passenger_user_id !== userId) {
        return respondError(403, 'forbidden', 'not_a_participant');
      }
      if (!LIVE_MATCH.includes(m.status)) return respondError(409, 'conflict', 'match_closed');
      partnerId = m.driver_user_id === userId ? m.passenger_user_id : m.driver_user_id;
      thread = m.ride_id ? { ride_id: m.ride_id, match_id: m.id } : { match_id: m.id };
    } else {
      const { data: r, error } = await supabase
        .from('rides')
        .select('id, driver_id, rider_id')
        .eq('id', ride_id)
        .maybeSingle();
      if (error) return respondInternalError('send-message', error, 'ride_fetch_failed');
      if (!r) return respondError(404, 'not_found', 'ride_not_found');
      if (r.driver_id !== userId && r.rider_id !== userId) {
        return respondError(403, 'forbidden', 'not_a_participant');
      }
      if (!r.driver_id || !r.rider_id) return respondError(409, 'conflict', 'not_a_carpool');
      partnerId = r.driver_id === userId ? r.rider_id : r.driver_id;
      thread = { ride_id: r.id };
    }

    // The message itself, as the caller.
    const userClient = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
      auth: { persistSession: false },
    });
    const { data: message, error: insErr } = await userClient
      .from('messages')
      .insert({ ...thread, sender_id: userId, content })
      .select('*')
      .single();
    if (insErr) return respondInternalError('send-message', insErr, 'message_insert_failed');

    // Push the partner, unless they turned chat notifications off.
    const [{ data: me }, { data: partner, error: partnerErr }] = await Promise.all([
      supabase.from('profiles').select('first_name').eq('id', userId).maybeSingle(),
      supabase.from('profiles').select('expo_push_token, notification_prefs').eq('id', partnerId).maybeSingle(),
    ]);
    if (partnerErr) console.error('[send-message] partner profile read failed:', partnerErr.message);
    const chatPref = (partner?.notification_prefs as { chat?: boolean } | null)?.chat ?? true;
    if (partner?.expo_push_token && chatPref) {
      const body = content.length > PREVIEW_CHARS ? `${content.slice(0, PREVIEW_CHARS - 1)}…` : content;
      await sendPush({
        to: partner.expo_push_token,
        title: me?.first_name ?? 'New message',
        body,
        data: thread.ride_id
          ? { screen: 'chat', rideId: thread.ride_id }
          : { screen: 'chat', matchId: thread.match_id },
      });
    }

    return respondJSON({ ok: true, message });
  } catch (e) {
    return respondInternalError('send-message', e, 'send_failed');
  }
});
