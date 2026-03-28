import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
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
  Zap,
  Clock,
  Euro,
  Navigation,
} from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { useAIStore, CommuteSuggestion } from "../../store/useAIStore";
import { useTheme } from "../../contexts/ThemeContext";
import { getThemeColors } from "../../lib/theme";
import { haversineKm, computeLocalModes, MODES, CAR_CO2, CAR_COST, WORKING_DAYS, LocalMode } from "../../lib/commuteUtils";
import CarpoolMatchModal from "../../components/CarpoolMatchModal";

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
  // Note: SkeletonCard doesn't need TC since it's a loading placeholder
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
  TC,
}: {
  suggestion: CommuteSuggestion;
  isTop: boolean;
  onPlanIt: (mode: string) => void;
  TC: ReturnType<typeof getThemeColors>;
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
    <View style={[styles.card, { backgroundColor: TC.surface }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.modeIconBg, { backgroundColor: COLORS.light }]}>
          {getModeIcon(suggestion.mode_icon, COLORS.primary, 20)}
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.modeName, { color: TC.text }]}>{suggestion.mode}</Text>
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

      <View style={[styles.statsRow, { backgroundColor: TC.surface2 }]}>
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: TC.text }]}>
            {suggestion.estimated_co2_kg.toFixed(2)} kg
          </Text>
          <Text style={[styles.statLabel, { color: TC.textSecondary }]}>CO2 / trip</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: TC.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: TC.text }]}>
            {suggestion.estimated_time_min} min
          </Text>
          <Text style={[styles.statLabel, { color: TC.textSecondary }]}>Est. time</Text>
        </View>
        <View style={[styles.statDivider, { backgroundColor: TC.border }]} />
        <View style={styles.stat}>
          <Text style={[styles.statValue, { color: COLORS.green }]}>
            €{suggestion.cost_saving_eur_monthly}
          </Text>
          <Text style={[styles.statLabel, { color: TC.textSecondary }]}>saved/mo</Text>
        </View>
      </View>

      {suggestion.tips.slice(0, 2).map((tip, i) => (
        <View key={i} style={styles.tipRow}>
          <Leaf size={13} color={COLORS.green} />
          <Text style={[styles.tipText, { color: TC.textSecondary }]}>{tip}</Text>
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

// ─── Local Insights Panel ─────────────────────────────────────────────────────

function LocalInsightsPanel({
  distKm,
  homeAddress,
  workAddress,
  onPlanIt,
  TC,
}: {
  distKm: number;
  homeAddress: string;
  workAddress: string;
  onPlanIt: (mode: string) => void;
  TC: ReturnType<typeof getThemeColors>;
}) {
  const modes = useMemo(() => computeLocalModes(distKm), [distKm]);
  const bestCO2 = modes[0];
  const weeklyKg = (CAR_CO2 * distKm * 2 * 5) - (bestCO2.co2PerKm * distKm * 2 * 5);
  const yearlyTrees = Math.round((weeklyKg * 52) / 20); // 20kg CO2 per tree/year

  return (
    <View>
      {/* Distance hero card */}
      <LinearGradient
        colors={[COLORS.primary, COLORS.dark]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.insightCard}
      >
        <Sparkles size={22} color={COLORS.white} style={{ marginBottom: 10 }} />
        <Text style={styles.insightText}>
          Your commute is <Text style={{ fontWeight: "800" }}>{distKm.toFixed(1)} km</Text>.
          Switching to {bestCO2.label.toLowerCase()} could save{" "}
          <Text style={{ color: COLORS.accent }}>~{weeklyKg.toFixed(1)} kg CO₂/week</Text>
          {yearlyTrees > 0 ? ` — equal to planting ${yearlyTrees} tree${yearlyTrees !== 1 ? "s" : ""} a year 🌳` : " 🌱"}.
        </Text>
        <View style={styles.savingPill}>
          <Text style={styles.savingPillText}>
            Save up to €{modes[0]?.monthlySaving}/month on travel costs
          </Text>
        </View>
      </LinearGradient>

      {/* Route snapshot */}
      <View style={[styles.routeSnapshotCard, { backgroundColor: TC.surface }]}>
        <View style={styles.routeSnapshotRow}>
          <View style={styles.routeDot} />
          <Text style={[styles.routeSnapshotText, { color: TC.text }]} numberOfLines={1}>
            {homeAddress}
          </Text>
        </View>
        <View style={styles.routeSnapshotLine} />
        <View style={styles.routeSnapshotRow}>
          <Navigation size={12} color={COLORS.primary} />
          <Text style={[styles.routeSnapshotText, { color: TC.text }]} numberOfLines={1}>
            {workAddress}
          </Text>
        </View>
      </View>

      {/* Mode cards */}
      {modes.map((m, i) => (
        <View key={m.id} style={[
          styles.localModeCard,
          { backgroundColor: TC.surface },
          i === 0 && { borderColor: m.color, borderWidth: 2 },
        ]}>
          {i === 0 && (
            <View style={[styles.localModeTagBadge, { backgroundColor: m.color }]}>
              <Text style={styles.localModeTagText}>✨ {m.tag}</Text>
            </View>
          )}

          <View style={styles.cardHeader}>
            <View style={[styles.modeIconBg, { backgroundColor: m.color + "18" }]}>
              {getModeIcon(m.icon, m.color, 20)}
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={[styles.modeName, { color: TC.text }]}>{m.label}</Text>
              {i > 0 && (
                <View style={[styles.difficultyPill, { backgroundColor: m.tagColor + "20" }]}>
                  <Text style={[styles.difficultyText, { color: m.tagColor }]}>{m.tag}</Text>
                </View>
              )}
            </View>
            <View style={[styles.co2Badge, { backgroundColor: COLORS.green + "18" }]}>
              <TrendingDown size={13} color={COLORS.green} />
              <Text style={[styles.co2BadgeText, { color: COLORS.green }]}>–{m.reductionPct}%</Text>
            </View>
          </View>

          <View style={[styles.statsRow, { backgroundColor: TC.surface2 }]}>
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: TC.text }]}>
                {m.tripCO2 < 0.01 ? "0" : m.tripCO2.toFixed(2)} kg
              </Text>
              <Text style={[styles.statLabel, { color: TC.textSecondary }]}>CO₂ / trip</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: TC.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: TC.text }]}>{m.timeMin} min</Text>
              <Text style={[styles.statLabel, { color: TC.textSecondary }]}>Est. time</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: TC.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statValue, { color: COLORS.green }]}>€{m.monthlySaving}</Text>
              <Text style={[styles.statLabel, { color: TC.textSecondary }]}>saved/mo</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.ctaButton} onPress={() => onPlanIt(m.id)}>
            <Text style={styles.ctaButtonText}>Plan with {m.label} →</Text>
          </TouchableOpacity>
        </View>
      ))}

      {/* Fun eco fact */}
      <View style={[styles.ecoFactCard, { backgroundColor: "#E8F5E9" }]}>
        <Leaf size={18} color={COLORS.green} />
        <Text style={styles.ecoFactText}>
          If every commuter in your city switched to green transport one day per week,
          city CO₂ emissions would drop by ~20%. Small habits, massive impact.
        </Text>
      </View>

      {/* Upgrade nudge */}
      <View style={[styles.upgradeNudge, { backgroundColor: TC.surface }]}>
        <Sparkles size={16} color={COLORS.primary} />
        <Text style={[styles.upgradeNudgeText, { color: TC.textSecondary }]}>
          These are estimated based on your route. Tap refresh for AI-personalised suggestions using your commute history.
        </Text>
      </View>
    </View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

interface UserProfile {
  home_address?: string;
  work_address?: string;
  home_lat?: number;
  home_long?: number;
  work_lat?: number;
  work_long?: number;
  first_name?: string;
}

export default function AIPlannerScreen() {
  const router = useRouter();
  const { isDark } = useTheme();
  const TC = getThemeColors(isDark);
  const {
    commuteResult, isLoadingCommute, commuteError, fetchCommuteSuggestions,
    carpoolResult, isLoadingCarpool, fetchCarpoolMatches, clearCarpoolResult,
  } = useAIStore();
  const [hasLocations, setHasLocations] = useState(true);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [showCarpoolModal, setShowCarpoolModal] = useState(false);

  const distKm = useMemo(() => {
    if (!userProfile?.home_lat || !userProfile?.home_long || !userProfile?.work_lat || !userProfile?.work_long) return 0;
    return haversineKm(userProfile.home_lat, userProfile.home_long, userProfile.work_lat, userProfile.work_long);
  }, [userProfile]);

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
      .select("home_address, work_address, home_lat, home_long, work_lat, work_long, first_name")
      .eq("id", user.id)
      .single();

    setUserProfile(profile);
    const hasAddresses = !!(profile?.home_address && profile?.work_address);
    setHasLocations(hasAddresses);

    if (hasAddresses) {
      fetchCommuteSuggestions();

      // Auto-fetch carpool matches for the home→work commute route
      if (profile?.home_lat && profile?.home_long && profile?.work_lat && profile?.work_long) {
        fetchCarpoolMatches({
          origin_lat:     profile.home_lat,
          origin_long:    profile.home_long,
          dest_lat:       profile.work_lat,
          dest_long:      profile.work_long,
          departure_time: new Date().toISOString(),
          role:           "rider",
        }).catch(() => {}); // silent fail — carpool section just hides if unavailable
      }
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
    <SafeAreaView style={[styles.container, { backgroundColor: TC.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.headerTitle, { color: TC.text }]}>AI Planner</Text>
          <Sparkles size={22} color={COLORS.primary} />
        </View>
        <TouchableOpacity
          style={[styles.refreshBtn, { backgroundColor: TC.surface }]}
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

        {/* Error state — show local insights instead of bare error */}
        {!!commuteError && !isLoadingCommute && (
          <>
            {distKm > 0 ? (
              <LocalInsightsPanel
                distKm={distKm}
                homeAddress={userProfile?.home_address ?? ""}
                workAddress={userProfile?.work_address ?? ""}
                onPlanIt={handlePlanIt}
                TC={TC}
              />
            ) : (
              <View style={[styles.errorCard, { backgroundColor: TC.surface }]}>
                <AlertCircle size={20} color={COLORS.orange} />
                <Text style={[styles.errorText, { color: TC.text }]}>
                  AI suggestions temporarily unavailable.
                </Text>
                <TouchableOpacity style={styles.retryBtn} onPress={handleRefresh}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Suggestion cards */}
        {commuteResult?.suggestions.map((suggestion, index) => (
          <SuggestionCard
            key={suggestion.rank}
            suggestion={suggestion}
            isTop={index === 0}
            onPlanIt={handlePlanIt}
            TC={TC}
          />
        ))}

        {/* Empty state when locations are set but no result yet */}
        {hasLocations && !isLoadingCommute && !commuteResult && !commuteError && (
          <View style={[styles.emptyCard, { backgroundColor: TC.surface }]}>
            <Sparkles size={32} color={COLORS.primary} />
            <Text style={[styles.emptyTitle, { color: TC.text }]}>Ready to suggest your green commute</Text>
            <Text style={[styles.emptySubtitle, { color: TC.textSecondary }]}>
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

        {/* ─── Matches Near Your Route ──────────────────────────── */}
        {hasLocations && (
          <View style={[styles.matchSection, { backgroundColor: TC.surface }]}>
            <View style={styles.matchSectionHeader}>
              <Users size={18} color={COLORS.primary} />
              <Text style={[styles.matchSectionTitle, { color: TC.text }]}>
                Matches Near Your Route
              </Text>
              {isLoadingCarpool && (
                <ActivityIndicator size="small" color={COLORS.primary} style={{ marginLeft: "auto" }} />
              )}
            </View>

            {/* Empty state */}
            {!isLoadingCarpool && (carpoolResult?.ranked_matches?.length ?? 0) === 0 && (
              <Text style={[styles.matchSectionSubtitle, { color: TC.textSecondary }]}>
                No matches found for your commute yet. Check back after planning a trip.
              </Text>
            )}

            {/* Top 2 match previews */}
            {carpoolResult?.ranked_matches?.slice(0, 2).map((match) => (
              <View key={match.ride_id} style={styles.matchPreviewRow}>
                <View style={styles.matchPreviewAvatar}>
                  <Users size={14} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.matchPreviewName, { color: TC.text }]}>
                    {match.user_first_name}
                  </Text>
                  <Text style={[styles.matchPreviewScore, { color: TC.textSecondary }]}>
                    {match.compatibility_score}% match · saves {match.co2_saving_kg.toFixed(2)} kg CO₂
                  </Text>
                </View>
              </View>
            ))}

            {/* View all CTA */}
            {(carpoolResult?.ranked_matches?.length ?? 0) > 0 && (
              <TouchableOpacity onPress={() => setShowCarpoolModal(true)}>
                <Text style={styles.viewMatchesBtn}>View All Matches →</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Carpool Match Modal */}
      <CarpoolMatchModal
        visible={showCarpoolModal}
        result={carpoolResult}
        loading={isLoadingCarpool}
        rideId={null}
        onClose={() => setShowCarpoolModal(false)}
        onMatchAccepted={() => {
          setShowCarpoolModal(false);
          router.push("/(tabs)");
        }}
      />
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

  // Local mode cards
  localModeCard: {
    borderRadius: 20,
    padding: 20,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 0,
    borderColor: "transparent",
  },
  localModeTagBadge: {
    alignSelf: "flex-start",
    borderRadius: 50,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 14,
  },
  localModeTagText: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.white,
  },

  // Route snapshot card
  routeSnapshotCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  routeSnapshotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  routeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.primary,
  },
  routeSnapshotLine: {
    width: 2,
    height: 14,
    backgroundColor: COLORS.gray,
    marginLeft: 4,
    marginVertical: 4,
    opacity: 0.4,
  },
  routeSnapshotText: {
    flex: 1,
    fontSize: 13,
    fontWeight: "500",
  },

  // Eco fact
  ecoFactCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  ecoFactText: {
    flex: 1,
    fontSize: 13,
    color: "#2E7D32",
    lineHeight: 20,
  },

  // Upgrade nudge
  upgradeNudge: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    opacity: 0.85,
  },
  upgradeNudgeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 18,
  },

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

  // Matches Near Your Route section
  matchSection: {
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  matchSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  matchSectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    flex: 1,
  },
  matchSectionSubtitle: {
    fontSize: 13,
    lineHeight: 19,
  },
  matchPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 10,
  },
  matchPreviewAvatar: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#E0F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  matchPreviewName: {
    fontSize: 14,
    fontWeight: "600",
  },
  matchPreviewScore: {
    fontSize: 12,
    marginTop: 1,
  },
  viewMatchesBtn: {
    fontSize: 14,
    fontWeight: "700",
    color: "#26C6DA",
    marginTop: 4,
  },

});
