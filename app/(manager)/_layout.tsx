import { useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function ManagerLayout() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    checkManagerAccess();
  }, []);

  const checkManagerAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      router.replace("/(auth)/login");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("is_manager")
      .eq("id", user.id)
      .single();

    if (!profile?.is_manager) {
      router.replace("/(tabs)");
      return;
    }

    setChecking(false);
  };

  if (checking) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#26C6DA" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="challenges" />
      <Stack.Screen name="esg-export" />
    </Stack>
  );
}
