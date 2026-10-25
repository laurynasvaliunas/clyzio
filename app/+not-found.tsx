import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "../components/ui/AppText";
import { SafeAreaView } from "react-native-safe-area-context";
import { Stack, useRouter } from "expo-router";
import { Compass } from "lucide-react-native";
import { depth } from "../lib/theme/tokens";
import { GlowBackdrop } from "../components/ui";

// Ambient light across the top of the screen (decorative).
const GLOW_TOP = { bottom: undefined, height: 420 } as const;

/**
 * Catch-all route. Without this, an unmatched deep link or a stale push
 * payload drops the user on expo-router's raw "Unmatched Route" debug screen.
 * Now they get a branded dead-end with a way back to the map.
 */

const COLORS = {
  background: "#F4FAFB",
  surface: "#FFFFFF",
  ink: "#0B2540",
  inkSoft: "#5B6B7A",
  primary: "#007C89",
  tint: "#E3FAFB",
};

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <>
      <Stack.Screen options={{ title: "Not found", headerShown: false }} />
      <SafeAreaView style={styles.container}>
        <GlowBackdrop variant="subtle" style={GLOW_TOP} />
        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <Compass size={36} color={COLORS.primary} />
          </View>
          <Text style={styles.title}>This page doesn&apos;t exist</Text>
          <Text style={styles.body}>
            The link you followed may be outdated or the page may have moved.
          </Text>
          <TouchableOpacity
            style={styles.cta}
            onPress={() => router.replace("/(tabs)" as any)}
            accessibilityRole="button"
            accessibilityLabel="Go to the map"
          >
            <Text style={styles.ctaText}>Go to the map</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: COLORS.tint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    boxShadow: depth.embossLight,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: COLORS.ink,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    color: COLORS.inkSoft,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 24,
  },
  cta: {
    backgroundColor: "#09E0E8",
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 32,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.22)",
  },
  ctaText: { color: "#0B2540", fontSize: 16, fontWeight: "800"},
});
