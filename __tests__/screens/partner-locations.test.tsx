import React from "react";
import * as Location from "expo-location";
import { render, waitFor, act } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import TripScreen from "../../app/trip/[id]";
import LiveLocationSharer from "../../components/LiveLocationSharer";
import { useLiveShareStore } from "../../store/useLiveShareStore";
import { ageLabel, isLiveWindowOpen, LIVE_LEAD_MS, LIVE_TAIL_MS } from "../../lib/liveLocation";

// Migration 052: matched driver and rider see each other — approximate start
// area before the trip, live positions from 15 min before pickup while the
// app is open.

const sb = supabase as any;
const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();
const getSession = supabase.auth.getSession as jest.Mock;
const defaultGetSession = getSession.getMockImplementation();

beforeAll(() => {
  sb.channel = jest.fn(() => {
    const ch: Record<string, jest.Mock> = {};
    ch.on = jest.fn(() => ch);
    ch.subscribe = jest.fn(() => ch);
    return ch;
  });
  sb.removeChannel = jest.fn();
});

afterEach(() => {
  fromMock.mockImplementation(defaultFrom);
  getSession.mockImplementation(defaultGetSession);
  (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: "granted" });
  (Location.watchPositionAsync as jest.Mock).mockReset().mockResolvedValue({ remove: jest.fn() });
  useLiveShareStore.setState({ sharingRideIds: [], needsPermission: false });
});

/** A thenable query chain: every filter returns itself, awaiting yields `result`. */
function chain(result: unknown, extra: Record<string, unknown> = {}) {
  const c: any = { then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res), ...extra };
  for (const m of ["select", "eq", "or", "not", "in", "gte", "lte", "order"]) c[m] = jest.fn(() => c);
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  return c;
}

describe("live window", () => {
  const pickup = new Date("2026-10-26T08:00:00Z");

  it("opens 15 min before pickup and closes 3 h after", () => {
    expect(isLiveWindowOpen(pickup, pickup.getTime() - LIVE_LEAD_MS - 1)).toBe(false);
    expect(isLiveWindowOpen(pickup, pickup.getTime() - LIVE_LEAD_MS)).toBe(true);
    expect(isLiveWindowOpen(pickup, pickup.getTime() + LIVE_TAIL_MS)).toBe(true);
    expect(isLiveWindowOpen(pickup, pickup.getTime() + LIVE_TAIL_MS + 1)).toBe(false);
    expect(isLiveWindowOpen(null)).toBe(false);
  });

  it("labels how old a position is", () => {
    const now = Date.parse("2026-10-26T08:00:00Z");
    expect(ageLabel("2026-10-26T07:59:55Z", now)).toBe("just now");
    expect(ageLabel("2026-10-26T07:59:20Z", now)).toBe("40 s ago");
    expect(ageLabel("2026-10-26T07:57:00Z", now)).toBe("3 min ago");
  });
});

describe("LiveLocationSharer", () => {
  const upsert = jest.fn().mockResolvedValue({ error: null });

  beforeEach(() => {
    upsert.mockClear();
    getSession.mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
    fromMock.mockImplementation((table: string) =>
      table === "rides" ? chain({ data: [{ id: "ride-1" }], error: null }) : { upsert },
    );
  });

  it("shares this phone's position to a ride whose window is open", async () => {
    let onFix: ((fix: any) => void) | undefined;
    (Location.watchPositionAsync as jest.Mock).mockImplementation(async (_opts, cb) => {
      onFix = cb;
      return { remove: jest.fn() };
    });

    render(<LiveLocationSharer />);
    await waitFor(() => expect(onFix).toBeDefined());
    expect(useLiveShareStore.getState().sharingRideIds).toEqual(["ride-1"]);

    act(() => onFix!({ coords: { latitude: 54.68, longitude: 25.27, heading: 90, accuracy: 8 } }));
    await waitFor(() =>
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ ride_id: "ride-1", user_id: "me", lat: 54.68, lng: 25.27, heading: 90 }),
        { onConflict: "ride_id,user_id" },
      ),
    );
  });

  it("never prompts: without permission it only flags it", async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ status: "denied" });
    render(<LiveLocationSharer />);
    await waitFor(() => expect(useLiveShareStore.getState().needsPermission).toBe(true));
    expect(Location.watchPositionAsync).not.toHaveBeenCalled();
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe("Trip screen - partner location", () => {
  function rideAt(scheduledAt: Date) {
    const ride = {
      id: "test-id",
      status: "scheduled",
      driver_id: "driver-1",
      rider_id: "test-user-id",
      origin_lat: 54.66,
      origin_long: 25.25,
      dest_lat: 54.7,
      dest_long: 25.3,
      waypoints: null,
      transport_mode: "carpool",
      transport_label: "Carpool",
      co2_saved: 0,
      scheduled_at: scheduledAt.toISOString(),
    };
    fromMock.mockImplementation((table: string) =>
      chain(table === "rides" ? { data: ride, error: null } : { data: null, error: null }),
    );
  }

  it("says when live locations turn on", async () => {
    rideAt(new Date(Date.now() + 2 * 60 * 60_000));
    const { findByText } = render(<TripScreen />);
    expect(await findByText(/Live locations turn on at \d\d:\d\d, 15 min before pickup\./)).toBeTruthy();
  });

  it("follows the partner inside the window", async () => {
    rideAt(new Date(Date.now() + 5 * 60_000));
    const { findByText } = render(<TripScreen />);
    expect(await findByText(/location appears when they open Clyzio/)).toBeTruthy();
    await waitFor(() => expect(sb.channel).toHaveBeenCalledWith("live:test-id:driver-1"));
  });
});
