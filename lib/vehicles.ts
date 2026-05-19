// ─── Garage / Vehicle model ───────────────────────────────────────────────────
// A user's garage is stored as profiles.vehicles (JSONB array) + a
// profiles.primary_vehicle_id. The primary vehicle keeps the legacy flat
// car_* / baseline_co2 columns in sync so the rest of the CO₂ pipeline
// (TripPlanner, useTripStore, ai-planner, ai-commute-planner edge fn) is
// untouched. CO₂ math per vehicle lives in lib/commuteUtils (getVehicleCO2).

export type VehicleType = "car" | "motorcycle" | "scooter" | "bicycle";

export interface Vehicle {
  /** Stable client-generated id (used as primary_vehicle_id). */
  id: string;
  type: VehicleType;
  make?: string;
  model?: string;
  color?: string;
  plate?: string;
  /** Only meaningful for car / motorcycle. */
  fuel_type?: string;
}

/** Vehicle types that burn fuel and therefore expose a fuel-type picker. */
export const FUELED_VEHICLE_TYPES: VehicleType[] = ["car", "motorcycle"];

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  car: "Car",
  motorcycle: "Motorcycle",
  scooter: "Scooter",
  bicycle: "Bicycle",
};

export function newVehicleId(): string {
  return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeVehicle(type: VehicleType = "car"): Vehicle {
  return {
    id: newVehicleId(),
    type,
    make: "",
    model: "",
    color: "",
    plate: "",
    fuel_type: type === "car" ? "petrol" : undefined,
  };
}

/** Best-effort parse of whatever is stored in profiles.vehicles. */
export function parseVehicles(raw: unknown): Vehicle[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v) => v && typeof v === "object")
    .map((v: any) => ({
      id: String(v.id ?? newVehicleId()),
      type: (["car", "motorcycle", "scooter", "bicycle"].includes(v.type)
        ? v.type
        : "car") as VehicleType,
      make: v.make ?? "",
      model: v.model ?? "",
      color: v.color ?? "",
      plate: v.plate ?? "",
      fuel_type: v.fuel_type ?? undefined,
    }));
}
