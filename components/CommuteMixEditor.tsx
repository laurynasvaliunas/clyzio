import { useState, useCallback, useMemo } from "react";
import { View, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Text } from "./ui/AppText";
import { Check } from "lucide-react-native";
import ModeIcon from "./ModeIcon";
import { depth } from "../lib/theme/tokens";
import { fuelKgPerKm, modeKgPerKm } from "../lib/emissionFactors";

/**
 * CommuteMixEditor — "which modes do you use on which days?".
 *
 * The answer produces `commuting_habits` + a weighted `baseline_co2` (kg/km),
 * which is the denominator for every saving the app reports. First-run setup
 * doesn't ask for days: it stores `averageBaseline` of the modes picked on
 * "What do you travel with?". Profile (app/(tabs)/profile.tsx) hosts this
 * editor so the mix can be refined later, inside ProfileEditor's save.
 *
 * Controlled: the host owns `habits` and persists them.
 */

const COLORS = {
  surface: "#FFFFFF",
  ink: "#0B2540",
  inkSoft: "#5B6B7A",
  primary: "#007C89",
  tint: "#E3FAFB",
  border: "#EEF6F7",
  white: "#FFFFFF",
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export interface TransportMode {
  id: string;
  name: string;
  co2: number;
}

export interface CommuteHabit {
  modeId: string;
  days: boolean[];
}

/**
 * Per-km CO₂ by mode (kg), from lib/emissionFactors (the cited values the
 * server and clyzio.com use).
 * Listed in the design's display order; working from home comes last.
 */
export const TRANSPORT_OPTIONS: TransportMode[] = [
  { id: "public", name: "Public transport", co2: modeKgPerKm("public") },
  { id: "car_gas", name: "Car (Petrol)", co2: fuelKgPerKm("petrol") },
  { id: "car_diesel", name: "Car (Diesel)", co2: fuelKgPerKm("diesel") },
  { id: "car_hybrid", name: "Car (Hybrid)", co2: fuelKgPerKm("hybrid") },
  { id: "car_hydrogen", name: "Car (Hydrogen)", co2: fuelKgPerKm("hydrogen") },
  { id: "car_electric", name: "Car (Electric)", co2: fuelKgPerKm("electric") },
  { id: "bike", name: "Bike", co2: 0 },
  { id: "ebike", name: "E-bike / E-scooter", co2: modeKgPerKm("ebike") },
  { id: "walking", name: "Walking", co2: 0 },
  { id: "taxi", name: "Taxi", co2: modeKgPerKm("taxi") },
  { id: "moto_gas", name: "Motorcycle / Moped", co2: modeKgPerKm("moto") },
  { id: "nomotor", name: "Other, no motor", co2: 0 },
  { id: "wfh", name: "Working from home", co2: 0 },
];

export const emptyDays = (): boolean[] => [false, false, false, false, false, false, false];

/**
 * Weighted per-km baseline across the selected week.
 * Returns null when nothing is selected — callers must NOT invent a number:
 * the app previously fell back to 0.192 (petrol car) and displayed it as
 * "Your Carbon Baseline", which is a fabrication for someone who never
 * answered.
 */
export function computeBaseline(habits: CommuteHabit[]): number | null {
  let totalDays = 0;
  let weightedSum = 0;
  for (const habit of habits) {
    const mode = TRANSPORT_OPTIONS.find((m) => m.id === habit.modeId);
    if (!mode) continue;
    const daysUsed = habit.days.filter(Boolean).length;
    totalDays += daysUsed;
    weightedSum += mode.co2 * daysUsed;
  }
  return totalDays > 0 ? weightedSum / totalDays : null;
}

/**
 * Baseline for a set of modes with no days known (first-run setup): each
 * picked mode counts equally. Null when none of the ids is a known mode.
 */
export function averageBaseline(modeIds: string[]): number | null {
  const known = modeIds
    .map((id) => TRANSPORT_OPTIONS.find((m) => m.id === id))
    .filter((m): m is TransportMode => !!m);
  if (known.length === 0) return null;
  return known.reduce((sum, m) => sum + m.co2, 0) / known.length;
}

export function hasAnyDay(habits: CommuteHabit[]): boolean {
  return habits.some((h) => h.days.some(Boolean));
}

function ModeCard({
  mode,
  isSelected,
  daysCount,
  onPress,
}: {
  mode: TransportMode;
  isSelected: boolean;
  daysCount: number;
  onPress: () => void;
}) {
  const hasData = daysCount > 0;
  return (
    <TouchableOpacity
      style={[
        styles.modeCard,
        isSelected && styles.modeCardSelected,
        hasData && !isSelected && styles.modeCardHasData,
      ]}
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${mode.name}${daysCount > 0 ? `, ${daysCount} days selected` : ""}`}
    >
      {hasData && (
        <View style={[styles.daysBadge, isSelected && styles.daysBadgeSelected]}>
          <Text style={[styles.daysBadgeText, isSelected && styles.daysBadgeTextSelected]}>
            {daysCount}
          </Text>
        </View>
      )}
      <View style={styles.modeIcon}>
        <ModeIcon mode={mode.id} size={26} color={isSelected || hasData ? COLORS.primary : COLORS.inkSoft} />
      </View>
      <Text style={[styles.modeName, isSelected && styles.modeNameSelected]} numberOfLines={2}>
        {mode.name}
      </Text>
      <Text style={[styles.modeCo2, isSelected && styles.modeCo2Selected]}>{mode.co2} kg</Text>
    </TouchableOpacity>
  );
}

function DaySelector({
  modeId,
  modeName,
  selectedDays,
  onToggleDay,
}: {
  modeId: string;
  modeName: string;
  selectedDays: boolean[];
  onToggleDay: (index: number) => void;
}) {
  return (
    <View style={styles.daySelector}>
      <Text style={styles.daySelectorTitle}>
        {modeId === "wfh"
          ? "Tap the days you work from home:"
          : `Tap the days you use ${modeName}:`}
      </Text>
      <View style={styles.dayBubbles}>
        {DAYS.map((day, index) => {
          const isActive = selectedDays[index];
          return (
            <TouchableOpacity hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              key={index}
              style={[styles.dayBubble, isActive && styles.dayBubbleActive]}
              onPress={() => onToggleDay(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Day ${index + 1}${isActive ? ", selected" : ""}`}
            >
              {isActive ? (
                <Check size={18} color="#0B2540" strokeWidth={3} />
              ) : (
                <Text style={styles.dayText}>{day}</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

export default function CommuteMixEditor({
  habits,
  onChange,
  bleed = 0,
}: {
  habits: CommuteHabit[];
  onChange: (habits: CommuteHabit[]) => void;
  /** The parent's horizontal padding: the mode carousel scrolls edge to edge
   *  instead of being clipped mid-card at the padding. */
  bleed?: number;
}) {
  const [selectedModeId, setSelectedModeId] = useState<string | null>(null);

  const getHabitDays = useCallback(
    (modeId: string) => habits.find((h) => h.modeId === modeId)?.days ?? emptyDays(),
    [habits],
  );
  const getDaysCount = useCallback(
    (modeId: string) => getHabitDays(modeId).filter(Boolean).length,
    [getHabitDays],
  );

  const handleModeSelect = useCallback(
    (modeId: string) => {
      if (selectedModeId === modeId) {
        setSelectedModeId(null);
        return;
      }
      setSelectedModeId(modeId);
      if (!habits.find((h) => h.modeId === modeId)) {
        onChange([...habits, { modeId, days: emptyDays() }]);
      }
    },
    [selectedModeId, habits, onChange],
  );

  const toggleDay = useCallback(
    (modeId: string, dayIndex: number) => {
      const existing = habits.find((h) => h.modeId === modeId);
      if (existing) {
        onChange(
          habits.map((h) =>
            h.modeId === modeId
              ? { ...h, days: h.days.map((d, i) => (i === dayIndex ? !d : d)) }
              : h,
          ),
        );
        return;
      }
      const days = emptyDays();
      days[dayIndex] = true;
      onChange([...habits, { modeId, days }]);
    },
    [habits, onChange],
  );

  const selectedMode = useMemo(
    () => TRANSPORT_OPTIONS.find((m) => m.id === selectedModeId) ?? null,
    [selectedModeId],
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginHorizontal: -bleed }}
        contentContainerStyle={[styles.modeCardsContainer, { paddingHorizontal: bleed }]}
      >
        {TRANSPORT_OPTIONS.map((mode) => (
          <ModeCard
            key={mode.id}
            mode={mode}
            isSelected={selectedModeId === mode.id}
            daysCount={getDaysCount(mode.id)}
            onPress={() => handleModeSelect(mode.id)}
          />
        ))}
      </ScrollView>

      {selectedMode && (
        <DaySelector
          modeId={selectedMode.id}
          modeName={selectedMode.name}
          selectedDays={getHabitDays(selectedMode.id)}
          onToggleDay={(index) => toggleDay(selectedMode.id, index)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  modeCardsContainer: { gap: 12, paddingVertical: 12, paddingRight: 8 },
  modeCard: {
    width: 104,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  modeCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.tint, boxShadow: depth.selected },
  modeCardHasData: { borderColor: COLORS.primary },
  modeIcon: { height: 32, justifyContent: "center", marginBottom: 6 },
  modeName: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.ink,
    textAlign: "center",
    marginBottom: 2,
  },
  modeNameSelected: { color: COLORS.primary },
  modeCo2: { fontSize: 11, color: COLORS.inkSoft },
  modeCo2Selected: { color: COLORS.primary },
  daysBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 12,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  daysBadgeSelected: { backgroundColor: "#09E0E8" },
  daysBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.inkSoft },
  daysBadgeTextSelected: { color: "#0B2540" },
  daySelector: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 16,
    marginTop: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  daySelectorTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.ink,
    marginBottom: 12,
  },
  dayBubbles: { flexDirection: "row", justifyContent: "space-between" },
  dayBubble: {
    width: 40,
    height: 40,
    borderRadius: 25,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleActive: { backgroundColor: "#09E0E8", boxShadow: "inset 0px -3px 0px rgba(11,37,64,0.14)" },
  dayText: { fontSize: 14, fontWeight: "600", color: COLORS.inkSoft },
});
