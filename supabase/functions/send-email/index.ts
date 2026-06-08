// send-email — server-to-server transactional sender (invite / esg-ready /
// welcome). verify_jwt:false; gated by the shared CRON_SHARED_SECRET so only
// trusted callers (other edge functions, the web's service-role endpoints, DB
// triggers via pg_net) can send.
import { corsHeaders } from '../_shared/cors.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { sendMail, inviteEmail, esgReadyEmail, welcomeEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respondError(405, 'method_not_allowed');

  const secret = req.headers.get('x-cron-secret');
  if (!secret || secret !== (Deno.env.get('CRON_SHARED_SECRET') ?? '')) {
    return respondError(401, 'unauthorized');
  }

  let body: { template?: string; to?: string; data?: Record<string, string> } = {};
  try { body = await req.json(); } catch { body = {}; }
  const { template, to } = body;
  const data = body.data ?? {};
  if (!to || !template) return respondError(400, 'bad_request');

  try {
    let r: { subject: string; html: string };
    if (template === 'invite') r = inviteEmail(data as any);
    else if (template === 'esg-ready') r = esgReadyEmail(data as any);
    else if (template === 'welcome') r = welcomeEmail(data as any);
    else return respondError(400, 'bad_request', 'unknown_template');

    await sendMail({ to, subject: r.subject, html: r.html });
    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('send-email', err);
  }
});
