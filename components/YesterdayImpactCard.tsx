import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Leaf, X, ArrowRight } from "lucide-react-native";

/**
 * YesterdayImpactCard — Stage 4 of the customer-journey PDF.
 *
 * A passive next-day re-engagement card surfaced on the Map when the user
 * completed a commute yesterday. Frames the win ("you saved X g vs driving")
 * with a simple comparison bar, and routes to the full stats screen.
 *
 * Presentational — the Map screen owns the data fetch + the dismissed flag
 * (persisted in SecureStore so it shows at most once per day).
 */

const COLORS = {
  surface: "#FAF7EF",
  surfaceDark: "#0E1F23",
  ink: "#0B1A1F",
  inkDark: "#FAF7EF",
  inkSoft: "#5A6A6F",
  inkSoftDark: "#8B989C",
  leaf: "#5B8F5B",
  clay: "#C4623F",
  track: "#E8E3D7",
  trackDark: "#1B2E33",
};

const MODE_LABEL: Record<string, string> = {
  walking: "on foot",
  bike: "by bike",
  ebike: "by e-bike",
  escooter: "by e-scooter",
  scooter: "by scooter",
  motorbike: "by motorbike",
  moto: "by motorbike",
  public: "by public transport",
  taxi: "by taxi",
  my_car: "by car",
  car: "by car",
  carpool: "by carpool",
  wfh: "from home",
};

export interface YesterdayImpact {
  distanceKm: number;
  modeId: string | null;
  co2SavedKg: number;
  /** The car-equivalent CO₂ for the same trip, for the comparison bar. */
  carCo2Kg: number;
}

interface Props {
  impact: YesterdayImpact;
  onSeeImpact: () => void;
  onDismiss: () => void;
  isDark?: boolean;
}

export default function YesterdayImpactCard({ impact, onSeeImpact, onDismiss, isDark = false }: Props) {
  const surface = isDark ? COLORS.surfaceDark : COLORS.surface;
  const ink = isDark ? COLORS.inkDark : COLORS.ink;
  const inkSoft = isDark ? COLORS.inkSoftDark : COLORS.inkSoft;
  const track = isDark ? COLORS.trackDark : COLORS.track;

  const modeText = impact.modeId ? (MODE_LABEL[impact.modeId] ?? "") : "";
  const savedGrams = Math.round(impact.co2SavedKg * 1000);

  // Comparison bar: your trip's CO₂ vs the car-equivalent. Green portion = the
  // share you saved. Guard against divide-by-zero for zero-distance days.
  const carKg = Math.max(impact.carCo2Kg, 0.0001);
  const yourKg = Math.max(carKg - impact.co2SavedKg, 0);
  const savedPct = Math.max(0, Math.min(1, impact.co2SavedKg / carKg));

  return (
    <View style={[styles.card, { backgroundColor: surface }]} accessibilityRole="summary">
      <TouchableOpacity
        style={styles.dismiss}
        onPress={onDismiss}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss yesterday's impact"
      >
        <X size={16} color={inkSoft} />
      </TouchableOpacity>

      <View style={styles.headerRow}>
        <View style={styles.leafWrap}>
          <Leaf size={18} color={COLORS.leaf} />
        </View>
        <Text style={[styles.eyebrow, { color: inkSoft }]}>Yesterday's impact</Text>
      </View>

      <Text style={[styles.headline, { color: ink }]}>
        You commuted {impact.distanceKm.toFixed(1)} km {modeText} and saved{" "}
        <Text style={{ color: COLORS.leaf }}>
          {savedGrams >= 1000 ? `${impact.co2SavedKg.toFixed(2)} kg` : `${savedGrams} g`} CO₂
        </Text>{" "}
        vs. driving.
      </Text>

      {/* Comparison bar */}
      <View style={styles.barWrap}>
        <View style={[styles.barTrack, { backgroundColor: track }]}>
          <View style={[styles.barSaved, { flex: savedPct }]} />
          <View style={[styles.barUsed, { flex: 1 - savedPct }]} />
        </View>
        <View style={styles.barLegend}>
          <Text style={[styles.legendText, { color: COLORS.leaf }]}>
            Saved {impact.co2SavedKg.toFixed(2)} kg
          </Text>
          <Text style={[styles.legendText, { color: inkSoft }]}>
            Car would be {carKg.toFixed(2)} kg
          </Text>
        </View>
      </View>

      <TouchableOpacity
        style={styles.cta}
        onPress={onSeeImpact}
        accessibilityRole="button"
        accessibilityLabel="See your impact"
      >
        <Text style={styles.ctaText}>See your impact</Text>
        <ArrowRight size={16} color={COLORS.leaf} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 22,
    padding: 18,
    gap: 12,
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.18,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  dismiss: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  leafWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: "rgba(91,143,91,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  headline: {
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  barWrap: {
    gap: 6,
  },
  barTrack: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
  },
  barSaved: {
    backgroundColor: "#5B8F5B",
  },
  barUsed: {
    backgroundColor: "transparent",
  },
  barLegend: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  legendText: {
    fontSize: 11,
    fontWeight: "600",
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
  },
  ctaText: {
    color: "#5B8F5B",
    fontSize: 14,
    fontWeight: "700",
  },
});
