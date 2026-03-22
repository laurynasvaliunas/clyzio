import { create } from "zustand";
import { supabase } from "../lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export type TimePeriod = "week" | "month" | "quarter" | "year";

export interface DeptBreakdown {
  dept_id: string;
  dept_name: string;
  employee_count: number;
  co2_saved: number;
  trips_completed: number;
}

export interface CompanyStats {
  company_name: string;
  green_commute_score: number;
  employee_count: number;
  active_users: number;
  total_co2_saved: number;
  total_trips: number;
  dept_breakdown: DeptBreakdown[];
  transport_mode_distribution: Array<{ mode: string; trip_count: number }>;
}

export interface SustainabilityInsight {
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  metric: string;
}

export interface Recommendation {
  action: string;
  expected_impact_kg_co2: number;
  timeframe: string;
  effort: "low" | "medium" | "high";
  esg_pillar: "E" | "S" | "G";
}

export interface DeptRanking {
  dept_name: string;
  co2_saved: number;
  employee_count: number;
  trend: "up" | "down" | "stable";
}

export interface SustainabilityReport {
  executive_summary: string;
  green_commute_score: number;
  score_trend: "improving" | "stable" | "declining";
  co2_equivalent: {
    trees_planted: number;
    car_km_avoided: number;
    flights_avoided: number;
  };
  cost_savings_eur: number;
  top_insights: SustainabilityInsight[];
  department_rankings: DeptRanking[];
  recommendations: Recommendation[];
  esg_narrative: string;
  next_challenge_suggestion: {
    title: string;
    challenge_type: string;
    rationale: string;
    target_value: number;
    reward_xp: number;
  };
}

export interface CompanyChallenge {
  id: string;
  title: string;
  description: string | null;
  challenge_type: string;
  target_value: number;
  current_value: number;
  reward_xp: number;
  starts_at: string;
  ends_at: string | null;
  is_active: boolean;
}

export interface NewChallenge {
  title: string;
  description?: string;
  challenge_type: "co2_reduction" | "carpool_days" | "green_trips" | "distance";
  target_value: number;
  reward_xp: number;
  ends_at?: string;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface ManagerState {
  companyId: string | null;
  companyStats: CompanyStats | null;
  sustainabilityReport: SustainabilityReport | null;
  challenges: CompanyChallenge[];
  isLoadingStats: boolean;
  isLoadingReport: boolean;
  statsError: string | null;
  reportError: string | null;

  fetchCompanyStats: () => Promise<void>;
  fetchSustainabilityReport: (period?: TimePeriod) => Promise<void>;
  fetchChallenges: () => Promise<void>;
  createChallenge: (challenge: NewChallenge) => Promise<boolean>;
  toggleChallenge: (id: string, isActive: boolean) => Promise<void>;
  reset: () => void;
}

export const useManagerStore = create<ManagerState>((set, get) => ({
  companyId: null,
  companyStats: null,
  sustainabilityReport: null,
  challenges: [],
  isLoadingStats: false,
  isLoadingReport: false,
  statsError: null,
  reportError: null,

  fetchCompanyStats: async () => {
    set({ isLoadingStats: true, statsError: null });

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { data: profile } = await supabase
        .from("profiles")
        .select("company_id, is_manager")
        .eq("id", user.id)
        .single();

      if (!profile?.is_manager) throw new Error("Manager role required");
      if (!profile.company_id) throw new Error("No company linked");

      set({ companyId: profile.company_id });

      const { data, error } = await supabase
        .rpc("get_company_stats", { p_company_id: profile.company_id });

      if (error) throw new Error(error.message);

      set({ companyStats: data as CompanyStats, isLoadingStats: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load company stats";
      set({ statsError: message, isLoadingStats: false });
    }
  },

  fetchSustainabilityReport: async (period: TimePeriod = "month") => {
    set({ isLoadingReport: true, reportError: null });

    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-sustainability-report",
        { body: { time_period: period, include_recommendations: true } }
      );

      if (error) throw new Error(error.message);

      set({ sustainabilityReport: data as SustainabilityReport, isLoadingReport: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate report";
      set({ reportError: message, isLoadingReport: false });
    }
  },

  fetchChallenges: async () => {
    const { companyId } = get();
    if (!companyId) return;

    const { data } = await supabase
      .from("company_challenges")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (data) set({ challenges: data as CompanyChallenge[] });
  },

  createChallenge: async (challenge: NewChallenge): Promise<boolean> => {
    const { companyId } = get();
    if (!companyId) return false;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const { error } = await supabase.from("company_challenges").insert({
      company_id: companyId,
      created_by: user.id,
      ...challenge,
    });

    if (error) return false;

    get().fetchChallenges();
    return true;
  },

  toggleChallenge: async (id: string, isActive: boolean) => {
    await supabase
      .from("company_challenges")
      .update({ is_active: isActive })
      .eq("id", id);

    set((state) => ({
      challenges: state.challenges.map((c) =>
        c.id === id ? { ...c, is_active: isActive } : c
      ),
    }));
  },

  reset: () =>
    set({
      companyId: null,
      companyStats: null,
      sustainabilityReport: null,
      challenges: [],
      statsError: null,
      reportError: null,
    }),
}));
