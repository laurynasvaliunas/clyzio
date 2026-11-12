import React from "react";
import { AppState, Text } from "react-native";
import { act, render, screen } from "@testing-library/react-native";
import { dayLabel, localISODate, tomorrowLocalISODate, useLocalToday } from "../../lib/localDate";

describe("local calendar dates", () => {
  it("uses the phone's date, not the UTC date", () => {
    // 00:30 local: toISOString() would still say the day before in UTC+2.
    const justAfterMidnight = new Date(2026, 10, 13, 0, 30);
    expect(localISODate(justAfterMidnight)).toBe("2026-11-13");
    expect(tomorrowLocalISODate(justAfterMidnight)).toBe("2026-11-14");
  });

  it("rolls over month and year ends", () => {
    expect(tomorrowLocalISODate(new Date(2026, 10, 30, 12))).toBe("2026-12-01");
    expect(tomorrowLocalISODate(new Date(2026, 11, 31, 23, 59))).toBe("2027-01-01");
  });

  it("names today and tomorrow, and dates anything else", () => {
    const now = new Date(2026, 10, 12, 9);
    expect(dayLabel("2026-11-12", now)).toBe("Today");
    expect(dayLabel("2026-11-13", now)).toBe("Tomorrow");
    expect(dayLabel("2026-11-17", now)).toBe("Tue 17 Nov");
  });
});

// The app can stay open for days (a phone rarely kills it): "today" has to
// follow the calendar, or the Map keeps showing the day it was opened.
describe("useLocalToday", () => {
  const Today = () => <Text>{useLocalToday()}</Text>;
  const appStateListener = () => {
    const calls = (AppState.addEventListener as jest.Mock).mock.calls;
    return calls[calls.length - 1][1] as (state: string) => void;
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AppState, "addEventListener").mockImplementation(() => ({ remove: jest.fn() }) as any);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("moves to the new day when the app comes back to the foreground", () => {
    jest.setSystemTime(new Date(2026, 9, 28, 18, 0));
    render(<Today />);
    expect(screen.getByText("2026-10-28")).toBeTruthy();

    // Left in the background for two weeks, then reopened.
    jest.setSystemTime(new Date(2026, 10, 12, 8, 0));
    act(() => appStateListener()("active"));
    expect(screen.getByText("2026-11-12")).toBeTruthy();
  });

  it("moves to the new day at midnight while the screen stays open", () => {
    jest.setSystemTime(new Date(2026, 10, 12, 23, 59, 50));
    render(<Today />);
    expect(screen.getByText("2026-11-12")).toBeTruthy();

    act(() => { jest.advanceTimersByTime(15_000); });
    expect(screen.getByText("2026-11-13")).toBeTruthy();

    // ...and again the night after.
    act(() => { jest.advanceTimersByTime(24 * 3600 * 1000); });
    expect(screen.getByText("2026-11-14")).toBeTruthy();
  });

  it("stops listening when the screen goes away", () => {
    const remove = jest.fn();
    (AppState.addEventListener as jest.Mock).mockImplementation(() => ({ remove }));
    const { unmount } = render(<Today />);
    unmount();
    expect(remove).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });
});
