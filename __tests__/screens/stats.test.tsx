import React from "react";
import { fireEvent, render, screen } from "../utils/test-utils";
import StatsScreen from "../../app/(tabs)/stats";
import { supabase } from "../../lib/supabase";

// The Impact tab, simplified: one headline number with the trip count, one
// Week / Month / All-time card, then the rest once each. The colleague
// leaderboard lives in the Company view.

const RPC: Record<string, unknown> = {
  get_user_impact: { total_co2_saved: 2.62, total_trips: 2, this_week_co2: 0, last_week_co2: 1.2 },
  get_company_leaderboard: [
    { id: "test-user-id", name: "Laura Test", department: "Ops", total_saved: 2.62, is_current_user: true },
    { id: "u2", name: "Rasa Colleague", department: "Ops", total_saved: 1.1, is_current_user: false },
  ],
  get_company_totals: [{ company_name: "Clyzio", total_co2_saved: 3.72, total_trips: 3, employee_count: 2 }],
  get_department_leaderboard: [],
  get_company_breakdown: [],
};

function mockData({ company }: { company: boolean }) {
  (supabase.rpc as jest.Mock).mockImplementation((name: string) =>
    Promise.resolve({ data: RPC[name] ?? null, error: null }));
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const chain: any = {};
    for (const m of ["select", "eq", "in", "or", "order", "neq", "gte", "lte"]) chain[m] = jest.fn(() => chain);
    chain.single = jest.fn().mockResolvedValue({
      data: table === "profiles"
        ? { xp_points: 20, badges: ["first_trip"], company_id: company ? "co-1" : null, department_id: null, baseline_co2: 0.192 }
        : null,
      error: null,
    });
    chain.then = (res: any, rej: any) => Promise.resolve({ data: [], error: null }).then(res, rej);
    return chain;
  });
}

describe("Impact tab", () => {
  afterEach(() => {
    (supabase.rpc as jest.Mock).mockReset();
    (supabase.rpc as jest.Mock).mockResolvedValue({ data: null, error: null });
  });

  it("renders without crashing", () => {
    expect(() => render(<StatsScreen />)).not.toThrow();
  });

  it("shows each number once: the total with its trips, then one period card", async () => {
    mockData({ company: true });
    render(<StatsScreen />);

    expect(await screen.findByText("Total CO₂ Saved")).toBeTruthy();
    expect(screen.getByText("from 2 trips")).toBeTruthy();
    expect(screen.getByLabelText("Show Week stats")).toBeTruthy();
    expect(screen.getByLabelText("Show All-time stats")).toBeTruthy();
    expect(screen.getByText("Trophy Cabinet")).toBeTruthy();
    expect(screen.getByText("Tap a badge to see how to earn it.")).toBeTruthy();

    // Gone: the repeated stats row, the second weekly chart and the XP guide.
    expect(screen.queryByText("This Week")).toBeNull();
    expect(screen.queryByText("Weekly comparison")).toBeNull();
    expect(screen.queryByText("How you earn XP & badges")).toBeNull();
  });

  it("keeps the colleague leaderboard in the Company view", async () => {
    mockData({ company: true });
    render(<StatsScreen />);

    expect(await screen.findByText("Your part in Clyzio")).toBeTruthy();
    expect(screen.queryByText("Company Leaderboard")).toBeNull();

    fireEvent.press(screen.getByText("Company"));
    expect(await screen.findByText("Company Leaderboard")).toBeTruthy();
    expect(screen.getByText("Rasa Colleague")).toBeTruthy();
  });

  it("shows no empty leaderboard to someone without a company", async () => {
    mockData({ company: false });
    render(<StatsScreen />);

    expect(await screen.findByText("Total CO₂ Saved")).toBeTruthy();
    expect(screen.queryByText("Company Leaderboard")).toBeNull();
    expect(screen.queryByText("No data yet. Start logging trips!")).toBeNull();
    expect(screen.queryByText("Company")).toBeNull();
  });
});
