import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/** Response of the `complete-trip` edge function. */
export interface CompleteTripResult {
  xp_earned: number;
  co2_saved: number;
  distance_km: number;
  new_level?: number;
  leveled_up: boolean;
  already_completed?: boolean;
}

export type CompleteTripOutcome =
  | { ok: true; data: CompleteTripResult }
  | { ok: false; message: string };

// Sub-codes returned by complete-trip (supabase/functions/complete-trip).
const ERROR_MESSAGES: Record<string, string> = {
  ride_cancelled: "This ride was cancelled, so it can't be completed.",
  ride_not_started: "This ride hasn't started yet. You can complete it once you're on your way.",
  ride_not_completable: "This ride can't be completed.",
  daily_completion_limit: "You've reached today's limit of completed trips.",
  not_a_participant: "You're not part of this ride.",
  ride_not_found: "This ride no longer exists.",
};

/**
 * On a carpool only the driver ends the ride; the passenger just collects
 * their own credit. Solo trips are ended by their one participant.
 * (complete-trip enforces the same rule server-side.)
 */
export function shouldEndRide(
  ride: { driver_id?: string | null; rider_id?: string | null },
  userId: string | null,
): boolean {
  const isCarpool = !!(ride.driver_id && ride.rider_id);
  return !isCarpool || ride.driver_id === userId;
}

/**
 * Calls complete-trip and turns every failure into a user-facing sentence,
 * so callers never celebrate a completion that didn't happen.
 */
export async function completeTrip(rideId: string, endTrip: boolean): Promise<CompleteTripOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke<CompleteTripResult>("complete-trip", {
      body: { ride_id: rideId, end_trip: endTrip },
    });
    if (error) {
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        try {
          code = (await error.context.json())?.code;
        } catch {
          /* body wasn't JSON */
        }
      }
      return {
        ok: false,
        message: (code && ERROR_MESSAGES[code]) || "Check your connection and try again.",
      };
    }
    if (!data) return { ok: false, message: "Check your connection and try again." };
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Check your connection and try again." };
  }
}
