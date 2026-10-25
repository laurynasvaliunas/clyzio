import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { supabase } from "../lib/supabase";
import { LIVE_LEAD_MS, LIVE_RIDE_STATUSES, LIVE_TAIL_MS, sharePosition } from "../lib/liveLocation";
import { useLiveShareStore } from "../store/useLiveShareStore";

/** Post at most this often while moving… */
const SEND_EVERY_MS = 5_000;
/** …and re-post the last fix this often while standing still, so the partner
 *  doesn't see "last seen" for someone waiting at the pickup point. */
const HEARTBEAT_MS = 30_000;
/** How often to look for a ride whose live window just opened. */
const RECHECK_MS = 60_000;

interface LiveRide {
  id: string;
}

/** `currentState` can still be "unknown" at cold start, while the app is open. */
const isForeground = (state: string | null | undefined) => state !== "background" && state !== "inactive";

/**
 * Shares this phone's position with carpool partners while Clyzio is open:
 * from 15 min before pickup until the ride ends (migration 052 enforces the
 * same window). Foreground only — the app asks for "While Using" location and
 * never "Always" — and it never prompts: without permission it only flags
 * `needsPermission` for the trip screen to offer.
 *
 * Mounted once at the root; renders nothing.
 */
export default function LiveLocationSharer() {
  const nudge = useLiveShareStore((s) => s.nudge);
  const setSharing = useLiveShareStore((s) => s.setSharing);
  const [appActive, setAppActive] = useState(isForeground(AppState.currentState));
  const [userId, setUserId] = useState<string | null>(null);
  const [rides, setRides] = useState<LiveRide[]>([]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setAppActive(isForeground(s)));
    return () => sub.remove();
  }, []);

  // Find carpool rides whose live window is open (or opens within a minute).
  useEffect(() => {
    if (!appActive) {
      setRides([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const uid = session?.user?.id ?? null;
      if (cancelled) return;
      setUserId(uid);
      if (!uid) {
        setRides([]);
        return;
      }
      const now = Date.now();
      const { data } = await supabase
        .from("rides")
        .select("id")
        .or(`driver_id.eq.${uid},rider_id.eq.${uid}`)
        .not("driver_id", "is", null)
        .not("rider_id", "is", null)
        .in("status", LIVE_RIDE_STATUSES)
        .gte("scheduled_at", new Date(now - LIVE_TAIL_MS).toISOString())
        .lte("scheduled_at", new Date(now + LIVE_LEAD_MS).toISOString());
      if (!cancelled) setRides((data as LiveRide[] | null) ?? []);
    };
    load().catch(() => undefined);
    const t = setInterval(() => load().catch(() => undefined), RECHECK_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [appActive, nudge]);

  const ridesRef = useRef<LiveRide[]>(rides);
  ridesRef.current = rides;
  const rideKey = rides.map((r) => r.id).sort().join(",");

  // Watch and share while there's anything to share to.
  useEffect(() => {
    if (!appActive || !userId || !rideKey) {
      setSharing([], false);
      return;
    }
    let cancelled = false;
    let sub: Location.LocationSubscription | null = null;
    let lastSent = 0;
    let lastFix: Location.LocationObject | null = null;

    const send = (fix: Location.LocationObject) => {
      lastSent = Date.now();
      for (const r of ridesRef.current) {
        sharePosition(r.id, userId, {
          lat: fix.coords.latitude,
          lng: fix.coords.longitude,
          heading: fix.coords.heading,
          accuracy: fix.coords.accuracy,
        }).catch(() => undefined);
      }
    };

    (async () => {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (cancelled) return;
      if (status !== "granted") {
        setSharing([], true);
        return;
      }
      setSharing(ridesRef.current.map((r) => r.id), false);
      const s = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: SEND_EVERY_MS, distanceInterval: 10 },
        (fix) => {
          lastFix = fix;
          if (Date.now() - lastSent >= SEND_EVERY_MS) send(fix);
        },
      );
      if (cancelled) s.remove();
      else sub = s;
    })().catch(() => undefined);

    const heartbeat = setInterval(() => {
      if (lastFix && Date.now() - lastSent >= HEARTBEAT_MS) send(lastFix);
    }, HEARTBEAT_MS);

    return () => {
      cancelled = true;
      clearInterval(heartbeat);
      sub?.remove();
    };
  }, [appActive, userId, rideKey, setSharing]);

  return null;
}
