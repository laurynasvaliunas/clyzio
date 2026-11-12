import React from "react";
import { AppState } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import CommuteHomeCard, { type PlannedRideSummary } from "../../components/CommuteHomeCard";
import MapScreen from "../../app/(tabs)";

// The Map's bottom card for a planned day: tapping the summary opens the
// trip's details (it used to do nothing; only "Change" reacted), and the CO₂
// line no longer calls a car trip "zero-emission".

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

const plan = (over: Partial<PlannedRideSummary> = {}): PlannedRideSummary => ({
  rideId: "ride-1",
  modeId: "my_car",
  modeLabel: "Audi A6 etron",
  distanceKm: 12.2,
  co2SavedKg: 0,
  ...over,
});

function renderCard(p: PlannedRideSummary) {
  const onOpenPlan = jest.fn();
  const onChangePlan = jest.fn();
  render(
    <CommuteHomeCard
      targetDay="tomorrow"
      onChangeDay={jest.fn()}
      plan={p}
      onPlanRide={jest.fn()}
      onOpenPlan={onOpenPlan}
      onChangePlan={onChangePlan}
    />,
  );
  return { onOpenPlan, onChangePlan };
}

describe("CommuteHomeCard, planned day", () => {
  it("opens the trip from the summary, and Change only reopens the planner", () => {
    const { onOpenPlan, onChangePlan } = renderCard(plan());

    fireEvent.press(screen.getByLabelText(/^Tomorrow's commute: Audi A6 etron, 12\.2 km/));
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
    expect(onChangePlan).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText("Change your plan"));
    expect(onChangePlan).toHaveBeenCalledTimes(1);
    expect(onOpenPlan).toHaveBeenCalledTimes(1);
  });

  it("doesn't call a car trip with no saving zero-emission", () => {
    renderCard(plan());
    expect(screen.queryByText("Zero-emission trip")).toBeNull();
    expect(screen.queryByText(/kg CO₂ saved/)).toBeNull();
  });

  it("calls a bike or walking trip zero-emission", () => {
    renderCard(plan({ modeId: "bike", modeLabel: "Bike", co2SavedKg: 0 }));
    expect(screen.getByText("Zero-emission trip")).toBeTruthy();
  });

  it("shows the saving when there is one", () => {
    renderCard(plan({ modeId: "public", modeLabel: "Public transport", co2SavedKg: 1.234 }));
    expect(screen.getByText("1.23 kg CO₂ saved")).toBeTruthy();
    expect(screen.queryByText("Zero-emission trip")).toBeNull();
  });
});

describe("Map screen, planned trip", () => {
  beforeEach(() => {
    mockPush.mockClear();
    // Tomorrow's planned ride for the signed-in user; every other table empty.
    const ride = {
      id: "ride-42",
      transport_mode: "my_car",
      transport_label: "Audi A6 etron",
      distance_km: 12.2,
      co2_saved: 0,
      scheduled_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      status: "scheduled",
      driver_id: null,
      rider_id: "test-user-id",
    };
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const rows = table === "rides" ? [ride] : [];
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, update: self, insert: self, delete: self, eq: self, in: self, or: self,
        gte: self, lte: self, neq: self, not: self, order: self, is: self,
        limit: jest.fn().mockResolvedValue({ data: rows, error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
      });
      return chain;
    });
  });

  it("opens the planned trip's details from the bottom card", async () => {
    render(<MapScreen />);

    const summary = await waitFor(() => screen.getByLabelText(/^Tomorrow's commute: Audi A6 etron/));
    fireEvent.press(summary);

    expect(mockPush).toHaveBeenCalledWith("/trip/ride-42");
  });

  // Seen on a phone left open since 28 October: two weeks later the Map still
  // said "Wednesday, 28 Oct" and showed that day's plan.
  it("follows the calendar when the app is reopened on a later day", async () => {
    const headerDate = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    const rideLookups = () => (supabase.from as jest.Mock).mock.calls.filter(([table]) => table === "rides").length;
    const onAppState = jest.spyOn(AppState, "addEventListener");
    // Only the clock is faked; timers and promises run as usual.
    jest.useFakeTimers({
      now: new Date(2026, 9, 28, 18, 0),
      doNotFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "setImmediate", "clearImmediate", "nextTick", "queueMicrotask", "requestAnimationFrame", "cancelAnimationFrame", "performance"],
    });

    try {
      render(<MapScreen />);
      await waitFor(() => screen.getByLabelText(/^Tomorrow's commute: Audi A6 etron/));
      expect(screen.getByText(headerDate(new Date(2026, 9, 28)))).toBeTruthy();
      const lookupsOnTheFirstDay = rideLookups();

      jest.setSystemTime(new Date(2026, 10, 12, 8, 0));
      act(() => {
        onAppState.mock.calls.filter(([event]) => event === "change").forEach(([, listener]) => listener("active"));
      });

      await waitFor(() => expect(screen.getByText(headerDate(new Date(2026, 10, 12)))).toBeTruthy());
      await waitFor(() => expect(rideLookups()).toBeGreaterThan(lookupsOnTheFirstDay));
    } finally {
      jest.useRealTimers();
      onAppState.mockRestore();
    }
  });
});
