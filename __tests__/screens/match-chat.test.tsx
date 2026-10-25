import React from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { render, fireEvent, waitFor } from "../utils/test-utils";
import DailyCommuteScreen from "../../app/daily-commute";
import { useDailyCommuteStore, type TripIntentMatch } from "../../store/useDailyCommuteStore";
import { supabase } from "../../lib/supabase";
import { sendChatMessage } from "../../lib/chat";
import { notificationToRoute } from "../../lib/deepLinks";

// Migration 051: matched commuters can chat before either approves, and the
// other person gets a push (send-message).

const sb = supabase as any;
const invoke = jest.fn();
const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();

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
});

// The signed-in user (jest.setup getUser → "test-user-id") is the passenger.
const match = {
  id: "match-1",
  driver_intent_id: "di-1",
  passenger_intent_id: "pi-1",
  driver_user_id: "driver-1",
  passenger_user_id: "test-user-id",
  trip_date: "2026-10-26",
  ai_compatibility_score: 92,
  ai_reasoning: null,
  proposed_departure: "08:00",
  proposed_pickup_time: "08:10",
  pickup_lat: null,
  pickup_long: null,
  pickup_address: "Gedimino pr. 1, Vilnius",
  detour_preference: null,
  custom_pickup_lat: null,
  custom_pickup_long: null,
  driver_approved: true,
  passenger_approved: false,
  status: "awaiting_other",
  ride_id: null,
  created_at: "2026-10-25T08:00:00Z",
  updated_at: "2026-10-25T08:00:00Z",
  driver_profile: { first_name: "Rasa" },
} as unknown as TripIntentMatch;

function showStep(step: string, m: TripIntentMatch) {
  useDailyCommuteStore.setState({
    step: step as any,
    intent: null,
    matches: [m],
    isLoading: false,
    checkExistingIntent: jest.fn().mockResolvedValue(undefined),
  });
}

describe("Daily commute - chat with your match", () => {
  it("lets the passenger message the driver before approving", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    showStep("passenger_review", match);
    const { findByLabelText, getByLabelText, findByText } = render(<DailyCommuteScreen />);

    fireEvent.press(await findByLabelText("Message Rasa"));
    expect(await findByText("Chat with Rasa")).toBeTruthy();

    fireEvent.changeText(getByLabelText("Type a message"), "Can you pick me up at 8:10?");
    fireEvent.press(getByLabelText("Send message"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("send-message", {
        body: { match_id: "match-1", content: "Can you pick me up at 8:10?" },
      }),
    );
  });

  it("offers the chat while waiting for the other side", async () => {
    showStep("passenger_waiting", { ...match, passenger_approved: true, driver_approved: false } as TripIntentMatch);
    const { findByLabelText } = render(<DailyCommuteScreen />);
    expect(await findByLabelText("Message Rasa")).toBeTruthy();
  });

  it("chats on the ride once it's confirmed", async () => {
    invoke.mockResolvedValue({ data: { ok: true }, error: null });
    showStep("passenger_confirmed", { ...match, status: "confirmed", passenger_approved: true, ride_id: "ride-9" } as TripIntentMatch);
    const { findByLabelText, getByLabelText } = render(<DailyCommuteScreen />);

    fireEvent.press(await findByLabelText("Message Rasa"));
    fireEvent.changeText(getByLabelText("Type a message"), "On my way");
    fireEvent.press(getByLabelText("Send message"));

    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("send-message", { body: { ride_id: "ride-9", content: "On my way" } }),
    );
  });
});

describe("sendChatMessage", () => {
  function httpError(status: number, body: unknown) {
    return new FunctionsHttpError({ status, json: async () => body } as unknown as Response);
  }

  it("explains a closed match", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(409, { error: "conflict", code: "match_closed" }) });
    const out = await sendChatMessage({ matchId: "match-1" }, "test-user-id", "hi");
    expect(out).toEqual({ ok: false, message: "This match has ended, so the chat is closed." });
  });

  it("writes directly while the function isn't deployed yet", async () => {
    invoke.mockResolvedValue({ data: null, error: httpError(404, { code: "NOT_FOUND" }) });
    const insert = jest.fn().mockResolvedValue({ error: null });
    fromMock.mockImplementation(() => ({ insert }));

    const out = await sendChatMessage({ rideId: "ride-9" }, "test-user-id", "hi");
    expect(out).toEqual({ ok: true });
    expect(insert).toHaveBeenCalledWith({ ride_id: "ride-9", sender_id: "test-user-id", content: "hi" });
  });
});

describe("chat push routing", () => {
  it("opens the ride chat or the match chat", () => {
    expect(notificationToRoute({ screen: "chat", rideId: "ride-9" })).toBe("/trip/ride-9?openChat=1");
    expect(notificationToRoute({ screen: "chat", matchId: "match-1" })).toBe("/daily-commute?openChat=match-1");
  });
});
