import React from "react";
import { Alert } from "react-native";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { render, fireEvent, waitFor } from "../utils/test-utils";
import DailyCommuteScreen from "../../app/daily-commute";
import {
  useDailyCommuteStore,
  stepFor,
  CarpoolError,
  type TripIntentMatch,
} from "../../store/useDailyCommuteStore";
import { pickupHint, pickupMapUrl } from "../../components/PickupDetails";
import { dayLabel, localISODate } from "../../lib/localDate";
import { supabase } from "../../lib/supabase";

// Migration 053: one carpool lifecycle — riders along the driver's route with
// the pickup shown before deciding, stop looking, cancel and plan again.

const sb = supabase as any;
const invoke = jest.fn();
const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();
const rpcMock = supabase.rpc as jest.Mock;
// The real store actions: showStep() swaps some for mocks.
const initialStore = useDailyCommuteStore.getState();

beforeAll(() => {
  sb.functions = { invoke };
  sb.channel = jest.fn(() => {
    const ch: Record<string, jest.Mock> = {};
    ch.on = jest.fn(() => ch);
    ch.subscribe = jest.fn(() => ch);
    return ch;
  });
  sb.removeChannel = jest.fn();
});

afterEach(() => {
  invoke.mockReset();
  fromMock.mockImplementation(defaultFrom);
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ data: null, error: null });
  jest.restoreAllMocks();
  useDailyCommuteStore.setState(initialStore, true);
});

const offer = (over: Partial<TripIntentMatch> = {}): TripIntentMatch =>
  ({
    id: "m1",
    driver_intent_id: "di",
    passenger_intent_id: "pi",
    driver_user_id: "test-user-id",
    passenger_user_id: "rasa",
    trip_date: "2026-10-27",
    ai_compatibility_score: 88,
    ai_reasoning: "On the driver's route: 4 min walk to the pickup, 7.8 km together.",
    proposed_departure: "08:00",
    proposed_pickup_time: "08:12",
    proposed_dropoff_time: "08:31",
    pickup_lat: 54.687,
    pickup_long: 25.28,
    pickup_address: "Gedimino pr. 9, Vilnius, Lithuania",
    pickup_kind: "route",
    walk_to_pickup_m: 320,
    detour_km: 0,
    detour_min: 0,
    dropoff_lat: 54.7,
    dropoff_long: 25.3,
    dropoff_address: "Konstitucijos pr. 7, Vilnius",
    walk_from_dropoff_m: 150,
    shared_km: 7.8,
    detour_preference: null,
    custom_pickup_lat: null,
    custom_pickup_long: null,
    driver_approved: false,
    passenger_approved: false,
    status: "pending",
    ride_id: null,
    created_at: "2026-10-26T08:00:00Z",
    updated_at: "2026-10-26T08:00:00Z",
    passenger_profile: { first_name: "Rasa" },
    driver_profile: { first_name: "Tomas" },
    ...over,
  }) as TripIntentMatch;

const intent = (over: Record<string, unknown> = {}) => ({
  id: "pi",
  user_id: "test-user-id",
  role: "passenger",
  passenger_capacity: null,
  departure_time: "08:05:00",
  required_arrival_time: null,
  trip_date: localISODate(),
  home_lat: 54.68,
  home_long: 25.27,
  work_lat: 54.7,
  work_long: 25.3,
  status: "pending",
  generation: 2,
  created_at: "2026-10-26T08:00:00Z",
  ...over,
});

/** supabase.from() returning these rows per table (awaitable or via .limit()). */
function mockTables(rows: Record<string, unknown[]>) {
  const calls: Record<string, jest.Mock[]> = {};
  fromMock.mockImplementation((table: string) => {
    const data = rows[table] ?? [];
    const c: any = { then: (res: any, rej: any) => Promise.resolve({ data, error: null }).then(res, rej) };
    for (const m of ["select", "eq", "in", "gte", "order", "neq"]) c[m] = jest.fn(() => c);
    c.limit = jest.fn(() => Promise.resolve({ data, error: null }));
    c.maybeSingle = jest.fn(() => Promise.resolve({ data: data[0] ?? null, error: null }));
    calls[table] = [c.eq, c.gte];
    return c;
  });
  return calls;
}

function showStep(step: string, matches: TripIntentMatch[], extra: Record<string, unknown> = {}) {
  useDailyCommuteStore.setState({
    step: step as any,
    intent: intent({ role: step.startsWith("driver") ? "driver" : "passenger" }) as any,
    matches,
    outcome: null,
    isLoading: false,
    error: null,
    checkExistingIntent: jest.fn().mockResolvedValue(undefined),
    subscribeToMatches: jest.fn(() => () => undefined),
    ...extra,
  });
}

/** Alert.alert that taps the button with this text. */
function tapAlert(buttonText: string) {
  return jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => {
    buttons?.find((b) => b.text === buttonText)?.onPress?.();
  });
}

// ─── Steps ───────────────────────────────────────────────────────────────────

describe("stepFor", () => {
  it("shows a driver new riders for a free seat even with one confirmed", () => {
    const confirmed = offer({ id: "c", status: "confirmed", driver_approved: true, passenger_approved: true, ride_id: "r" });
    expect(stepFor("driver", [confirmed, offer()])).toBe("driver_review");
    expect(stepFor("driver", [confirmed])).toBe("driver_confirmed");
    expect(stepFor("driver", [offer({ driver_approved: true, status: "awaiting_other" })])).toBe("driver_waiting");
    expect(stepFor("driver", [])).toBe("driver_submitted");
  });

  it("walks a rider from searching to confirmed", () => {
    expect(stepFor("passenger", [])).toBe("passenger_submitted");
    expect(stepFor("passenger", [offer()])).toBe("passenger_review");
    expect(stepFor("passenger", [offer({ passenger_approved: true, status: "awaiting_other" })])).toBe("passenger_waiting");
    expect(stepFor("passenger", [offer({ status: "confirmed", ride_id: "r" })])).toBe("passenger_confirmed");
  });
});

describe("checkExistingIntent", () => {
  it("loads a trip planned for today, not only tomorrow", async () => {
    const calls = mockTables({ trip_intents: [intent()], trip_intent_matches: [] });
    await useDailyCommuteStore.getState().checkExistingIntent();
    const s = useDailyCommuteStore.getState();
    expect(s.intent?.id).toBe("pi");
    expect(s.step).toBe("passenger_submitted");
    expect(calls.trip_intents[1]).toHaveBeenCalledWith("trip_date", localISODate());
  });

  it("only counts the trip's current generation and live rides", async () => {
    const calls = mockTables({
      trip_intents: [intent()],
      trip_intent_matches: [offer({ id: "old", status: "confirmed", ride_id: "ride-x", passenger_user_id: "test-user-id" })],
      rides: [{ id: "ride-x", status: "cancelled" }],
    });
    await useDailyCommuteStore.getState().checkExistingIntent();
    expect(calls.trip_intent_matches[0]).toHaveBeenCalledWith("passenger_generation", 2);
    expect(useDailyCommuteStore.getState().matches).toEqual([]);
    expect(useDailyCommuteStore.getState().step).toBe("passenger_submitted");
  });

  it("says when the driver cancelled and matching continues", async () => {
    mockTables({
      trip_intents: [intent()],
      trip_intent_matches: [offer({ status: "cancelled_by_driver", driver_user_id: "tomas", passenger_user_id: "test-user-id" })],
    });
    rpcMock.mockResolvedValue({ data: [{ id: "tomas", first_name: "Tomas" }], error: null });
    await useDailyCommuteStore.getState().checkExistingIntent();
    expect(useDailyCommuteStore.getState().outcome).toEqual({ kind: "partner_cancelled", name: "Tomas" });
  });

  it("offers a new plan once the carpool is done", async () => {
    mockTables({
      trip_intents: [intent({ status: "expired" })],
      trip_intent_matches: [offer({ status: "confirmed", ride_id: "ride-d", passenger_user_id: "test-user-id" })],
      rides: [{ id: "ride-d", status: "completed" }],
    });
    await useDailyCommuteStore.getState().checkExistingIntent();
    const s = useDailyCommuteStore.getState();
    expect(s.step).toBe("role_select");
    expect(s.intent).toBeNull();
    expect(s.outcome).toEqual({ kind: "trip_done", tripDate: localISODate() });
  });
});

describe("submitIntent", () => {
  it("sends the phone's time zone and turns a confirmed-carpool refusal into a CarpoolError", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError({
        status: 409,
        json: async () => ({ error: "conflict", code: "has_confirmed_ride", ride_id: "ride-1" }),
      } as unknown as Response),
    });
    const err = await useDailyCommuteStore.getState().submitIntent({ role: "passenger" }).catch((e) => e);
    expect(err).toBeInstanceOf(CarpoolError);
    expect(err).toMatchObject({ code: "has_confirmed_ride", rideId: "ride-1" });
    expect(invoke).toHaveBeenCalledWith("submit-trip-intent", {
      body: expect.objectContaining({ role: "passenger", tz_offset_minutes: new Date().getTimezoneOffset() }),
    });
  });
});

// ─── Screens ─────────────────────────────────────────────────────────────────

describe("Daily commute - the driver decides with the pickup in front of them", () => {
  it("shows where and when the rider is picked up and dropped off", async () => {
    showStep("driver_review", [offer()]);
    const { findByText, getByText } = render(<DailyCommuteScreen />);
    expect(await findByText("Pickup 08:12 · Gedimino pr. 9")).toBeTruthy();
    expect(getByText("On your route: Rasa walks 4 min")).toBeTruthy();
    expect(getByText("Drop-off 08:31 · Konstitucijos pr. 7")).toBeTruthy();
    expect(getByText("Rasa walks 2 min from there")).toBeTruthy();
    expect(getByText("7.8 km together")).toBeTruthy();
  });

  it("accepts or declines each rider on their own card", async () => {
    const respondAsDriver = jest.fn().mockResolvedValue(undefined);
    showStep("driver_review", [offer(), offer({ id: "m2", passenger_user_id: "ona", passenger_profile: { first_name: "Ona" } })], { respondAsDriver });
    const { findByLabelText, getByLabelText } = render(<DailyCommuteScreen />);

    fireEvent.press(await findByLabelText("Accept Rasa"));
    await waitFor(() => expect(respondAsDriver).toHaveBeenCalledWith({ accepted_ids: ["m1"] }));
    fireEvent.press(getByLabelText("Decline Ona"));
    await waitFor(() => expect(respondAsDriver).toHaveBeenCalledWith({ accepted_ids: [], declined_ids: ["m2"] }));
  });

  it("tells the driver a door pickup's detour", () => {
    const door = offer({ pickup_kind: "door", walk_to_pickup_m: 0, detour_km: 1.6, detour_min: 4 });
    expect(pickupHint(door, "driver", "Rasa")).toBe("At Rasa's door: +1.6 km, about 4 min for you");
    expect(pickupHint(door, "passenger", "Tomas")).toBe("At your door");
    expect(pickupHint(offer(), "passenger", "Tomas")).toBe("On the driver's route: 4 min walk for you");
  });

  it("maps the pickup and drop-off", () => {
    const url = pickupMapUrl(offer(), "pk.test")!;
    expect(url).toContain("pin-s-p+09e0e8(25.28000,54.68700)");
    expect(url).toContain("pin-s-d+0b2540(25.30000,54.70000)");
    expect(url).toContain("access_token=pk.test");
    expect(pickupMapUrl(offer({ pickup_lat: null }), "pk.test")).toBeNull();
    expect(pickupMapUrl(offer(), "")).toBeNull();
  });
});

describe("Daily commute - stop, cancel and plan again", () => {
  it("lets a searching rider stop looking", async () => {
    const stopLooking = jest.fn().mockResolvedValue(undefined);
    showStep("passenger_submitted", [], { stopLooking });
    tapAlert("Stop looking");
    const { findByLabelText } = render(<DailyCommuteScreen />);
    fireEvent.press(await findByLabelText("Stop looking for a carpool"));
    await waitFor(() => expect(stopLooking).toHaveBeenCalled());
  });

  it("cancels a confirmed carpool from Daily Commute", async () => {
    const cancelCarpool = jest.fn().mockResolvedValue(undefined);
    showStep("passenger_confirmed", [offer({ status: "confirmed", ride_id: "ride-9", passenger_user_id: "test-user-id" })], { cancelCarpool });
    tapAlert("Cancel carpool");
    const { findByLabelText } = render(<DailyCommuteScreen />);
    fireEvent.press(await findByLabelText("Cancel the carpool with Tomas"));
    await waitFor(() => expect(cancelCarpool).toHaveBeenCalledWith("ride-9"));
  });

  it("goes straight back to planning after a cancel", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    showStep("passenger_confirmed", [offer({ status: "confirmed", ride_id: "ride-9" })]);
    await useDailyCommuteStore.getState().cancelCarpool("ride-9");
    expect(invoke).toHaveBeenCalledWith("cancel-ride", { body: { ride_id: "ride-9" } });
    expect(useDailyCommuteStore.getState()).toMatchObject({ step: "role_select", intent: null, matches: [] });
  });

  it("tells the rider their driver cancelled while it keeps looking", async () => {
    showStep("passenger_submitted", [], { outcome: { kind: "partner_cancelled", name: "Tomas" } });
    const { findByText } = render(<DailyCommuteScreen />);
    expect(await findByText("Tomas cancelled. We're looking for another match.")).toBeTruthy();
  });
});

describe("dayLabel", () => {
  it("names today, tomorrow and other days", () => {
    const now = new Date(2026, 9, 26, 9, 0);
    expect(dayLabel("2026-10-26", now)).toBe("Today");
    expect(dayLabel("2026-10-27", now)).toBe("Tomorrow");
    expect(dayLabel("2026-10-30", now)).toMatch(/Fri.*30.*Oct/);
  });
});
