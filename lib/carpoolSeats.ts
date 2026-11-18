/**
 * A driver's seats for one trip: how many they offered, and who holds them.
 *
 * The server keeps the same count (migration 053, carpool_free_seats): a seat
 * is held by a confirmed passenger or by an offer still waiting for an answer,
 * and the trip keeps being offered to riders while a seat is free.
 */

export interface SeatSummary {
  /** Seats the driver offered. */
  total: number;
  /** Seats with a confirmed passenger. */
  taken: number;
  /** Seats held by an offer nobody has turned down yet. */
  offered: number;
  /** Seats still open to other riders. */
  free: number;
}

interface SeatIntent {
  role: "driver" | "passenger";
  passenger_capacity: number | null;
}

interface SeatMatch {
  status: string;
}

/** The driver's seats, or null for a rider (or no trip). */
export function seatSummary(
  intent: SeatIntent | null | undefined,
  liveMatches: SeatMatch[] | null | undefined,
): SeatSummary | null {
  if (!intent || intent.role !== "driver") return null;
  // A trip saved without a number offers one seat, as the server counts it.
  const total = Math.max(0, intent.passenger_capacity ?? 1);
  const matches = liveMatches ?? [];
  const taken = matches.filter((m) => m.status === "confirmed").length;
  const offered = matches.filter((m) => m.status === "pending" || m.status === "awaiting_other").length;
  return { total, taken, offered, free: Math.max(0, total - taken - offered) };
}

const seats = (n: number) => `${n} seat${n === 1 ? "" : "s"}`;

/** "1 of 2 seats taken" */
export function seatsTakenLabel(s: SeatSummary): string {
  if (s.total === 0) return "No seats offered";
  return `${s.taken} of ${seats(s.total)} taken`;
}

/** What is happening with the rest: "1 offer waiting for an answer · 1 seat still free". */
export function seatsOpenLabel(s: SeatSummary): string | null {
  if (s.total === 0) return null;
  const parts: string[] = [];
  if (s.offered > 0) parts.push(`${s.offered} offer${s.offered === 1 ? "" : "s"} waiting for an answer`);
  if (s.free > 0) parts.push(`${seats(s.free)} still free`);
  if (parts.length === 0) return s.taken >= s.total ? "Your car is full" : null;
  return parts.join(" · ");
}
