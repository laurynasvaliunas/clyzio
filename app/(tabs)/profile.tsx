import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Image,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { LogOut, Leaf, Check, Settings, CalendarRange } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { useToast } from "../../contexts/ToastContext";
import ProfileEditor from "../../components/ProfileEditor";
import CommuteMixEditor, {
  type CommuteHabit,
  computeBaseline,
} from "../../components/CommuteMixEditor";

// Editorial reskin — local palette re-pointed onto the warm "paper" system.
const COLORS = {
  textMuted: "#5A6A6F",   // WCAG-AA muted text (#8B989C is 2.97:1 on white)
  primary: "#00565A",   // cyan
  primaryDark: "#003D40",// teal-2
  accent: "#F59E0B",    // sun
  dark: "#003D40",      // teal
  light: "#E6F1F2",     // cyan-fog
  background: "#F7F9FA",// paper
  white: "#FFFFFF",     // ivory
  gray: "#8B989C",      // ink-4
  black: "#0B1A1F",     // ink
  red: "#DC2626",       // clay
  transparent: "transparent",
};

/**
 * Get eco level badge based on baseline CO₂
 */
function getEcoLevel(baseline: number | null) {
  if (baseline === null) return { label: "Not set", color: COLORS.textMuted };
  if (baseline === 0) return { label: "Zero Hero! 🌟", color: COLORS.accent };
  if (baseline < 0.04) return { label: "Eco Champion!", color: COLORS.accent };
  if (baseline < 0.08) return { label: "Green Warrior!", color: COLORS.primary };
  if (baseline < 0.12) return { label: "Good Progress!", color: COLORS.primary };
  return { label: "Getting Started", color: COLORS.textMuted };
}

/**
 * ScoreCard - Displays CO₂ baseline score with glow effect
 */
interface ScoreCardProps {
  /** null = the user hasn't set a commute mix yet — show a prompt, not a number. */
  baseline: number | null;
  scaleAnim: Animated.Value;
  glowOpacity: Animated.AnimatedInterpolation<string | number>;
  ecoLevel: { label: string; color: string };
}

function ScoreCard({ baseline, scaleAnim, glowOpacity, ecoLevel }: ScoreCardProps) {
  return (
    <View style={styles.scoreCardContainer}>
      <Animated.View style={[styles.scoreGlow, { opacity: glowOpacity }]} />
      <LinearGradient
        colors={[COLORS.primary, COLORS.primaryDark]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.scoreCard}
      >
        <Leaf size={24} color={COLORS.white} style={{ opacity: 0.8 }} />
        <Text style={styles.scoreLabel}>Your carbon baseline</Text>
        {baseline === null ? (
          <>
            {/* Previously this rendered a hardcoded 0.192 kg/km (petrol car)
                as if it were the user's measured baseline. */}
            <Text style={styles.scoreEmpty}>Not set yet</Text>
            <Text style={styles.scoreUnit}>
              Pick your weekly commute mix below to set it
            </Text>
          </>
        ) : (
          <>
            <Animated.Text style={[styles.scoreValue, { transform: [{ scale: scaleAnim }] }]}>
              {baseline.toFixed(3)}
            </Animated.Text>
            <Text style={styles.scoreUnit}>kg CO₂ per km</Text>
            <View style={[styles.levelBadge, { backgroundColor: ecoLevel.color }]}>
              <Text style={styles.levelText}>{ecoLevel.label}</Text>
            </View>
          </>
        )}
      </LinearGradient>
    </View>
  );
}

/**
 * ProfileScreen - User profile and commute baseline configuration
 * Allows users to set their weekly commute habits and calculate CO₂ baseline
 */
export default function ProfileScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [habits, setHabits] = useState<CommuteHabit[]>([]);
  const [baseline, setBaseline] = useState<number | null>(null);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;

  /**
   * Persist the weekly commute mix + derived baseline.
   *
   * Runs as part of ProfileEditor's single Save (passed as `onExtraSave`), so
   * the screen has ONE save button instead of the two competing ones that used
   * to sit two screens apart — editing the top half then tapping the bottom
   * button silently discarded those edits.
   *
   * Throws on failure so ProfileEditor reports it instead of showing success.
   */
  const persistCommuteMix = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Please sign in first");

    const { error } = await supabase
      .from("profiles")
      .update({ commuting_habits: habits, baseline_co2: baseline })
      .eq("id", user.id);

    if (error) throw error;
  }, [habits, baseline]);

  /**
   * Sign out user and redirect to login
   */
  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/(auth)/login");
  }, [router]);

  // Memoize derived values
  const ecoLevel = useMemo(() => getEcoLevel(baseline), [baseline]);
  const glowOpacity = useMemo(() => glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.6] }), [glowAnim]);

  if (loading) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {/* Header with Settings */}
        <View style={styles.headerRow}>
          <Text style={[styles.pageTitle, { color: TC.text }]}>Profile</Text>
          <TouchableOpacity
            style={[styles.settingsButton, { backgroundColor: TC.surface }]}
            onPress={() => router.push("/settings")}
            accessibilityRole="button"
            accessibilityLabel="Settings"
          >
            <Settings size={22} color={TC.text} />
          </TouchableOpacity>
        </View>

        {/* Profile editor — the primary Profile view. The eco-score and the
            weekly commute mix are injected into it via `extraSections` and
            persist through its single Save, so the screen has exactly one
            save action (there used to be two, two screens apart). */}
        <View style={{ paddingHorizontal: 16 }}>
          <ProfileEditor
            saveLabel="Save profile"
            onExtraSave={persistCommuteMix}
            extraSections={
              <>
                {/* Score Card */}
                <ScoreCard
                  baseline={baseline}
                  scaleAnim={scaleAnim}
                  glowOpacity={glowOpacity}
                  ecoLevel={ecoLevel}
                />

                {/* Weekly commute mix */}
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <CalendarRange size={18} color={COLORS.primary} />
                    <Text style={[styles.sectionTitle, { color: TC.text }]}>
                      Average weekly commute mix
                    </Text>
                  </View>
                  <Text style={[styles.sectionSubtitle, { color: TC.textSecondary }]}>
                    Select modes and tap the days you use them — this sets your CO₂ baseline.
                  </Text>

                  <CommuteMixEditor habits={habits} onChange={setHabits} />
                </View>
              </>
            }
          />
        </View>

        {/* Sign Out */}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <LogOut size={18} color={COLORS.red} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ===== CONTAINER & SCROLL =====
  container: { flex: 1, backgroundColor: COLORS.background },
  scroll: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  
  // ===== HEADER =====
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  pageTitle: { fontWeight: "700", fontSize: 40, lineHeight: 48, letterSpacing: -0.8, color: COLORS.dark },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.black,
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 2,
  },
  

  // ===== SCORE CARD =====
  scoreCardContainer: { marginHorizontal: 16, marginBottom: 20, position: "relative" },
  scoreGlow: {
    position: "absolute",
    top: 10,
    left: 10,
    right: 10,
    bottom: -10,
    backgroundColor: COLORS.primary,
    borderRadius: 28,
    zIndex: -1,
  },
  scoreCard: { borderRadius: 24, padding: 24, alignItems: "center" },
  scoreLabel: { fontSize: 14, color: COLORS.white, opacity: 0.9, marginTop: 8 },
  scoreValue: { fontWeight: "800", fontSize: 72, lineHeight: 86, letterSpacing: -2, color: COLORS.white, marginVertical: 4 },
  scoreEmpty: {
    fontSize: 30,
    fontWeight: "800",
    color: COLORS.white,
    marginTop: 4,
    marginBottom: 2,
  },
  scoreUnit: { fontSize: 14, color: COLORS.white, opacity: 0.8 },
  levelBadge: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, marginTop: 12 },
  levelText: { color: COLORS.dark, fontWeight: "700", fontSize: 14 },
  
  // ===== COMMUTE SECTION =====
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontWeight: "700", fontSize: 24, color: COLORS.dark },
  sectionSubtitle: { fontSize: 13, color: COLORS.textMuted, marginTop: 4, marginBottom: 16 },
  modeCardsContainer: { paddingVertical: 8, gap: 12 },
  
  // ===== MODE CARDS =====
  modeCard: {
    width: 100,
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 14,
    alignItems: "center",
    marginRight: 12,
    shadowColor: COLORS.black,
    shadowOpacity: 0.06,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 2,
    borderColor: COLORS.transparent,
    position: "relative",
  },
  modeCardSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryDark, shadowColor: COLORS.primary, shadowOpacity: 0.3, shadowOffset: { width: 0, height: 2 }, elevation: 8 },
  modeCardHasData: { borderColor: COLORS.primary },
  daysBadge: { position: "absolute", top: -8, right: -8, width: 24, height: 24, borderRadius: 12, backgroundColor: COLORS.primary, alignItems: "center", justifyContent: "center" },
  daysBadgeSelected: { backgroundColor: COLORS.white },
  daysBadgeText: { fontSize: 12, fontWeight: "700", color: COLORS.white },
  daysBadgeTextSelected: { color: COLORS.primary },
  modeEmoji: { fontSize: 32, marginBottom: 8 },
  modeName: { fontSize: 13, fontWeight: "600", color: COLORS.dark },
  modeNameSelected: { color: COLORS.white },
  modeCo2: { fontSize: 11, color: COLORS.textMuted, marginTop: 4 },
  modeCo2Selected: { color: COLORS.white, opacity: 0.8 },
  
  // ===== DAY SELECTOR =====
  daySelector: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginTop: 16,
    shadowColor: COLORS.primary,
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 10,
    elevation: 4,
  },
  daySelectorTitle: { fontSize: 14, color: COLORS.dark, marginBottom: 16, textAlign: "center" },
  dayBubbles: { flexDirection: "row", justifyContent: "center", gap: 10 },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.light,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.transparent,
  },
  dayBubbleActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primaryDark },
  dayText: { fontSize: 14, fontWeight: "600", color: COLORS.textMuted },
  
  // ===== SAVE BUTTON =====
  saveButton: { marginHorizontal: 16, marginBottom: 12, borderRadius: 28, overflow: "hidden" },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonGradient: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 18, gap: 10 },
  saveButtonText: { color: COLORS.white, fontSize: 17, fontWeight: "700" },

  // ===== SIGN OUT BUTTON =====
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: COLORS.transparent,
    borderRadius: 28,
    borderWidth: 1.5,
    borderColor: COLORS.red,
    paddingVertical: 14,
    marginHorizontal: 16,
  },
  signOutText: { color: COLORS.red, fontSize: 15, fontWeight: "600" },
});
