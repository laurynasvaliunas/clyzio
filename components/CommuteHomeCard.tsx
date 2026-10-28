import { View, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./ui/AppText";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { ArrowRight, Pencil, Leaf } from "lucide-react-native";
import ModeIcon from "./ModeIcon";
import { elevation as ELEVATION, getGlass, gradients, fun, depth } from "../lib/theme/tokens";
import { MODE_FACTORS } from "../lib/emissionFactors";
import { PressableScale } from "./ui";

/**
 * CommuteHomeCard — Stage 2 of the customer-journey PDF.
 *
 * The bottom card on the Map screen. Two responsibilities:
 *   1. A Today / Tomorrow segmented toggle (default Tomorrow — the app
 *      nudges planning ahead).
 *   2. The day's plan state:
 *        - no plan  → "{Day}'s commute" + big "Plan your ride" CTA
 *        - planned  → mode icon + distance + CO₂ summary (tap: trip details)
 *                     + "Change" (reopens the planner)
 *
 * Presentational: all data + handlers come from the Map screen. Kept off
 * the 1900-line index.tsx so the bottom card can evolve independently
 * (Phase 4 swaps the CTA target from the full-screen modal to the
 * PlanRideSheet).
 */

export type PlanDay = "today" | "tomorrow";

export interface PlannedRideSummary {
  rideId: string;
  modeId: string | null;
  modeLabel: string;
  distanceKm: number | null;
  co2SavedKg: number | null;
}

/** Walking, bike, no-motor, working from home: nothing emitted at all. */
function isZeroEmissionMode(modeId: string | null): boolean {
  const factor = modeId ? MODE_FACTORS[modeId as keyof typeof MODE_FACTORS] : undefined;
  return factor?.kgPerKm === 0;
}

interface Props {
  targetDay: PlanDay;
  onChangeDay: (day: PlanDay) => void;
  plan: PlannedRideSummary | null;
  onPlanRide: () => void;
  /** Tapping the planned-trip summary: the trip's details. */
  onOpenPlan?: () => void;
  onChangePlan: () => void;
  isDark?: boolean;
  /** Reports the card stack's measured height so the Map can lift the
   *  My-Location FAB clear of it (heights differ by plan/no-plan state). */
  onHeightChange?: (height: number) => void;
}

const COLORS = {
  surface: "#FFFFFF",
  surfaceDark: "#0E1F23",
  ink: "#0B2540",
  inkDark: "#FFFFFF",
  inkSoft: "#5B6B7A",
  inkSoftDark: "#8B989C",
  cyan: "#007C89",
  teal: "#0B2540",
  leaf: "#059669",
  track: "#EEF6F7",
  trackDark: "#1B3035",
};

export default function CommuteHomeCard({
  targetDay,
  onChangeDay,
  plan,
  onPlanRide,
  onOpenPlan,
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

  // "Zero-emission" only when nothing is emitted. A car trip saves nothing
  // against the usual commute, but it isn't zero-emission (an EV still has
  // 0.047 kg/km), so it gets no CO₂ line rather than a wrong one.
  const planDistance = plan?.distanceKm != null ? `  ·  ${plan.distanceKm.toFixed(1)} km` : "";
  const planCo2 = !plan
    ? null
    : plan.co2SavedKg != null && plan.co2SavedKg > 0
      ? `${plan.co2SavedKg.toFixed(2)} kg CO₂ saved`
      : isZeroEmissionMode(plan.modeId)
        ? "Zero-emission trip"
        : null;

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
                  { color: active ? fun.navy : inkSoft },
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
          // The summary opens the trip's details; "Change" (a separate button,
          // not nested) reopens the planner.
          <View style={styles.plannedRow}>
            <PressableScale
              style={styles.planOpen}
              onPress={onOpenPlan}
              disabled={!onOpenPlan}
              haptic
              accessibilityRole="button"
              accessibilityLabel={`${dayPossessive} commute: ${plan.modeLabel}${planDistance.replace("  ·  ", ", ")}${planCo2 ? `, ${planCo2}` : ""}`}
              accessibilityHint="Opens the trip details"
            >
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
                  {planDistance}
                </Text>
                {planCo2 && (
                  <View style={styles.planCo2Row}>
                    <Leaf size={13} color={COLORS.leaf} />
                    <Text style={[styles.planCo2, { color: COLORS.leaf }]}>{planCo2}</Text>
                  </View>
                )}
              </View>
            </PressableScale>
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
                colors={gradients.bright}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[StyleSheet.absoluteFill, { borderRadius: 999 }]}
              />
              <Text style={styles.planBtnText}>Plan your ride</Text>
              <View style={styles.planBtnIcon}>
                <ArrowRight size={20} color={fun.navy} strokeWidth={2.6} />
              </View>
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
    borderColor: "rgba(11,37,64,0.06)",
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
    // The logo's bright cyan so the selected day pops (navy text on it).
    backgroundColor: fun.cyan,
    boxShadow: "inset 0px -2px 0px rgba(11,37,64,0.12)",
  },
  toggleText: {
    fontSize: 14,
    fontWeight: "800",
  },
  card: {
    borderRadius: 30,
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
    backgroundColor: fun.cyan,
    borderRadius: 999,
    paddingLeft: 24,
    paddingRight: 6,
    height: 58,
    boxShadow: depth.ctaGlow,
    borderTopWidth: 1.5,
    borderTopColor: "rgba(255,255,255,0.45)",
  },
  planBtnText: {
    color: fun.navy,
    fontSize: 18,
    fontWeight: "800",
  },
  planBtnIcon: {
    width: 46,
    height: 46,
    borderRadius: 29,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 3px 8px rgba(11,37,64,0.18)",
  },

  // Planned state
  plannedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  planOpen: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  planEmojiWrap: {
    width: 52,
    height: 52,
    borderRadius: 20,
    backgroundColor: "rgba(0,124,137,0.12)",
    boxShadow: "inset 0px 2px 3px rgba(255,255,255,0.8), inset 0px -3px 6px rgba(0,124,137,0.12)",
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
