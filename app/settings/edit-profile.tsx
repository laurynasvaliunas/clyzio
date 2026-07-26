import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import ProfileEditor from "../../components/ProfileEditor";

/**
 * /settings/edit-profile — thin route wrapper around ProfileEditor.
 *
 * The editor itself now lives in components/ProfileEditor.tsx and is ALSO the
 * primary content of the Profile tab. This route stays so existing links
 * (settings menu, ai-planner CTA) and the legacy `?setup=1` first-run flow
 * keep working: setup mode flips `commute_setup_done` on save and lands on
 * the Map; normal mode goes back.
 */

const COLORS = {
  primary: "#00565A",
  dark: "#003D40",
  background: "#F7F9FA",
  white: "#FFFFFF",
};

export default function EditProfileScreen() {
  const router = useRouter();
  const { setup } = useLocalSearchParams<{ setup?: string }>();
  const isSetup = setup === "1"; // first-run: this is the final step before the Map

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Edit Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ProfileEditor
          setupMode={isSetup}
          onSaved={() => {
            // First-run: last setup step → land on the Map. Otherwise go back.
            if (isSetup) router.replace("/(tabs)" as any);
            else router.back();
          }}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },
  scroll: { flex: 1, paddingHorizontal: 16 },
});
