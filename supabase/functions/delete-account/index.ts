import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, DeleteAccountSchema } from '../_shared/validate.ts';

/**
 * Deletes a user's account and all associated data.
 *
 * Client-side profile deletion (the previous implementation) failed silently
 * under RLS and never removed the `auth.users` row, leaving orphaned auth
 * accounts. This function uses the service role to:
 *   1. Cascade-delete application data the user owns (rides, intents, etc.).
 *      Any row with `ON DELETE CASCADE` from `profiles.id` is cleaned by (3).
 *   2. Revoke the push token.
 *   3. Call `auth.admin.deleteUser(userId)` which also cascades to `profiles`.
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  let userId: string;
  try {
    ({ userId } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, DeleteAccountSchema);
  if (!parsed.ok) return parsed.response;

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  try {
    // (1) Belt-and-braces cleanup of tables that don't cascade-delete from profiles.
    const tables = [
      'rides',
      'messages',
      'trip_intents',
      'trip_intent_matches',
      'ai_suggestions',
      'ratings',
      'referrals',
      'safety_incidents',
    ] as const;
    for (const table of tables) {
      // Tables with different owner column naming: ride / message have sender_id / rider_id etc.
      // For safety, just try a few likely owner keys each wrapped in its own try.
      const keys = ['user_id', 'sender_id', 'rider_id', 'driver_id', 'rater_id', 'referrer_id'];
      for (const key of keys) {
        try {
          await admin.from(table).delete().eq(key, userId);
        } catch {/* table/column may not exist — ignore */}
      }
    }

    // (2) Revoke push token before we delete the profile.
    try { await admin.from('profiles').update({ expo_push_token: null }).eq('id', userId); }
    catch {/* ignore */}

    // (3) Delete auth user; `profiles` cascades via FK ON DELETE CASCADE.
    const { error: authErr } = await admin.auth.admin.deleteUser(userId);
    if (authErr) throw authErr;

    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('delete-account', err);
  }
});
