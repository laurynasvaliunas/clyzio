import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, parseClaudeJSON } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';

const SYSTEM_PROMPT = `You are Clyzio's AI Carpool Matcher. Your job is to rank and explain carpool compatibility between a user and candidate rides based on geographic proximity, timing, and route alignment.

Return ONLY valid JSON matching the exact schema provided — no markdown, no explanation.

Rules:
- compatibility_score is 0-100: 80+ = excellent match, 60-79 = good, 40-59 = fair, <40 = poor
- Always reference the distance_to_origin_km when explaining matches
- co2_saving_kg should reflect actual saving for one person per trip vs driving alone (0.192 kg/km baseline)
- Be honest: if no candidates are a good match, say so in best_match_summary
- If there are no candidates at all, return an empty ranked_matches array`;

interface CarpoolMatch {
  ride_id: string;
  user_first_name: string;
  compatibility_score: number;
  co2_saving_kg: number;
  reasoning: string;
  estimated_detour_min: number;
}

interface CarpoolResponse {
  ranked_matches: CarpoolMatch[];
  best_match_summary: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);
    const body = await req.json();

    const {
      origin_lat,
      origin_long,
      dest_lat,
      dest_long,
      departure_time,
      role = 'rider',
      max_detour_km = 3,
    } = body;

    if (!origin_lat || !origin_long || !dest_lat || !dest_long) {
      throw new Error('origin_lat, origin_long, dest_lat, dest_long are required');
    }

    // Find carpool candidates via RPC
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
      }
    );

    if (candidatesError) throw new Error(`DB error: ${candidatesError.message}`);

    // If no candidates found, return early without calling Claude
    if (!candidates || candidates.length === 0) {
      const emptyResponse: CarpoolResponse = {
        ranked_matches: [],
        best_match_summary: 'No commuters found nearby for your route right now. Try searching again later or post your own trip for others to join.',
      };
      return new Response(JSON.stringify(emptyResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Estimate straight-line trip distance
    const tripDistanceKm = Math.sqrt(
      Math.pow((dest_lat - origin_lat) * 111.0, 2) +
      Math.pow((dest_long - origin_long) * 111.0 * Math.cos((origin_lat * Math.PI) / 180), 2)
    );

    const userMessage = `A user needs a ${role} for a trip:
- From: (${origin_lat}, ${origin_long})
- To: (${dest_lat}, ${dest_long})
- Departure: ${departure_time ?? 'now'}
- Trip distance (straight-line): ${tripDistanceKm.toFixed(1)} km
- Max detour willing: ${max_detour_km} km

Candidate matches found (sorted by distance to pickup):
${JSON.stringify(candidates, null, 2)}

Rank these candidates by carpool compatibility. Consider:
1. Distance to pickup (closer = better)
2. Route alignment (are they going the same general direction?)
3. Timing compatibility

Return JSON matching this schema exactly:
{
  "ranked_matches": [
    {
      "ride_id": "string",
      "user_first_name": "string",
      "compatibility_score": number,
      "co2_saving_kg": number,
      "reasoning": "string — 1 sentence, specific about distance/direction",
      "estimated_detour_min": number
    }
  ],
  "best_match_summary": "string — 1-2 sentences about the overall match quality"
}`;

    const { text, usage } = await callClaude({
      system: SYSTEM_PROMPT,
      user: userMessage,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 768,
    });

    const parsed = parseClaudeJSON<CarpoolResponse>(text);

    // Log to ai_suggestions
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      suggestion_type: 'carpool_match',
      input_context: {
        origin_lat, origin_long, dest_lat, dest_long,
        role, candidates_count: candidates.length,
      },
      ai_response: parsed,
      tokens_used: usage.input_tokens + usage.output_tokens,
    });

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
