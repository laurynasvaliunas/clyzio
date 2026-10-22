import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { supabase } from "./supabase";
import { rememberDevicePushToken } from "./signOut";
import { captureError } from "./sentry";

/**
 * This device's Expo push token, or undefined when there's no permission yet,
 * no projectId, or no push support (simulator / Expo Go). Never prompts — the
 * priming screen owns the OS permission dialog.
 */
async function getPushTokenIfPermitted(): Promise<string | undefined> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#00565A",
    });
  }

  if (!Device.isDevice) {
    if (__DEV__) { console.log("Push notifications require a physical device"); }
    return undefined;
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") {
    if (__DEV__) { console.log("Push permission not granted yet - token registration deferred to priming flow"); }
    return undefined;
  }

  // Resolve EAS projectId dynamically from app.config.ts — avoids drift if
  // the project is ever rotated.
  const projectId =
    (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
    (Constants as any)?.easConfig?.projectId;
  if (!projectId) {
    if (__DEV__) { console.log("Push token skipped - missing EAS projectId"); }
    return undefined;
  }

  try {
    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    if (__DEV__) { console.log("Push token registered"); }
    return token;
  } catch {
    if (__DEV__) { console.log("Push token not available (expected in Expo Go)"); }
    return undefined;
  }
}

/**
 * Register this device for push and store the token on the signed-in profile.
 *
 * Called on sign-in (root layout) AND right after the user grants notification
 * permission on the priming screen. The sign-in call alone ran before that
 * permission existed, so new users never had a token saved and every carpool
 * push was skipped.
 */
export async function registerAndSavePushToken(): Promise<string | undefined> {
  try {
    const token = await getPushTokenIfPermitted();
    rememberDevicePushToken(token ?? null);
    if (!token) return undefined;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return token;
    const { error } = await supabase
      .from("profiles")
      .update({ expo_push_token: token })
      .eq("id", user.id);
    if (error) captureError(error, { feature: "push-token-register" });
    return token;
  } catch (err) {
    captureError(err, { feature: "push-token-register" });
    return undefined;
  }
}
