import React from "react";
import { act, fireEvent, render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import MapScreen from "../../app/(tabs)";

// A public-transport trip must draw the route of the option the person picked
// (bus and tram lines, with the walks), not a car route between the two ends.

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
  useSegments: () => ["(tabs)"],
  useFocusEffect: () => {},
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
  Stack: { Screen: ({ children }: { children: React.ReactNode }) => children },
}));

// The planner is replaced by two buttons that hand the Map a finished trip.
const ORIGIN = { lat: 54.6872, lng: 25.2797, description: "Gedimino pr. 9, Vilnius" };
const DESTINATION = { lat: 54.7097, lng: 25.2603, description: "Ozo g. 25, Vilnius" };
// 54.68720,25.27970 → 54.68890,25.27000 (see __tests__/lib/polyline.test.ts).
const TRANSIT_LINE = "_bxlIcmhyCsIr{@";
const mockPlanner: { trip: Record<string, unknown> } = { trip: {} };
jest.mock("../../components/TripPlannerModal", () => {
  const ReactLib = require("react");
  const { TouchableOpacity: Button, Text: Label } = require("react-native");
  return {
    __esModule: true,
    default: ({ onTripStart }: { onTripStart: (trip: unknown) => void }) =>
      ReactLib.createElement(
        Button,
        { onPress: () => onTripStart(mockPlanner.trip) },
        ReactLib.createElement(Label, null, "save trip"),
      ),
  };
});

const trip = (modeId: string, routePolyline: string | null) => ({
  rideId: "ride-1",
  origin: ORIGIN,
  destination: DESTINATION,
  waypoints: [],
  mode: { id: modeId, label: modeId },
  role: "solo",
  routePolyline,
});

const drawnRoute = () =>
  screen
    .UNSAFE_getAllByProps({ testID: "mock-shape-source" })
    .find((n) => n.props.id === "route")?.props.shape.geometry.coordinates as number[][] | undefined;

describe("Map screen, route of the planned trip", () => {
  const fetchMock = jest.fn();
  const directionsCalls = () => fetchMock.mock.calls.filter(([url]) => String(url).includes("/directions/v5/"));

  beforeEach(() => {
    // A user with nothing planned and no saved places: only the trip's own
    // route can ask Mapbox for directions.
    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self, update: self, insert: self, delete: self, eq: self, in: self, or: self,
        gte: self, lte: self, neq: self, not: self, order: self,
        limit: jest.fn().mockResolvedValue({ data: [], error: null }),
        single: jest.fn().mockResolvedValue({ data: null, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
        then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
      });
      return chain;
    });
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ routes: [{ geometry: { coordinates: [[25.2797, 54.6872], [25.27, 54.7], [25.2603, 54.7097]] } }] }),
    });
    (global as any).fetch = fetchMock;
  });

  it("draws the picked public-transport option's own route, without asking for a car route", async () => {
    mockPlanner.trip = trip("public", TRANSIT_LINE);
    render(<MapScreen />);
    fireEvent.press(await screen.findByText("save trip"));

    await waitFor(() => expect(drawnRoute()).toBeDefined());
    const line = drawnRoute()!;
    expect(line).toHaveLength(2);
    expect(line[0][0]).toBeCloseTo(25.2797, 5);
    expect(line[0][1]).toBeCloseTo(54.6872, 5);
    expect(line[1][0]).toBeCloseTo(25.27, 5);
    expect(line[1][1]).toBeCloseTo(54.6889, 5);
    await act(async () => { await Promise.resolve(); });
    expect(directionsCalls()).toHaveLength(0);
  });

  it("falls back to the road route when the option came without one", async () => {
    mockPlanner.trip = trip("public", null);
    render(<MapScreen />);
    fireEvent.press(await screen.findByText("save trip"));

    await waitFor(() => expect(drawnRoute()).toHaveLength(3));
    expect(directionsCalls()).toHaveLength(1);
    expect(directionsCalls()[0][0]).toContain("/mapbox/driving/");
  });

  it("routes through every stop in order and marks each one", async () => {
    const stops = [
      { lat: 54.695, lng: 25.275, description: "School" },
      { lat: 54.702, lng: 25.268, description: "Kindergarten" },
    ];
    mockPlanner.trip = { ...trip("bike", null), waypoints: stops };
    render(<MapScreen />);
    fireEvent.press(await screen.findByText("save trip"));

    await waitFor(() => expect(directionsCalls()).toHaveLength(1));
    expect(directionsCalls()[0][0]).toContain(
      `/mapbox/cycling/${ORIGIN.lng},${ORIGIN.lat};25.275,54.695;25.268,54.702;${DESTINATION.lng},${DESTINATION.lat}?`,
    );
    const markers = screen.UNSAFE_getAllByProps({ testID: "mock-point-annotation" }).map((n) => n.props.id);
    expect(markers).toEqual(expect.arrayContaining(["origin", "waypoint-0", "waypoint-1", "destination"]));
  });

  it("still routes a bike trip along cycling roads, ignoring any transit line", async () => {
    mockPlanner.trip = trip("bike", TRANSIT_LINE);
    render(<MapScreen />);
    fireEvent.press(await screen.findByText("save trip"));

    await waitFor(() => expect(drawnRoute()).toHaveLength(3));
    expect(directionsCalls()[0][0]).toContain("/mapbox/cycling/");
  });
});
