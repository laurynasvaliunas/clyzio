import { useEffect, useState } from "react";
import { AppState } from "react-native";

/**
 * Calendar dates in the device's local time zone.
 *
 * `toISOString().split("T")[0]` gives the UTC date — in Lithuania (UTC+2/+3)
 * that is still "yesterday" until 02:00–03:00, so "tomorrow" computed shortly
 * after midnight pointed at today and carpool plans landed on the wrong day.
 */

/** YYYY-MM-DD for the given moment in local time. */
export function localISODate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Tomorrow's local calendar date as YYYY-MM-DD. */
export function tomorrowLocalISODate(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return localISODate(d);
}

/**
 * "Today" / "Tomorrow" / "Tue 27 Oct" for a YYYY-MM-DD trip date — carpool
 * trips can be for any day, so screens no longer assume tomorrow.
 */
export function dayLabel(isoDate: string, now: Date = new Date()): string {
  if (isoDate === localISODate(now)) return "Today";
  if (isoDate === tomorrowLocalISODate(now)) return "Tomorrow";
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * Today's local date (YYYY-MM-DD), kept current while a screen stays mounted:
 * re-read when the app returns to the foreground and when midnight passes. A
 * phone keeps the app alive for days, so a date read once at mount goes stale.
 */
export function useLocalToday(): string {
  const [today, setToday] = useState(() => localISODate());

  useEffect(() => {
    const sync = () => setToday(localISODate());
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") sync();
    });

    let timer: ReturnType<typeof setTimeout>;
    const waitForMidnight = () => {
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 1, 0);
      timer = setTimeout(() => {
        sync();
        waitForMidnight();
      }, midnight.getTime() - now.getTime());
    };
    waitForMidnight();

    return () => {
      sub.remove();
      clearTimeout(timer);
    };
  }, []);

  return today;
}
