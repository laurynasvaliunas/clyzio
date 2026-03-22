import React from "react";
import { fireEvent, render, waitFor } from "../utils/test-utils";
import MapScreen from "../../app/(tabs)";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

describe("Plan Trip Flow Integration", () => {
  it("opens TripPlannerModal when tapping Where to today?", async () => {
    const { getByText } = render(<MapScreen />);

    fireEvent.press(getByText("Where to today?"));

    await waitFor(() => {
      expect(getByText("Plan Trip")).toBeTruthy();
    });
  });
});
