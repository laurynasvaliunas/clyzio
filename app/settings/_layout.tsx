import { Stack } from "expo-router";

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      <Stack.Screen name="licenses" options={{ headerShown: false }} />
      <Stack.Screen name="export-data" options={{ headerShown: false }} />
    </Stack>
  );
}

