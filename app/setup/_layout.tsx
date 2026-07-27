import { useEffect } from "react";
import { BackHandler, Platform } from "react-native";
import { Stack } from "expo-router";

/**
 * First-run setup stack — Stage 1 of the customer-journey PDF.
 *
 * Sequence: profile (name/photo) → places → garage → week (commute mix)
 * → done → Map.
 *
 * Lives at root (not under `(auth)`) so the root layout's redirect rule
 * "authenticated users in (auth) → kick to (tabs)" doesn't fight the setup
 * flow. The root layout exempts `segments[0] === 'setup'` from both the
 * welcome gate and the auth redirect.
 */
export default function SetupLayout() {
  // `gestureEnabled: false` only blocks the iOS swipe. On Android the hardware
  // back button popped the user out of the setup stack into (tabs) with no
  // name, no addresses and commute_setup_done still false — and the per-launch
  // gate had already run, so nothing sent them back.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, []);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,         // can't swipe back during setup
        animation: "slide_from_right",
      }}
    />
  );
}
