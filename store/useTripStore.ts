import { create } from "zustand";
import { getFuelBaseCO2, FUEL_CO2_FACTORS } from "../lib/commuteUtils";

// CO2 data (kg CO₂/km) aligned with DEFRA/EEA/IPCC standards.
// Mode labels match transport_label values stored in the rides table.
const TRANSPORT_CO2_DATA: Record<string, number> = {
  "Walking":               0.000,
  "Cycling":               0.000,
  "E-Bike / Scooter":      0.023,
  "Electric Bike/Scooter": 0.023,
  "Public Transport":      0.040,
  "Carpool":               0.096, // petrol car ÷ 2 occupants
  "Ridesharing (2 people)":0.096,
  // Fuel-specific solo car modes — resolved dynamically via getFuelBaseCO2()
  "Car (Petrol)":          FUEL_CO2_FACTORS.petrol,
  "Car (Gasoline)":        FUEL_CO2_FACTORS.petrol,
  "Car (Diesel)":          FUEL_CO2_FACTORS.diesel,
  "Car (Hybrid)":          FUEL_CO2_FACTORS.hybrid,
  "Car (PHEV)":            FUEL_CO2_FACTORS.phev,
  "Car (Electric)":        FUEL_CO2_FACTORS.electric,
  "Car (Electric BEV)":    FUEL_CO2_FACTORS.electric,
  "Car (LPG)":             FUEL_CO2_FACTORS.lpg,
  "Car (Hydrogen)":        FUEL_CO2_FACTORS.hydrogen,
  "Car (CNG)":             FUEL_CO2_FACTORS.cng,
};

interface TripState {
  selectedMode: string;
  distance: number;
  co2Saved: number;
  /** User's personal CO₂ baseline (kg/km), derived from their car's fuel type. */
  userBaseline: number;

  setSelectedMode: (mode: string) => void;
  setDistance: (distance: number) => void;
  /** Set baseline directly from a numeric factor. */
  setUserBaseline: (baseline: number) => void;
  /** Set baseline from a fuel type id (e.g. "diesel", "electric"). */
  setUserBaselineFromFuelType: (fuelType: string | null | undefined) => void;
  calculateSavings: (distanceKm: number, modeName: string) => number;
  reset: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  selectedMode: "Carpool",
  distance: 0,
  co2Saved: 0,
  userBaseline: FUEL_CO2_FACTORS.petrol, // conservative default until profile loaded

  setSelectedMode: (mode) => set({ selectedMode: mode }),
  setDistance: (distance) => set({ distance }),
  setUserBaseline: (baseline) => set({ userBaseline: baseline }),

  setUserBaselineFromFuelType: (fuelType) =>
    set({ userBaseline: getFuelBaseCO2(fuelType) }),

  calculateSavings: (distanceKm, modeName) => {
    const { userBaseline } = get();
    const modeCo2 = TRANSPORT_CO2_DATA[modeName] ?? userBaseline;
    const saved = Math.max(0, (userBaseline - modeCo2) * distanceKm);
    const roundedSaved = Math.round(saved * 1000) / 1000;
    set({ co2Saved: roundedSaved, distance: distanceKm, selectedMode: modeName });
    return roundedSaved;
  },

  reset: () => set({
    selectedMode: "Carpool",
    distance: 0,
    co2Saved: 0,
  }),
}));

/** Resolve CO₂ factor for any transport label. */
export const getTransportCO2 = (modeName: string): number =>
  TRANSPORT_CO2_DATA[modeName] ?? FUEL_CO2_FACTORS.petrol;
