import { supabase } from "./supabase";

/**
 * The Expo push token this device registered for the signed-in user.
 * Set by the root layout after registration; used on sign-out so the profile
 * stops pointing at this device.
 */
let devicePushToken: string | null = null;

export function rememberDevicePushToken(token: string | null): void {
  devicePushToken = token;
}

/**
 * Sign out and detach this device from push notifications.
 *
 * `profiles.expo_push_token` used to survive sign-out, so the next person to
 * use the phone (or nobody) kept receiving the previous user's carpool and
 * chat notifications. The token is cleared while the session is still valid
 * (RLS needs it), and only if it is still THIS device's token — a newer
 * registration from the user's other phone is left alone. A failed clear never
 * blocks the sign-out itself.
 */
export async function signOut(): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user.id;
    if (userId && devicePushToken) {
      await supabase
        .from("profiles")
        .update({ expo_push_token: null })
        .eq("id", userId)
        .eq("expo_push_token", devicePushToken);
    }
  } catch {
    /* never block sign-out */
  }
  devicePushToken = null;
  await supabase.auth.signOut();
}
