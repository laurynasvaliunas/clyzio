import React from "react";
import { fireEvent, render, screen } from "../utils/test-utils";
import ActivityScreen from "../../app/(tabs)/activity";
import { supabase } from "../../lib/supabase";

const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();

/** Every query answers with no rows. */
function noRides() {
  fromMock.mockImplementation(() => {
    const chain: any = {};
    for (const m of ["select", "eq", "in", "or", "gte", "lte", "neq", "not", "order"]) chain[m] = jest.fn(() => chain);
    chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.single = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.then = (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
    return chain;
  });
}

const mockPush = jest.fn();
jest.mock("expo-router", () => {
  const React = require("react");
  return {
    useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
    useSegments: () => ["(tabs)"],
    useFocusEffect: (cb: () => void) => React.useEffect(cb, [cb]),
    useLocalSearchParams: () => ({}),
  };
});

describe("ActivityScreen", () => {
  beforeEach(() => mockPush.mockClear());
  afterEach(() => fromMock.mockImplementation(defaultFrom));

  it("renders the header and both tabs", () => {
    const { getByText } = render(<ActivityScreen />);
    expect(getByText("Activity")).toBeTruthy();
    expect(getByText("Upcoming")).toBeTruthy();
    expect(getByText("History")).toBeTruthy();
  });

  it("with nothing planned, invites you to share your route and opens Daily Commute", async () => {
    noRides();
    render(<ActivityScreen />);
    expect(await screen.findByText("Nothing planned yet")).toBeTruthy();
    expect(screen.getByText("Share your route, and a colleague might join you")).toBeTruthy();
    fireEvent.press(screen.getByText("Offer / find a ride"));
    expect(mockPush).toHaveBeenCalledWith("/daily-commute");
  });

  it("keeps the history tab's own empty state", async () => {
    noRides();
    render(<ActivityScreen />);
    fireEvent.press(screen.getByText("History"));
    expect(await screen.findByText("No history yet")).toBeTruthy();
    fireEvent.press(screen.getByText("Plan your route"));
    expect(mockPush).toHaveBeenCalledWith("/(tabs)");
  });
});
