import React from "react";
import { render, fireEvent, waitFor, act } from "../utils/test-utils";
import DoneScreen from "../../app/setup/done";
import DailyCommuteScreen from "../../app/daily-commute";
import { useDailyCommuteStore } from "../../store/useDailyCommuteStore";
import { supabase } from "../../lib/supabase";

// Migration 045: independents choose at setup whether to match with other
// independents; employees open individual trips to people outside the company.

const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();

/** Every profiles read returns `row`; returns the spy recording update payloads. */
function mockProfile(row: Record<string, unknown>) {
  const update = jest.fn();
  fromMock.mockImplementation(() => {
    const chain: Record<string, jest.Mock> = {};
    for (const m of ["select", "eq", "in", "order", "neq", "not"]) chain[m] = jest.fn(() => chain);
    chain.update = update.mockImplementation(() => chain);
    chain.single = jest.fn().mockResolvedValue({ data: row, error: null });
    chain.maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    return chain;
  });
  return update;
}

afterEach(() => {
  fromMock.mockImplementation(defaultFrom);
});

describe("Setup done - independent matching choice", () => {
  it("asks independents, preselected on, and saves is_public with setup", async () => {
    const update = mockProfile({ company_id: null });
    const { findByLabelText, getByLabelText } = render(<DoneScreen />);

    const toggle = await findByLabelText("Match with other independent commuters");
    expect(toggle.props.value).toBe(true);

    fireEvent.press(getByLabelText("Plan my first commute"));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ commute_setup_done: true, is_public: true }),
    );
  });

  it("saves is_public false when the independent switches it off", async () => {
    const update = mockProfile({ company_id: null });
    const { findByLabelText, getByLabelText } = render(<DoneScreen />);

    fireEvent(await findByLabelText("Match with other independent commuters"), "valueChange", false);
    fireEvent.press(getByLabelText("Plan my first commute"));
    await waitFor(() =>
      expect(update).toHaveBeenCalledWith({ commute_setup_done: true, is_public: false }),
    );
  });

  it("does not ask employees and leaves is_public alone", async () => {
    const update = mockProfile({ company_id: "company-1" });
    const { getByLabelText, queryByLabelText } = render(<DoneScreen />);

    fireEvent.press(getByLabelText("Plan my first commute"));
    await waitFor(() => expect(update).toHaveBeenCalledWith({ commute_setup_done: true }));
    expect(queryByLabelText("Match with other independent commuters")).toBeNull();
  });
});

describe("Daily commute - open a trip to commuters outside the company", () => {
  const submitIntent = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    submitIntent.mockClear();
    useDailyCommuteStore.setState({
      step: "driver_details",
      intent: null,
      matches: [],
      isLoading: false,
      checkExistingIntent: jest.fn().mockResolvedValue(undefined),
      submitIntent,
    });
  });

  it("shows the switch to employees and sends the flag with the intent", async () => {
    mockProfile({ company_id: "company-1" });
    const { findByLabelText, getByText } = render(<DailyCommuteScreen />);

    fireEvent(await findByLabelText("Open to commuters outside my company"), "valueChange", true);
    fireEvent.press(getByText("Submit Intent"));
    await waitFor(() =>
      expect(submitIntent).toHaveBeenCalledWith(
        expect.objectContaining({ role: "driver", open_to_independents: true }),
      ),
    );
  });

  it("hides the switch from independents", async () => {
    mockProfile({ company_id: null });
    const { findByText, queryByLabelText } = render(<DailyCommuteScreen />);

    await findByText("Submit Intent");
    // Let the company lookup settle — the switch starts hidden either way.
    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("profiles"));
    await act(async () => {});
    expect(queryByLabelText("Open to commuters outside my company")).toBeNull();
  });

  it("offers the switch on the passenger step too", async () => {
    useDailyCommuteStore.setState({ step: "passenger_details" });
    mockProfile({ company_id: "company-1" });
    const { findByLabelText } = render(<DailyCommuteScreen />);

    expect(await findByLabelText("Open to commuters outside my company")).toBeTruthy();
  });
});
