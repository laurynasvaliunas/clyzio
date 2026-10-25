import React from "react";
import { render, waitFor, act } from "../utils/test-utils";
import { supabase } from "../../lib/supabase";
import ChatWatcher, { chatRoute } from "../../components/ChatWatcher";
import ChatModal from "../../components/ChatModal";
import { useChatStore, selectTotalUnread } from "../../store/useChatStore";
import { useNotificationToastStore } from "../../store/useNotificationToastStore";
import { isAnnouncedInApp } from "../../lib/deepLinks";

// New chat messages are announced wherever you are in the app (ChatWatcher),
// counted as unread until the chat is opened (ChatModal).

const sb = supabase as any;
const fromMock = supabase.from as jest.Mock;
const defaultFrom = fromMock.getMockImplementation();
const getSession = supabase.auth.getSession as jest.Mock;
const defaultGetSession = getSession.getMockImplementation();

let onInsert: ((payload: any) => void) | undefined;

beforeAll(() => {
  sb.channel = jest.fn(() => {
    const ch: Record<string, jest.Mock> = {};
    ch.on = jest.fn((_type, _filter, cb) => {
      onInsert = cb;
      return ch;
    });
    ch.subscribe = jest.fn(() => ch);
    return ch;
  });
  sb.removeChannel = jest.fn();
});

beforeEach(() => {
  onInsert = undefined;
  getSession.mockResolvedValue({ data: { session: { user: { id: "me" } } }, error: null });
  (supabase.rpc as jest.Mock).mockResolvedValue({ data: [{ id: "rasa", first_name: "Rasa" }], error: null });
  // No earlier messages to catch up on; chat notifications on.
  fromMock.mockImplementation(() => {
    const c: any = { then: (res: any) => Promise.resolve({ data: [], error: null }).then(res) };
    for (const m of ["select", "eq", "neq", "gte", "order", "limit", "insert"]) c[m] = jest.fn(() => c);
    c.maybeSingle = jest.fn(() => Promise.resolve({ data: { notification_prefs: { chat: true } }, error: null }));
    return c;
  });
  useChatStore.setState({ unread: {}, openThreads: [], lastRead: {}, lastReadLoaded: false });
  useNotificationToastStore.setState({ queue: [] });
});

afterEach(() => {
  fromMock.mockImplementation(defaultFrom);
  getSession.mockImplementation(defaultGetSession);
});

const message = (over: Record<string, unknown> = {}) => ({
  new: {
    id: 1,
    ride_id: "ride-9",
    match_id: null,
    sender_id: "rasa",
    content: "I'm at the pickup point",
    created_at: new Date().toISOString(),
    ...over,
  },
});

describe("ChatWatcher", () => {
  it("counts a new message and shows a toast that opens the chat", async () => {
    render(<ChatWatcher />);
    await waitFor(() => expect(onInsert).toBeDefined());

    act(() => onInsert!(message()));

    expect(selectTotalUnread(useChatStore.getState())).toBe(1);
    await waitFor(() => expect(useNotificationToastStore.getState().queue).toHaveLength(1));
    expect(useNotificationToastStore.getState().queue[0]).toMatchObject({
      type: "chat",
      title: "New message from Rasa",
      body: "I'm at the pickup point",
      screen: "/trip/ride-9?openChat=1",
    });
  });

  it("ignores your own messages and the chat that's open on screen", async () => {
    render(<ChatWatcher />);
    await waitFor(() => expect(onInsert).toBeDefined());

    act(() => onInsert!(message({ sender_id: "me" })));
    useChatStore.getState().openChat(["ride:ride-9"]);
    act(() => onInsert!(message({ id: 2 })));

    expect(selectTotalUnread(useChatStore.getState())).toBe(0);
    expect(useNotificationToastStore.getState().queue).toHaveLength(0);
  });

  it("routes a match chat (before the ride exists) to Daily Commute", () => {
    expect(chatRoute({ ride_id: null, match_id: "match-1" })).toBe("/daily-commute?openChat=match-1");
    expect(chatRoute({ ride_id: "ride-9", match_id: "match-1" })).toBe("/trip/ride-9?openChat=1");
  });
});

describe("ChatModal", () => {
  it("clears the chat's unread count while it's open", () => {
    useChatStore.setState({ unread: { "ride:ride-9": 3, "ride:other": 1 } });
    const { unmount } = render(
      <ChatModal visible onClose={jest.fn()} thread={{ rideId: "ride-9" }} currentUserId="me" partnerName="Rasa" />,
    );
    expect(useChatStore.getState().unread).toEqual({ "ride:other": 1 });
    expect(useChatStore.getState().isOpen("ride:ride-9")).toBe(true);
    unmount();
    expect(useChatStore.getState().isOpen("ride:ride-9")).toBe(false);
  });
});

describe("Foreground pushes", () => {
  it("leaves chat pushes to ChatWatcher so the toast isn't shown twice", () => {
    expect(isAnnouncedInApp({ screen: "chat", rideId: "ride-9" })).toBe(true);
    expect(isAnnouncedInApp({ screen: "daily-commute" })).toBe(false);
    expect(isAnnouncedInApp(null)).toBe(false);
  });
});
