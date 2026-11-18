import React from "react";
import { Text } from "react-native";
import { act, fireEvent, render, screen, waitFor } from "../utils/test-utils";
import TripPlannerModal from "../../components/TripPlannerModal";
import { supabase } from "../../lib/supabase";
import { searchAddresses, type AddressSuggestion } from "../../lib/addressSearch";
import { Alert } from "react-native";
import { useDailyCommuteStore, CarpoolError } from "../../store/useDailyCommuteStore";

// "Plan your route": Passenger instead of Rider, several stops, and the
// greenest option highlighted on its card instead of an insight banner.

jest.mock("../../lib/addressSearch", () => ({
  ...jest.requireActual("../../lib/addressSearch"),
  searchAddresses: jest.fn(),
}));
const search = searchAddresses as jest.Mock;

const ORIGIN = { lat: 54.6872, lng: 25.2797, description: "Gedimino pr. 9, Vilnius" };
const NEAR_DEST = { lat: 54.7097, lng: 25.2603, description: "Ozo g. 25, Vilnius" }; // ~2.8 km
const FAR_DEST = { lat: 54.8, lng: 25.3, description: "Pabradės g. 1, Nemenčinė" }; // ~12.6 km

const place = (title: string, lng: number, lat: number): AddressSuggestion => ({
  id: `address.${title}`,
  place_name: `${title}, Vilnius, Lithuania`,
  title,
  subtitle: "Vilnius, Lithuania",
  coordinates: [lng, lat],
});

/** Focus a field and type into it, as a person would (the list only shows while focused). */
function typeInto(placeholder: string, text: string) {
  const field = screen.getByPlaceholderText(placeholder);
  fireEvent(field, "focus");
  fireEvent.changeText(field, text);
}

/** Let the field's 350 ms search delay pass, then tap the suggestion. */
async function pick(label: string) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 450));
  });
  fireEvent.press(screen.getByLabelText(label));
}

/** Every table answers with nothing (or `profile`); "rides" records what is inserted. */
function mockTables({ profile = null }: { profile?: Record<string, unknown> | null } = {}) {
  const inserted: any[] = [];
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: any = {};
    for (const m of ["select", "update", "delete", "eq", "in", "or", "gte", "lte", "neq", "not", "order"]) {
      chain[m] = jest.fn(() => chain);
    }
    chain.limit = jest.fn().mockResolvedValue({ data: [], error: null });
    chain.single = jest.fn().mockResolvedValue({ data: table === "profiles" ? profile : null, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
    chain.then = (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
    if (table === "rides") {
      chain.insert = jest.fn((rows: any[]) => {
        inserted.push(...rows);
        return { select: jest.fn().mockResolvedValue({ data: [{ id: "ride-1" }], error: null }) };
      });
    }
    return chain;
  });
  return inserted;
}

function renderPlanner(dest: typeof NEAR_DEST | null = null) {
  const onTripStart = jest.fn();
  const onClose = jest.fn();
  render(
    <TripPlannerModal
      visible
      onClose={onClose}
      onTripStart={onTripStart}
      initialOrigin={dest ? ORIGIN : undefined}
      initialDest={dest ?? undefined}
    />,
  );
  return { onTripStart, onClose };
}

describe("Plan your route", () => {
  beforeEach(() => {
    search.mockReset();
    search.mockResolvedValue([]);
  });

  it("calls the third role Passenger", async () => {
    mockTables();
    renderPlanner();
    expect(await screen.findByText("Passenger")).toBeTruthy();
    expect(screen.getByLabelText("Passenger - Get a ride")).toBeTruthy();
    expect(screen.queryByText("Rider")).toBeNull();
  });

  it("adds several stops, removes any of them, and stops at five", async () => {
    mockTables();
    renderPlanner();

    fireEvent.press(await screen.findByText("Add Stop (like Kindergarten / School)"));
    expect(screen.getByPlaceholderText("School / Kindergarten stop")).toBeTruthy();
    fireEvent.press(screen.getByText("Add another stop"));
    fireEvent.press(screen.getByText("Add another stop"));
    expect(screen.getByPlaceholderText("Stop 2")).toBeTruthy();
    expect(screen.getByPlaceholderText("Stop 3")).toBeTruthy();

    // Typed into the second stop, then the first one goes: the second keeps its text.
    fireEvent.changeText(screen.getByPlaceholderText("Stop 2"), "Kindergarten");
    fireEvent.press(screen.getByLabelText("Remove stop 1"));
    expect(screen.getByDisplayValue("Kindergarten")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Stop 3")).toBeNull();
    expect(screen.getAllByLabelText(/^Remove stop \d$/)).toHaveLength(2);

    fireEvent.press(screen.getByText("Add another stop"));
    fireEvent.press(screen.getByText("Add another stop"));
    fireEvent.press(screen.getByText("Add another stop"));
    expect(screen.getAllByLabelText(/^Remove stop \d$/)).toHaveLength(5);
    expect(screen.queryByText("Add another stop")).toBeNull();
  });

  it("saves every stop, in order, with the trip", async () => {
    const inserted = mockTables();
    const { onTripStart } = renderPlanner(FAR_DEST);

    search.mockImplementation(async (text: string) =>
      text.startsWith("Mokyklos") ? [place("Mokyklos g. 1", 25.285, 54.70)]
      : text.startsWith("Darželio") ? [place("Darželio g. 2", 25.29, 54.75)]
      : []);
    fireEvent.press(await screen.findByText("Add Stop (like Kindergarten / School)"));
    typeInto("School / Kindergarten stop", "Mokyklos");
    await pick("Mokyklos g. 1, Vilnius, Lithuania");

    fireEvent.press(screen.getByText("Add another stop"));
    typeInto("Stop 2", "Darželio");
    await pick("Darželio g. 2, Vilnius, Lithuania");

    // A third stop left empty is not saved.
    fireEvent.press(screen.getByText("Add another stop"));

    fireEvent.press(screen.getByText("Bike"));
    fireEvent.press(await screen.findByText("Go with Bike"));

    await waitFor(() => expect(onTripStart).toHaveBeenCalled());
    const stops = [
      { lat: 54.70, lng: 25.285, description: "Mokyklos g. 1, Vilnius, Lithuania" },
      { lat: 54.75, lng: 25.29, description: "Darželio g. 2, Vilnius, Lithuania" },
    ];
    expect(JSON.parse(inserted[0].waypoints)).toEqual(stops);
    expect(onTripStart.mock.calls[0][0].waypoints).toEqual(stops);
  });

  it("saves no stops when none were added", async () => {
    const inserted = mockTables();
    const { onTripStart } = renderPlanner(FAR_DEST);
    fireEvent.press(await screen.findByText("Bike"));
    fireEvent.press(await screen.findByText("Go with Bike"));
    await waitFor(() => expect(onTripStart).toHaveBeenCalled());
    expect(inserted[0].waypoints).toBeNull();
    expect(onTripStart.mock.calls[0][0].waypoints).toEqual([]);
  });

  it("asks which vehicle right under the Car card, not at the end of the list", async () => {
    mockTables({
      profile: {
        car_fuel_type: "petrol",
        vehicles: [
          { id: "v1", type: "car", make: "Toyota", model: "Corolla", fuel_type: "petrol" },
          { id: "v2", type: "car", make: "Tesla", model: "Model 3", fuel_type: "electric" },
        ],
        primary_vehicle_id: "v1",
        share_pickup_address: true,
        company_id: null,
      },
    });
    renderPlanner(FAR_DEST);
    expect(screen.queryByText("Which vehicle?")).toBeNull();

    fireEvent.press(await screen.findByText("Car"));
    expect(await screen.findByText("Which vehicle?")).toBeTruthy();

    // On screen, top to bottom: the Car card, the vehicle chips, then the next mode.
    const texts = screen.UNSAFE_getAllByType(Text).map((n) => [n.props.children].flat().join(""));
    const car = texts.indexOf("Car");
    const question = texts.indexOf("Which vehicle?");
    const bike = texts.indexOf("Bike");
    expect(car).toBeGreaterThan(-1);
    // Only the Car card's own CO₂ figure sits between its name and the question.
    expect(texts.slice(car + 1, question)).toEqual([expect.stringMatching(/CO₂$/)]);
    expect(texts.slice(question + 1, bike)).toEqual(["Toyota Corolla", "Tesla Model 3"]);

    // Choosing another mode hides it again.
    fireEvent.press(screen.getByText("Bike"));
    expect(screen.queryByText("Which vehicle?")).toBeNull();
  });

  it("replaces a carpool day that has two confirmed passengers: cancels each, then saves", async () => {
    mockTables();
    const invoke = jest.fn().mockResolvedValue({ data: { ok: true }, error: null });
    (supabase as any).functions = { invoke };
    const submitIntent = jest.fn()
      .mockRejectedValueOnce(new CarpoolError("has_confirmed_ride", "ride-a"))
      .mockRejectedValueOnce(new CarpoolError("has_confirmed_ride", "ride-b"))
      .mockResolvedValueOnce(undefined);
    useDailyCommuteStore.setState({ submitIntent });
    const alert = jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
      buttons?.find((b) => b.text === "Cancel it and continue")?.onPress?.();
    });
    const { onClose } = renderPlanner(FAR_DEST);

    fireEvent.press(await screen.findByText("Driver"));
    fireEvent.press(await screen.findByText("Offer ride"));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invoke.mock.calls.map(([name, opts]) => [name, opts.body])).toEqual([
      ["cancel-ride", { ride_id: "ride-a" }],
      ["cancel-ride", { ride_id: "ride-b" }],
    ]);
    expect(submitIntent).toHaveBeenCalledTimes(3);
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
  });

  it("highlights the greenest option for the distance instead of an insight banner", async () => {
    mockTables();
    renderPlanner(NEAR_DEST);
    expect(await screen.findByLabelText(/^Walking, .*greenest option$/)).toBeTruthy();
    expect(screen.getAllByText("Greenest option")).toHaveLength(1);
    expect(screen.queryByText(/Best green option/)).toBeNull();
  });

  it("picks the bike as the greenest option for a longer trip", async () => {
    mockTables();
    renderPlanner(FAR_DEST);
    expect(await screen.findByLabelText(/^Bike, .*greenest option$/)).toBeTruthy();
    expect(screen.queryByLabelText(/^Walking, .*greenest option$/)).toBeNull();
  });
});
