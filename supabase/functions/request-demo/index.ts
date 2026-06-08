// request-demo — public marketing endpoint (demo / pilot / contact form).
// verify_jwt:false. Anti-abuse: honeypot + per-email hourly rate limit. Logs to
// demo_requests, notifies sales, and sends the requester a branded ack. Email
// failures never fail the form — the lead is still captured.
import { corsHeaders } from '../_shared/cors.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendMail, demoAck, demoNotify, SALES_EMAIL } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return respondError(405, 'method_not_allowed');

  let body: Record<string, string> = {};
  try { body = await req.json(); } catch { body = {}; }
  const type = body.type === 'contact' ? 'contact' : 'demo';
  const name = (body.name ?? '').trim();
  const email = (body.email ?? '').trim().toLowerCase();
  const company = (body.company ?? '').trim();
  const employees = (body.employees ?? '').trim();
  const message = (body.message ?? '').trim();

  // Honeypot — bots fill hidden fields; silently accept + drop.
  if ((body.hp ?? '').trim()) return respondJSON({ ok: true });

  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
  if (!name || !emailOk) return respondError(400, 'bad_request');

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const ua = req.headers.get('user-agent') ?? null;

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Rate limit: max 5 requests per email per hour → soft-drop beyond that.
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase
      .from('demo_requests')
      .select('id', { count: 'exact', head: true })
      .eq('email', email)
      .gte('created_at', since);
    if ((count ?? 0) >= 5) return respondJSON({ ok: true });

    await supabase.from('demo_requests')
      .insert({ type, name, email, company, employees, message, ip, user_agent: ua });

    // Best-effort email — never fail the lead capture if SMTP hiccups.
    try {
      const notify = demoNotify({ type, name, email, company, employees, message });
      const ack = demoAck({ name, company });
      await sendMail({ to: SALES_EMAIL, subject: notify.subject, html: notify.html, replyTo: email });
      await sendMail({ to: email, subject: ack.subject, html: ack.html });
    } catch (mailErr) {
      console.error('request-demo email failed (lead still logged):', mailErr);
    }

    return respondJSON({ ok: true });
  } catch (err) {
    return respondInternalError('request-demo', err);
  }
});
