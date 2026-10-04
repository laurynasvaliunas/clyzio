import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Has the user opted in to AI features? (profiles.ai_consent_at, migration 044)
 *
 * App Store Guideline 5.1.2(i): personal data may only reach a third-party AI
 * service after the user is told what is sent, to whom, and agrees. Any read
 * failure counts as "no consent" — we never send data on a guess.
 */
export async function hasAiConsent(supabase: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('profiles')
    .select('ai_consent_at')
    .eq('id', userId)
    .maybeSingle();
  if (error) return false;
  return !!(data as { ai_consent_at?: string | null } | null)?.ai_consent_at;
}

/** Straight-line distance in km. */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
