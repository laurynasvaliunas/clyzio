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
  | "passenger_waiting"
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
  // Symmetric approval (migration 021).
  driver_approved: boolean;
  passenger_approved: boolean;
  status:
    | "pending"
    | "awaiting_other"
    | "confirmed"
    | "cancelled_by_driver"
    | "cancelled_by_passenger"
    | "expired";
  ride_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined / resolved peer display fields (via get_public_profiles — the direct
  // profiles embed is RLS-blocked for non-same-company peers).
  passenger_profile?: { first_name: string | null; last_name?: string | null; avatar_url?: string | null; home_lat?: number; home_long?: number } | null;
  driver_profile?: { first_name: string | null; last_name?: string | null; avatar_url?: string | null } | null;
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
    // Planner inline carpool form: chosen date + typed origin/destination.
    trip_date?: string;
    origin_lat?: number;
    origin_long?: number;
    dest_lat?: number;
    dest_long?: number;
    origin_address?: string;
    dest_address?: string;
  }) => Promise<void>;
  respondAsDriver: (params: {
    accepted_ids: string[];
    declined_ids?: string[];
    detour_preference: "flexible" | "fixed";
    custom_pickups?: Array<{ match_id: string; lat: number; lng: number }>;
  }) => Promise<void>;
  respondAsPassenger: (params: { match_id: string; accepted: boolean }) => Promise<void>;
  /** Map-radar bridge: request a specific colleague → creates a pre-approved match. */
  requestCarpool: (targetUserId: string, requesterRole: "driver" | "rider", tripDate?: string) => Promise<void>;
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

      const { data: intent, error: intentError } = await supabase
        .from("trip_intents")
        .select("*")
        .eq("user_id", user.id)
        .eq("trip_date", tomorrow)
        .maybeSingle();

      if (intentError) {
        // Real DB/RLS error — don't wipe current step, just stop loading
        set({ isLoading: false });
        return;
      }

      if (!intent || intent.status === "expired") {
        set({ step: "role_select", intent: null, matches: [], isLoading: false });
        return;
      }

      // Load matches — use intent ID to avoid RLS ambiguity with .or()
      const matchFilter = intent.role === "driver"
        ? supabase
            .from("trip_intent_matches")
            .select(`*, passenger_profile:profiles!trip_intent_matches_passenger_user_id_fkey(first_name, home_lat, home_long), driver_profile:profiles!trip_intent_matches_driver_user_id_fkey(first_name)`)
            .eq("driver_intent_id", intent.id)
        : supabase
            .from("trip_intent_matches")
            .select(`*, passenger_profile:profiles!trip_intent_matches_passenger_user_id_fkey(first_name, home_lat, home_long), driver_profile:profiles!trip_intent_matches_driver_user_id_fkey(first_name)`)
            .eq("passenger_intent_id", intent.id);

      const { data: matches } = await matchFilter;

      const activeMatches = (matches ?? []).filter(
        m => !["cancelled_by_driver", "cancelled_by_passenger", "expired"].includes(m.status)
      );

      const isDriver = intent.role === "driver";

      // Resolve the OTHER person's display name/avatar via the is_peer_visible-
      // gated get_public_profiles RPC. The direct profiles FK embed above returns
      // null for non-same-company peers (RLS), which is why cards showed
      // "Passenger"/"Driver". Pickup coords come from the match itself, not here.
      const peerIds = Array.from(new Set(
        activeMatches
          .map(m => (isDriver ? m.passenger_user_id : m.driver_user_id))
          .filter(Boolean) as string[]
      ));
      if (peerIds.length > 0) {
        const { data: pubs } = await supabase.rpc("get_public_profiles", { p_ids: peerIds });
        const byId = new Map<string, any>((pubs ?? []).map((p: any) => [p.id, p]));
        for (const m of activeMatches) {
          const peer = byId.get(isDriver ? m.passenger_user_id : m.driver_user_id);
          if (!peer) continue;
          const display = { first_name: peer.first_name, last_name: peer.last_name, avatar_url: peer.avatar_url };
          if (isDriver) m.passenger_profile = { ...(m.passenger_profile ?? {}), ...display };
          else m.driver_profile = { ...(m.driver_profile ?? {}), ...display };
        }
      }

      // Determine step from intent/match state
      let step: FlowStep = "role_select";

      if (intent.status === "pending") {
        step = isDriver ? "driver_submitted" : "passenger_submitted";
      } else if (intent.status === "matched" || intent.status === "unmatched") {
        const confirmed = activeMatches.find(m => m.status === "confirmed");
        if (confirmed) {
          step = isDriver ? "driver_confirmed" : "passenger_confirmed";
        } else if (isDriver) {
          // Symmetric approval: the driver reviews any open match they haven't
          // approved yet; once they have, they wait on the passenger.
          const needsApproval = activeMatches.find(m => !m.driver_approved);
          const waiting = activeMatches.find(m => m.driver_approved && !m.passenger_approved);
          if (needsApproval) step = "driver_review";
          else if (waiting) step = "driver_waiting";
          else step = "driver_submitted"; // no open matches — back to submitted
        } else {
          // Passenger mirror of the same symmetric logic.
          const needsApproval = activeMatches.find(m => !m.passenger_approved);
          const waiting = activeMatches.find(m => m.passenger_approved && !m.driver_approved);
          if (needsApproval) step = "passenger_review";
          else if (waiting) step = "passenger_waiting";
          else step = "passenger_submitted"; // no open matches — back to submitted
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

  // Both respond paths now go through the unified, symmetric `respond-to-match`
  // edge function (migration 021). The driver/passenger method names are kept
  // so the daily-commute screen's handlers don't have to change.
  respondAsDriver: async (params) => {
    set({ isLoading: true, error: null });
    try {
      for (const matchId of params.accepted_ids) {
        const cp = params.custom_pickups?.find((p) => p.match_id === matchId);
        const { error } = await supabase.functions.invoke("respond-to-match", {
          body: {
            match_id: matchId,
            accepted: true,
            detour_preference: params.detour_preference,
            custom_pickup: cp ? { lat: cp.lat, lng: cp.lng } : undefined,
            // M1: send the approver's UTC offset so the created ride's
            // scheduled_at reflects the local wall-clock time, not UTC.
            tz_offset_minutes: new Date().getTimezoneOffset(),
          },
        });
        if (error) throw error;
      }
      for (const matchId of params.declined_ids ?? []) {
        const { error } = await supabase.functions.invoke("respond-to-match", {
          body: { match_id: matchId, accepted: false },
        });
        if (error) throw error;
      }
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
      const { error } = await supabase.functions.invoke("respond-to-match", {
        body: {
          match_id: params.match_id,
          accepted: params.accepted,
          tz_offset_minutes: new Date().getTimezoneOffset(),
        },
      });
      if (error) throw error;
      await get().checkExistingIntent();
      set({ isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  requestCarpool: async (targetUserId, requesterRole, tripDate) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.functions.invoke("request-carpool", {
        body: { target_user_id: targetUserId, requester_role: requesterRole, trip_date: tripDate },
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
