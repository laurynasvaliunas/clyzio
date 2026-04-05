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

// ─── Fuel-Type CO₂ Factors ────────────────────────────────────────────────────
// Sources: DEFRA UK GHG Conversion Factors 2024, EEA Transport Emission Factors,
//          IPCC AR6 WG3 Ch.10, GHG Protocol Scope 3 Standard.
// All values in kg CO₂e per km for an average passenger car.
export const FUEL_CO2_FACTORS: Record<string, number> = {
  petrol:   0.192, // DEFRA 2024 — average petrol passenger car
  diesel:   0.171, // DEFRA 2024 — diesel is ~11% more fuel-efficient per km
  hybrid:   0.110, // EEA — self-charging HEV (e.g. Toyota Prius class)
  phev:     0.075, // EEA — PHEV assuming ~50% electric share in real-world use
  electric: 0.053, // EU grid average 2024 (EEA): ~0.233 kgCO₂/kWh × ~0.2 kWh/km
  lpg:      0.162, // DEFRA 2024 — LPG / autogas
  hydrogen: 0.020, // IEA — green hydrogen via electrolysis, renewable energy
  cng:      0.157, // DEFRA 2024 — compressed natural gas
};

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
 * e.g. "Electric — 0.053 kg/km (EU grid 2024)"
 */
export function fuelCO2Label(fuelType?: string | null): string {
  const factor = getFuelBaseCO2(fuelType);
  return `${factor} kg CO₂/km`;
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
  { id: "walking",  label: "Walking",          icon: "walk",    co2PerKm: 0,     speedKmh: 5,  costPerKm: 0,    color: "#4CAF50", tag: "Zero Emissions", tagColor: "#4CAF50" },
  { id: "bike",     label: "Cycling",          icon: "bike",    co2PerKm: 0,     speedKmh: 15, costPerKm: 0,    color: "#FF9800", tag: "Most Eco",       tagColor: "#FF9800" },
  { id: "ebike",    label: "E-Bike / Scooter", icon: "bike",    co2PerKm: 0.023, speedKmh: 22, costPerKm: 0.03, color: "#E91E63", tag: "Fastest Green",  tagColor: "#E91E63" },
  { id: "public",   label: "Public Transport", icon: "bus",     co2PerKm: 0.04,  speedKmh: 25, costPerKm: 0.05, color: "#7C3AED", tag: "Best Balance",   tagColor: "#7C3AED" },
  { id: "carpool",  label: "Carpool",          icon: "carpool", co2PerKm: 0.096, speedKmh: 35, costPerKm: 0.10, color: "#26C6DA", tag: "Social & Green", tagColor: "#26C6DA" },
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
