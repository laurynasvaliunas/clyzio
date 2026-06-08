// welcome-self — sends the branded welcome email to the authenticated caller's
// own address, once. Called by the apps right after signup (mobile + web), so it
// covers both platforms without embedding any secret in the database. Idempotent
// via profiles.welcomed_at.
import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { sendMail, welcomeEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  let userId: string;
  // deno-lint-ignore no-explicit-any
  let supabase: any;
  try { ({ userId, supabase } = await verifyAuth(req)); }
  catch { return respondError(401, 'unauthorized'); }

  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, first_name, welcomed_at')
      .eq('id', userId)
      .single();

    if (!profile?.email) return respondError(400, 'bad_request', 'no_email');
    if (profile.welcomed_at) return respondJSON({ ok: true, skipped: true });

    const r = welcomeEmail({ firstName: profile.first_name ?? undefined, appUrl: 'https://clyzio.com' });
    await sendMail({ to: profile.email, subject: r.subject, html: r.html });

    await supabase.from('profiles').update({ welcomed_at: new Date().toISOString() }).eq('id', userId);
    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('welcome-self', err);
  }
});
