import { Redirect } from "expo-router";

export default function Index() {
  // Simple redirect to tabs (auth check happens in individual screens)
  return <Redirect href="/(tabs)" />;
}
