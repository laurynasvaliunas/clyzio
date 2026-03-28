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
  to_user_id?: string;
  compatibility_score: number;
  co2_saving_kg: number;
  reasoning: string;
  estimated_detour_min: number;
}

export interface CarpoolSuggestion {
  id: string;
  from_user_id: string;
  to_user_id: string;
  ride_id: string | null;
  compatibility_score: number | null;  // stored 0–100
  co2_saving_kg: number | null;
  estimated_detour_min: number | null;
  ai_reasoning: string | null;
  suggested_departure: string | null;
  status: "pending" | "accepted" | "declined" | "expired";
  responded_at: string | null;
  expires_at: string;
  created_at: string;
  from_profile?: { first_name: string | null; email: string } | null;
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

  // Incoming carpool suggestions (to_user_id = current user)
  incomingSuggestions: CarpoolSuggestion[];
  _suggestionChannel: ReturnType<typeof supabase.channel> | null;

  // Actions
  fetchCommuteSuggestions: (forceRefresh?: boolean) => Promise<void>;
  fetchCarpoolMatches: (params: CarpoolSearchParams) => Promise<void>;
  sendCarpoolSuggestion: (match: CarpoolMatch, departure_time?: string) => Promise<void>;
  respondToSuggestion: (id: string, response: "accepted" | "declined") => Promise<void>;
  subscribeToIncomingSuggestions: () => Promise<void>;
  unsubscribeFromSuggestions: () => void;
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

  incomingSuggestions: [],
  _suggestionChannel: null,

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

  sendCarpoolSuggestion: async (match: CarpoolMatch, departure_time?: string) => {
    if (!match.to_user_id) return;

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("carpool_suggestions").insert({
      from_user_id: user.id,
      to_user_id: match.to_user_id,
      ride_id: match.ride_id,
      compatibility_score: match.compatibility_score,
      co2_saving_kg: match.co2_saving_kg,
      estimated_detour_min: match.estimated_detour_min,
      ai_reasoning: match.reasoning,
      suggested_departure: departure_time ?? null,
      status: "pending",
    });
  },

  respondToSuggestion: async (id: string, response: "accepted" | "declined") => {
    const { error } = await supabase
      .from("carpool_suggestions")
      .update({ status: response, responded_at: new Date().toISOString() })
      .eq("id", id);

    if (!error) {
      set((state) => ({
        incomingSuggestions: state.incomingSuggestions.map((s) =>
          s.id === id ? { ...s, status: response } : s
        ),
      }));
    }
  },

  subscribeToIncomingSuggestions: async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Load existing pending suggestions
    const { data } = await supabase
      .from("carpool_suggestions")
      .select("*, from_profile:profiles!from_user_id(first_name, email)")
      .eq("to_user_id", user.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false });

    set({ incomingSuggestions: (data as CarpoolSuggestion[]) ?? [] });

    // Subscribe to new inserts
    const channel = supabase
      .channel("incoming-carpool-suggestions")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "carpool_suggestions",
          filter: `to_user_id=eq.${user.id}`,
        },
        (payload) => {
          set((state) => ({
            incomingSuggestions: [
              payload.new as CarpoolSuggestion,
              ...state.incomingSuggestions,
            ],
          }));
        }
      )
      .subscribe();

    set({ _suggestionChannel: channel });
  },

  unsubscribeFromSuggestions: () => {
    const channel = get()._suggestionChannel;
    if (channel) supabase.removeChannel(channel);
    set({ _suggestionChannel: null });
  },

  clearCarpoolResult: () =>
    set({ carpoolResult: null, carpoolError: null }),

  clearCommuteResult: () =>
    set({ commuteResult: null, commuteLastFetchedAt: null }),
}));
