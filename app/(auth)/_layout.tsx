import { Stack } from "expo-router";

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      {/* 1.1 — Permission priming, shown once per device after first
          login / signup. See app/(auth)/permissions.tsx for details. */}
      <Stack.Screen name="permissions" options={{ headerShown: false }} />
    </Stack>
  );
}
