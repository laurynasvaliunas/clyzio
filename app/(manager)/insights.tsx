import { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Sparkles,
  Leaf,
  TrendingDown,
  Clock,
  Zap,
} from "lucide-react-native";
import { useManagerStore, TimePeriod } from "../../store/useManagerStore";

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

const PERIODS: Array<{ label: string; value: TimePeriod }> = [
  { label: "Week", value: "week" },
  { label: "Month", value: "month" },
  { label: "Quarter", value: "quarter" },
  { label: "Year", value: "year" },
];

function effortColor(effort: string) {
  return effort === "low" ? COLORS.green : effort === "medium" ? COLORS.orange : COLORS.red;
}

function pillarBadge(pillar: string) {
  const colors: Record<string, string> = { E: COLORS.green, S: COLORS.primary, G: COLORS.accent };
  return colors[pillar] ?? COLORS.gray;
}

export default function InsightsScreen() {
  const router = useRouter();
  const { sustainabilityReport, isLoadingReport, fetchSustainabilityReport } =
    useManagerStore();
  const [selectedPeriod, setSelectedPeriod] = useState<TimePeriod>("month");

  const handlePeriodChange = (period: TimePeriod) => {
    setSelectedPeriod(period);
    fetchSustainabilityReport(period);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <ArrowLeft size={22} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Full AI Report</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Period selector */}
      <View style={styles.periodRow}>
        {PERIODS.map((p) => (
          <TouchableOpacity
            key={p.value}
            style={[
              styles.periodBtn,
              selectedPeriod === p.value && styles.periodBtnActive,
            ]}
            onPress={() => handlePeriodChange(p.value)}
          >
            <Text
              style={[
                styles.periodText,
                selectedPeriod === p.value && styles.periodTextActive,
              ]}
            >
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoadingReport && (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Claude is analysing your company data…</Text>
        </View>
      )}

      {!sustainabilityReport && !isLoadingReport && (
        <View style={styles.emptyBox}>
          <Sparkles size={36} color={COLORS.gray} />
          <Text style={styles.emptyText}>
            Return to the dashboard and generate a report first.
          </Text>
        </View>
      )}

      {sustainabilityReport && !isLoadingReport && (
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>

          {/* CO2 Equivalents */}
          <LinearGradient colors={["#E0F7FA", "#B2EBF2"]} style={styles.equivCard}>
            <Text style={styles.equivTitle}>Impact Equivalents</Text>
            <View style={styles.equivRow}>
              <View style={styles.equivItem}>
                <Text style={styles.equivNum}>
                  {sustainabilityReport.co2_equivalent.trees_planted}
                </Text>
                <Text style={styles.equivLabel}>Trees planted</Text>
              </View>
              <View style={styles.equivItem}>
                <Text style={styles.equivNum}>
                  {sustainabilityReport.co2_equivalent.car_km_avoided}
                </Text>
                <Text style={styles.equivLabel}>Car km avoided</Text>
              </View>
              <View style={styles.equivItem}>
                <Text style={styles.equivNum}>
                  {sustainabilityReport.co2_equivalent.flights_avoided}
                </Text>
                <Text style={styles.equivLabel}>Flights avoided</Text>
              </View>
            </View>
            <View style={styles.costRow}>
              <TrendingDown size={16} color={COLORS.green} />
              <Text style={styles.costText}>
                Estimated cost savings:{" "}
                <Text style={styles.costHighlight}>
                  €{sustainabilityReport.cost_savings_eur}
                </Text>
              </Text>
            </View>
          </LinearGradient>

          {/* Executive Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Executive Summary</Text>
            <Text style={styles.summaryText}>
              {sustainabilityReport.executive_summary}
            </Text>
          </View>

          {/* Recommendations */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Recommendations</Text>
            {sustainabilityReport.recommendations.map((rec, i) => (
              <View key={i} style={styles.recCard}>
                <View style={styles.recHeader}>
                  <View
                    style={[
                      styles.pillarBadge,
                      { backgroundColor: pillarBadge(rec.esg_pillar) + "20" },
                    ]}
                  >
                    <Text
                      style={[
                        styles.pillarText,
                        { color: pillarBadge(rec.esg_pillar) },
                      ]}
                    >
                      {rec.esg_pillar}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.effortBadge,
                      { backgroundColor: effortColor(rec.effort) + "20" },
                    ]}
                  >
                    <Zap size={11} color={effortColor(rec.effort)} />
                    <Text
                      style={[styles.effortText, { color: effortColor(rec.effort) }]}
                    >
                      {rec.effort} effort
                    </Text>
                  </View>
                </View>
                <Text style={styles.recAction}>{rec.action}</Text>
                <View style={styles.recMeta}>
                  <Leaf size={13} color={COLORS.green} />
                  <Text style={styles.recMetaText}>
                    -{rec.expected_impact_kg_co2} kg CO2
                  </Text>
                  <Clock size={13} color={COLORS.gray} />
                  <Text style={styles.recMetaText}>{rec.timeframe}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* ESG Narrative */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>ESG Narrative</Text>
            <Text style={styles.narrativeText}>
              {sustainabilityReport.esg_narrative}
            </Text>
          </View>

          {/* Next Challenge Suggestion */}
          {sustainabilityReport.next_challenge_suggestion && (
            <LinearGradient
              colors={[COLORS.accent + "30", COLORS.accent + "10"]}
              style={styles.challengeSuggCard}
            >
              <Text style={styles.challengeSuggLabel}>AI Suggested Challenge</Text>
              <Text style={styles.challengeSuggTitle}>
                {sustainabilityReport.next_challenge_suggestion.title}
              </Text>
              <Text style={styles.challengeSuggRationale}>
                {sustainabilityReport.next_challenge_suggestion.rationale}
              </Text>
            </LinearGradient>
          )}

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: COLORS.white,
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "bold", color: COLORS.dark },

  periodRow: {
    flexDirection: "row", paddingHorizontal: 16, gap: 8, marginBottom: 12,
  },
  periodBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.white, alignItems: "center",
    borderWidth: 1, borderColor: "transparent",
  },
  periodBtnActive: { backgroundColor: COLORS.primary + "15", borderColor: COLORS.primary },
  periodText: { fontSize: 13, color: COLORS.gray, fontWeight: "600" },
  periodTextActive: { color: COLORS.primary },

  loadingBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16 },
  loadingText: { fontSize: 14, color: COLORS.gray, textAlign: "center", paddingHorizontal: 32 },

  emptyBox: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: COLORS.gray, textAlign: "center" },

  scroll: { flex: 1, paddingHorizontal: 16 },

  equivCard: { borderRadius: 20, padding: 20, marginBottom: 14 },
  equivTitle: { fontSize: 14, fontWeight: "bold", color: COLORS.dark, marginBottom: 14 },
  equivRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 14 },
  equivItem: { alignItems: "center" },
  equivNum: { fontSize: 22, fontWeight: "900", color: COLORS.dark },
  equivLabel: { fontSize: 11, color: COLORS.gray, marginTop: 2 },
  costRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  costText: { fontSize: 13, color: COLORS.dark },
  costHighlight: { fontWeight: "bold", color: COLORS.green },

  section: {
    backgroundColor: COLORS.white, borderRadius: 18, padding: 18, marginBottom: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
  },
  sectionTitle: { fontSize: 15, fontWeight: "bold", color: COLORS.dark, marginBottom: 12 },
  summaryText: { fontSize: 14, color: COLORS.dark, lineHeight: 22 },
  narrativeText: { fontSize: 13, color: COLORS.dark, lineHeight: 21 },

  recCard: {
    backgroundColor: COLORS.grayLight, borderRadius: 14, padding: 14, marginBottom: 10,
  },
  recHeader: { flexDirection: "row", gap: 8, marginBottom: 8 },
  pillarBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  pillarText: { fontSize: 11, fontWeight: "900" },
  effortBadge: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
  },
  effortText: { fontSize: 11, fontWeight: "600" },
  recAction: { fontSize: 14, fontWeight: "600", color: COLORS.dark, marginBottom: 8 },
  recMeta: { flexDirection: "row", alignItems: "center", gap: 6 },
  recMetaText: { fontSize: 12, color: COLORS.gray },

  challengeSuggCard: { borderRadius: 18, padding: 18, marginBottom: 14 },
  challengeSuggLabel: { fontSize: 12, color: COLORS.orange, fontWeight: "600", marginBottom: 6 },
  challengeSuggTitle: { fontSize: 16, fontWeight: "bold", color: COLORS.dark, marginBottom: 8 },
  challengeSuggRationale: { fontSize: 13, color: COLORS.dark, lineHeight: 20 },
});
