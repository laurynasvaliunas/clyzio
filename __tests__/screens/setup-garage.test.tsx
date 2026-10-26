import React from "react";
import { render, fireEvent, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import GarageSetupScreen from "../../app/setup/garage";
import { averageBaseline, computeBaseline } from "../../components/CommuteMixEditor";
import { FUEL_FACTORS, MODE_FACTORS } from "../../lib/emissionFactors";

// Setup step "What do you travel with?": public transport, taxi and walking
// are full options next to the vehicles. The picks set the CO₂ baseline (their
// average — setup no longer asks for days) and go straight to Done.

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => ({}),
}));

const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();

/** Records profiles.update payloads. */
function spyOnProfileUpdate() {
  const update = jest.fn();
  fromMock.mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    chain.eq = jest.fn().mockResolvedValue({ error: null });
    chain.update = update.mockImplementation(() => chain);
    return chain;
  });
  return update;
}

afterEach(() => {
  fromMock.mockImplementation(defaultFrom);
  mockPush.mockReset();
});

const OPTIONS = [
  "Public transport",
  "Car",
  "Bike",
  "E-bike / E-scooter",
  "Walking",
  "Taxi",
  "Motorcycle / Moped",
  "Other, no motor",
];

describe("Setup - what do you travel with", () => {
  it("offers all 8 options as equal cards, with no skip link", () => {
    const { getByLabelText, queryByText } = render(<GarageSetupScreen />);
    for (const label of OPTIONS) {
      expect(getByLabelText(label).props.accessibilityRole).toBe("checkbox");
    }
    expect(queryByText("I only use public transport or taxi")).toBeNull();
  });

  it("saves only vehicles to the garage, averages the picks into the baseline and finishes", async () => {
    const update = spyOnProfileUpdate();
    const { getByLabelText } = render(<GarageSetupScreen />);

    fireEvent.press(getByLabelText("Car"));
    fireEvent.press(getByLabelText("Public transport"));
    fireEvent.press(getByLabelText("Next, continue to confirmation"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    const saved = update.mock.calls[0][0];
    expect(saved.vehicles).toHaveLength(1);
    expect(saved.vehicles[0]).toMatchObject({ type: "car", fuel_type: "petrol" });
    expect(saved.baseline_co2).toBeCloseTo((MODE_FACTORS.public.kgPerKm + FUEL_FACTORS.petrol.kgPerKm) / 2);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/setup/done", params: { modes: "public,car_gas" } });
  });

  it("lets a taxi-only commuter continue with an empty garage", async () => {
    const update = spyOnProfileUpdate();
    const { getByLabelText } = render(<GarageSetupScreen />);

    fireEvent.press(getByLabelText("Taxi"));
    fireEvent.press(getByLabelText("Next, continue to confirmation"));

    await waitFor(() => expect(mockPush).toHaveBeenCalled());
    expect(update.mock.calls[0][0]).toMatchObject({ vehicles: [], primary_vehicle_id: null });
    expect(update.mock.calls[0][0].baseline_co2).toBeCloseTo(0.12);
    expect(mockPush).toHaveBeenCalledWith({ pathname: "/setup/done", params: { modes: "taxi" } });
  });
});

describe("Baselines", () => {
  it("averages picked modes equally and ignores unknown ids", () => {
    expect(averageBaseline(["walking", "car_gas", "hovercraft"])).toBeCloseTo(0.096);
    expect(averageBaseline([])).toBeNull();
  });

  it("counts taxi days in the weekly mix at the taxi factor", () => {
    const weekdays = [true, true, true, true, true, false, false];
    expect(computeBaseline([{ modeId: "taxi", days: weekdays }])).toBeCloseTo(0.12);
  });
});
