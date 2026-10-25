import { useCallback, useRef } from "react";
import { View, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Text } from "../../components/ui/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import ProfileEditor, { type ProfileSection } from "../../components/ProfileEditor";
import { GlowBackdrop } from "../../components/ui";

// Ambient light across the top of the screen (decorative).
const GLOW_TOP = { bottom: undefined, height: 420 } as const;

/**
 * /settings/edit-profile — thin route wrapper around ProfileEditor.
 *
 * The editor itself now lives in components/ProfileEditor.tsx and is ALSO the
 * primary content of the Profile tab. This route stays so existing links
 * (settings menu, ai-planner CTA) and the legacy `?setup=1` first-run flow
 * keep working: setup mode flips `commute_setup_done` on save and lands on
 * the Map; normal mode goes back.
 *
 * `?section=garage | places` (Settings → My Garage / My Places) opens the
 * screen scrolled to that section.
 */

const COLORS = {
  primary: "#007C89",
  dark: "#0B2540",
  background: "#F4FAFB",
  white: "#FFFFFF",
};

export default function EditProfileScreen() {
  const router = useRouter();
  const { setup, section } = useLocalSearchParams<{ setup?: string; section?: string }>();
  const isSetup = setup === "1"; // first-run: this is the final step before the Map
  const target: ProfileSection | null = section === "garage" || section === "places" ? section : null;

  // Scroll to the requested section once, as soon as it has laid out (the
  // form renders after the profile loads).
  const scrollRef = useRef<ScrollView>(null);
  const scrolledRef = useRef(false);
  const handleSectionLayout = useCallback(
    (s: ProfileSection, y: number) => {
      if (s !== target || scrolledRef.current) return;
      scrolledRef.current = true;
      requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true }));
    },
    [target],
  );

  return (
    <SafeAreaView style={styles.container}>
      <GlowBackdrop variant="subtle" style={GLOW_TOP} />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Go back" style={styles.backButton} onPress={() => router.back()}>
          <ArrowLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 44 }} />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <ProfileEditor
          setupMode={isSetup}
          onSectionLayout={target ? handleSectionLayout : undefined}
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
    // Shared header spec (44pt target, light chip) — keep in sync across stack screens.
    width: 44,
    height: 44,
    borderRadius: 28,
    backgroundColor: "#F4FAFB",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700", color: COLORS.dark },
  scroll: { flex: 1, paddingHorizontal: 16 },
});
