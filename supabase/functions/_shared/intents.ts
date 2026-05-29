// Shared helper: ensure a user has a pending trip_intent for a given date.
// Used by submit-trip-intent (self) and request-carpool (both parties — the
// caller via their JWT-scoped data, the target via the service-role client).

// deno-lint-ignore no-explicit-any
type Client = any;

export interface EnsuredIntent {
  id: string;
  user_id: string;
  role: 'driver' | 'passenger';
  home_lat: number;
  home_long: number;
  work_lat: number;
  work_long: number;
  trip_date: string;
}

/**
 * Upsert a pending trip_intent for (userId, tripDate) with the given role,
 * sourcing home/work from the user's profile. Returns null if the profile is
 * missing home/work (can't form a commute intent).
 */
export async function ensureIntent(
  supabase: Client,
  userId: string,
  role: 'driver' | 'passenger',
  tripDate: string,
): Promise<EnsuredIntent | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('home_lat, home_long, work_lat, work_long')
    .eq('id', userId)
    .single();

  if (!profile || profile.home_lat == null || profile.work_lat == null) {
    return null;
  }

  const { data: existing } = await supabase
    .from('trip_intents')
    .select('id')
    .eq('user_id', userId)
    .eq('trip_date', tripDate)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('trip_intents')
      .update({ role, status: 'pending' })
      .eq('id', existing.id)
      .select('id, user_id, role, home_lat, home_long, work_lat, work_long, trip_date')
      .single();
    if (error) throw error;
    return data as EnsuredIntent;
  }

  const { data, error } = await supabase
    .from('trip_intents')
    .insert({
      user_id: userId,
      role,
      trip_date: tripDate,
      home_lat: profile.home_lat,
      home_long: profile.home_long,
      work_lat: profile.work_lat,
      work_long: profile.work_long,
    })
    .select('id, user_id, role, home_lat, home_long, work_lat, work_long, trip_date')
    .single();
  if (error) throw error;
  return data as EnsuredIntent;
}
