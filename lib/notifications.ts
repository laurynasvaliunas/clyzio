import * as Notifications from "expo-notifications";
import { AppState } from "react-native";
import { useNotificationToastStore } from "../store/useNotificationToastStore";

// ─── Low-level OS notification ────────────────────────────────────────────────
// Only use this directly for background/scheduled notifications.
// For foreground alerts, use deliverNotification() or NotificationTypes below.
export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: { title, body, sound: true },
    trigger: null,
  });
}

/**
 * Route a notification to the right channel:
 * - App open (active)  → in-app styled toast
 * - App backgrounded   → OS system notification
 */
export function deliverNotification(title: string, body: string, screen?: string) {
  if (AppState.currentState === "active") {
    useNotificationToastStore.getState().push({ title, body, screen });
  } else {
    sendLocalNotification(title, body);
  }
}

// ─── Pre-defined notification types ─────────────────────────────────────────
export const NotificationTypes = {
  driverFound: () =>
    deliverNotification("Ride Confirmed!", "Your driver is on the way."),

  tripLogged: (co2Saved: number) =>
    deliverNotification(
      "Commute Logged",
      `You just saved ${co2Saved.toFixed(1)} kg of CO₂ — great work!`
    ),

  tripScheduled: (time: string) =>
    deliverNotification("Trip Scheduled", `Your ride is confirmed for ${time}.`),

  levelUp: (level: number) =>
    deliverNotification("Level Up!", `Congratulations! You've reached Level ${level}!`),

  badgeUnlocked: (badgeName: string) =>
    deliverNotification("Badge Unlocked!", `You earned the "${badgeName}" badge!`),

  rideReminder: (minutes: number) =>
    deliverNotification(
      "Ride Starting Soon",
      `Your scheduled ride starts in ${minutes} minutes.`
    ),
};

// ─── Scheduled reminders (always OS — app may be closed) ─────────────────────
export async function scheduleRideReminder(
  scheduledAt: string,
  reminderMinutesBefore = 15
): Promise<string | null> {
  try {
    const tripTime = new Date(scheduledAt).getTime();
    const reminderTime = new Date(tripTime - reminderMinutesBefore * 60 * 1000);
    if (reminderTime <= new Date()) return null;

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: "Ride Starting Soon",
        body: `Your scheduled ride starts in ${reminderMinutesBefore} minutes.`,
        sound: true,
      },
      trigger: { type: "date", date: reminderTime } as any,
    });
    return id;
  } catch {
    return null;
  }
}
