import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ArrowRight, Pencil, Leaf } from "lucide-react-native";
import ModeIcon from "./ModeIcon";
import { elevation as ELEVATION, getGlass, gradients } from "../lib/theme/tokens";
import { PressableScale } from "./ui";

/**
 * CommuteHomeCard — Stage 2 of the customer-journey PDF.
 *
 * The bottom card on the Map screen. Two responsibilities:
 *   1. A Today / Tomorrow segmented toggle (default Tomorrow — the app
 *      nudges planning ahead).
 *   2. The day's plan state:
 *        - no plan  → "{Day}'s commute" + big "Plan your ride" CTA
 *        - planned  → mode emoji + distance + CO₂ summary + "Change plan"
 *
 * Presentational: all data + handlers come from the Map screen. Kept off
 * the 1900-line index.tsx so the bottom card can evolve independently
 * (Phase 4 swaps the CTA target from the full-screen modal to the
 * PlanRideSheet).
 */

export type PlanDay = "today" | "tomorrow";

export interface PlannedRideSummary {
  modeId: string | null;
  modeLabel: string;
  distanceKm: number | null;
  co2SavedKg: number | null;
}

interface Props {
  targetDay: PlanDay;
  onChangeDay: (day: PlanDay) => void;
  plan: PlannedRideSummary | null;
  onPlanRide: () => void;
  onChangePlan: () => void;
  isDark?: boolean;
  /** Reports the card stack's measured height so the Map can lift the
   *  My-Location FAB clear of it (heights differ by plan/no-plan state). */
  onHeightChange?: (height: number) => void;
}

const COLORS = {
  surface: "#FFFFFF",
  surfaceDark: "#0E1F23",
  ink: "#0B1A1F",
  inkDark: "#FFFFFF",
  inkSoft: "#5A6A6F",
  inkSoftDark: "#8B989C",
  cyan: "#00565A",
  teal: "#003D40",
  leaf: "#059669",
  track: "#EDF1F2",
  trackDark: "#1B3035",
};

export default function CommuteHomeCard({
  targetDay,
  onChangeDay,
  plan,
  onPlanRide,
  onChangePlan,
  isDark = false,
  onHeightChange,
}: Props) {
  const ink = isDark ? COLORS.inkDark : COLORS.ink;
  const inkSoft = isDark ? COLORS.inkSoftDark : COLORS.inkSoft;
  const track = isDark ? COLORS.trackDark : COLORS.track;

  const g = getGlass(isDark);
  // Frosted surface (over the 3D map) with a lit top edge.
  const glassLayer = (radius: number) => (
    <>
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
        <BlurView intensity={g.intensity + 20} tint={g.tint} style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { borderRadius: radius, borderWidth: StyleSheet.hairlineWidth, borderColor: g.stroke, borderTopColor: g.highlight },
        ]}
      />
    </>
  );

  const dayWord = targetDay === "today" ? "Today" : "Tomorrow";
  const dayPossessive = targetDay === "today" ? "Today's" : "Tomorrow's";

  const selectDay = (day: PlanDay) => {
    if (day === targetDay) return;
    Haptics.selectionAsync().catch(() => undefined);
    onChangeDay(day);
  };

  return (
    <View
      style={styles.wrap}
      pointerEvents="box-none"
      onLayout={(e) => onHeightChange?.(e.nativeEvent.layout.height)}
    >
      {/* Today / Tomorrow toggle */}
      <View style={styles.toggle} accessibilityRole="tablist">
        {glassLayer(999)}
        {(["today", "tomorrow"] as PlanDay[]).map((day) => {
          const active = day === targetDay;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.toggleSeg, active && styles.toggleSegActive]}
              onPress={() => selectDay(day)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={day === "today" ? "Plan for today" : "Plan for tomorrow"}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: active ? "#FFFFFF" : inkSoft },
                ]}
              >
                {day === "today" ? "Today" : "Tomorrow"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* The card itself */}
      <View style={styles.card}>
        {glassLayer(26)}
        {plan ? (
          // ── Planned state ───────────────────────────────────────────────
          <View style={styles.plannedRow}>
            <View style={styles.planEmojiWrap}>
              <ModeIcon mode={plan.modeId} size={26} color={COLORS.cyan} />
            </View>
            <View style={styles.planInfo}>
              {/* One line each on narrow phones: shrink slightly rather than
                  wrap the eyebrow or truncate "Carpool · 13.6…" (iPhone SE). */}
              <Text
                style={[styles.planEyebrow, { color: inkSoft }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {dayPossessive} commute
              </Text>
              <Text
                style={[styles.planMode, { color: ink }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
              >
                {plan.modeLabel}
                {plan.distanceKm != null ? `  ·  ${plan.distanceKm.toFixed(1)} km` : ""}
              </Text>
              <View style={styles.planCo2Row}>
                <Leaf size={13} color={COLORS.leaf} />
                <Text style={[styles.planCo2, { color: COLORS.leaf }]}>
                  {plan.co2SavedKg != null && plan.co2SavedKg > 0
                    ? `${plan.co2SavedKg.toFixed(2)} kg CO₂ saved`
                    : "Zero-emission trip"}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={[styles.changeBtn, { borderColor: track }]}
              onPress={onChangePlan}
              accessibilityRole="button"
              accessibilityLabel="Change your plan"
              hitSlop={8}
            >
              <Pencil size={14} color={inkSoft} />
              <Text style={[styles.changeText, { color: inkSoft }]}>Change</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // ── No-plan state ───────────────────────────────────────────────
          <>
            <View style={styles.emptyHeader}>
              <Text style={[styles.emptyEyebrow, { color: inkSoft }]}>
                {dayPossessive} commute
              </Text>
              <Text style={[styles.emptyTitle, { color: ink }]}>
                How are you getting to work?
              </Text>
            </View>
            <PressableScale
              style={styles.planBtn}
              onPress={onPlanRide}
              haptic
              accessibilityRole="button"
              accessibilityLabel={`Plan your ride for ${dayWord.toLowerCase()}`}
            >
              <LinearGradient
                colors={["#16323A", COLORS.ink]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 18 }]}
              />
              <Text style={styles.planBtnText}>Plan your ride</Text>
              <LinearGradient colors={gradients.brand} style={styles.planBtnIcon}>
                <ArrowRight size={18} color="#FFFFFF" />
              </LinearGradient>
            </PressableScale>
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    bottom: 100,
    left: 16,
    right: 16,
    gap: 10,
    zIndex: 30,
  },
  toggle: {
    flexDirection: "row",
    alignSelf: "center",
    borderRadius: 999,
    padding: 4,
    gap: 4,
    // Lift the toggle crisply off the map (was washed-out / translucent).
    borderWidth: 1,
    borderColor: "rgba(11,26,31,0.06)",
    boxShadow: ELEVATION.light.e3,
  },
  toggleSeg: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 96,
    alignItems: "center",
  },
  toggleSegActive: {
    // Strong brand fill so the selected day pops.
    backgroundColor: COLORS.teal,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 26,
    padding: 18,
    boxShadow: ELEVATION.light.e4,
  },

  // Empty (no plan) state
  emptyHeader: {
    gap: 2,
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  emptyEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  emptyTitle: {
    fontSize: 19,
    fontWeight: "700",
    letterSpacing: -0.3,
  },
  planBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#0B1A1F",
    borderRadius: 18,
    paddingLeft: 22,
    paddingRight: 6,
    height: 56,
    boxShadow: "0px 2px 4px rgba(11,26,31,0.16), 0px 12px 26px rgba(11,26,31,0.24)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.10)",
  },
  planBtnText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  planBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0px 1px 2px rgba(255,255,255,0.35), 0px 4px 10px rgba(0,86,90,0.45)",
  },

  // Planned state
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  planEmojiWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(0,86,90,0.12)",
    boxShadow: "inset 0px 2px 3px rgba(255,255,255,0.8), inset 0px -3px 6px rgba(0,86,90,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  planInfo: {
    flex: 1,
    gap: 2,
  },
  planEyebrow: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  planMode: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  planCo2Row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 2,
  },
  planCo2: {
    fontSize: 12,
    fontWeight: "600",
  },
  changeBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1.5,
  },
  changeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
