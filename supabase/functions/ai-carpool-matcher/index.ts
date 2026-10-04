import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, parseClaudeJSON } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, AICarpoolMatcherSchema } from '../_shared/validate.ts';
import { hasAiConsent, haversineKm } from '../_shared/aiConsent.ts';

function buildSystemPrompt(baselineCO2: number, fuelType: string): string {
  return `You are Clyzio's AI Carpool Matcher. Your job is to rank and explain carpool compatibility between a user and candidate rides based on geographic proximity, timing, and route alignment.

Return ONLY valid JSON matching the exact schema provided. No markdown, no explanation.

Rules:
- compatibility_score is 0-100: 80+ = excellent match, 60-79 = good, 40-59 = fair, <40 = poor
- Candidates are anonymous and numbered. Refer to them only by their numbers' facts (distance, timing), never invent names
- Always reference distance_to_pickup_km when explaining matches
- co2_saving_kg should reflect actual saving for one person per trip vs driving alone (user drives a ${fuelType} car at ${baselineCO2} kg CO₂/km, DEFRA/EEA 2024)
- Be honest: if no candidates are a good match, say so in best_match_summary
- If there are no candidates at all, return an empty ranked_matches array
- Punctuation: always use a plain hyphen "-" if you need a dash. NEVER use an em-dash "—" or en-dash "–"; they read as AI-generated. Prefer two short sentences over one long sentence joined by a dash.`;
}

interface CarpoolMatch {
  ride_id: string;
  user_first_name: string;
  to_user_id?: string;
  compatibility_score: number;
  co2_saving_kg: number;
  reasoning: string;
  estimated_detour_min: number;
}

interface CarpoolResponse {
  ranked_matches: CarpoolMatch[];
  best_match_summary: string;
}

/** What the model returns: candidates by number only (no ids, no names). */
interface AIRankedCandidate {
  candidate: number;
  compatibility_score: number;
  co2_saving_kg: number;
  reasoning: string;
  estimated_detour_min: number;
}

interface Candidate {
  ride_id: string;
  user_id: string;
  first_name: string | null;
  origin_lat: number | null;
  origin_long: number | null;
  dest_lat: number | null;
  dest_long: number | null;
  distance_to_origin_km: number | null;
  scheduled_at: string | null;
  transport_mode: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let userId: string;
  let supabase;
  try {
    ({ userId, supabase } = await verifyAuth(req));
  } catch {
    return respondError(401, 'unauthorized');
  }

  const parsed = await parseBody(req, AICarpoolMatcherSchema);
  if (!parsed.ok) return parsed.response;
  const { origin_lat, origin_long, dest_lat, dest_long, departure_time, role, max_detour_km } = parsed.data;

  try {

    // Fetch user's fuel type / CO2 baseline from profile
    const { data: profileData } = await supabase
      .from('profiles')
      .select('car_fuel_type, baseline_co2')
      .eq('id', userId)
      .single();

    const FUEL_CO2_FACTORS: Record<string, number> = {
      petrol: 0.192, diesel: 0.171, hybrid: 0.110, phev: 0.075,
      electric: 0.053, lpg: 0.162, hydrogen: 0.020, cng: 0.157,
    };
    const fuelType: string = profileData?.car_fuel_type || 'petrol';
    const baselineCO2: number = FUEL_CO2_FACTORS[fuelType] ?? profileData?.baseline_co2 ?? 0.192;

    // Find carpool candidates via RPC. p_caller_id makes the server-side
    // is_peer_visible predicate apply same-company default + mutual-opt-in
    // cross-org rules. We run as service role so auth.uid() inside the RPC
    // would be NULL — passing the explicit caller is required.
    const { data: candidates, error: candidatesError } = await supabase.rpc(
      'find_carpool_candidates',
      {
        p_origin_lat: origin_lat,
        p_origin_long: origin_long,
        p_dest_lat: dest_lat,
        p_dest_long: dest_long,
        p_departure_time: departure_time ?? new Date().toISOString(),
        p_role: role,
        p_radius_km: 5.0,
        p_exclude_user_id: userId,
        p_caller_id: userId,
      }
    );

    if (candidatesError) {
      console.error('candidates rpc err:', candidatesError.message);
      return respondError(500, 'internal_error', 'candidates_unavailable');
    }

    if (!candidates || candidates.length === 0) {
      const emptyResponse: CarpoolResponse = {
        ranked_matches: [],
        best_match_summary:
          'No commuters found nearby for your route right now. Try searching again later or post your own trip for others to join.',
      };
      return respondJSON(emptyResponse);
    }

    const pool = candidates as Candidate[];
    const departureMs = departure_time ? new Date(departure_time).getTime() : Date.now();
    const tripDistanceKm = haversineKm(origin_lat, origin_long, dest_lat, dest_long);

    // Data minimisation: the model sees derived numbers only. No coordinates,
    // no names, no ids — neither the caller's nor (crucially) the other
    // commuters', who never agreed to share anything with an AI provider.
    const anonymised = pool.map((c, i) => ({
      candidate: i + 1,
      distance_to_pickup_km: c.distance_to_origin_km != null ? round1(c.distance_to_origin_km) : null,
      destination_gap_km:
        c.dest_lat != null && c.dest_long != null
          ? round1(haversineKm(dest_lat, dest_long, c.dest_lat, c.dest_long))
          : null,
      departure_gap_min: c.scheduled_at
        ? Math.round((new Date(c.scheduled_at).getTime() - departureMs) / 60000)
        : null,
      transport_mode: c.transport_mode,
    }));

    const toMatch = (c: Candidate, ai?: AIRankedCandidate): CarpoolMatch => ({
      ride_id: c.ride_id,
      user_first_name: c.first_name ?? '',
      to_user_id: c.user_id,
      compatibility_score: ai?.compatibility_score ?? Math.max(0, Math.round(100 - (c.distance_to_origin_km ?? 5) * 15)),
      co2_saving_kg: ai?.co2_saving_kg ?? round1(tripDistanceKm * baselineCO2 * 0.5),
      reasoning: ai?.reasoning ?? `${round1(c.distance_to_origin_km ?? 0)} km from your start.`,
      estimated_detour_min: ai?.estimated_detour_min ?? Math.round((c.distance_to_origin_km ?? 0) * 3),
    });

    // Without AI consent, rank by distance only — matching still works, it
    // just isn't explained by the model.
    if (!(await hasAiConsent(supabase, userId))) {
      const byDistance = [...pool].sort(
        (a, b) => (a.distance_to_origin_km ?? 99) - (b.distance_to_origin_km ?? 99),
      );
      return respondJSON({
        ranked_matches: byDistance.map((c) => toMatch(c)),
        best_match_summary: 'Closest commuters to your start point.',
      } satisfies CarpoolResponse);
    }

    const userMessage = `A user needs a ${role} for a trip:
- Departure: ${departure_time ?? 'now'}
- Trip distance (straight-line): ${tripDistanceKm.toFixed(1)} km
- Max detour willing: ${max_detour_km} km
- User's car: ${fuelType} (${baselineCO2} kg CO₂/km baseline)

Anonymous candidates (distance_to_pickup_km = how far their start is from the user's start; destination_gap_km = how far apart the two destinations are; departure_gap_min = their departure minus the user's):
${JSON.stringify(anonymised, null, 2)}

Rank these candidates by carpool compatibility. Consider:
1. Distance to pickup (closer = better)
2. Destination gap (smaller = same direction)
3. Timing compatibility

Return JSON matching this schema exactly:
{
  "ranked_matches": [
    {
      "candidate": number,
      "compatibility_score": number,
      "co2_saving_kg": number,
      "reasoning": "string. 1 sentence, specific about distance/direction.",
      "estimated_detour_min": number
    }
  ],
  "best_match_summary": "string. 1-2 sentences about the overall match quality."
}`;

    const { text, usage } = await callClaude({
      system: buildSystemPrompt(baselineCO2, fuelType),
      user: userMessage,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 768,
    });

    const aiParsed = parseClaudeJSON<{ ranked_matches: AIRankedCandidate[]; best_match_summary: string }>(text);

    // Map the model's candidate numbers back to real rides server-side.
    const enriched: CarpoolResponse = {
      best_match_summary: aiParsed.best_match_summary,
      ranked_matches: (aiParsed.ranked_matches ?? [])
        .filter((m) => Number.isInteger(m.candidate) && m.candidate >= 1 && m.candidate <= pool.length)
        .map((m) => toMatch(pool[m.candidate - 1], m)),
    };

    // Log to ai_suggestions
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      suggestion_type: 'carpool_match',
      input_context: {
        origin_lat, origin_long, dest_lat, dest_long,
        role, candidates_count: candidates.length,
      },
      ai_response: enriched,
      tokens_used: usage.input_tokens + usage.output_tokens,
    });

    return respondJSON(enriched);
  } catch (err) {
    return respondInternalError('ai-carpool-matcher', err);
  }
});
