import { useState, useCallback, useMemo } from "react";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from "react-native";
import { Check } from "lucide-react-native";

/**
 * CommuteMixEditor — "which modes do you use on which days?".
 *
 * The answer produces `commuting_habits` + a weighted `baseline_co2` (kg/km),
 * which is the denominator for every saving the app reports. It is used in two
 * places, so it lives here instead of being duplicated:
 *   - app/setup/week.tsx  — first-run step 4 of 5
 *   - app/(tabs)/profile.tsx — editable later, inside ProfileEditor's save
 *
 * Controlled: the host owns `habits` and persists them. `computeBaseline` is
 * exported so both hosts derive the number the same way.
 */

const COLORS = {
  surface: "#FFFFFF",
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  primary: "#00565A",
  tint: "#E6F1F2",
  border: "#EDF1F2",
  white: "#FFFFFF",
};

const DAYS = ["M", "T", "W", "T", "F", "S", "S"];

export interface TransportMode {
  id: string;
  name: string;
  co2: number;
  emoji: string;
}

export interface CommuteHabit {
  modeId: string;
  days: boolean[];
}

/** Per-km CO₂ by mode (kg). Mirrors lib/commuteUtils FUEL_CO2_FACTORS. */
export const TRANSPORT_OPTIONS: TransportMode[] = [
  { id: "wfh", name: "Working from home", co2: 0, emoji: "🏠" },
  { id: "walking", name: "Walking", co2: 0, emoji: "🚶" },
  { id: "bike", name: "Bike/Scooter", co2: 0, emoji: "🚴" },
  { id: "ebike", name: "E-Bike/Scooter", co2: 0.023, emoji: "⚡" },
  { id: "moto_gas", name: "Motorbike", co2: 0.09, emoji: "🏍️" },
  { id: "car_gas", name: "Car (Gasoline)", co2: 0.192, emoji: "🚗" },
  { id: "car_diesel", name: "Car (Diesel)", co2: 0.171, emoji: "🚙" },
  { id: "car_hybrid", name: "Car (Hybrid)", co2: 0.12, emoji: "🔋" },
  { id: "car_hydrogen", name: "Car (Hydrogen)", co2: 0.02, emoji: "💧" },
  { id: "car_electric", name: "Car (Electric)", co2: 0.032, emoji: "⚡" },
  { id: "public", name: "Public Transport", co2: 0.04, emoji: "🚌" },
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
      <Text style={styles.modeEmoji}>{mode.emoji}</Text>
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
            <TouchableOpacity
              key={index}
              style={[styles.dayBubble, isActive && styles.dayBubbleActive]}
              onPress={() => onToggleDay(index)}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`Day ${index + 1}${isActive ? ", selected" : ""}`}
            >
              {isActive ? (
                <Check size={18} color={COLORS.white} />
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
}: {
  habits: CommuteHabit[];
  onChange: (habits: CommuteHabit[]) => void;
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
        contentContainerStyle={styles.modeCardsContainer}
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
    borderRadius: 16,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  modeCardSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.tint },
  modeCardHasData: { borderColor: COLORS.primary },
  modeEmoji: { fontSize: 28, marginBottom: 6 },
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
    borderRadius: 10,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  daysBadgeSelected: { backgroundColor: COLORS.primary },
  daysBadgeText: { fontSize: 11, fontWeight: "700", color: COLORS.inkSoft },
  daysBadgeTextSelected: { color: COLORS.white },
  daySelector: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
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
    borderRadius: 20,
    backgroundColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBubbleActive: { backgroundColor: COLORS.primary },
  dayText: { fontSize: 14, fontWeight: "600", color: COLORS.inkSoft },
});
