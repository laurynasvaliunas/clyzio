import { useCallback, useEffect, useState } from "react";
import { Stack, useRouter } from "expo-router";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { supabase } from "../../lib/supabase";

type Access = "checking" | "granted" | "error";

export default function ManagerLayout() {
  const router = useRouter();
  const [access, setAccess] = useState<Access>("checking");

  const checkManagerAccess = useCallback(async () => {
    setAccess("checking");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/(auth)/login");
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("is_manager")
        .eq("id", user.id)
        .maybeSingle();

      // A failed read is not "you're not a manager" — bouncing real managers
      // to the tabs on a network blip made the dashboard look broken.
      if (error) {
        setAccess("error");
        return;
      }
      if (!profile?.is_manager) {
        router.replace("/(tabs)");
        return;
      }
      setAccess("granted");
    } catch {
      setAccess("error");
    }
  }, [router]);

  useEffect(() => {
    checkManagerAccess();
  }, [checkManagerAccess]);

  if (access === "checking") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#FFFFFF" }}>
        <ActivityIndicator size="large" color="#00565A" />
      </View>
    );
  }

  if (access === "error") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#FFFFFF" }}>
        <Text style={{ fontSize: 17, fontWeight: "700", color: "#003D40", marginBottom: 8 }}>
          Couldn&apos;t open the dashboard
        </Text>
        <Text style={{ fontSize: 15, color: "#5A6A6F", textAlign: "center", marginBottom: 20 }}>
          Check your connection and try again.
        </Text>
        <TouchableOpacity
          onPress={checkManagerAccess}
          accessibilityRole="button"
          style={{ minHeight: 48, paddingHorizontal: 24, borderRadius: 14, backgroundColor: "#00565A", justifyContent: "center" }}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 16 }}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => router.replace("/(tabs)")}
          accessibilityRole="button"
          style={{ minHeight: 44, justifyContent: "center", marginTop: 8 }}
        >
          <Text style={{ color: "#00565A", fontWeight: "600", fontSize: 15 }}>Back to the app</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="dashboard" />
      <Stack.Screen name="insights" />
      <Stack.Screen name="challenges" />
      <Stack.Screen name="esg-export" />
      <Stack.Screen name="company-settings" />
    </Stack>
  );
}
