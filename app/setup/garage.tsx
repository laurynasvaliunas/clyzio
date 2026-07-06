import { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import { Check, ChevronDown, ArrowRight, ArrowLeft } from "lucide-react-native";

import { supabase } from "../../lib/supabase";
import { useToast } from "../../contexts/ToastContext";
import {
  type VehicleType,
  makeVehicle,
  VEHICLE_TYPE_LABELS,
  FUELED_VEHICLE_TYPES,
} from "../../lib/vehicles";
import SetupProgress from "../../components/SetupProgress";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Stage 1.2 — "What do you travel with?"
 *
 * 6 large cards in a 2×3 grid. Tap to select (multiple allowed). Selected
 * cards get a check + tint. Tapping Car or Motorcycle reveals an inline
 * fuel-type chip row below the card (no new screen).
 *
 * "I only use public transport or taxi" skip link clears any garage state
 * and proceeds straight to Done.
 */

const COLORS = {
  bg: "#F7F9FA",
  surface: "#FFFFFF",
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  border: "#EDF1F2",
  selected: "#003D40",   // teal — selected card border + check pill
  selectedTint: "#E6F1F2",
  fuelPill: "#E6F1F2",
  fuelPillActive: "#003D40",
};

interface VehicleCard {
  type: VehicleType;
  emoji: string;
  label: string;
}

const CARDS: VehicleCard[] = [
  { type: "car",        emoji: "🚗",   label: "Car" },
  { type: "motorcycle", emoji: "🏍️",  label: "Motorcycle" },
  { type: "bicycle",    emoji: "🚲",   label: "Bike" },
  { type: "scooter",    emoji: "🛵",   label: "Scooter" },
  { type: "ebike",      emoji: "⚡🚲",  label: "E-Bike" },
  { type: "escooter",   emoji: "⚡🛵",  label: "E-Scooter" },
];

const FUEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "petrol",   label: "Petrol" },
  { id: "diesel",   label: "Diesel" },
  { id: "hybrid",   label: "Hybrid" },
  { id: "electric", label: "Electric" },
];

interface PickedVehicle {
  type: VehicleType;
  fuel_type?: string;
}

export default function GarageSetupScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [picked, setPicked] = useState<Map<VehicleType, PickedVehicle>>(new Map());
  const [saving, setSaving] = useState(false);

  const togglePick = useCallback((card: VehicleCard) => {
    Haptics.selectionAsync().catch(() => undefined);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(card.type)) {
        next.delete(card.type);
      } else {
        next.set(card.type, {
          type: card.type,
          fuel_type: FUELED_VEHICLE_TYPES.includes(card.type) ? "petrol" : undefined,
        });
      }
      return next;
    });
  }, []);

  const setFuel = useCallback((type: VehicleType, fuel: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setPicked((prev) => {
      const next = new Map(prev);
      const v = next.get(type);
      if (v) next.set(type, { ...v, fuel_type: fuel });
      return next;
    });
  }, []);

  const canProceed = useMemo(() => picked.size > 0, [picked]);

  const handleNext = async () => {
    if (!canProceed) return;
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        showToast({ title: "Please sign in first", message: "We couldn't find your session.", type: "error" });
        router.replace("/(auth)/login" as any);
        return;
      }
      // Translate each picked card into a Vehicle row. We don't ask the user
      // for make/model/plate during setup — those are post-setup polish.
      const vehicles = Array.from(picked.values()).map((p) => ({
        ...makeVehicle(p.type),
        fuel_type: p.fuel_type,
      }));
      const primaryId = vehicles[0]?.id ?? null;
      const { error } = await supabase
        .from("profiles")
        .update({
          vehicles,
          primary_vehicle_id: primaryId,
        })
        .eq("id", user.id);
      if (error) throw error;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      router.push("/setup/done" as any);
    } catch (err: any) {
      showToast({ title: "Couldn't save", message: err?.message ?? "Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleSkipNoVehicle = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      // Clear garage; baseline will emerge from logged trips.
      await supabase
        .from("profiles")
        .update({ vehicles: [], primary_vehicle_id: null })
        .eq("id", user.id);
      router.push("/setup/done" as any);
    } catch (err: any) {
      showToast({ title: "Couldn't save", message: err?.message ?? "Please try again.", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <View style={styles.headerRow}>
        <TouchableOpacity
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.backButton}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <ArrowLeft size={22} color={COLORS.ink} />
        </TouchableOpacity>
        <SetupProgress current={2} total={4} />
        <View style={styles.backButton} />
      </View>

      <View style={styles.header}>
        <Text style={styles.heading} accessibilityRole="header">
          What do you travel with?
        </Text>
        <Text style={styles.subhead}>
          Pick everything you use. We use this to estimate your CO₂.
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.gridScroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.grid}>
          {CARDS.map((card) => {
            const selected = picked.has(card.type);
            const v = picked.get(card.type);
            const showsFuel = selected && FUELED_VEHICLE_TYPES.includes(card.type);
            return (
              <View key={card.type} style={styles.gridItem}>
                <TouchableOpacity
                  style={[styles.card, selected && styles.cardSelected]}
                  onPress={() => togglePick(card)}
                  activeOpacity={0.85}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                  accessibilityLabel={card.label}
                >
                  {selected && (
                    <View style={styles.cardCheck}>
                      <Check size={12} color={COLORS.surface} />
                    </View>
                  )}
                  <Text style={styles.cardEmoji} accessibilityElementsHidden importantForAccessibility="no">
                    {card.emoji}
                  </Text>
                  <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                    {card.label}
                  </Text>
                </TouchableOpacity>

                {showsFuel && v && (
                  <View style={styles.fuelRow} accessibilityLabel={`Fuel type for ${card.label}`}>
                    <View style={styles.fuelRowHeader}>
                      <Text style={styles.fuelLabel}>Fuel type</Text>
                      <ChevronDown size={12} color={COLORS.inkSoft} />
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.fuelPills}
                    >
                      {FUEL_OPTIONS.map((f) => {
                        const active = v.fuel_type === f.id;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[styles.fuelPillEl, active && styles.fuelPillElActive]}
                            onPress={() => setFuel(card.type, f.id)}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={f.label}
                          >
                            <Text style={[styles.fuelPillText, active && styles.fuelPillTextActive]}>
                              {f.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.skipLink}
          onPress={handleSkipNoVehicle}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="I only use public transport or taxi"
        >
          <Text style={styles.skipText}>I only use public transport or taxi</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.next, !canProceed && styles.nextDisabled]}
          onPress={handleNext}
          disabled={!canProceed || saving}
          accessibilityRole="button"
          accessibilityState={{ disabled: !canProceed || saving }}
          accessibilityLabel="Next, continue to confirmation"
        >
          {saving ? (
            <ActivityIndicator color={COLORS.surface} />
          ) : (
            <>
              <Text style={styles.nextText}>Next</Text>
              <ArrowRight size={18} color={COLORS.surface} />
            </>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  backButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 6,
  },
  heading: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "700",
    letterSpacing: -0.3,
    color: COLORS.ink,
  },
  subhead: {
    fontSize: 14,
    color: COLORS.inkSoft,
    lineHeight: 19,
  },
  gridScroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    // rowGap only — a column `gap` plus 48%+48% widths exceeded 100% and forced
    // a single column. space-between spreads the gutter horizontally instead.
    rowGap: 12,
  },
  gridItem: {
    width: "48%",
    gap: 0,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 22,
    padding: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 120,
    gap: 10,
    borderWidth: 2,
    borderColor: "transparent",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    position: "relative",
  },
  cardSelected: {
    borderColor: COLORS.selected,
    backgroundColor: COLORS.selectedTint,
  },
  cardCheck: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.selected,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEmoji: {
    fontSize: 40,
    lineHeight: 46,
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.ink,
  },
  cardLabelSelected: {
    color: COLORS.selected,
  },
  fuelRow: {
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
    gap: 6,
  },
  fuelRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  fuelLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.inkSoft,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  fuelPills: {
    flexDirection: "row",
    gap: 6,
  },
  fuelPillEl: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.fuelPill,
    borderRadius: 999,
  },
  fuelPillElActive: {
    backgroundColor: COLORS.fuelPillActive,
  },
  fuelPillText: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.inkSoft,
  },
  fuelPillTextActive: {
    color: COLORS.surface,
  },
  skipLink: {
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 24,
    marginTop: 8,
  },
  skipText: {
    fontSize: 14,
    color: COLORS.inkSoft,
    textDecorationLine: "underline",
  },
  footer: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  next: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.ink,
    paddingVertical: 18,
    borderRadius: 999,
    minHeight: 56,
  },
  nextDisabled: {
    opacity: 0.4,
  },
  nextText: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
