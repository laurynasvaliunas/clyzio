import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { ArrowRight, Pencil, Leaf } from "lucide-react-native";

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
}

const COLORS = {
  surface: "#FAF7EF",
  surfaceDark: "#0E1F23",
  ink: "#0B1A1F",
  inkDark: "#FAF7EF",
  inkSoft: "#5A6A6F",
  inkSoftDark: "#8B989C",
  cyan: "#26C6DA",
  teal: "#003D40",
  leaf: "#5B8F5B",
  track: "#E8E3D7",
  trackDark: "#1B2E33",
};

// Transport-mode → emoji. Mirrors the planner's mode ids so a saved ride
// renders the right glyph in the summary.
const MODE_EMOJI: Record<string, string> = {
  walking: "🚶",
  bike: "🚲",
  ebike: "⚡🚲",
  escooter: "⚡🛵",
  scooter: "🛵",
  motorbike: "🏍️",
  motorcycle: "🏍️",
  public: "🚌",
  taxi: "🚕",
  my_car: "🚗",
  car: "🚗",
  carpool: "👥",
  wfh: "🏠",
};

function emojiFor(modeId: string | null): string {
  if (!modeId) return "🧭";
  return MODE_EMOJI[modeId] ?? "🧭";
}

export default function CommuteHomeCard({
  targetDay,
  onChangeDay,
  plan,
  onPlanRide,
  onChangePlan,
  isDark = false,
}: Props) {
  const surface = isDark ? COLORS.surfaceDark : COLORS.surface;
  const ink = isDark ? COLORS.inkDark : COLORS.ink;
  const inkSoft = isDark ? COLORS.inkSoftDark : COLORS.inkSoft;
  const track = isDark ? COLORS.trackDark : COLORS.track;

  const dayWord = targetDay === "today" ? "Today" : "Tomorrow";
  const dayPossessive = targetDay === "today" ? "Today's" : "Tomorrow's";

  const selectDay = (day: PlanDay) => {
    if (day === targetDay) return;
    Haptics.selectionAsync().catch(() => undefined);
    onChangeDay(day);
  };

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {/* Today / Tomorrow toggle */}
      <View style={[styles.toggle, { backgroundColor: track }]} accessibilityRole="tablist">
        {(["today", "tomorrow"] as PlanDay[]).map((day) => {
          const active = day === targetDay;
          return (
            <TouchableOpacity
              key={day}
              style={[styles.toggleSeg, active && { backgroundColor: surface }]}
              onPress={() => selectDay(day)}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={day === "today" ? "Plan for today" : "Plan for tomorrow"}
            >
              <Text
                style={[
                  styles.toggleText,
                  { color: active ? ink : inkSoft },
                ]}
              >
                {day === "today" ? "Today" : "Tomorrow"}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* The card itself */}
      <View style={[styles.card, { backgroundColor: surface }]}>
        {plan ? (
          // ── Planned state ───────────────────────────────────────────────
          <View style={styles.plannedRow}>
            <View style={styles.planEmojiWrap}>
              <Text style={styles.planEmoji}>{emojiFor(plan.modeId)}</Text>
            </View>
            <View style={styles.planInfo}>
              <Text style={[styles.planEyebrow, { color: inkSoft }]}>
                {dayPossessive} commute
              </Text>
              <Text style={[styles.planMode, { color: ink }]} numberOfLines={1}>
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
            <TouchableOpacity
              style={styles.planBtn}
              onPress={onPlanRide}
              activeOpacity={0.9}
              accessibilityRole="button"
              accessibilityLabel={`Plan your ride for ${dayWord.toLowerCase()}`}
            >
              <Text style={styles.planBtnText}>Plan your ride</Text>
              <View style={styles.planBtnIcon}>
                <ArrowRight size={18} color={COLORS.ink} />
              </View>
            </TouchableOpacity>
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
  },
  toggleSeg: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 999,
    minWidth: 96,
    alignItems: "center",
  },
  toggleText: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  card: {
    borderRadius: 26,
    padding: 18,
    shadowColor: "#0B1A1F",
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
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
  },
  planBtnText: {
    color: "#FAF7EF",
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  planBtnIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#26C6DA",
    alignItems: "center",
    justifyContent: "center",
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
    backgroundColor: "rgba(38,198,218,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  planEmoji: {
    fontSize: 26,
  },
  planInfo: {
    flex: 1,
    gap: 2,
  },
  planEyebrow: {
    fontSize: 10,
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
