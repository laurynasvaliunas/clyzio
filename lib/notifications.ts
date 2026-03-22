import * as Notifications from "expo-notifications";

// Schedule a local notification
export async function sendLocalNotification(title: string, body: string) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: true,
    },
    trigger: null, // Immediate notification
  });
}

// Pre-defined notification types
export const NotificationTypes = {
  driverFound: () =>
    sendLocalNotification("Ride Confirmed! 🚗", "Your driver is on the way."),

  tripLogged: (co2Saved: number) =>
    sendLocalNotification(
      "Commute Logged ✅",
      `You just saved ${co2Saved.toFixed(1)}kg of CO₂!`
    ),

  tripScheduled: (time: string) =>
    sendLocalNotification(
      "Trip Scheduled 📅",
      `Your ride is confirmed for ${time}.`
    ),

  levelUp: (level: number) =>
    sendLocalNotification(
      "Level Up! 🎉",
      `Congratulations! You've reached Level ${level}!`
    ),

  badgeUnlocked: (badgeName: string) =>
    sendLocalNotification(
      "Badge Unlocked! 🏆",
      `You earned the "${badgeName}" badge!`
    ),

  rideReminder: (minutes: number) =>
    sendLocalNotification(
      "Ride Starting Soon ⏰",
      `Your scheduled ride starts in ${minutes} minutes.`
    ),
};

