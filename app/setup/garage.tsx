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
import { friendlyError } from "../../lib/friendlyError";
import { useToast } from "../../contexts/ToastContext";
import {
  type VehicleType,
  makeVehicle,
  VEHICLE_TYPE_LABELS,
  FUELED_VEHICLE_TYPES,
} from "../../lib/vehicles";
import SetupProgress from "../../components/SetupProgress";
import ModeIcon from "../../components/ModeIcon";
import { deriveProfileCarFields, getPrimaryVehicle } from "../../lib/commuteUtils";
import { elevation as ELEVATION } from "../../lib/theme/tokens";
import { GlowBackdrop } from "../../components/ui";

// Ambient light across the top of the screen (decorative).
const GLOW_TOP = { bottom: undefined, height: 420 } as const;

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * Stage 1.2 — "What do you travel with?"
 *
 * The designer's 8 options as equal cards in a 2×4 grid, multi-select:
 * public transport, car, bike, e-bike / e-scooter, walking, taxi,
 * motorcycle / moped, other (no motor). Bus, train and taxi riders are the
 * people most likely to need a lift, so they get full-size cards, not a skip
 * link. Car and Motorcycle reveal an inline fuel-type chip row.
 *
 * Vehicle cards are saved to the garage (profiles.vehicles). Every pick is
 * also handed to the next step as `modes`, so the weekly commute mix opens
 * with those modes already chosen.
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

interface TravelCard {
  /** Commute-mode id used by the weekly mix (car/motorcycle resolve via fuel). */
  id: string;
  label: string;
  /** Garage vehicle the card creates; none for modes you don't own. */
  vehicle?: VehicleType;
}

// Design display order (Clyzio pictogram set 1–8).
const CARDS: TravelCard[] = [
  { id: "public",   label: "Public transport" },
  { id: "car",      label: "Car",                vehicle: "car" },
  { id: "bike",     label: "Bike",               vehicle: "bicycle" },
  { id: "ebike",    label: "E-bike / E-scooter", vehicle: "ebike" },
  { id: "walking",  label: "Walking" },
  { id: "taxi",     label: "Taxi" },
  { id: "moto_gas", label: "Motorcycle / Moped", vehicle: "motorcycle" },
  { id: "nomotor",  label: "Other, no motor" },
];

/** Car fuel → the matching weekly-mix mode. */
const CAR_MIX_MODE: Record<string, string> = {
  petrol: "car_gas",
  diesel: "car_diesel",
  hybrid: "car_hybrid",
  electric: "car_electric",
};

const FUEL_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "petrol",   label: "Petrol" },
  { id: "diesel",   label: "Diesel" },
  { id: "hybrid",   label: "Hybrid" },
  { id: "electric", label: "Electric" },
];

interface Pick {
  card: TravelCard;
  fuel_type?: string;
}

export default function GarageSetupScreen() {
  const router = useRouter();
  const { showToast } = useToast();

  const [picked, setPicked] = useState<Map<string, Pick>>(new Map());
  const [saving, setSaving] = useState(false);

  const togglePick = useCallback((card: TravelCard) => {
    Haptics.selectionAsync().catch(() => undefined);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(card.id)) {
        next.delete(card.id);
      } else {
        next.set(card.id, {
          card,
          fuel_type: card.vehicle && FUELED_VEHICLE_TYPES.includes(card.vehicle) ? "petrol" : undefined,
        });
      }
      return next;
    });
  }, []);

  const setFuel = useCallback((cardId: string, fuel: string) => {
    Haptics.selectionAsync().catch(() => undefined);
    setPicked((prev) => {
      const next = new Map(prev);
      const p = next.get(cardId);
      if (p) next.set(cardId, { ...p, fuel_type: fuel });
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
      // Picks in grid order, so the next step lists them the way they're shown here.
      const picks = CARDS.filter((c) => picked.has(c.id)).map((c) => picked.get(c.id)!);
      // Vehicle cards become garage rows. We don't ask the user for
      // make/model/plate during setup — those are post-setup polish. With no
      // vehicle picked (bus, taxi, walking…) the garage is cleared, and the
      // baseline comes from the weekly mix instead.
      const vehicles = picks
        .filter((p) => p.card.vehicle)
        .map((p) => ({ ...makeVehicle(p.card.vehicle!), fuel_type: p.fuel_type }));
      const primaryId = vehicles[0]?.id ?? null;
      // Keep the legacy flat car_* columns in sync, exactly like
      // ProfileEditor.persistGarage does. Without this the sign-in baseline
      // seeder (app/_layout.tsx, keyed on car_fuel_type) never fired for
      // users who set their vehicle during first-run setup.
      const derived = deriveProfileCarFields(
        getPrimaryVehicle(vehicles, primaryId),
      );
      const { error } = await supabase
        .from("profiles")
        .update({
          vehicles,
          primary_vehicle_id: primaryId,
          car_make: derived.car_make,
          car_model: derived.car_model,
          car_color: derived.car_color,
          car_plate: derived.car_plate,
          car_fuel_type: derived.car_fuel_type,
        })
        .eq("id", user.id);
      if (error) throw error;
      const modes = picks.map((p) =>
        p.card.id === "car" ? CAR_MIX_MODE[p.fuel_type ?? "petrol"] ?? "car_gas" : p.card.id,
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      router.push({ pathname: "/setup/week", params: { modes: modes.join(",") } } as any);
    } catch (err: any) {
      showToast({ title: "Couldn't save", message: friendlyError(err), type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <GlowBackdrop variant="brand" style={GLOW_TOP} />
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
        <SetupProgress current={2} total={5} />
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
            const p = picked.get(card.id);
            const selected = !!p;
            const showsFuel = selected && !!card.vehicle && FUELED_VEHICLE_TYPES.includes(card.vehicle);
            return (
              <View key={card.id} style={styles.gridItem}>
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
                  <View style={styles.cardIcon} accessibilityElementsHidden importantForAccessibility="no">
                    <ModeIcon mode={card.id} size={36} color={selected ? COLORS.selected : COLORS.inkSoft} strokeWidth={1.75} />
                  </View>
                  <Text style={[styles.cardLabel, selected && styles.cardLabelSelected]}>
                    {/* Non-breaking hyphens: "E-bike / E-scooter" wraps at the slash, not mid-word. */}
                    {card.label.replace(/-/g, "\u2011")}
                  </Text>
                </TouchableOpacity>

                {showsFuel && p && (
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
                        const active = p.fuel_type === f.id;
                        return (
                          <TouchableOpacity
                            key={f.id}
                            style={[styles.fuelPillEl, active && styles.fuelPillElActive]}
                            onPress={() => setFuel(card.id, f.id)}
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
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
    // Fits a two-line label ("Motorcycle / Moped"), so every card in the
    // grid has the same height.
    minHeight: 120,
    gap: 8,
    borderWidth: 2,
    borderColor: "transparent",
    position: "relative",
    boxShadow: ELEVATION.light.e2,
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
  cardIcon: {
    height: 42,
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.ink,
    textAlign: "center",
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
