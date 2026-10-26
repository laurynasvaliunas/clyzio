/**
 * Emission factors (kg CO₂e per passenger-km) — the app's single copy.
 *
 * Mirrors the database's transport_mode_catalog and emission_factor tables
 * (migration 055), which the server uses for every ride's CO₂ and the website
 * uses for its ESG inventory, so the app, the server and clyzio.com all count
 * with the same numbers. Change them there and here together;
 * __tests__/lib/emissionFactors.test.ts and supabase/tests/app_web_alignment.sql
 * check both sides.
 */

export interface CitedFactor {
  kgPerKm: number;
  source: string;
}

/** Per transport mode, by the mode ids rides are stored with. */
export const MODE_FACTORS = {
  walking: { kgPerKm: 0, source: "IPCC AR6" },
  bike: { kgPerKm: 0, source: "IPCC AR6" },
  nomotor: { kgPerKm: 0, source: "IPCC AR6" },
  ebike: { kgPerKm: 0.005, source: "EEA 2023" },
  public: { kgPerKm: 0.097, source: "EEA 2023 (bus)" },
  carpool: { kgPerKm: 0.096, source: "DEFRA 2024 (petrol car shared by two)" },
  wfh: { kgPerKm: 0, source: "No commute" },
  taxi: { kgPerKm: 0.12, source: "Clyzio estimate" },
  moto: { kgPerKm: 0.103, source: "DEFRA 2024" },
  my_car: { kgPerKm: 0.192, source: "DEFRA 2024 (petrol)" },
} as const satisfies Record<string, CitedFactor>;

export type ModeId = keyof typeof MODE_FACTORS;

/** Per car fuel type (profiles.car_fuel_type), for driving and carpools. */
export const FUEL_FACTORS = {
  petrol: { kgPerKm: 0.192, source: "DEFRA 2024" },
  diesel: { kgPerKm: 0.171, source: "DEFRA 2024" },
  hybrid: { kgPerKm: 0.11, source: "EEA" },
  phev: { kgPerKm: 0.075, source: "EEA" },
  electric: { kgPerKm: 0.047, source: "DEFRA 2024" },
  lpg: { kgPerKm: 0.162, source: "DEFRA 2024" },
  hydrogen: { kgPerKm: 0.02, source: "IEA" },
  cng: { kgPerKm: 0.157, source: "DEFRA 2024" },
} as const satisfies Record<string, CitedFactor>;

export type FuelId = keyof typeof FUEL_FACTORS;

export const modeKgPerKm = (id: ModeId): number => MODE_FACTORS[id].kgPerKm;
export const fuelKgPerKm = (id: FuelId): number => FUEL_FACTORS[id].kgPerKm;
