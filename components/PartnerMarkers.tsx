import React, { useEffect, useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text } from "./ui/AppText";
import { MarkerView } from "@rnmapbox/maps";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { MapPin } from "lucide-react-native";
import { useReducedMotion } from "./ui/useReducedMotion";
import {
  ageLabel,
  LIVE_STALE_MS,
  useLiveWindowOpen,
  useMatchPoints,
  usePartnerPosition,
  type LatLng,
  type LivePosition,
} from "../lib/liveLocation";
import { supabase } from "../lib/supabase";
import type { TripIntentMatch } from "../store/useDailyCommuteStore";

/**
 * A matched partner on the map (migration 052): their approximate start area
 * before the trip, their live position from 15 min before pickup.
 */
const COLORS = {
  primary: "#007C89",
  live: "#059669",
  stale: "#8B989C",
  ink: "#0B2540",
  white: "#FFFFFF",
};

export function PartnerMarker({
  id,
  name,
  start,
  live,
}: {
  id: string;
  name: string;
  /** Approximate start area (~300 m) — shown until a live position arrives. */
  start: LatLng | null;
  live: LivePosition | null;
}) {
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);
  // Re-render every 15 s so "last seen" and staleness keep up without updates.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, [live]);
  const fresh = !!live && now - new Date(live.updatedAt).getTime() < LIVE_STALE_MS;

  useEffect(() => {
    pulse.value = fresh && !reduceMotion ? withRepeat(withTiming(1, { duration: 1600 }), -1, false) : 0;
  }, [fresh, reduceMotion, pulse]);

  const halo = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - pulse.value),
    transform: [{ scale: 1 + pulse.value * 1.2 }],
  }));

  const at = live ?? start;
  if (!at) return null;

  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  const ring = live ? (fresh ? COLORS.live : COLORS.stale) : COLORS.primary;
  const caption = live
    ? fresh
      ? `${name} · live`
      : `${name} · ${ageLabel(live.updatedAt, now)}`
    : `${name} · ≈ start area`;

  return (
    <MarkerView id={`partner-${id}`} coordinate={[at.lng, at.lat]} allowOverlap>
      <View
        style={styles.wrap}
        accessible
        accessibilityLabel={live ? `${name}, live location, updated ${ageLabel(live.updatedAt, now)}` : `${name}'s approximate start area`}
      >
        <View style={styles.avatarSlot}>
          {live && <Animated.View style={[styles.halo, { backgroundColor: ring }, halo]} />}
          {!live && <View style={styles.approxArea} />}
          <View style={[styles.avatar, { borderColor: ring, opacity: live ? 1 : 0.9 }]}>
            <Text style={styles.initial}>{initial}</Text>
          </View>
        </View>
        <View style={styles.caption}>
          <Text style={styles.captionText} numberOfLines={1}>{caption}</Text>
        </View>
      </View>
    </MarkerView>
  );
}

/** The agreed pickup point. */
export function PickupMarker({ id, at }: { id: string; at: LatLng }) {
  return (
    <MarkerView id={`pickup-${id}`} coordinate={[at.lng, at.lat]} allowOverlap>
      <View style={styles.pickup} accessible accessibilityLabel="Pickup point">
        <MapPin size={14} color={COLORS.white} />
        <Text style={styles.pickupText}>Pickup</Text>
      </View>
    </MarkerView>
  );
}

/**
 * One match on the main Map: the pickup point and the partner — approximate
 * start area once matched, live position from 15 min before a confirmed
 * ride's pickup.
 */
export function MatchOnMap({ match, iDrive }: { match: TripIntentMatch; iDrive: boolean }) {
  const points = useMatchPoints({ matchId: match.id });
  const [ride, setRide] = useState<{ scheduled_at: string; status: string } | null>(null);
  useEffect(() => {
    if (!match.ride_id) {
      setRide(null);
      return;
    }
    let cancelled = false;
    supabase
      .from("rides")
      .select("scheduled_at, status")
      .eq("id", match.ride_id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setRide((data as { scheduled_at: string; status: string } | null) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [match.ride_id]);

  const liveOpen = useLiveWindowOpen(ride?.scheduled_at, ride?.status);
  const partnerId = iDrive ? match.passenger_user_id : match.driver_user_id;
  const live = usePartnerPosition(match.ride_id, partnerId, liveOpen);
  const name = (iDrive ? match.passenger_profile : match.driver_profile)?.first_name ?? (iDrive ? "Passenger" : "Driver");

  return (
    <>
      {points?.pickup && <PickupMarker id={match.id} at={points.pickup} />}
      <PartnerMarker id={match.id} name={name} start={points?.partnerStart ?? null} live={live} />
    </>
  );
}

const AVATAR = 40;

const styles = StyleSheet.create({
  wrap: { alignItems: "center" },
  avatarSlot: { width: AVATAR, height: AVATAR, alignItems: "center", justifyContent: "center" },
  halo: { position: "absolute", width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2 },
  // The partner is somewhere in here — not at the pin.
  approxArea: {
    position: "absolute",
    width: AVATAR + 28,
    height: AVATAR + 28,
    borderRadius: (AVATAR + 28) / 2,
    backgroundColor: "rgba(0,124,137,0.12)",
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "rgba(0,124,137,0.45)",
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    borderWidth: 3,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0px 4px 10px rgba(11,37,64,0.25)",
  },
  initial: { color: COLORS.white, fontSize: 16, fontWeight: "700" },
  caption: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: COLORS.white,
    boxShadow: "0px 2px 6px rgba(11,37,64,0.18)",
    maxWidth: 180,
  },
  captionText: { fontSize: 11, fontWeight: "700", color: COLORS.ink },
  pickup: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
    boxShadow: "0px 3px 8px rgba(11,37,64,0.25)",
  },
  pickupText: { color: COLORS.white, fontSize: 11, fontWeight: "700" },
});
