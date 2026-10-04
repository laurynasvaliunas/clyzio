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
