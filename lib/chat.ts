import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "./supabase";

/**
 * A chat thread between two matched commuters: a match (open from the moment
 * they're matched, before either approves) or a ride. Migration 051 ties a
 * match's messages to its ride once the ride exists, so the ride thread then
 * shows the whole conversation.
 */
export type ChatThread = { matchId: string } | { rideId: string };

/** The messages column + id a thread is stored under. */
export function threadKey(thread: ChatThread): { column: "match_id" | "ride_id"; id: string } {
  return "rideId" in thread
    ? { column: "ride_id", id: thread.rideId }
    : { column: "match_id", id: thread.matchId };
}

export type SendMessageOutcome = { ok: true } | { ok: false; message: string };

// Sub-codes returned by send-message (supabase/functions/send-message).
const ERROR_MESSAGES: Record<string, string> = {
  match_closed: "This match has ended, so the chat is closed.",
  not_a_participant: "You're not part of this conversation.",
  match_not_found: "This match no longer exists.",
  ride_not_found: "This ride no longer exists.",
};

/**
 * Sends a message through the `send-message` edge function, which also pushes
 * the other person. Every failure becomes a user-facing sentence.
 */
export async function sendChatMessage(
  thread: ChatThread,
  senderId: string,
  content: string,
): Promise<SendMessageOutcome> {
  const key = threadKey(thread);
  try {
    const { error } = await supabase.functions.invoke("send-message", {
      body: { [key.column]: key.id, content },
    });
    if (!error) return { ok: true };

    let code: string | undefined;
    let status: number | undefined;
    if (error instanceof FunctionsHttpError) {
      status = error.context.status;
      try {
        code = (await error.context.json())?.code;
      } catch {
        /* body wasn't JSON */
      }
    }
    // Function not deployed yet (a gateway 404, not one of ours): write
    // directly — the messages RLS policies still decide who may post — just
    // without the push.
    if (status === 404 && !(code && code in ERROR_MESSAGES)) {
      const { error: insErr } = await supabase
        .from("messages")
        .insert({ [key.column]: key.id, sender_id: senderId, content });
      if (!insErr) return { ok: true };
    }
    return { ok: false, message: (code && ERROR_MESSAGES[code]) || "Check your connection and try again." };
  } catch {
    return { ok: false, message: "Check your connection and try again." };
  }
}
