import { create } from "zustand";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { localISODate } from "../lib/localDate";
import { cancelRide } from "../lib/cancelRide";

// ─── Types ────────────────────────────────────────────────────────────────────

export type FlowStep =
  | "role_select"
  | "driver_details"
  | "driver_submitted"
  | "driver_review"
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
  // Migration 053: re-submitting a day starts a new generation; only the
  // current generation's matches belong to this trip.
  generation?: number;
  departs_at?: string | null;
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
  // Where and when, planned with the match (migration 053). Null on older rows.
  pickup_kind?: "route" | "door" | null;
  pickup_at?: string | null;
  walk_to_pickup_m?: number | null;
  detour_km?: number | null;
  detour_min?: number | null;
  dropoff_lat?: number | null;
  dropoff_long?: number | null;
  dropoff_address?: string | null;
  walk_from_dropoff_m?: number | null;
  proposed_dropoff_time?: string | null;
  shared_km?: number | null;
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
  // The other person is in the viewer's company (get_public_profiles, 045).
  peer_is_colleague?: boolean;
}

/** What last happened to your carpool, shown above the next step. */
export type CarpoolOutcome =
  | { kind: "partner_cancelled"; name: string | null }
  | { kind: "trip_done"; tripDate: string };

/** A carpool action the server refused, with its reason code. */
export class CarpoolError extends Error {
  constructor(public code: string, public rideId: string | null = null) {
    super(code);
    this.name = "CarpoolError";
  }
}

async function functionError(error: unknown): Promise<CarpoolError | unknown> {
  if (error instanceof FunctionsHttpError) {
    const body = await error.context.json().catch(() => null);
    if (body?.code) return new CarpoolError(body.code, body.ride_id ?? null);
  }
  return error;
}

// ─── Store interface ──────────────────────────────────────────────────────────

interface DailyCommuteState {
  step: FlowStep;
  intent: TripIntent | null;
  /** The trip's live matches (offers and the confirmed carpool). */
  matches: TripIntentMatch[];
  outcome: CarpoolOutcome | null;
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
    // Employees only: open this trip to commuters outside the company (045).
    open_to_independents?: boolean;
  }) => Promise<void>;
  respondAsDriver: (params: { accepted_ids: string[]; declined_ids?: string[] }) => Promise<void>;
  respondAsPassenger: (params: { match_id: string; accepted: boolean }) => Promise<void>;
  /** Close the trip ("Stop looking"). Refused while a carpool is confirmed. */
  stopLooking: () => Promise<void>;
  /** Cancel a confirmed carpool; you can plan a new trip right after. */
  cancelCarpool: (rideId: string) => Promise<void>;
  /** Map-radar bridge: request a specific colleague → creates a pre-approved match. */
  requestCarpool: (targetUserId: string, requesterRole: "driver" | "rider", tripDate?: string) => Promise<void>;
  subscribeToMatches: () => () => void;
  reset: () => void;
}

const LIVE_OFFER = ["pending", "awaiting_other"];
const RIDE_OVER = ["completed", "cancelled"];

/** The step a trip is at, from its live matches. */
export function stepFor(role: "driver" | "passenger", matches: TripIntentMatch[]): FlowStep {
  const isDriver = role === "driver";
  const mine = (m: TripIntentMatch) => (isDriver ? m.driver_approved : m.passenger_approved);
  const offers = matches.filter((m) => LIVE_OFFER.includes(m.status));
  const confirmed = matches.some((m) => m.status === "confirmed");
  if (isDriver) {
    // New riders for a free seat come first, even with a passenger confirmed.
    if (offers.some((m) => !mine(m))) return "driver_review";
    if (confirmed) return "driver_confirmed";
    if (offers.length > 0) return "driver_waiting";
    return "driver_submitted";
  }
  if (confirmed) return "passenger_confirmed";
  if (offers.some((m) => !mine(m))) return "passenger_review";
  if (offers.length > 0) return "passenger_waiting";
  return "passenger_submitted";
}

const MATCH_SELECT = "*";

// ─── Store ────────────────────────────────────────────────────────────────────

export const useDailyCommuteStore = create<DailyCommuteState>((set, get) => ({
  step: "role_select",
  intent: null,
  matches: [],
  outcome: null,
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

      // Your next trip from today on (local date) — a planner trip for today or
      // next week, not only tomorrow's.
      const { data: intents, error: intentError } = await supabase
        .from("trip_intents")
        .select("*")
        .eq("user_id", user.id)
        .gte("trip_date", localISODate())
        .order("trip_date", { ascending: true })
        .limit(7);

      if (intentError) {
        // Real DB/RLS error — don't wipe current step, just stop loading
        set({ isLoading: false });
        return;
      }

      const rows = (intents ?? []) as TripIntent[];
      const intent = rows.find((i) => i.status !== "expired") ?? null;
      // Without an open trip: did the soonest one just end with a carpool?
      const shown = intent ?? rows[0] ?? null;
      if (!shown) {
        set({ step: "role_select", intent: null, matches: [], outcome: null, isLoading: false });
        return;
      }

      const isDriver = shown.role === "driver";
      let query = supabase
        .from("trip_intent_matches")
        .select(MATCH_SELECT)
        .eq(isDriver ? "driver_intent_id" : "passenger_intent_id", shown.id);
      // Only this trip's generation (053); older rows have no generation.
      if (shown.generation != null) {
        query = query.eq(isDriver ? "driver_generation" : "passenger_generation", shown.generation);
      }
      const { data: matchRows } = await query;
      const all = (matchRows ?? []) as TripIntentMatch[];

      // A confirmed carpool stays on screen until its ride is over.
      const rideIds = all.filter((m) => m.status === "confirmed" && m.ride_id).map((m) => m.ride_id as string);
      const rideStatus = new Map<string, string>();
      if (rideIds.length > 0) {
        const { data: rides } = await supabase.from("rides").select("id, status").in("id", rideIds);
        for (const r of (rides ?? []) as Array<{ id: string; status: string }>) rideStatus.set(r.id, r.status);
      }
      const isLive = (m: TripIntentMatch) =>
        LIVE_OFFER.includes(m.status) ||
        (m.status === "confirmed" && !RIDE_OVER.includes(rideStatus.get(m.ride_id ?? "") ?? ""));
      const live = all.filter(isLive);

      // What happened last: the other person cancelled, or the trip is done.
      let outcome: CarpoolOutcome | null = null;
      const theirCancel = isDriver ? "cancelled_by_passenger" : "cancelled_by_driver";
      const lastCancel = all
        .filter((m) => m.status === theirCancel)
        .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
      if (!intent) {
        if (all.some((m) => m.status === "confirmed" && rideStatus.get(m.ride_id ?? "") === "completed")) {
          outcome = { kind: "trip_done", tripDate: shown.trip_date };
        }
      } else if (live.length === 0 && lastCancel) {
        outcome = { kind: "partner_cancelled", name: null };
      }

      // Resolve the OTHER person's display name/avatar via the is_peer_visible-
      // gated get_public_profiles RPC (the direct profiles embed is RLS-blocked
      // for non-same-company peers).
      const peerOf = (m: TripIntentMatch) => (isDriver ? m.passenger_user_id : m.driver_user_id);
      const peerIds = Array.from(new Set([...live, ...(lastCancel ? [lastCancel] : [])].map(peerOf).filter(Boolean)));
      if (peerIds.length > 0) {
        const { data: pubs } = await supabase.rpc("get_public_profiles", { p_ids: peerIds });
        const byId = new Map<string, any>((pubs ?? []).map((p: any) => [p.id, p]));
        for (const m of live) {
          const peer = byId.get(peerOf(m));
          if (!peer) continue;
          if (typeof peer.is_colleague === "boolean") m.peer_is_colleague = peer.is_colleague;
          const display = { first_name: peer.first_name, last_name: peer.last_name, avatar_url: peer.avatar_url };
          if (isDriver) m.passenger_profile = { ...(m.passenger_profile ?? {}), ...display };
          else m.driver_profile = { ...(m.driver_profile ?? {}), ...display };
        }
        if (outcome?.kind === "partner_cancelled" && lastCancel) {
          outcome = { kind: "partner_cancelled", name: byId.get(peerOf(lastCancel))?.first_name ?? null };
        }
      }

      if (!intent) {
        set({ step: "role_select", intent: null, matches: [], outcome, isLoading: false });
        return;
      }
      set({ intent, matches: live, step: stepFor(intent.role, live), outcome, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  submitIntent: async (params) => {
    set({ isLoading: true, error: null });
    try {
      const { data, error } = await supabase.functions.invoke("submit-trip-intent", {
        // The leaving moment needs the phone's time zone (053).
        body: { tz_offset_minutes: new Date().getTimezoneOffset(), ...params },
      });
      if (error) throw await functionError(error);

      const step: FlowStep = params.role === "driver" ? "driver_submitted" : "passenger_submitted";
      set({ intent: data.intent, matches: [], outcome: null, step, isLoading: false });
    } catch (err) {
      set({ error: err instanceof CarpoolError ? null : String(err), isLoading: false });
      throw err;
    }
  },

  // Both respond paths go through the symmetric `respond-to-match` function
  // (migrations 021, 053). The pickup is planned with the match.
  respondAsDriver: async (params) => {
    set({ isLoading: true, error: null });
    try {
      for (const matchId of params.accepted_ids) {
        const { error } = await supabase.functions.invoke("respond-to-match", {
          body: { match_id: matchId, accepted: true, tz_offset_minutes: new Date().getTimezoneOffset() },
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

  stopLooking: async () => {
    const { intent } = get();
    if (!intent) return;
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.functions.invoke("cancel-trip-intent", { body: { intent_id: intent.id } });
      if (error) throw await functionError(error);
      set({ step: "role_select", intent: null, matches: [], outcome: null, isLoading: false });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  cancelCarpool: async (rideId) => {
    set({ isLoading: true, error: null });
    const outcome = await cancelRide(rideId);
    if (!outcome.ok) {
      set({ isLoading: false });
      throw new Error(outcome.message);
    }
    // Your trip closed with the cancel: straight back to planning a new one.
    set({ step: "role_select", intent: null, matches: [], outcome: null, isLoading: false });
  },

  requestCarpool: async (targetUserId, requesterRole, tripDate) => {
    set({ isLoading: true, error: null });
    try {
      const { error } = await supabase.functions.invoke("request-carpool", {
        body: { target_user_id: targetUserId, requester_role: requesterRole, trip_date: tripDate },
      });
      if (error) {
        // Surface the function's code (peer_unavailable, trip_not_open, …)
        // instead of the generic "non-2xx status code" message.
        const e = await functionError(error);
        throw e instanceof CarpoolError ? new Error(e.code) : e;
      }
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
    const refresh = () => { get().checkExistingIntent(); };

    // Offers and answers on this trip, and the carpool ride itself (the other
    // person cancelling or the driver ending it).
    const channel = supabase
      .channel(`trip_intent_matches_${intent.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_intent_matches", filter: `driver_intent_id=eq.${intent.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "trip_intent_matches", filter: `passenger_intent_id=eq.${intent.id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `driver_id=eq.${intent.user_id}` }, refresh)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rides", filter: `rider_id=eq.${intent.user_id}` }, refresh)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  },

  reset: () => set({
    step: "role_select",
    intent: null,
    matches: [],
    outcome: null,
    isLoading: false,
    error: null,
    selectedRole: null,
  }),
}));
