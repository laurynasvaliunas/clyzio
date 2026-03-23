import { useState, useCallback } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  Sparkles,
  RefreshCw,
  Footprints,
  Bike,
  Bus,
  Car,
  Users,
  ChevronRight,
  Leaf,
  AlertCircle,
  TrendingDown,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useAIStore, CommuteSuggestion } from "../../store/useAIStore";

// ─── Brand Colors ─────────────────────────────────────────────────────────────

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  accent: "#FDD835",
  dark: "#006064",
  light: "#E0F7FA",
  background: "#F5FAFA",
  white: "#FFFFFF",
  gray: "#90A4AE",
  grayLight: "#F1F5F9",
  green: "#4CAF50",
  orange: "#FF9800",
  red: "#EF4444",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getModeIcon(icon: string, color: string, size = 22) {
  switch (icon) {
    case "walk": return <Footprints size={size} color={color} />;
    case "bike": return <Bike size={size} color={color} />;
    case "bus": return <Bus size={size} color={color} />;
    case "carpool": return <Users size={size} color={color} />;
    default: return <Car size={size} color={color} />;
  }
}

function getDifficultyColor(level: string) {
  switch (level) {
    case "easy": return COLORS.green;
    case "medium": return COLORS.orange;
    default: return COLORS.red;
  }
}

// ─── Skeleton placeholder card ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <View style={styles.skeletonCard}>
      <View style={styles.skeletonLine} />
      <View style={[styles.skeletonLine, { width: "60%", marginTop: 8 }]} />
      <View style={[styles.skeletonLine, { width: "80%", marginTop: 8 }]} />
    </View>
  );
}

// ─── Suggestion Card ──────────────────────────────────────────────────────────

function SuggestionCard({
  suggestion,
  isTop,
  onPlanIt,
}: {
  suggestion: CommuteSuggestion;
  isTop: boolean;
  onPlanIt: (mode: string) => void;
}) {
  const difficultyColor = getDifficultyColor(suggestion.difficulty_level);
  const iconColor = isTop ? COLORS.white : COLORS.primary;

  return isTop ? (
    <LinearGradient
      colors={[COLORS.primary, COLORS.dark]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, styles.topCard]}
    >
      {/* Best Pick badge */}
      <View style={styles.bestPickBadge}>
        <Text style={styles.bestPickText}>✨ Best Pick</Text>
      </View>

      <View style={styles.cardHeader}>
        <View style={[styles.modeIconBg, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
          {getModeIcon(suggestion.mode_icon, iconColor, 20)}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.modeName, { color: COLORS.white, fontSize: 22 }]}>{suggestion.mode}</Text>
          <View style={[styles.difficultyPill, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
            <Text style={[styles.difficultyText, { color: COLORS.white }]}>
              {suggestion.difficulty_level}
            </Text>
          </View>
        </View>
        <View style={styles.co2Badge}>
          <TrendingDown size={14} color={COLORS.white} />
          <Text style={styles.co2BadgeText}>–{suggestion.co2_reduction_pct}%</Text>
        </View>
      </View>

      <View style={[styles.statsRow, { backgroundColor: "rgba(255,255,255,0.15)" }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.white }]}>
            {suggestion.estimated_co2_kg.toFixed(2)} kg
          </Text>
          <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.7)" }]}>CO2 / trip</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.white }]}>
            {suggestion.estimated_time_min} min
          </Text>
          <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.7)" }]}>Est. time</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.accent }]}>
            €{suggestion.cost_saving_eur_monthly}
          </Text>
          <Text style={[styles.statLabel, { color: "rgba(255,255,255,0.7)" }]}>saved/mo</Text>
        </View>
      </View>

      {suggestion.tips.slice(0, 2).map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <Leaf size={13} color="rgba(255,255,255,0.8)" />
          <Text style={[styles.tipText, { color: "rgba(255,255,255,0.9)" }]}>{tip}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.ctaButtonTop} onPress={() => onPlanIt(suggestion.mode)}>
        <Text style={styles.ctaButtonTopText}>{suggestion.cta_label} →</Text>
      </TouchableOpacity>
    </LinearGradient>
  ) : (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.modeIconBg, { backgroundColor: COLORS.light }]}>
          {getModeIcon(suggestion.mode_icon, COLORS.primary, 20)}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.modeName, { color: COLORS.dark }]}>{suggestion.mode}</Text>
          <View style={[styles.difficultyPill, { backgroundColor: difficultyColor + "20" }]}>
            <Text style={[styles.difficultyText, { color: difficultyColor }]}>
              {suggestion.difficulty_level}
            </Text>
          </View>
        </View>
        <View style={[styles.co2Badge, { backgroundColor: COLORS.green + "20" }]}>
          <TrendingDown size={14} color={COLORS.green} />
          <Text style={[styles.co2BadgeText, { color: COLORS.green }]}>
            –{suggestion.co2_reduction_pct}%
          </Text>
        </View>
      </View>

      <View style={[styles.statsRow, { backgroundColor: COLORS.grayLight }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.dark }]}>
            {suggestion.estimated_co2_kg.toFixed(2)} kg
          </Text>
          <Text style={styles.statLabel}>CO2 / trip</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: "#E5E7EB" }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.dark }]}>
            {suggestion.estimated_time_min} min
          </Text>
          <Text style={styles.statLabel}>Est. time</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: "#E5E7EB" }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.green }]}>
            €{suggestion.cost_saving_eur_monthly}
          </Text>
          <Text style={styles.statLabel}>saved/mo</Text>
        </View>
      </View>

      {suggestion.tips.slice(0, 2).map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <Leaf size={13} color={COLORS.green} />
          <Text style={styles.tipText}>{tip}</Text>
        </View>
      ))}

      <TouchableOpacity
        style={styles.ctaButton}
        onPress={() => onPlanIt(suggestion.mode)}
      >
        <Text style={styles.ctaButtonText}>{suggestion.cta_label} →</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function AIPlannerScreen() {
  const router = useRouter();
  const { commuteResult, isLoadingCommute, commuteError, fetchCommuteSuggestions } = useAIStore();
  const [hasLocations, setHasLocations] = useState(true);

  useFocusEffect(
    useCallback(() => {
      checkLocationsAndFetch();
    }, [])
  );

  const checkLocationsAndFetch = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("profiles")
      .select("home_address, work_address")
      .eq("id", user.id)
      .single();

    const hasAddresses = !!(profile?.home_address && profile?.work_address);
    setHasLocations(hasAddresses);

    if (hasAddresses) {
      fetchCommuteSuggestions();
    }
  };

  const handlePlanIt = (mode: string) => {
    // Navigate to the map/home tab — TripPlannerModal picks up the mode via query param
    router.push({ pathname: "/(tabs)", params: { preset_mode: mode } });
  };

  const handleRefresh = () => {
    fetchCommuteSuggestions(true);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>AI Planner</Text>
          <Sparkles size={22} color={COLORS.primary} />
        </View>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={handleRefresh}
          disabled={isLoadingCommute}
        >
          <RefreshCw size={18} color={isLoadingCommute ? COLORS.gray : COLORS.primary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Profile completion banner */}
        {!hasLocations && (
          <TouchableOpacity
            style={styles.completionBanner}
            onPress={() => router.push("/settings/edit-profile")}
          >
            <AlertCircle size={20} color={COLORS.orange} />
            <View style={styles.completionText}>
              <Text style={styles.completionTitle}>Set up your commute profile</Text>
              <Text style={styles.completionSubtitle}>
                Add your home & work address to get AI suggestions
              </Text>
            </View>
            <ChevronRight size={18} color={COLORS.orange} />
          </TouchableOpacity>
        )}

        {/* Hero insight card */}
        {commuteResult && (
          <LinearGradient
            colors={[COLORS.primary, COLORS.dark]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.insightCard}
          >
            <Sparkles size={24} color={COLORS.white} style={{ marginBottom: 10 }} />
            <Text style={styles.insightText}>{commuteResult.insight}</Text>
            <View style={styles.savingPill}>
              <Text style={styles.savingPillText}>
                Save ~{commuteResult.weekly_potential_saving_kg.toFixed(1)} kg/week
              </Text>
            </View>
          </LinearGradient>
        )}

        {/* Loading skeleton */}
        {isLoadingCommute && !commuteResult && (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}

        {/* Error state */}
        {commuteError && !isLoadingCommute && (
          <View style={styles.errorCard}>
            <AlertCircle size={20} color={COLORS.red} />
            <Text style={styles.errorText}>
              Could not load AI suggestions. Please try again.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Suggestion cards */}
        {commuteResult?.suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.rank}
            suggestion={suggestion}
            isTop={index === 0}
            onPlanIt={handlePlanIt}
          />
        ))}

        {/* Empty state when locations are set but no result yet */}
        {hasLocations && !isLoadingCommute && !commuteResult && !commuteError && (
          <View style={styles.emptyCard}>
            <Sparkles size={32} color={COLORS.primary} />
            <Text style={styles.emptyTitle}>Ready to suggest your green commute</Text>
            <Text style={styles.emptySubtitle}>
              Tap the refresh button to generate your personalised suggestions
            </Text>
            <TouchableOpacity style={styles.generateBtn} onPress={handleRefresh}>
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.generateGradient}
              >
                <Sparkles size={16} color={COLORS.white} />
                <Text style={styles.generateText}>Generate Suggestions</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

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
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 28, fontWeight: "700", color: COLORS.dark },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: { flex: 1, paddingHorizontal: 16 },

  // Profile completion banner — yellow left-border style
  completionBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFF8E1",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FDD835",
  },
  completionText: { flex: 1 },
  completionTitle: { fontSize: 14, fontWeight: "600", color: COLORS.dark },
  completionSubtitle: { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  // Insight hero — dark gradient card
  insightCard: {
    borderRadius: 24,
    padding: 24,
    marginBottom: 16,
  },
  insightText: { fontSize: 16, fontWeight: "600", color: COLORS.white, lineHeight: 24, marginBottom: 16 },
  savingPill: {
    alignSelf: "flex-start",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 50,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  savingPillText: { fontSize: 13, fontWeight: "700", color: COLORS.white },

  // Skeleton
  skeletonCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: COLORS.grayLight,
    borderRadius: 7,
    width: "100%",
  },

  // Cards
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
  },
  topCard: {
    shadowColor: COLORS.primary,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  bestPickBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.white,
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  bestPickText: { fontSize: 12, fontWeight: "700", color: COLORS.primary },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  modeIconBg: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardHeaderText: { flex: 1 },
  modeName: { fontSize: 16, fontWeight: "bold" },
  difficultyPill: {
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  difficultyText: { fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  co2Badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.25)",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  co2BadgeText: { fontSize: 13, fontWeight: "bold", color: COLORS.white },

  // Stats row
  statsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: "rgba(255,255,255,0.15)",
    borderRadius: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  stat: { alignItems: "center", flex: 1 },
  statValue: { fontSize: 15, fontWeight: "bold" },
  statLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  statDivider: {
    width: 1,
    backgroundColor: "rgba(255,255,255,0.3)",
    marginVertical: 4,
  },

  // Tips
  tipRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  tipText: { flex: 1, fontSize: 13, color: COLORS.gray, lineHeight: 18 },

  // CTA buttons
  ctaButtonTop: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.white,
    borderRadius: 28,
    paddingVertical: 14,
    marginTop: 12,
  },
  ctaButtonTopText: { fontSize: 15, fontWeight: "700", color: COLORS.primary },
  ctaButton: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    paddingVertical: 14,
    marginTop: 12,
    overflow: "hidden",
    backgroundColor: COLORS.primary,
  },
  ctaButtonText: { fontSize: 15, fontWeight: "700", color: COLORS.white },

  // Error
  errorCard: {
    backgroundColor: "#FFF5F5",
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  errorText: { fontSize: 14, color: COLORS.dark, textAlign: "center" },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
  },
  retryText: { color: COLORS.white, fontWeight: "600" },

  // Empty
  emptyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 20,
    padding: 32,
    alignItems: "center",
    gap: 12,
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.dark, textAlign: "center" },
  emptySubtitle: { fontSize: 13, color: COLORS.gray, textAlign: "center", lineHeight: 20 },
  generateBtn: { borderRadius: 14, overflow: "hidden", marginTop: 8, width: "100%" },
  generateGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    gap: 8,
  },
  generateText: { color: COLORS.white, fontWeight: "bold", fontSize: 15 },

});
