import { useCallback } from "react";
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
  ArrowLeft,
  Sparkles,
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Leaf,
  Trophy,
  Target,
  ChevronRight,
  Building2,
} from "lucide-react-native";
import { useManagerStore } from "../../store/useManagerStore";

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

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 70 ? COLORS.green : score >= 40 ? COLORS.orange : COLORS.red;
  return (
    <View style={styles.gaugeBox}>
      <Text style={[styles.gaugeScore, { color: COLORS.white }]}>{score}</Text>
      <Text style={[styles.gaugeLabel, { color: "rgba(255,255,255,0.8)" }]}>/100</Text>
    </View>
  );
}

function TrendIcon({ trend }: { trend: string }) {
  if (trend === "improving") return <TrendingUp size={16} color={COLORS.green} />;
  if (trend === "declining") return <TrendingDown size={16} color={COLORS.red} />;
  return <Minus size={16} color={COLORS.gray} />;
}

export default function ManagerDashboardScreen() {
  const router = useRouter();
  const {
    companyStats,
    sustainabilityReport,
    challenges,
    isLoadingStats,
    isLoadingReport,
    statsError,
    fetchCompanyStats,
    fetchSustainabilityReport,
    fetchChallenges,
  } = useManagerStore();

  useFocusEffect(
    useCallback(() => {
      fetchCompanyStats();
      fetchChallenges();
    }, [])
  );

  const activeChallenges = challenges.filter((c) => c.is_active);

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Building2 size={18} color={COLORS.primary} />
          <Text style={styles.headerTitle}>Sustainability Dashboard</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Green Commute Score Hero */}
        <LinearGradient
          colors={[COLORS.primary, COLORS.primaryDark, COLORS.dark]}
          style={styles.heroCard}
        >
          {isLoadingStats ? (
            <ActivityIndicator color={COLORS.white} size="large" />
          ) : (
            <>
              <Text style={styles.heroCompany}>
                {companyStats?.company_name ?? "Your Company"}
              </Text>
              <Text style={styles.heroLabel}>Green Commute Score</Text>
              <ScoreGauge score={companyStats?.green_commute_score ?? 0} />
              {sustainabilityReport && (
                <View style={styles.trendRow}>
                  <TrendIcon trend={sustainabilityReport.score_trend} />
                  <Text style={styles.trendText}>
                    {sustainabilityReport.score_trend === "improving"
                      ? "Improving"
                      : sustainabilityReport.score_trend === "declining"
                      ? "Needs attention"
                      : "Stable"}
                  </Text>
                </View>
              )}
            </>
          )}
        </LinearGradient>

        {/* Quick Stats Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Leaf size={20} color={COLORS.green} />
            <Text style={styles.statValue}>
              {companyStats ? `${companyStats.total_co2_saved.toFixed(0)} kg` : "—"}
            </Text>
            <Text style={styles.statLabel}>CO2 Saved</Text>
          </View>
          <View style={styles.statCard}>
            <Users size={20} color={COLORS.primary} />
            <Text style={styles.statValue}>
              {companyStats
                ? `${companyStats.active_users}/${companyStats.employee_count}`
                : "—"}
            </Text>
            <Text style={styles.statLabel}>Active Users</Text>
          </View>
          <View style={styles.statCard}>
            <Trophy size={20} color={COLORS.accent} />
            <Text style={styles.statValue}>
              {companyStats ? companyStats.total_trips : "—"}
            </Text>
            <Text style={styles.statLabel}>Total Trips</Text>
          </View>
        </View>

        {/* AI Insights Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Sparkles size={18} color={COLORS.primary} />
            <Text style={styles.sectionTitle}>AI Insights</Text>
          </View>

          {isLoadingReport && (
            <View style={styles.centeredRow}>
              <ActivityIndicator color={COLORS.primary} />
              <Text style={styles.loadingText}>Generating AI report…</Text>
            </View>
          )}

          {!sustainabilityReport && !isLoadingReport && (
            <TouchableOpacity
              style={styles.generateBtn}
              onPress={() => fetchSustainabilityReport("month")}
            >
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.generateGradient}
              >
                <Sparkles size={16} color={COLORS.white} />
                <Text style={styles.generateText}>Generate AI Sustainability Report</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}

          {sustainabilityReport && !isLoadingReport && (
            <>
              <Text style={styles.executiveSummary}>
                {sustainabilityReport.executive_summary}
              </Text>

              {sustainabilityReport.top_insights.slice(0, 3).map((insight, i) => {
                const borderColor = insight.priority === "high"
                  ? COLORS.red
                  : insight.priority === "medium"
                  ? COLORS.accent
                  : COLORS.green;
                return (
                  <View
                    key={i}
                    style={[styles.insightCard, { borderLeftColor: borderColor }]}
                  >
                    <Text style={styles.insightTitle}>{insight.title}</Text>
                    <Text style={styles.insightMetric}>{insight.metric}</Text>
                    <Text style={styles.insightDesc}>{insight.description}</Text>
                  </View>
                );
              })}

              <TouchableOpacity
                style={styles.viewFullBtn}
                onPress={() => router.push("/(manager)/insights")}
              >
                <Text style={styles.viewFullText}>View Full Report</Text>
                <ChevronRight size={16} color={COLORS.primary} />
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Department Rankings */}
        {(sustainabilityReport?.department_rankings?.length ?? 0) > 0 && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Building2 size={18} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>Department Rankings</Text>
            </View>
            {sustainabilityReport!.department_rankings!.slice(0, 4).map((dept, i) => (
              <View key={i} style={styles.deptRow}>
                <View style={styles.deptRank}>
                  <Text style={styles.deptRankNum}>{i + 1}</Text>
                </View>
                <View style={styles.deptInfo}>
                  <Text style={styles.deptName}>{dept.dept_name}</Text>
                  <Text style={styles.deptStat}>
                    {dept.co2_saved.toFixed(1)} kg saved · {dept.employee_count} employees
                  </Text>
                </View>
                <TrendIcon trend={dept.trend} />
              </View>
            ))}
            <TouchableOpacity
              style={styles.viewFullBtn}
              onPress={() => router.push("/(manager)/departments")}
            >
              <Text style={styles.viewFullText}>View All Departments</Text>
              <ChevronRight size={16} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        )}

        {/* Active Challenges */}
        <View style={styles.section}>
          <View style={[styles.sectionHeader, { justifyContent: "space-between" }]}>
            <View style={styles.sectionHeader}>
              <Target size={18} color={COLORS.primary} />
              <Text style={styles.sectionTitle}>
                Active Challenges ({activeChallenges.length})
              </Text>
            </View>
            <TouchableOpacity onPress={() => router.push("/(manager)/challenges")}>
              <Text style={styles.manageText}>Manage</Text>
            </TouchableOpacity>
          </View>

          {activeChallenges.length === 0 ? (
            <TouchableOpacity
              style={styles.createChallengeBtn}
              onPress={() => router.push("/(manager)/challenges")}
            >
              <Target size={16} color={COLORS.gray} />
              <Text style={styles.createChallengeText}>
                Create your first company challenge
              </Text>
            </TouchableOpacity>
          ) : (
            activeChallenges.slice(0, 2).map((challenge) => {
              const pct = challenge.target_value > 0
                ? Math.min(100, (challenge.current_value / challenge.target_value) * 100)
                : 0;
              return (
                <View key={challenge.id} style={styles.challengeCard}>
                  <Text style={styles.challengeTitle}>{challenge.title}</Text>
                  <View style={styles.challengeProgress}>
                    <View style={styles.progressBg}>
                      <View style={[styles.progressFill, { width: `${pct}%` as any }]} />
                    </View>
                    <Text style={styles.progressPct}>{Math.round(pct)}%</Text>
                  </View>
                  <Text style={styles.challengeReward}>+{challenge.reward_xp} XP reward</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Export Button */}
        <TouchableOpacity
          style={styles.exportBtn}
          onPress={() => router.push("/(manager)/esg-export")}
        >
          <Text style={styles.exportText}>Export ESG Report</Text>
          <ChevronRight size={16} color={COLORS.primary} />
        </TouchableOpacity>

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
  backBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
  },
  headerCenter: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: "bold", color: COLORS.dark },
  scroll: { flex: 1, paddingHorizontal: 16 },

  // Hero
  heroCard: {
    borderRadius: 24, padding: 28,
    alignItems: "center", marginBottom: 16,
  },
  heroCompany: { fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 4 },
  heroLabel: { fontSize: 13, color: "rgba(255,255,255,0.8)", marginBottom: 8 },
  gaugeBox: { alignItems: "center", flexDirection: "row", gap: 4 },
  gaugeScore: { fontSize: 64, fontWeight: "900" },
  gaugeLabel: { fontSize: 20, fontWeight: "600", marginTop: 24 },
  trendRow: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12,
    backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 50,
    paddingHorizontal: 14, paddingVertical: 7,
  },
  trendText: { fontSize: 13, color: "rgba(255,255,255,0.9)", fontWeight: "600" },

  // Stats row
  statsRow: { flexDirection: "row", gap: 10, marginBottom: 16 },
  statCard: {
    flex: 1, backgroundColor: COLORS.white, borderRadius: 20,
    padding: 14, alignItems: "center", gap: 6,
    shadowColor: COLORS.primary, shadowOpacity: 0.12,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3,
  },
  statValue: { fontSize: 15, fontWeight: "800", color: COLORS.dark },
  statLabel: { fontSize: 11, color: COLORS.gray, textAlign: "center" },

  // Section
  section: {
    backgroundColor: COLORS.white, borderRadius: 20, padding: 18,
    marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: COLORS.dark },

  // AI report
  centeredRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12 },
  loadingText: { fontSize: 14, color: COLORS.gray },
  generateBtn: { borderRadius: 28, overflow: "hidden" },
  generateGradient: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 14, gap: 8,
  },
  generateText: { color: COLORS.white, fontWeight: "bold", fontSize: 14 },
  executiveSummary: {
    fontSize: 14, color: COLORS.dark, lineHeight: 21,
    marginBottom: 14, fontStyle: "italic",
  },
  insightCard: {
    backgroundColor: COLORS.grayLight, borderRadius: 14, padding: 14, marginBottom: 10,
    borderLeftWidth: 3, borderLeftColor: COLORS.gray,
  },
  insightTitle: { fontSize: 13, fontWeight: "bold", color: COLORS.dark, marginBottom: 2 },
  insightMetric: { fontSize: 13, color: COLORS.primary, fontWeight: "600", marginBottom: 4 },
  insightDesc: { fontSize: 12, color: COLORS.gray, lineHeight: 17 },
  viewFullBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 10, gap: 4,
  },
  viewFullText: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },

  // Dept rankings
  deptRow: {
    flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: COLORS.grayLight,
  },
  deptRank: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: COLORS.light, alignItems: "center", justifyContent: "center",
  },
  deptRankNum: { fontSize: 13, fontWeight: "bold", color: COLORS.primary },
  deptInfo: { flex: 1 },
  deptName: { fontSize: 14, fontWeight: "600", color: COLORS.dark },
  deptStat: { fontSize: 12, color: COLORS.gray, marginTop: 2 },

  // Challenges
  manageText: { fontSize: 13, color: COLORS.primary, fontWeight: "600" },
  createChallengeBtn: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: COLORS.grayLight, borderRadius: 14, padding: 14,
  },
  createChallengeText: { fontSize: 14, color: COLORS.gray },
  challengeCard: {
    backgroundColor: COLORS.grayLight, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  challengeTitle: { fontSize: 14, fontWeight: "600", color: COLORS.dark, marginBottom: 8 },
  challengeProgress: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  progressBg: { flex: 1, height: 6, backgroundColor: COLORS.white, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: 3 },
  progressPct: { fontSize: 12, fontWeight: "bold", color: COLORS.primary, width: 36 },
  challengeReward: { fontSize: 12, color: COLORS.gray },

  // Export
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    backgroundColor: COLORS.white, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: COLORS.primary + "40",
    gap: 8, marginBottom: 8,
  },
  exportText: { fontSize: 15, fontWeight: "600", color: COLORS.primary },
});
