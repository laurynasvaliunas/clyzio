import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { deliverNotification } from "./notifications";

const LAST_TIP_KEY = "ai_last_tip_sent_at";
const LAST_SUMMARY_KEY = "ai_last_weekly_summary_at";
const TIP_INTERVAL_MS = 24 * 60 * 60 * 1000;     // 24 hours
const SUMMARY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// ─── AI-Powered Notification Types ───────────────────────────────────────────

export const AINotifications = {
  /**
   * Sends a contextual commute tip from the user's cached AI suggestions.
   * Called on app foreground — throttled to once per 24 hours.
   */
  aiCommuteTip: (tip: string) =>
    deliverNotification("Green Commute Tip", tip),

  challengeProgress: (challengeName: string, pct: number) =>
    deliverNotification(
      `Challenge: ${challengeName}`,
      `You're ${Math.round(pct)}% of the way there! Keep it up.`
    ),

  weeklyCO2Summary: (savedKg: number, treesEquiv: number) =>
    deliverNotification(
      "Your Week in Green",
      `You saved ${savedKg.toFixed(1)} kg CO₂ this week — equivalent to ${treesEquiv} tree${treesEquiv === 1 ? "" : "s"}.`
    ),

  carpoolMatchAvailable: (firstName: string) =>
    deliverNotification(
      "Carpool Match Found",
      `${firstName} is heading the same direction. Check the map to connect!`,
      "/(tabs)"
    ),
};

// ─── Main orchestrator ────────────────────────────────────────────────────────

/**
 * Called from app/_layout.tsx on app foreground.
 * Checks if notifications should be sent based on time throttles.
 */
export async function checkAndSendAINotifications(): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await Promise.all([
      maybesSendDailyTip(user.id),
      maybeSendWeeklySummary(user.id),
    ]);
  } catch {
    // Silently fail — notifications are non-critical
  }
}

async function maybesSendDailyTip(userId: string): Promise<void> {
  const lastSentRaw = await AsyncStorage.getItem(LAST_TIP_KEY);
  const lastSent = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
  if (Date.now() - lastSent < TIP_INTERVAL_MS) return;

  // Fetch cached AI suggestions from profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("ai_suggestions_cache, home_address, work_address")
    .eq("id", userId)
    .single();

  if (!profile?.ai_suggestions_cache) return;
  if (!profile.home_address || !profile.work_address) return;

  const suggestions = profile.ai_suggestions_cache?.suggestions ?? [];
  if (suggestions.length === 0) return;

  // Pick the top suggestion's first tip
  const topTip = suggestions[0]?.tips?.[0];
  if (!topTip) return;

  await AINotifications.aiCommuteTip(topTip);
  await AsyncStorage.setItem(LAST_TIP_KEY, Date.now().toString());
}

async function maybeSendWeeklySummary(userId: string): Promise<void> {
  const lastSentRaw = await AsyncStorage.getItem(LAST_SUMMARY_KEY);
  const lastSent = lastSentRaw ? parseInt(lastSentRaw, 10) : 0;
  if (Date.now() - lastSent < SUMMARY_INTERVAL_MS) return;

  // Only send on Monday mornings (approx — check day of week)
  const today = new Date();
  if (today.getDay() !== 1) return; // 1 = Monday

  // Fetch weekly CO2 data
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: rides } = await supabase
    .from("rides")
    .select("co2_saved")
    .or(`rider_id.eq.${userId},driver_id.eq.${userId}`)
    .eq("status", "completed")
    .gte("created_at", oneWeekAgo);

  if (!rides || rides.length === 0) return;

  const weeklyTotal = rides.reduce((sum, r) => sum + (r.co2_saved ?? 0), 0);
  if (weeklyTotal < 0.1) return;

  const treesEquiv = Math.floor(weeklyTotal / 20);

  await AINotifications.weeklyCO2Summary(weeklyTotal, treesEquiv);
  await AsyncStorage.setItem(LAST_SUMMARY_KEY, Date.now().toString());
}

// scheduleRideReminder is now in lib/notifications.ts
export { scheduleRideReminder } from "./notifications";
