import React from "react";
import { fireEvent, render, screen, waitFor } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import ProfileScreen from "../../app/(tabs)/profile";

/**
 * Previously skipped because an un-stopped Animated.loop fired after tear-down.
 * The loop is now stopped on unmount, so this runs — and it guards a real
 * regression: with no data-loading focus effect the screen sat on its loading
 * spinner forever and rendered nothing at all.
 */
describe("ProfileScreen", () => {
  beforeEach(() => {
    // Both this screen and the embedded ProfileEditor read the profile row.
    // ProfileEditor deliberately refuses to render its form when the read
    // returns no row (that guard is what stops a Save from wiping real data),
    // so a row is required to see the full screen.
    (supabase.from as jest.Mock).mockImplementation(() => {
      const row = {
        first_name: "Test",
        last_name: "User",
        phone: "",
        department: "",
        avatar_url: null,
        car_make: "",
        car_model: "",
        car_color: "",
        car_plate: "",
        car_fuel_type: "",
        home_address: "",
        home_lat: null,
        home_long: null,
        work_address: "",
        work_lat: null,
        work_long: null,
        is_public: false,
        share_pickup_address: true,
        vehicles: [],
        primary_vehicle_id: null,
        commuting_habits: [],
        baseline_co2: null,
      };
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      Object.assign(chain, {
        select: self,
        update: self,
        insert: self,
        eq: self,
        order: self,
        single: jest.fn().mockResolvedValue({ data: row, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
      });
      return chain;
    });
  });

  it("finishes loading and renders the profile content", async () => {
    render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText("Profile")).toBeTruthy();
    });

    // The screen's own section, injected into ProfileEditor via extraSections.
    await waitFor(() => {
      expect(screen.getByText(/Average weekly commute mix/i)).toBeTruthy();
    });

    // One save action only — the two competing buttons were a launch blocker.
    expect(screen.getByText("Save profile")).toBeTruthy();
  });

  it("never writes the commute mix when it failed to load", async () => {
    // Regression: Save used to write commuting_habits = [] and
    // baseline_co2 = null whenever the mix read failed.
    const updates: Record<string, unknown>[] = [];
    (supabase.from as jest.Mock).mockImplementation(() => {
      let columns = "";
      const row = {
        first_name: "Test", last_name: "User", phone: "", department: "",
        avatar_url: null, car_make: "", car_model: "", car_color: "",
        car_plate: "", car_fuel_type: "", home_address: "", home_lat: null,
        home_long: null, work_address: "", work_lat: null, work_long: null,
        is_public: false, share_pickup_address: true, vehicles: [],
        primary_vehicle_id: null, company_id: null, department_id: null,
      };
      const chain: Record<string, unknown> = {};
      Object.assign(chain, {
        select: (cols: string) => { columns = cols; return chain; },
        update: (payload: Record<string, unknown>) => { updates.push(payload); return chain; },
        eq: () => chain,
        order: () => chain,
        maybeSingle: jest.fn().mockImplementation(() =>
          Promise.resolve(
            columns.includes("commuting_habits")
              ? { data: null, error: { message: "offline" } }
              : { data: row, error: null },
          ),
        ),
      });
      return chain;
    });

    render(<ProfileScreen />);

    await waitFor(() => {
      expect(screen.getByText(/Your commute mix couldn.t load/)).toBeTruthy();
    });

    fireEvent.press(screen.getByText("Save profile"));

    await waitFor(() => {
      expect(updates.length).toBeGreaterThan(0);
    });
    expect(updates.some((u) => "commuting_habits" in u || "baseline_co2" in u)).toBe(false);
  });
});

