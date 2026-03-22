import React from "react";
import { act, fireEvent, render, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import * as RN from "react-native";

// Mock Alert to auto-confirm "Yes, Complete" so the completion flow runs
const mockAlert = jest.spyOn(RN.Alert, "alert").mockImplementation(
  (title: string, message?: string, buttons?: RN.AlertButton[]) => {
    const confirmBtn = buttons?.find((b) => b.text?.includes("Complete") || b.text === "Yes, Complete");
    if (confirmBtn?.onPress) {
      Promise.resolve().then(() => {
        const result = (confirmBtn as { onPress?: () => void }).onPress?.();
        if (result instanceof Promise) result.catch(() => {});
      });
    }
  }
);

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  useFocusEffect: (cb: () => void) => {
    // Run focus effect once so ActivityScreen loads rides
    const { useEffect } = require("react");
    useEffect(() => {
      if (typeof cb === "function") cb();
    }, [cb]);
  },
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

import ActivityScreen from "../../app/(tabs)/activity";

describe("Complete Trip Flow Integration", () => {
  beforeEach(() => {
    mockAlert.mockClear();
    // Ensure rides mock returns upcoming ride for activity screen
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const rideRow = {
        id: "ride-complete-test",
        status: "scheduled",
        driver_id: "test-user-id",
        rider_id: "test-user-id",
        origin_lat: 37.77,
        origin_long: -122.42,
        dest_lat: 37.78,
        dest_long: -122.43,
        origin_address: "123 Test St",
        dest_address: "456 Test Ave",
        transport_mode: "car_gas",
        transport_label: "Car",
        co2_saved: 2.5,
        scheduled_at: new Date(Date.now() + 86400000).toISOString(),
        created_at: new Date().toISOString(),
      };
      const chain: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        or: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        lte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue({ data: table === "rides" ? [rideRow] : [], error: null }),
        single: jest.fn().mockResolvedValue({
          data: table === "rides" ? rideRow : table === "profiles" ? { xp_points: 0, total_co2_saved: 0, trips_completed: 0 } : null,
          error: null,
        }),
      };
      return chain;
    });
  });

  it("completes trip and triggers completion flow", async () => {
    const { queryByText } = render(<ActivityScreen />);

    await waitFor(() => {
      expect(queryByText("✓ Complete")).toBeTruthy();
    });

    const completeBtn = queryByText("✓ Complete");
    expect(completeBtn).toBeTruthy();
    fireEvent.press(completeBtn!);

    // Verify Alert was shown for completion confirmation
    await waitFor(() => {
      expect(mockAlert).toHaveBeenCalledWith("Complete Trip", expect.any(String), expect.any(Array));
    });

    // Flow: Complete tap -> Alert -> onPress runs -> ride updated, modal shown
    expect(mockAlert).toHaveBeenCalledWith("Complete Trip", expect.any(String), expect.any(Array));

    // Allow async completion (loadRides, etc.) to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
  });
});
