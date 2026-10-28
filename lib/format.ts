// Shared display formatters. Keep these the single source of truth so numbers
// look identical everywhere (M5: CO₂ was rendered with .toFixed(1) on some
// screens and .toFixed(2) on others, which undermined trust in the impact data).

import { getCalendars } from "expo-localization";

/** Format a CO₂ amount in kilograms for display, e.g. `formatCO2(1.234)` → "1.2". */
export function formatCO2(kg: number | null | undefined): string {
  const v = Number(kg);
  if (!Number.isFinite(v)) return "0";
  return v.toFixed(1);
}

/** CO₂ with its unit, e.g. "1.2 kg". */
export function formatCO2kg(kg: number | null | undefined): string {
  return `${formatCO2(kg)} kg`;
}

/**
 * A Postgres `time` value ("08:00:00") as a clock time ("08:00"). Pickup and
 * departure times used to render with seconds. Returns null for empty or
 * unparseable input so callers can fall back ("—", "tomorrow").
 */
export function formatClockTime(t: string | null | undefined): string | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  return m ? `${m[1].padStart(2, "0")}:${m[2]}` : null;
}

/** Whether the phone shows a 24-hour clock (Settings → Date & Time). */
function phoneUses24HourClock(): boolean {
  try {
    return getCalendars()[0]?.uses24hourClock ?? true;
  } catch {
    return true;
  }
}

/**
 * A moment's time of day on this phone, in its 12/24-hour setting: "08:09" or
 * "8:09 AM". Times were hard-coded as US "8:09 AM" (and Google's transit
 * departures arrive that way), whatever the phone uses. Returns null for empty
 * or invalid input.
 */
export function formatTimeOfDay(value: Date | number | string | null | undefined): string | null {
  if (value === null || value === undefined || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const h = d.getHours();
  const mm = String(d.getMinutes()).padStart(2, "0");
  if (phoneUses24HourClock()) return `${String(h).padStart(2, "0")}:${mm}`;
  return `${h % 12 || 12}:${mm} ${h < 12 ? "AM" : "PM"}`;
}
