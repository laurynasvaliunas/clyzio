import { corsHeaders } from '../_shared/cors.ts';
import { verifyAuth } from '../_shared/auth.ts';

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, supabase } = await verifyAuth(req);

    const body = await req.json();
    const { role, passenger_capacity, departure_time, required_arrival_time, trip_date } = body;

    if (!role || !["driver", "passenger"].includes(role)) {
      return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400, headers: corsHeaders });
    }

    // Load user's home/work coords from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("home_lat, home_long, work_lat, work_long")
      .eq("id", userId)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: `Profile query failed: ${profileError.message}` }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (!profile || profile.home_lat == null || profile.work_lat == null) {
      return new Response(
        JSON.stringify({ error: "Profile home/work locations not set. Please update your profile." }),
        { status: 400, headers: corsHeaders }
      );
    }

    const targetDate = trip_date ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      return d.toISOString().split("T")[0];
    })();

    // Check for existing intent for this date
    const { data: existing } = await supabase
      .from("trip_intents")
      .select("id")
      .eq("user_id", userId)
      .eq("trip_date", targetDate)
      .maybeSingle();

    let intent;
    if (existing) {
      const { data, error } = await supabase
        .from("trip_intents")
        .update({
          role,
          passenger_capacity: role === "driver" ? (passenger_capacity ?? null) : null,
          departure_time: role === "driver" ? (departure_time ?? null) : null,
          required_arrival_time: role === "passenger" ? (required_arrival_time ?? null) : null,
          status: "pending",
        })
        .eq("id", existing.id)
        .select()
        .single();
      if (error) throw error;
      intent = data;
    } else {
      const { data, error } = await supabase
        .from("trip_intents")
        .insert({
          user_id: userId,
          role,
          passenger_capacity: role === "driver" ? (passenger_capacity ?? null) : null,
          departure_time: role === "driver" ? (departure_time ?? null) : null,
          required_arrival_time: role === "passenger" ? (required_arrival_time ?? null) : null,
          trip_date: targetDate,
          home_lat: profile.home_lat,
          home_long: profile.home_long,
          work_lat: profile.work_lat,
          work_long: profile.work_long,
        })
        .select()
        .single();
      if (error) throw error;
      intent = data;
    }

    return new Response(JSON.stringify({ intent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("submit-trip-intent error:", err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
