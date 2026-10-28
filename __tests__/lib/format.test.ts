import { getCalendars } from "expo-localization";
import { formatClockTime, formatTimeOfDay } from "../../lib/format";

// Times follow the phone's 12/24-hour setting. They used to be hard-coded US
// "8:09 AM" (planner, chat) or Google's English text (transit departures).

jest.mock("expo-localization", () => ({ getCalendars: jest.fn() }));
const calendars = getCalendars as jest.Mock;
const at = (h: number, m: number) => new Date(2026, 9, 28, h, m);

describe("formatTimeOfDay", () => {
  it("uses a 24-hour clock when the phone does", () => {
    calendars.mockReturnValue([{ uses24hourClock: true }]);
    expect(formatTimeOfDay(at(8, 9))).toBe("08:09");
    expect(formatTimeOfDay(at(17, 30))).toBe("17:30");
    expect(formatTimeOfDay(at(0, 5))).toBe("00:05");
  });

  it("uses AM/PM when the phone does", () => {
    calendars.mockReturnValue([{ uses24hourClock: false }]);
    expect(formatTimeOfDay(at(8, 9))).toBe("8:09 AM");
    expect(formatTimeOfDay(at(17, 30))).toBe("5:30 PM");
    expect(formatTimeOfDay(at(0, 5))).toBe("12:05 AM");
    expect(formatTimeOfDay(at(12, 0))).toBe("12:00 PM");
  });

  it("defaults to 24-hour when the setting is unknown", () => {
    calendars.mockReturnValue([{ uses24hourClock: null }]);
    expect(formatTimeOfDay(at(8, 9))).toBe("08:09");
    calendars.mockImplementation(() => { throw new Error("no native module"); });
    expect(formatTimeOfDay(at(8, 9))).toBe("08:09");
  });

  it("takes a Date, epoch milliseconds or an ISO string, and rejects junk", () => {
    calendars.mockReturnValue([{ uses24hourClock: true }]);
    const d = at(8, 9);
    expect(formatTimeOfDay(d.getTime())).toBe("08:09");
    expect(formatTimeOfDay(d.toISOString())).toBe("08:09");
    expect(formatTimeOfDay(null)).toBeNull();
    expect(formatTimeOfDay("")).toBeNull();
    expect(formatTimeOfDay("not a date")).toBeNull();
  });
});

describe("formatClockTime", () => {
  it("still trims stored times to HH:MM", () => {
    expect(formatClockTime("8:05:00")).toBe("08:05");
    expect(formatClockTime(null)).toBeNull();
  });
});
