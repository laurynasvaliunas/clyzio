import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, parseClaudeJSON } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, AICommutePlannerSchema } from '../_shared/validate.ts';

const CACHE_TTL_HOURS = 6;

const SYSTEM_PROMPT = `You are Clyzio's AI Commute Coach. Your goal is to suggest personalized, actionable commute options that reduce carbon emissions while being practical for the user's schedule and location.

Return ONLY valid JSON matching the exact schema provided — no markdown, no explanation, no preamble.

Rules:
- Always suggest exactly 3 options ranked by CO2 impact (rank 1 = best CO2 reduction)
- Reference the user's actual data (current mode, distance, saved CO2 so far) in the insight
- If the user is a driver and distance > 5km, include carpooling as one of the top 2 suggestions
- Be encouraging and specific — not generic sustainability advice
- cost_saving_eur_monthly should reflect realistic savings vs driving alone
- estimated_time_min is compared to a typical car commute for the route
- difficulty_level: easy = no behaviour change, medium = requires planning, hard = major lifestyle change`;

interface CommuteSuggestion {
  rank: number;
  mode: string;
  mode_icon: string; // 'walk' | 'bike' | 'bus' | 'car' | 'carpool'
  estimated_co2_kg: number;
  co2_reduction_pct: number;
  estimated_time_min: number;
  cost_saving_eur_monthly: number;
  difficulty_level: 'easy' | 'medium' | 'hard';
  tips: string[];
  cta_label: string;
}

interface CommuteResponse {
  insight: string;
  weekly_potential_saving_kg: number;
  suggestions: CommuteSuggestion[];
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
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

  const parsed = await parseBody(req, AICommutePlannerSchema);
  if (!parsed.ok) return parsed.response;
  const forceRefresh = parsed.data.force_refresh === true;

  try {

    // 1. Get full commute context from DB
    const { data: context, error: contextError } = await supabase
      .rpc('get_user_commute_context', { p_user_id: userId });

    if (contextError) {
      console.error('commute-context err:', contextError.message);
      return respondError(500, 'internal_error', 'context_unavailable');
    }
    if (!context) return respondError(404, 'not_found', 'profile_not_found');

    // 2. Check cache (skip if force_refresh or no home/work address set yet)
    const hasLocations = context.home_address && context.work_address;
    if (!forceRefresh && hasLocations && context.ai_cache_updated_at) {
      const cacheAge = Date.now() - new Date(context.ai_cache_updated_at).getTime();
      const cacheTTL = CACHE_TTL_HOURS * 60 * 60 * 1000;
      if (cacheAge < cacheTTL) {
        // Return cached response directly from profiles table
        const { data: profile } = await supabase
          .from('profiles')
          .select('ai_suggestions_cache')
          .eq('id', userId)
          .single();

        if (profile?.ai_suggestions_cache) {
          return respondJSON(profile.ai_suggestions_cache);
        }
      }
    }

    // 3. Build prompt — use placeholders if locations not set
    const recentModes = (context.recent_trips ?? [])
      .map((t: { transport_label?: string; transport_mode?: string }) =>
        t.transport_label || t.transport_mode || 'unknown')
      .join(', ') || 'not recorded yet';

    const userMessage = `User commute profile:
- Name: ${context.first_name || 'User'}
- Home: ${context.home_address || 'Not set'}${context.home_lat ? ` (${context.home_lat?.toFixed(4)}, ${context.home_long?.toFixed(4)})` : ''}
- Work: ${context.work_address || 'Not set'}${context.work_lat ? ` (${context.work_lat?.toFixed(4)}, ${context.work_long?.toFixed(4)})` : ''}
- Current main transport mode: ${context.baseline_co2_mode || 'Car (Gasoline)'}
- Car fuel type: ${context.car_fuel_type || 'petrol'}
- Baseline CO2 per km: ${context.baseline_co2 || 0.192} kg (DEFRA/EEA 2024 standard for ${context.car_fuel_type || 'petrol'} vehicle)
- Usual working days: ${formatWorkingDays(context.preferred_departure_days)}
- Preferred departure time: ${context.preferred_departure_time || '08:00'}
- Car available: ${context.is_driver ? `Yes (${[context.car_make, context.car_model].filter(Boolean).join(' ') || 'own car'})` : 'No'}
- Total trips completed on Clyzio: ${context.trips_completed || 0}
- Total CO2 saved so far: ${context.total_co2_saved || 0} kg
- Recent trip modes used: ${recentModes}

Provide exactly 3 commute suggestions. Return JSON matching this schema exactly:
{
  "insight": "string — 1-2 sentences, personal and data-driven",
  "weekly_potential_saving_kg": number,
  "suggestions": [
    {
      "rank": 1,
      "mode": "string — transport mode name",
      "mode_icon": "walk|bike|bus|car|carpool",
      "estimated_co2_kg": number,
      "co2_reduction_pct": number,
      "estimated_time_min": number,
      "cost_saving_eur_monthly": number,
      "difficulty_level": "easy|medium|hard",
      "tips": ["string", "string"],
      "cta_label": "string — short action label like 'Plan a Carpool'"
    }
  ]
}`;

    // 4. Call Claude
    const { text, usage } = await callClaude({
      system: SYSTEM_PROMPT,
      user: userMessage,
      model: 'claude-haiku-4-5-20251001',
      maxTokens: 1024,
    });

    const parsed = parseClaudeJSON<CommuteResponse>(text);

    // 5. Log to ai_suggestions table
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      suggestion_type: 'commute_plan',
      input_context: { home_address: context.home_address, work_address: context.work_address, trips_completed: context.trips_completed },
      ai_response: parsed,
      tokens_used: usage.input_tokens + usage.output_tokens,
    });

    // 6. Update profile cache
    await supabase.from('profiles').update({
      ai_suggestions_cache: parsed,
      ai_cache_updated_at: new Date().toISOString(),
    }).eq('id', userId);

    return respondJSON(parsed);
  } catch (err) {
    return respondInternalError('ai-commute-planner', err);
  }
});

function formatWorkingDays(days: boolean[] | null): string {
  if (!days || days.length < 7) return 'Mon–Fri';
  const names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return days.map((on, i) => (on ? names[i] : null)).filter(Boolean).join(', ') || 'Mon–Fri';
}
