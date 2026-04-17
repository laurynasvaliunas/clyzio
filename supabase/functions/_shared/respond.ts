import { corsHeaders } from './cors.ts';

/**
 * Sanitized error envelope. Clients only see `error` (a safe code) — full
 * error detail is logged server-side and never leaked via the response body.
 */
export interface ErrorEnvelope {
  error: string;   // machine-readable code, e.g. "unauthorized", "bad_request", "internal_error"
  code?: string;   // optional sub-code for the client to branch on (e.g. "no_home_location")
}

export function respondJSON(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
}

export function respondError(
  status: number,
  error: string,
  code?: string,
): Response {
  const body: ErrorEnvelope = code ? { error, code } : { error };
  return respondJSON(body, { status });
}

/**
 * Log the detailed error server-side (stderr → Supabase logs), return a sanitized
 * envelope to the client. NEVER embeds `err.message` / `String(err)` in the body.
 */
export function respondInternalError(
  functionName: string,
  err: unknown,
  code: string = 'internal_error',
): Response {
  const msg = err instanceof Error ? err.message : String(err);
  // Server-side log — visible in Supabase Dashboard → Functions → Logs
  console.error(`[${functionName}] ${code}:`, msg);
  if (err instanceof Error && err.stack) console.error(err.stack);
  return respondError(500, 'internal_error', code);
}

/**
 * Best-effort JSON request body parser. Returns null on any parse failure —
 * callers should treat null as empty body.
 */
export async function safeJSON<T = unknown>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
