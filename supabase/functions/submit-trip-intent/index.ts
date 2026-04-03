import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { role, passenger_capacity, departure_time, required_arrival_time, trip_date } = body;

    // Load user's home/work coords from profile
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("home_lat, home_long, work_lat, work_long")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.home_lat || !profile?.work_lat) {
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

    // Upsert — one intent per user per date
    const { data: existing } = await supabase
      .from("trip_intents")
      .select("id")
      .eq("user_id", user.id)
      .eq("trip_date", targetDate)
      .single();

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
          user_id: user.id,
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
