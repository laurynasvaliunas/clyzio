import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Plus, Trash2, Check, ChevronDown, Star } from "lucide-react-native";
import {
  Vehicle,
  VehicleType,
  VEHICLE_TYPE_LABELS,
  FUELED_VEHICLE_TYPES,
  makeVehicle,
} from "../lib/vehicles";

const COLORS = {
  primary: "#26C6DA",
  dark: "#003D40",
  gray: "#8B989C",
  grayLight: "#E8E3D7",
  white: "#FAF7EF",
  ink: "#0B1A1F",
};

const FUEL_TYPES = [
  { id: "petrol", label: "Petrol", emoji: "⛽" },
  { id: "diesel", label: "Diesel", emoji: "🛢️" },
  { id: "hybrid", label: "Hybrid", emoji: "⚡⛽" },
  { id: "electric", label: "Electric (BEV)", emoji: "⚡" },
  { id: "phev", label: "Plug-in Hybrid (PHEV)", emoji: "🔌" },
  { id: "lpg", label: "LPG / Autogas", emoji: "🔵" },
  { id: "hydrogen", label: "Hydrogen", emoji: "💧" },
  { id: "cng", label: "CNG (Natural Gas)", emoji: "🟢" },
];

const TYPE_ORDER: VehicleType[] = ["car", "motorcycle", "scooter", "bicycle"];

interface Props {
  vehicles: Vehicle[];
  primaryVehicleId: string | null;
  onChange: (vehicles: Vehicle[], primaryVehicleId: string | null) => void;
}

export default function GarageEditor({ vehicles, primaryVehicleId, onChange }: Props) {
  const [fuelOpenFor, setFuelOpenFor] = useState<string | null>(null);

  const patch = (id: string, fields: Partial<Vehicle>) => {
    onChange(
      vehicles.map((v) => (v.id === id ? { ...v, ...fields } : v)),
      primaryVehicleId,
    );
  };

  const setType = (id: string, type: VehicleType) => {
    const fuel = FUELED_VEHICLE_TYPES.includes(type)
      ? (vehicles.find((v) => v.id === id)?.fuel_type || "petrol")
      : undefined;
    patch(id, { type, fuel_type: fuel });
  };

  const addVehicle = () => {
    const v = makeVehicle("car");
    const next = [...vehicles, v];
    onChange(next, primaryVehicleId ?? v.id);
  };

  const removeVehicle = (id: string) => {
    const next = vehicles.filter((v) => v.id !== id);
    const nextPrimary =
      primaryVehicleId === id ? (next[0]?.id ?? null) : primaryVehicleId;
    onChange(next, nextPrimary);
  };

  const makePrimary = (id: string) => onChange(vehicles, id);

  return (
    <View>
      {vehicles.length === 0 && (
        <Text style={styles.empty}>
          No vehicles yet. Add the car, bike or scooter you commute with.
        </Text>
      )}

      {vehicles.map((v) => {
        const isPrimary = v.id === primaryVehicleId;
        const showFuel = FUELED_VEHICLE_TYPES.includes(v.type);
        return (
          <View key={v.id} style={[styles.card, isPrimary && styles.cardPrimary]}>
            {/* Type chips */}
            <View style={styles.typeRow}>
              {TYPE_ORDER.map((t) => {
                const active = v.type === t;
                return (
                  <TouchableOpacity
                    key={t}
                    style={[styles.typeChip, active && styles.typeChipActive]}
                    onPress={() => setType(v.id, t)}
                    activeOpacity={0.8}
                  >
                    <Text
                      style={[styles.typeChipText, active && styles.typeChipTextActive]}
                    >
                      {VEHICLE_TYPE_LABELS[t]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Make + Model */}
            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Brand</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Toyota"
                  placeholderTextColor={COLORS.gray}
                  value={v.make}
                  onChangeText={(t) => patch(v.id, { make: t })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Model</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Prius"
                  placeholderTextColor={COLORS.gray}
                  value={v.model}
                  onChangeText={(t) => patch(v.id, { model: t })}
                />
              </View>
            </View>

            {/* Fuel (car / motorcycle only) */}
            {showFuel && (
              <View style={{ marginTop: 10 }}>
                <Text style={styles.label}>Fuel Type</Text>
                <TouchableOpacity
                  style={styles.fuelToggle}
                  onPress={() =>
                    setFuelOpenFor(fuelOpenFor === v.id ? null : v.id)
                  }
                  activeOpacity={0.75}
                >
                  <Text style={styles.fuelToggleText}>
                    {(() => {
                      const f = FUEL_TYPES.find((x) => x.id === v.fuel_type);
                      return f ? `${f.emoji} ${f.label}` : "Select fuel type";
                    })()}
                  </Text>
                  <ChevronDown size={16} color={COLORS.gray} />
                </TouchableOpacity>
                {fuelOpenFor === v.id && (
                  <View style={styles.fuelList}>
                    {FUEL_TYPES.map((f) => {
                      const sel = v.fuel_type === f.id;
                      return (
                        <TouchableOpacity
                          key={f.id}
                          style={styles.fuelOption}
                          onPress={() => {
                            patch(v.id, { fuel_type: f.id });
                            setFuelOpenFor(null);
                          }}
                          activeOpacity={0.75}
                        >
                          <Text style={styles.fuelEmoji}>{f.emoji}</Text>
                          <Text
                            style={[
                              styles.fuelLabel,
                              sel && { color: COLORS.primary, fontWeight: "700" },
                            ]}
                          >
                            {f.label}
                          </Text>
                          {sel && <Check size={16} color={COLORS.primary} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            )}

            {/* Color + Plate */}
            <View style={[styles.inputRow, { marginTop: 10 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Color</Text>
                <TextInput
                  style={styles.input}
                  placeholderTextColor={COLORS.gray}
                  value={v.color}
                  onChangeText={(t) => patch(v.id, { color: t })}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Plate</Text>
                <TextInput
                  style={styles.input}
                  autoCapitalize="characters"
                  placeholderTextColor={COLORS.gray}
                  value={v.plate}
                  onChangeText={(t) => patch(v.id, { plate: t })}
                />
              </View>
            </View>

            {/* Footer: primary + remove */}
            <View style={styles.footer}>
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => makePrimary(v.id)}
                activeOpacity={0.8}
                disabled={isPrimary}
              >
                <Star
                  size={14}
                  color={isPrimary ? COLORS.primary : COLORS.gray}
                  fill={isPrimary ? COLORS.primary : "transparent"}
                />
                <Text
                  style={[
                    styles.primaryBtnText,
                    isPrimary && { color: COLORS.primary, fontWeight: "700" },
                  ]}
                >
                  {isPrimary ? "Primary vehicle" : "Set as primary"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => removeVehicle(v.id)}
                hitSlop={8}
                accessibilityLabel="Remove vehicle"
              >
                <Trash2 size={16} color={COLORS.gray} />
              </TouchableOpacity>
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={styles.addBtn} onPress={addVehicle} activeOpacity={0.85}>
        <Plus size={16} color={COLORS.dark} />
        <Text style={styles.addBtnText}>Add a vehicle</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Your primary vehicle is used to estimate the CO₂ you save vs. driving.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { fontSize: 13, color: COLORS.gray, marginBottom: 12, lineHeight: 18 },
  card: {
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    borderRadius: 18,
    padding: 14,
    marginBottom: 12,
  },
  cardPrimary: { borderColor: COLORS.primary },
  typeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  typeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(11,26,31,0.04)",
  },
  typeChipActive: { backgroundColor: COLORS.primary },
  typeChipText: { fontSize: 12, color: COLORS.gray, fontWeight: "600" },
  typeChipTextActive: { color: COLORS.ink },
  inputRow: { flexDirection: "row", gap: 12 },
  label: { fontSize: 12, color: COLORS.gray, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.ink,
  },
  fuelToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fuelToggleText: { fontSize: 14, color: COLORS.ink },
  fuelList: {
    borderWidth: 1,
    borderColor: COLORS.grayLight,
    borderRadius: 12,
    marginTop: 6,
    overflow: "hidden",
  },
  fuelOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fuelEmoji: { fontSize: 16 },
  fuelLabel: { flex: 1, fontSize: 14, color: COLORS.ink },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 14,
  },
  primaryBtn: { flexDirection: "row", alignItems: "center", gap: 6 },
  primaryBtnText: { fontSize: 12, color: COLORS.gray },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.dark,
  },
  hint: {
    fontSize: 12,
    color: COLORS.gray,
    marginTop: 12,
    lineHeight: 16,
  },
});
