import { useEffect, useState } from "react";
import { supabase } from "./supabase";

/**
 * Matched driver and rider on the map (migration 052).
 *
 *   Static, from the moment they're matched: the pickup point and the
 *   partner's approximate start area (snapped to ~300 m server-side).
 *   Live, for a confirmed carpool: each phone shares its position while Clyzio
 *   is open, from 15 min before pickup until the ride ends (at most 3 h after).
 *   The database enforces the same window; these constants only decide when
 *   the app bothers to try.
 */
export const LIVE_LEAD_MS = 15 * 60_000;
export const LIVE_TAIL_MS = 3 * 60 * 60_000;
export const LIVE_RIDE_STATUSES = ["scheduled", "accepted", "in_progress"];

/** A partner position older than this is shown as "last seen". */
export const LIVE_STALE_MS = 2 * 60_000;

export function liveWindow(scheduledAt: string | Date): { opensAt: number; closesAt: number } {
  const t = new Date(scheduledAt).getTime();
  return { opensAt: t - LIVE_LEAD_MS, closesAt: t + LIVE_TAIL_MS };
}

export function isLiveWindowOpen(scheduledAt: string | Date | null | undefined, now = Date.now()): boolean {
  if (!scheduledAt) return false;
  const { opensAt, closesAt } = liveWindow(scheduledAt);
  return now >= opensAt && now <= closesAt;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface MatchPoints {
  matchId: string;
  rideId: string | null;
  partnerId: string;
  partnerRole: "driver" | "rider";
  /** Null when the passenger doesn't share their pickup address. */
  pickup: LatLng | null;
  /** The partner's start area, approximate (~300 m grid). */
  partnerStart: LatLng | null;
}

const point = (lat: number | null, lng: number | null): LatLng | null =>
  lat != null && lng != null ? { lat, lng } : null;

/** Meeting points for one of the caller's matches (by match or by its ride). */
export async function fetchMatchPoints(key: { matchId: string } | { rideId: string }): Promise<MatchPoints | null> {
  const { data, error } = await supabase.rpc(
    "get_match_points",
    "matchId" in key ? { p_match_id: key.matchId } : { p_ride_id: key.rideId },
  );
  const row = Array.isArray(data) ? data[0] : null;
  if (error || !row) return null;
  return {
    matchId: row.match_id,
    rideId: row.ride_id,
    partnerId: row.partner_id,
    partnerRole: row.partner_role,
    pickup: point(row.pickup_lat, row.pickup_long),
    partnerStart: point(row.partner_start_lat, row.partner_start_long),
  };
}

export interface LivePosition extends LatLng {
  heading: number | null;
  updatedAt: string;
}

/** Post (upsert) the caller's position on a ride. The window is checked by RLS. */
export async function sharePosition(
  rideId: string,
  userId: string,
  pos: { lat: number; lng: number; heading?: number | null; accuracy?: number | null },
): Promise<boolean> {
  const { error } = await supabase.from("ride_live_locations").upsert(
    {
      ride_id: rideId,
      user_id: userId,
      lat: pos.lat,
      lng: pos.lng,
      heading: pos.heading ?? null,
      accuracy: pos.accuracy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "ride_id,user_id" },
  );
  return !error;
}

function toPosition(row: any): LivePosition {
  return { lat: row.lat, lng: row.lng, heading: row.heading ?? null, updatedAt: row.updated_at };
}

/**
 * Follow the partner's position on a ride: the current row, then Realtime
 * updates. Returns the unsubscribe function.
 */
export function followPartnerPosition(
  rideId: string,
  partnerId: string,
  onChange: (pos: LivePosition | null) => void,
): () => void {
  let active = true;
  supabase
    .from("ride_live_locations")
    .select("lat, lng, heading, updated_at")
    .eq("ride_id", rideId)
    .eq("user_id", partnerId)
    .maybeSingle()
    .then(({ data }) => {
      if (active && data) onChange(toPosition(data));
    });

  const channel = supabase
    .channel(`live:${rideId}:${partnerId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "ride_live_locations", filter: `ride_id=eq.${rideId}` },
      (payload: any) => {
        if (!active) return;
        if (payload.eventType === "DELETE") {
          if (payload.old?.user_id === partnerId) onChange(null);
          return;
        }
        if (payload.new?.user_id === partnerId) onChange(toPosition(payload.new));
      },
    )
    .subscribe();

  return () => {
    active = false;
    supabase.removeChannel(channel);
  };
}

/** True while the ride's live window is open; re-checked every 30 s. */
export function useLiveWindowOpen(scheduledAt: string | null | undefined, status?: string | null): boolean {
  const live = !!scheduledAt && (!status || LIVE_RIDE_STATUSES.includes(status));
  const [open, setOpen] = useState(() => live && isLiveWindowOpen(scheduledAt));
  useEffect(() => {
    if (!live) {
      setOpen(false);
      return;
    }
    const check = () => setOpen(isLiveWindowOpen(scheduledAt));
    check();
    const t = setInterval(check, 30_000);
    return () => clearInterval(t);
  }, [live, scheduledAt]);
  return open;
}

/** The partner's live position while `enabled` (null until they share one). */
export function usePartnerPosition(
  rideId: string | null | undefined,
  partnerId: string | null | undefined,
  enabled: boolean,
): LivePosition | null {
  const [pos, setPos] = useState<LivePosition | null>(null);
  useEffect(() => {
    if (!enabled || !rideId || !partnerId) {
      setPos(null);
      return;
    }
    return followPartnerPosition(rideId, partnerId, setPos);
  }, [enabled, rideId, partnerId]);
  return pos;
}

/** Match meeting points, fetched once per key. */
export function useMatchPoints(key: { matchId: string } | { rideId: string } | null): MatchPoints | null {
  const [points, setPoints] = useState<MatchPoints | null>(null);
  const k = key ? ("matchId" in key ? `m:${key.matchId}` : `r:${key.rideId}`) : null;
  useEffect(() => {
    if (!key) {
      setPoints(null);
      return;
    }
    let cancelled = false;
    fetchMatchPoints(key).then((p) => {
      if (!cancelled) setPoints(p);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k]);
  return points;
}

/** When live sharing opens, as a 24 h clock time ("07:55"). */
export function liveOpensAt(scheduledAt: string | Date): string {
  const d = new Date(liveWindow(scheduledAt).opensAt);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "just now" / "40 s ago" / "3 min ago". */
export function ageLabel(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 10) return "just now";
  if (s < 60) return `${s} s ago`;
  return `${Math.round(s / 60)} min ago`;
}
