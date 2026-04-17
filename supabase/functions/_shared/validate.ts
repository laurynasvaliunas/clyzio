// deno-lint-ignore-file no-explicit-any
import { z, ZodSchema } from 'https://esm.sh/zod@3.23.8';
import { respondError } from './respond.ts';

export { z };

export interface ParsedBody<T> {
  ok: true;
  data: T;
}

export interface ParsedError {
  ok: false;
  response: Response;
}

/**
 * Validates a JSON body against a zod schema. Returns the parsed body on
 * success, or a ready-to-return 400 Response on failure (error detail stays
 * on the server logs).
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>,
): Promise<ParsedBody<T> | ParsedError> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    raw = {};
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    // Log the field path(s) server-side so operators can debug — do NOT leak to client
    console.warn('validation failed:', JSON.stringify(result.error.flatten()));
    return { ok: false, response: respondError(400, 'bad_request') };
  }

  return { ok: true, data: result.data };
}

// ─── Shared helpers ─────────────────────────────────────────────────────────

export const lat = z.number().gte(-90).lte(90);
export const lon = z.number().gte(-180).lte(180);
export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/); // YYYY-MM-DD
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/); // HH:MM

// Request schemas for each edge function
export const SubmitTripIntentSchema = z.object({
  role: z.enum(['driver', 'passenger']),
  passenger_capacity: z.number().int().min(0).max(9).optional().nullable(),
  departure_time: hhmm.optional().nullable(),
  required_arrival_time: hhmm.optional().nullable(),
  trip_date: isoDate.optional(),
});

export const DriverRespondSchema = z.object({
  accepted_ids: z.array(uuid).default([]),
  declined_ids: z.array(uuid).default([]),
  detour_preference: z.enum(['flexible', 'fixed']),
  custom_pickups: z
    .array(z.object({ match_id: uuid, lat, lng: lon }))
    .optional(),
});

export const PassengerRespondSchema = z.object({
  match_id: uuid,
  accepted: z.boolean(),
});

export const AICommutePlannerSchema = z
  .object({ force_refresh: z.boolean().optional() })
  .passthrough();

export const AICarpoolMatcherSchema = z.object({
  origin_lat: lat,
  origin_long: lon,
  dest_lat: lat,
  dest_long: lon,
  departure_time: z.string().optional(),
  role: z.enum(['rider', 'driver']).default('rider'),
  max_detour_km: z.number().positive().max(50).default(3),
});

export const AISustainabilityReportSchema = z
  .object({ time_period: z.enum(['week', 'month', 'quarter', 'year']).optional() })
  .passthrough();

export const DailyCommuteMatcherSchema = z
  .object({ trip_date: isoDate.optional() })
  .passthrough();

export const DeleteAccountSchema = z.object({
  confirm: z.literal(true),
});
