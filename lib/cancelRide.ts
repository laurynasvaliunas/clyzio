import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type CancelRideOutcome = { ok: true } | { ok: false; message: string };

// Sub-codes returned by cancel-ride (supabase/functions/cancel-ride).
const ERROR_MESSAGES: Record<string, string> = {
  ride_already_completed: "One of you already completed this trip, so it can't be cancelled. End it instead.",
  ride_completed: "This trip is already completed.",
  not_a_participant: "You're not part of this ride.",
  ride_not_found: "This ride no longer exists.",
};

/**
 * Cancels a ride through the `cancel-ride` edge function, which also releases
 * a confirmed carpool (so neither side keeps seeing "Riding with …") and tells
 * the partner. Every failure becomes a user-facing sentence.
 */
export async function cancelRide(rideId: string): Promise<CancelRideOutcome> {
  try {
    const { error } = await supabase.functions.invoke("cancel-ride", { body: { ride_id: rideId } });
    if (error) {
      let code: string | undefined;
      if (error instanceof FunctionsHttpError) {
        try {
          code = (await error.context.json())?.code;
        } catch {
          /* body wasn't JSON */
        }
      }
      return { ok: false, message: (code && ERROR_MESSAGES[code]) || "Check your connection and try again." };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: "Check your connection and try again." };
  }
}
