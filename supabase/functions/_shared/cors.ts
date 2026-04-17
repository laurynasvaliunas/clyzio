// CORS for Clyzio edge functions.
//
// React Native doesn't enforce CORS, so `*` is acceptable here — but we keep the
// allowed header list minimal and explicitly include our own auth headers.
// When a web client is introduced, flip to an allowlist from
// `ALLOWED_ORIGINS` env var (comma-separated).
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').trim();

export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': allowedOrigins || '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
  Vary: 'Origin',
};
