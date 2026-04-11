import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';

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
    const { userId, supabase } = await verifyAuth(req);

    const { match_id, accepted } = await req.json() as { match_id: string; accepted: boolean };

    const { data: match, error: matchError } = await supabase
      .from("trip_intent_matches")
      .select("driver_user_id, passenger_intent_id, driver_intent_id, trip_date, pickup_lat, pickup_long, proposed_departure")
      .eq("id", match_id)
      .eq("passenger_user_id", userId)
      .single();

    if (matchError || !match) {
      return new Response(JSON.stringify({ error: "Match not found" }), { status: 404, headers: corsHeaders });
    }

    const { data: passengerProfile } = await supabase
      .from("profiles")
      .select("first_name")
      .eq("id", userId)
      .single();
    const passengerName = passengerProfile?.first_name ?? "Your passenger";

    const { data: driverProfile } = await supabase
      .from("profiles")
      .select("expo_push_token, work_lat, work_long")
      .eq("id", match.driver_user_id)
      .single();

    if (accepted) {
      const { data: rideData } = await supabase
        .from("rides")
        .insert({
          driver_id: match.driver_user_id,
          rider_id: userId,
          status: "scheduled",
          origin_lat: match.pickup_lat ?? 0,
          origin_long: match.pickup_long ?? 0,
          dest_lat: driverProfile?.work_lat ?? 0,
          dest_long: driverProfile?.work_long ?? 0,
          scheduled_at: new Date(`${match.trip_date}T${match.proposed_departure ?? "08:00"}:00`).toISOString(),
          transport_mode: "carpool",
          transport_label: "Carpool",
        })
        .select("id")
        .single();

      const { error: confirmError } = await supabase
        .from("trip_intent_matches")
        .update({
          status: "confirmed",
          ride_id: rideData?.id ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", match_id);

      if (confirmError) throw confirmError;

      await supabase.from("trip_intents").update({ status: "matched" }).eq("id", match.passenger_intent_id);
      await supabase.from("trip_intents").update({ status: "matched" }).eq("id", match.driver_intent_id);

      if (driverProfile?.expo_push_token) {
        await sendPush(
          driverProfile.expo_push_token,
          "Ride Confirmed!",
          `${passengerName} confirmed your commute tomorrow. You're all set!`,
          { screen: "daily-commute" }
        );
      }

      return new Response(JSON.stringify({ ok: true, ride_id: rideData?.id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    } else {
      await supabase
        .from("trip_intent_matches")
        .update({ status: "cancelled_by_passenger", updated_at: new Date().toISOString() })
        .eq("id", match_id);

      if (driverProfile?.expo_push_token) {
        await sendPush(
          driverProfile.expo_push_token,
          "Match Declined",
          `${passengerName} declined the ride. Check for other matches.`,
          { screen: "daily-commute" }
        );
      }

      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (err) {
    console.error("passenger-respond-to-match error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
