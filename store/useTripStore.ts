import { create } from "zustand";

// CO2 data from the database (kg CO2 per km)
const TRANSPORT_CO2_DATA: Record<string, number> = {
  "Walking": 0.0,
  "Car (Electric)": 0.032,
  "Electric Bike/Scooter": 0.023,
  "Ridesharing (2 people)": 0.096, // 0.192 / 2
  "Public Transport": 0.04,
  "Car (Gasoline)": 0.192,
};

interface TripState {
  // State
  selectedMode: string;
  distance: number;
  co2Saved: number;
  userBaseline: number; // Default: Car (Gasoline) = 0.192

  // Actions
  setSelectedMode: (mode: string) => void;
  setDistance: (distance: number) => void;
  setUserBaseline: (baseline: number) => void;
  calculateSavings: (distanceKm: number, modeName: string) => number;
  reset: () => void;
}

export const useTripStore = create<TripState>((set, get) => ({
  selectedMode: "Ridesharing (2 people)",
  distance: 0,
  co2Saved: 0,
  userBaseline: 0.192, // Default: Car (Gasoline)

  setSelectedMode: (mode) => set({ selectedMode: mode }),

  setDistance: (distance) => set({ distance }),

  setUserBaseline: (baseline) => set({ userBaseline: baseline }),

  calculateSavings: (distanceKm, modeName) => {
    const { userBaseline } = get();
    
    // Get CO2 per km for the selected mode
    let modeCo2 = TRANSPORT_CO2_DATA[modeName] ?? 0.192;
    
    // Calculate savings: (baseline - mode CO2) * distance
    const saved = Math.max(0, (userBaseline - modeCo2) * distanceKm);
    const roundedSaved = Math.round(saved * 1000) / 1000;

    set({ co2Saved: roundedSaved, distance: distanceKm, selectedMode: modeName });
    return roundedSaved;
  },

  reset: () =>
    set({
      selectedMode: "Ridesharing (2 people)",
      distance: 0,
      co2Saved: 0,
    }),
}));

// Export the CO2 data for use in components
export const getTransportCO2 = (modeName: string): number => {
  return TRANSPORT_CO2_DATA[modeName] ?? 0.192;
};
