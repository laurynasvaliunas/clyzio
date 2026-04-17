import { corsHeaders } from '../_shared/cors.ts';
import { callClaude, parseClaudeJSON } from '../_shared/anthropic.ts';
import { verifyAuth } from '../_shared/auth.ts';
import { respondJSON, respondError, respondInternalError } from '../_shared/respond.ts';
import { parseBody, AISustainabilityReportSchema } from '../_shared/validate.ts';

const SYSTEM_PROMPT = `You are Clyzio's ESG Intelligence Engine. You analyze corporate commuting data and produce actionable sustainability insights for HR and sustainability managers.

Return ONLY valid JSON matching the exact schema provided — no markdown, no explanation.

Your analysis must be:
- Data-driven: reference specific numbers from the input data
- Action-oriented: every insight leads to a concrete recommendation
- Business-framed: connect CO2 savings to cost savings, employee retention, and ESG ratings
- Benchmarked: use general industry knowledge to contextualize the company's performance
- Realistic: expected_impact_kg_co2 should be achievable within the timeframe`;

type TimePeriod = 'week' | 'month' | 'quarter' | 'year';

interface SustainabilityReport {
  executive_summary: string;
  green_commute_score: number;
  score_trend: 'improving' | 'stable' | 'declining';
  co2_equivalent: {
    trees_planted: number;
    car_km_avoided: number;
    flights_avoided: number;
  };
  cost_savings_eur: number;
  top_insights: Array<{
    title: string;
    description: string;
    priority: 'high' | 'medium' | 'low';
    metric: string;
  }>;
  department_rankings: Array<{
    dept_name: string;
    co2_saved: number;
    employee_count: number;
    trend: 'up' | 'down' | 'stable';
  }>;
  recommendations: Array<{
    action: string;
    expected_impact_kg_co2: number;
    timeframe: string;
    effort: 'low' | 'medium' | 'high';
    esg_pillar: 'E' | 'S' | 'G';
  }>;
  esg_narrative: string;
  next_challenge_suggestion: {
    title: string;
    challenge_type: string;
    rationale: string;
    target_value: number;
    reward_xp: number;
  };
}

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

  const parsed = await parseBody(req, AISustainabilityReportSchema);
  if (!parsed.ok) return parsed.response;
  const timePeriod: TimePeriod = (parsed.data.time_period as TimePeriod) ?? 'month';

  try {
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('is_manager, company_id, first_name, company_name')
      .eq('id', userId)
      .single();

    if (profileError) {
      console.error('sustainability profile err:', profileError.message);
      return respondError(500, 'internal_error', 'profile_query_failed');
    }
    if (!profile?.is_manager) return respondError(403, 'forbidden', 'manager_required');
    if (!profile?.company_id) return respondError(400, 'bad_request', 'company_required');

    // Get comprehensive company stats
    const { data: stats, error: statsError } = await supabase
      .rpc('get_company_stats', { p_company_id: profile.company_id });

    if (statsError) {
      console.error('sustainability stats err:', statsError.message);
      return respondError(500, 'internal_error', 'stats_unavailable');
    }

    // Estimate cost savings (fuel + parking)
    const avgDistanceKm = 15; // typical one-way commute
    const fuelCostPerKm = 1.80 * 0.07; // €1.80/L × 0.07L/km
    const totalKmAvoided = (stats.total_co2_saved ?? 0) / 0.192 * 2; // approx km avoided
    const estimatedCostSavings = Math.round(totalKmAvoided * fuelCostPerKm);

    const userMessage = `Company sustainability data for the past ${timePeriod}:
- Company: ${stats.company_name || profile.company_name || 'Company'}
- Total employees: ${stats.employee_count || 0}
- Employees actively using Clyzio: ${stats.active_users || 0}
- Participation rate: ${stats.employee_count > 0 ? Math.round((stats.active_users / stats.employee_count) * 100) : 0}%
- Total CO2 saved: ${stats.total_co2_saved || 0} kg
- Total trips logged: ${stats.total_trips || 0}
- Current Green Commute Score: ${stats.green_commute_score || 0}/100
- Estimated cost savings: €${estimatedCostSavings}
- Department breakdown: ${JSON.stringify(stats.dept_breakdown || [])}
- Transport mode distribution: ${JSON.stringify(stats.transport_mode_distribution || [])}
- Active challenges: ${JSON.stringify(stats.active_challenges || [])}

Generate a comprehensive ESG sustainability report. Return JSON matching this schema exactly:
{
  "executive_summary": "string — 2-3 sentences for exec presentation",
  "green_commute_score": number,
  "score_trend": "improving|stable|declining",
  "co2_equivalent": {
    "trees_planted": number,
    "car_km_avoided": number,
    "flights_avoided": number
  },
  "cost_savings_eur": number,
  "top_insights": [
    {
      "title": "string",
      "description": "string — data-driven, 1-2 sentences",
      "priority": "high|medium|low",
      "metric": "string — the key number (e.g. '23% of employees')"
    }
  ],
  "department_rankings": [
    {
      "dept_name": "string",
      "co2_saved": number,
      "employee_count": number,
      "trend": "up|down|stable"
    }
  ],
  "recommendations": [
    {
      "action": "string — specific, actionable",
      "expected_impact_kg_co2": number,
      "timeframe": "string (e.g. '3 months')",
      "effort": "low|medium|high",
      "esg_pillar": "E|S|G"
    }
  ],
  "esg_narrative": "string — 2-3 paragraph narrative suitable for an ESG report or investor update",
  "next_challenge_suggestion": {
    "title": "string",
    "challenge_type": "co2_reduction|carpool_days|green_trips|distance",
    "rationale": "string — why this challenge makes sense for this company right now",
    "target_value": number,
    "reward_xp": number
  }
}`;

    const { text, usage } = await callClaude({
      system: SYSTEM_PROMPT,
      user: userMessage,
      model: 'claude-sonnet-4-6',
      maxTokens: 2048,
    });

    const parsed = parseClaudeJSON<SustainabilityReport>(text);

    // Log to ai_suggestions
    await supabase.from('ai_suggestions').insert({
      user_id: userId,
      suggestion_type: 'sustainability_insight',
      input_context: {
        company_id: profile.company_id,
        time_period: timePeriod,
        employee_count: stats.employee_count,
        total_co2_saved: stats.total_co2_saved,
      },
      ai_response: parsed,
      tokens_used: usage.input_tokens + usage.output_tokens,
    });

    return respondJSON(parsed);
  } catch (err) {
    return respondInternalError('ai-sustainability-report', err);
  }
});
