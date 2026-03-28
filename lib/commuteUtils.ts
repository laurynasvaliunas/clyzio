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

export const CAR_CO2 = 0.192;    // kg/km baseline (solo gas car)
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
 * Filters:
 * - Walking excluded if distance > 4 km
 * - Cycling excluded if distance > 20 km
 */
export function computeLocalModes(distKm: number, maxModes = 3): ComputedMode[] {
  const eligible = MODES.filter(m => {
    if (m.id === "walking" && distKm > 4) return false;
    if (m.id === "bike" && distKm > 20) return false;
    return true;
  });

  return eligible.slice(0, maxModes).map(m => {
    const tripCO2 = m.co2PerKm * distKm;
    const carCO2 = CAR_CO2 * distKm;
    const reductionPct = carCO2 > 0 ? Math.round((1 - tripCO2 / carCO2) * 100) : 100;
    const timeMin = Math.round((distKm / m.speedKmh) * 60);
    const monthlySaving = Math.round((CAR_COST - m.costPerKm) * distKm * 2 * WORKING_DAYS);
    return { ...m, tripCO2, reductionPct, timeMin, monthlySaving };
  });
}
