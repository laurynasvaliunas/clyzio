import { Stack } from "expo-router";

/**
 * First-run setup stack — Stage 1 of the customer-journey PDF.
 *
 * Sequence: profile (name/photo) → places → garage → done → Map.
 *
 * Lives at root (not under `(auth)`) so the root layout's redirect rule
 * "authenticated users in (auth) → kick to (tabs)" doesn't fight the setup
 * flow. The root layout exempts `segments[0] === 'setup'` from both the
 * welcome gate and the auth redirect.
 */
export default function SetupLayout() {
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
