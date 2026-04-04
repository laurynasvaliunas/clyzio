import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sendPush(token: string, title: string, body: string, data?: Record<string, unknown>) {
  try {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: token, title, body, data, sound: "default" }),
    });
  } catch (e) {
    console.error("Push send error:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });
    }

    const { accepted_ids, declined_ids, detour_preference, custom_pickups } = await req.json() as {
      accepted_ids: string[];
      declined_ids?: string[];
      detour_preference: "flexible" | "fixed";
      custom_pickups?: Array<{ match_id: string; lat: number; lng: number }>;
    };

    // Get driver's name for notifications
    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("id", user.id)
      .single();
    const driverName = driverProfile?.first_name ?? "Your driver";

    for (const matchId of (accepted_ids ?? [])) {
      const updates: Record<string, unknown> = {
        status: "driver_accepted",
        detour_preference,
        updated_at: new Date().toISOString(),
      };
      if (detour_preference === "fixed") {
        const cp = (custom_pickups ?? []).find(p => p.match_id === matchId);
        if (cp) {
          updates.custom_pickup_lat = cp.lat;
          updates.custom_pickup_long = cp.lng;
        }
      }
      const { data: match, error } = await supabase
        .from("trip_intent_matches")
        .update(updates)
        .eq("id", matchId)
        .eq("driver_user_id", user.id)
        .eq("status", "pending_driver_review")
        .select("passenger_user_id")
        .single();

      if (error) { console.error("Accept match error:", error); continue; }

      const { data: passengerProfile } = await supabase
        .from("profiles")
        .select("expo_push_token")
        .eq("id", match.passenger_user_id)
        .single();
      if (passengerProfile?.expo_push_token) {
        await sendPush(
          passengerProfile.expo_push_token,
          "Match Accepted!",
          `${driverName} accepted your commute match. Tap to confirm your ride.`,
          { screen: "daily-commute" }
        );
      }
    }

    for (const matchId of (declined_ids ?? [])) {
      await supabase
        .from("trip_intent_matches")
        .update({ status: "cancelled_by_driver", updated_at: new Date().toISOString() })
        .eq("id", matchId)
        .eq("driver_user_id", user.id)
        .eq("status", "pending_driver_review");
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("driver-respond-to-matches error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
