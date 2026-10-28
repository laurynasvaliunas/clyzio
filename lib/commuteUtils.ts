// ─── Shared Commute Utilities ─────────────────────────────────────────────────
// Used by: app/(tabs)/ai-planner.tsx, components/TripPlannerModal.tsx

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

import { FUEL_FACTORS, MODE_FACTORS } from "./emissionFactors";

// ─── Fuel-Type CO₂ Factors ────────────────────────────────────────────────────
// kg CO₂e per km for an average passenger car, from lib/emissionFactors (the
// same cited values the server and clyzio.com use).
export const FUEL_CO2_FACTORS: Record<string, number> = Object.fromEntries(
  Object.entries(FUEL_FACTORS).map(([id, f]) => [id, f.kgPerKm]),
);

/**
 * Returns the CO₂ emission factor (kg/km) for a given fuel type id.
 * Falls back to the petrol baseline if the fuel type is unknown or not set.
 */
export function getFuelBaseCO2(fuelType?: string | null): number {
  if (!fuelType) return FUEL_CO2_FACTORS.petrol;
  return FUEL_CO2_FACTORS[fuelType] ?? FUEL_CO2_FACTORS.petrol;
}

/**
 * Human-readable label for a fuel type's CO₂ factor for display in UI.
 * e.g. "0.047 kg CO₂/km" for an electric car.
 */
export function fuelCO2Label(fuelType?: string | null): string {
  const factor = getFuelBaseCO2(fuelType);
  return `${factor} kg CO₂/km`;
}

// ─── Vehicle (garage) CO₂ ─────────────────────────────────────────────────────
import type { Vehicle } from "./vehicles";

// Non-car vehicle factors (kg CO₂e/km).
export const MOTO_CO2 = MODE_FACTORS.moto.kgPerKm;      // DEFRA 2024 — average motorcycle
export const ESCOOTER_CO2 = MODE_FACTORS.ebike.kgPerKm; // the app's e-bike / e-scooter mode

// Public-transit sub-mode factors (kg CO₂e/passenger-km, EEA 2023).
// KEEP IN SYNC with supabase/functions/transit-routes/transit.ts (Deno can't
// import this RN module) and the database's emission_factor rows (kind
// 'transit', migration 060), which credit the saved trip.
export const TRANSIT_CO2_FACTORS: Record<string, number> = {
  bus: 0.097,
  trolleybus: 0.029, // no published trolleybus figure: the electric tram value
  tram: 0.029,
  subway: 0.028,
  rail: 0.035,
};

/** CO₂ factor (kg/km) for a public-transit sub-mode; unknown → bus. */
export function getTransitCO2(submode?: string | null): number {
  return TRANSIT_CO2_FACTORS[submode ?? "bus"] ?? TRANSIT_CO2_FACTORS.bus;
}

/**
 * CO₂ factor (kg/km) for a specific garage vehicle.
 * car/motorcycle → fuel-based; e-bike / e-scooter / scooter → e-scooter;
 * bicycle → 0.
 */
export function getVehicleCO2(v?: Vehicle | null): number {
  if (!v) return FUEL_CO2_FACTORS.petrol;
  switch (v.type) {
    case "car":
      return getFuelBaseCO2(v.fuel_type);
    case "motorcycle":
      return MOTO_CO2;
    case "ebike":
    case "escooter":
    case "scooter":
      return ESCOOTER_CO2;
    case "bicycle":
      return 0;
    default:
      return FUEL_CO2_FACTORS.petrol;
  }
}

/** Resolve the primary vehicle (falls back to first, then null). */
export function getPrimaryVehicle(
  vehicles: Vehicle[] | undefined | null,
  primaryId?: string | null,
): Vehicle | null {
  if (!vehicles || vehicles.length === 0) return null;
  return vehicles.find((v) => v.id === primaryId) ?? vehicles[0];
}

/**
 * Flat profiles.car_* + baseline_co2 derived from the primary vehicle so the
 * legacy CO₂ pipeline keeps working unchanged. Non-car primary → clear car_*
 * and keep the conservative petrol baseline (existing behaviour).
 */
export function deriveProfileCarFields(primary: Vehicle | null): {
  car_make: string | null;
  car_model: string | null;
  car_color: string | null;
  car_plate: string | null;
  car_fuel_type: string | null;
  baseline_co2: number;
} {
  if (primary && primary.type === "car") {
    return {
      car_make: primary.make || null,
      car_model: primary.model || null,
      car_color: primary.color || null,
      car_plate: primary.plate || null,
      car_fuel_type: primary.fuel_type || null,
      baseline_co2: getFuelBaseCO2(primary.fuel_type),
    };
  }
  return {
    car_make: null,
    car_model: null,
    car_color: null,
    car_plate: null,
    car_fuel_type: null,
    baseline_co2: FUEL_CO2_FACTORS.petrol,
  };
}

export interface LocalMode {
  id: string;
  label: string;
  icon: "walk" | "bike" | "bus" | "car" | "carpool";
  co2PerKm: number;    // kg/km
  speedKmh: number;   // average urban speed
  costPerKm: number;  // €/km
  color: string;
  tag: string;
  tagColor: string;
}

export const MODES: LocalMode[] = [
  { id: "walking",  label: "Walking",          icon: "walk",    co2PerKm: 0,     speedKmh: 5,  costPerKm: 0,    color: "#059669", tag: "Zero Emissions", tagColor: "#059669" },
  { id: "bike",     label: "Bike",             icon: "bike",    co2PerKm: 0,     speedKmh: 15, costPerKm: 0,    color: "#D97706", tag: "Most Eco",       tagColor: "#D97706" },
  { id: "ebike",    label: "E-bike / E-scooter", icon: "bike",    co2PerKm: MODE_FACTORS.ebike.kgPerKm, speedKmh: 22, costPerKm: 0.03, color: "#7C3AED", tag: "Fastest Green",  tagColor: "#7C3AED" },
  { id: "public",   label: "Public transport", icon: "bus",     co2PerKm: MODE_FACTORS.public.kgPerKm, speedKmh: 25, costPerKm: 0.05, color: "#0095A3", tag: "Best Balance",   tagColor: "#0095A3" },
  { id: "carpool",  label: "Carpool",          icon: "carpool", co2PerKm: MODE_FACTORS.carpool.kgPerKm, speedKmh: 35, costPerKm: 0.10, color: "#007C89", tag: "Social & Green", tagColor: "#007C89" },
];

// Default fallback (petrol solo car) — use getFuelBaseCO2() for user-specific baseline
export const CAR_CO2 = FUEL_CO2_FACTORS.petrol;  // 0.192 kg/km
export const CAR_COST = 0.30;    // €/km driving alone
export const WORKING_DAYS = 22;  // working days per month

export interface ComputedMode extends LocalMode {
  tripCO2: number;        // kg CO₂ for one trip
  reductionPct: number;   // % reduction vs driving solo
  timeMin: number;        // estimated travel time in minutes
  monthlySaving: number;  // monthly € saving vs driving (round trips)
}

/**
 * Returns eligible transport modes for a given trip distance,
 * enriched with computed CO₂, time, and cost savings.
 *
 * @param distKm        One-way trip distance in km
 * @param maxModes      Maximum number of modes to return (default 3)
 * @param baselineCO2   User's actual car CO₂ factor in kg/km (from getFuelBaseCO2).
 *                      Defaults to petrol baseline (0.192) if not provided.
 *
 * Filters:
 * - Walking excluded if distance > 4 km
 * - Cycling excluded if distance > 20 km
 */
export function computeLocalModes(
  distKm: number,
  maxModes = 3,
  baselineCO2: number = CAR_CO2,
): ComputedMode[] {
  const eligible = MODES.filter(m => {
    if (m.id === "walking" && distKm > 4) return false;
    if (m.id === "bike" && distKm > 20) return false;
    return true;
  });

  return eligible.slice(0, maxModes).map(m => {
    const tripCO2 = m.co2PerKm * distKm;
    const carCO2 = baselineCO2 * distKm;
    const reductionPct = carCO2 > 0 ? Math.round((1 - tripCO2 / carCO2) * 100) : 100;
    const timeMin = Math.round((distKm / m.speedKmh) * 60);
    const monthlySaving = Math.round((CAR_COST - m.costPerKm) * distKm * 2 * WORKING_DAYS);
    return { ...m, tripCO2, reductionPct, timeMin, monthlySaving };
  });
}
