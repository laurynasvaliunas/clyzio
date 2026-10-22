import { FunctionsHttpError } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import { cancelRide } from "../../lib/cancelRide";
import { co2Share, shouldEndRide } from "../../lib/completeTrip";
import { formatClockTime } from "../../lib/format";

/**
 * Cancel and complete rules shared by the trip screen, Activity and the Map.
 * Cancelling used to be a bare `rides` update, which left a confirmed carpool
 * match behind (the Map kept saying "Riding with …") and told nobody.
 */
describe("cancelRide", () => {
  const invoke = jest.fn();

  beforeEach(() => {
    invoke.mockReset();
    (supabase as unknown as { functions: unknown }).functions = { invoke };
    (supabase.from as jest.Mock).mockClear();
  });

  it("cancels through the cancel-ride function, not a direct rides update", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });

    await expect(cancelRide("ride-1")).resolves.toEqual({ ok: true });

    expect(invoke).toHaveBeenCalledWith("cancel-ride", { body: { ride_id: "ride-1" } });
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("explains why a trip someone already completed can't be cancelled", async () => {
    const httpErr = new FunctionsHttpError({ json: async () => ({ code: "ride_already_completed" }) });
    invoke.mockResolvedValue({ data: null, error: httpErr });

    const outcome = await cancelRide("ride-1");

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false && outcome.message).toMatch(/already completed this trip/);
  });

  it("falls back to a connection message for anything else", async () => {
    invoke.mockRejectedValue(new Error("offline"));
    await expect(cancelRide("ride-1")).resolves.toEqual({
      ok: false,
      message: "Check your connection and try again.",
    });
  });
});

describe("co2Share", () => {
  it("credits each carpool participant half of the ride's saving", () => {
    expect(co2Share({ driver_id: "d", rider_id: "r", co2_saved: 2.6 })).toBeCloseTo(1.3);
  });

  it("credits a solo trip in full", () => {
    expect(co2Share({ driver_id: null, rider_id: "r", co2_saved: 2.6 })).toBeCloseTo(2.6);
  });

  it("treats a missing saving as zero", () => {
    expect(co2Share({ driver_id: "d", rider_id: "r", co2_saved: null })).toBe(0);
  });
});

describe("shouldEndRide", () => {
  it("lets only the driver end a carpool", () => {
    const ride = { driver_id: "d", rider_id: "r" };
    expect(shouldEndRide(ride, "d")).toBe(true);
    expect(shouldEndRide(ride, "r")).toBe(false);
  });

  it("lets the one participant end a solo trip", () => {
    expect(shouldEndRide({ driver_id: null, rider_id: "r" }, "r")).toBe(true);
  });
});

describe("formatClockTime", () => {
  it("drops the seconds from a Postgres time", () => {
    expect(formatClockTime("08:00:00")).toBe("08:00");
    expect(formatClockTime("7:05")).toBe("07:05");
  });

  it("returns null for nothing to show, so callers can fall back", () => {
    expect(formatClockTime(null)).toBeNull();
    expect(formatClockTime("")).toBeNull();
    expect(formatClockTime("tomorrow")).toBeNull();
  });
});
