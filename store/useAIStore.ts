import { create } from "zustand";
import { supabase } from "../lib/supabase";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CommuteSuggestion {
  rank: number;
  mode: string;
  mode_icon: "walk" | "bike" | "bus" | "car" | "carpool";
  estimated_co2_kg: number;
  co2_reduction_pct: number;
  estimated_time_min: number;
  cost_saving_eur_monthly: number;
  difficulty_level: "easy" | "medium" | "hard";
  tips: string[];
  cta_label: string;
}

export interface CommuteAIResult {
  insight: string;
  weekly_potential_saving_kg: number;
  suggestions: CommuteSuggestion[];
}

export interface CarpoolMatch {
  ride_id: string;
  user_first_name: string;
  compatibility_score: number;
  co2_saving_kg: number;
  reasoning: string;
  estimated_detour_min: number;
}

export interface CarpoolAIResult {
  ranked_matches: CarpoolMatch[];
  best_match_summary: string;
}

export interface CarpoolSearchParams {
  origin_lat: number;
  origin_long: number;
  dest_lat: number;
  dest_long: number;
  departure_time?: string;
  role?: "driver" | "rider";
  max_detour_km?: number;
}

// ─── Store ───────────────────────────────────────────────────────────────────

interface AIState {
  // Commute suggestions
  commuteResult: CommuteAIResult | null;
  isLoadingCommute: boolean;
  commuteError: string | null;
  commuteLastFetchedAt: number | null;

  // Carpool matching
  carpoolResult: CarpoolAIResult | null;
  isLoadingCarpool: boolean;
  carpoolError: string | null;

  // Actions
  fetchCommuteSuggestions: (forceRefresh?: boolean) => Promise<void>;
  fetchCarpoolMatches: (params: CarpoolSearchParams) => Promise<void>;
  clearCarpoolResult: () => void;
  clearCommuteResult: () => void;
}

const CACHE_STALE_MS = 6 * 60 * 60 * 1000; // 6 hours

export const useAIStore = create<AIState>((set, get) => ({
  commuteResult: null,
  isLoadingCommute: false,
  commuteError: null,
  commuteLastFetchedAt: null,

  carpoolResult: null,
  isLoadingCarpool: false,
  carpoolError: null,

  fetchCommuteSuggestions: async (forceRefresh = false) => {
    const { commuteLastFetchedAt, isLoadingCommute } = get();

    // Avoid duplicate in-flight requests
    if (isLoadingCommute) return;

    // Use in-memory cache if fresh and not forcing refresh
    const isCacheFresh =
      commuteLastFetchedAt !== null &&
      Date.now() - commuteLastFetchedAt < CACHE_STALE_MS;

    if (!forceRefresh && isCacheFresh && get().commuteResult !== null) return;

    set({ isLoadingCommute: true, commuteError: null });

    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-commute-planner",
        { body: { force_refresh: forceRefresh } }
      );

      if (error) throw new Error(error.message);

      set({
        commuteResult: data as CommuteAIResult,
        commuteLastFetchedAt: Date.now(),
        isLoadingCommute: false,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load suggestions";
      set({ commuteError: message, isLoadingCommute: false });
    }
  },

  fetchCarpoolMatches: async (params: CarpoolSearchParams) => {
    set({ isLoadingCarpool: true, carpoolError: null, carpoolResult: null });

    try {
      const { data, error } = await supabase.functions.invoke(
        "ai-carpool-matcher",
        { body: params }
      );

      if (error) throw new Error(error.message);

      set({ carpoolResult: data as CarpoolAIResult, isLoadingCarpool: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Carpool matching failed";
      set({ carpoolError: message, isLoadingCarpool: false });
    }
  },

  clearCarpoolResult: () =>
    set({ carpoolResult: null, carpoolError: null }),

  clearCommuteResult: () =>
    set({ commuteResult: null, commuteLastFetchedAt: null }),
}));
