import { create } from "zustand";
import { supabase } from "../lib/supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlowStep =
  | "role_select"
  | "driver_details"
  | "driver_submitted"
  | "driver_review"
  | "driver_detour"
  | "driver_waiting"
  | "driver_confirmed"
  | "passenger_details"
  | "passenger_submitted"
  | "passenger_review"
  | "passenger_confirmed";

export interface TripIntent {
  id: string;
  user_id: string;
  role: "driver" | "passenger";
  passenger_capacity: number | null;
  departure_time: string | null;
  required_arrival_time: string | null;
  trip_date: string;
  home_lat: number;
  home_long: number;
  work_lat: number;
  work_long: number;
  status: "pending" | "matched" | "unmatched" | "expired";
  created_at: string;
}

export interface TripIntentMatch {
  id: string;
  driver_intent_id: string;
  passenger_intent_id: string;
  driver_user_id: string;
  passenger_user_id: string;
  trip_date: string;
  ai_compatibility_score: number | null;
  ai_reasoning: string | null;
  proposed_departure: string | null;
  proposed_pickup_time: string | null;
  pickup_lat: number | null;
  pickup_long: number | null;
  pickup_address: string | null;
  detour_preference: "flexible" | "fixed" | null;
  custom_pickup_lat: number | null;
  custom_pickup_long: number | null;
  status:
    | "pending_driver_review"
    | "driver_accepted"
    | "pending_passenger_confirm"
    | "confirmed"
    | "cancelled_by_driver"
    | "cancelled_by_passenger"
    | "expired";
  ride_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  passenger_profile?: { first_name: string | null; home_lat: number; home_long: number } | null;
  driver_profile?: { first_name: string | null } | null;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface DailyCommuteState {
  step: FlowStep;
  intent: TripIntent | null;
  matches: TripIntentMatch[];
  isLoading: boolean;
  error: string | null;

  // Role selection staging
  selectedRole: "driver" | "passenger" | null;

  // Actions
  setStep: (step: FlowStep) => void;
  setSelectedRole: (role: "driver" | "passenger") => void;
  checkExistingIntent: () => Promise<void>;
  submitIntent: (params: {
    role: "driver" | "passenger";
    passenger_capacity?: number;
    departure_time?: string;
    required_arrival_time?: string;
  }) => Promise<void>;
  respondAsDriver: (params: {
    accepted_ids: string[];
    declined_ids?: string[];
    detour_preference: "flexible" | "fixed";
    custom_pickups?: Array<{ match_id: string; lat: number; lng: number }>;
  }) => Promise<void>;
  respondAsPassenger: (params: { match_id: string; accepted: boolean }) => Promise<void>;
  subscribeToMatches: () => () => void;
  reset: () => void;
}

// ─── Tomorrow helper ──────────────────────────────────────────────────────────

function getTomorrowDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().split("T")[0];
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDailyCommuteStore = create<DailyCommuteState>((set, get) => ({
  step: "role_select",
  intent: null,
  matches: [],
  isLoading: false,
  error: null,
  selectedRole: null,

  setStep: (step) => set({ step }),
  setSelectedRole: (role) => set({ selectedRole: role }),

  checkExistingIntent: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { set({ isLoading: false }); return; }

      const tomorrow = getTomorrowDate();

      const { data: intent } = await supabase
        .from("trip_intents")
        .select("*")
        .eq("user_id", user.id)
        .eq("trip_date", tomorrow)
        .single();

      if (!intent) {
        set({ step: "role_select", intent: null, matches: [], isLoading: false });
        return;
      }

      // Load matches
      const { data: matches } = await supabase
        .from("trip_intent_matches")
        .select(`
          *,
          passenger_profile:profiles!trip_intent_matches_passenger_user_id_fkey(first_name, home_lat, home_long),
          driver_profile:profiles!trip_intent_matches_driver_user_id_fkey(first_name)
        `)
        .or(`driver_user_id.eq.${user.id},passenger_user_id.eq.${user.id}`)
        .eq("trip_date", tomorrow);

      const activeMatches = (matches ?? []).filter(
        m => !["cancelled_by_driver", "cancelled_by_passenger", "expired"].includes(m.status)
      );

      // Determine step from intent/match state
      let step: FlowStep = "role_select";
      const isDriver = intent.role === "driver";

      if (intent.status === "pending") {
        step = isDriver ? "driver_submitted" : "passenger_submitted";
      } else if (intent.status === "matched" || intent.status === "unmatched") {
        const confirmed = activeMatches.find(m => m.status === "confirmed");
        if (confirmed) {
          step = isDriver ? "driver_confirmed" : "passenger_confirmed";
        } else if (isDriver) {
          const pendingReview = activeMatches.find(m => m.status === "pending_driver_review");
          const driverAccepted = activeMatches.find(m => m.status === "driver_accepted");
          if (pendingReview) step = "driver_review";
          else if (driverAccepted) step = "driver_waiting";
          else step = "driver_submitted"; // unmatched — back to submitted
        } else {
          const driverAccepted = activeMatches.find(m => m.status === "driver_accepted");
          if (driverAccepted) step = "passenger_review";
          else step = "passenger_submitted"; // unmatched — back to submitted
        }
      }

      set({ intent, matches: activeMatches, step, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  submitIntent: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("submit-trip-intent", {
        body: params,
      });

      if (error) throw error;

      const step: FlowStep = params.role === "driver" ? "driver_submitted" : "passenger_submitted";
      set({ intent: data.intent, step, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  respondAsDriver: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.functions.invoke("driver-respond-to-matches", {
        body: params,
      });

      if (error) throw error;

      // Refresh matches and advance step
      await get().checkExistingIntent();
      set({ isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  respondAsPassenger: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.functions.invoke("passenger-respond-to-match", {
        body: params,
      });

      if (error) throw error;

      await get().checkExistingIntent();
      set({ isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  subscribeToMatches: () => {
    const { intent } = get();
    if (!intent) return () => {};

    const channel = supabase
      .channel(`trip_intent_matches_${intent.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_intent_matches",
          filter: `driver_intent_id=eq.${intent.id}`,
        },
        () => { get().checkExistingIntent(); }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trip_intent_matches",
          filter: `passenger_intent_id=eq.${intent.id}`,
        },
        () => { get().checkExistingIntent(); }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },

  reset: () => set({
    step: "role_select",
    intent: null,
    matches: [],
    isLoading: false,
    error: null,
    selectedRole: null,
  }),
}));
