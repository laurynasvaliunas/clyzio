import { View, StyleSheet, Image } from "react-native";
import { MapPin, Flag, Footprints, Car } from "lucide-react-native";
import { Text } from "./ui/AppText";
import { formatClockTime } from "../lib/format";
import { MAPBOX_TOKEN } from "../lib/config";
import type { TripIntentMatch } from "../store/useDailyCommuteStore";

/**
 * Where and when a carpool picks up and drops off (planned with the match,
 * migration 053), so the driver — and the rider — can decide before
 * accepting: the pickup time and place, whether it's on the driver's route
 * (the rider walks a little) or at the rider's door (the driver detours), the
 * drop-off, and how far they ride together. A small map shows both points.
 *
 * Older matches without a plan show just the pickup address and time.
 */

const C = {
  ink: "#0B2540",
  muted: "#5B6B7A",
  line: "#E3EEF0",
  pickup: "#09E0E8",
  dropoff: "#0B2540",
  door: "#B45309",
};

const street = (address: string | null | undefined, fallback: string) =>
  address?.split(",")[0]?.trim() || fallback;
const walkMin = (m: number | null | undefined) => Math.max(1, Math.round((m ?? 0) / 80));

/** Mapbox Static Images URL with the pickup (P) and drop-off (D) pins. */
export function pickupMapUrl(m: TripIntentMatch, token: string = MAPBOX_TOKEN): string | null {
  if (!token || m.pickup_lat == null || m.pickup_long == null) return null;
  const pins = [`pin-s-p+09e0e8(${m.pickup_long.toFixed(5)},${m.pickup_lat.toFixed(5)})`];
  if (m.dropoff_lat != null && m.dropoff_long != null) {
    pins.push(`pin-s-d+0b2540(${m.dropoff_long.toFixed(5)},${m.dropoff_lat.toFixed(5)})`);
  }
  const view = pins.length > 1 ? "auto" : `${m.pickup_long.toFixed(5)},${m.pickup_lat.toFixed(5)},14`;
  return (
    `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins.join(",")}/${view}/600x220@2x` +
    `?padding=40&attribution=false&logo=false&access_token=${token}`
  );
}

/** The line under the pickup: who walks or detours, from the viewer's side. */
export function pickupHint(m: TripIntentMatch, viewer: "driver" | "passenger", peerName: string): string | null {
  if (m.pickup_kind === "door") {
    if (viewer === "passenger") return "At your door";
    const km = m.detour_km != null ? `+${m.detour_km} km` : "a short detour";
    const min = m.detour_min ? `, about ${m.detour_min} min` : "";
    return `At ${peerName}'s door: ${km}${min} for you`;
  }
  if (m.pickup_kind === "route") {
    if ((m.walk_to_pickup_m ?? 0) < 60) return viewer === "driver" ? "Right on your route" : "Right on the driver's route";
    return viewer === "driver"
      ? `On your route: ${peerName} walks ${walkMin(m.walk_to_pickup_m)} min`
      : `On the driver's route: ${walkMin(m.walk_to_pickup_m)} min walk for you`;
  }
  return null;
}

export default function PickupDetails({
  match,
  viewer,
  peerName,
  showMap = true,
}: {
  match: TripIntentMatch;
  viewer: "driver" | "passenger";
  peerName: string;
  showMap?: boolean;
}) {
  const pickupTime = formatClockTime(match.proposed_pickup_time ?? match.proposed_departure);
  const dropTime = formatClockTime(match.proposed_dropoff_time);
  const hint = pickupHint(match, viewer, peerName);
  const hasDropoff = match.dropoff_address != null || match.dropoff_lat != null;
  const mapUrl = showMap ? pickupMapUrl(match) : null;
  const dropWalk = (match.walk_from_dropoff_m ?? 0) >= 60
    ? viewer === "driver"
      ? `${peerName} walks ${walkMin(match.walk_from_dropoff_m)} min from there`
      : `${walkMin(match.walk_from_dropoff_m)} min walk to your destination`
    : null;

  return (
    <View style={styles.wrap} accessibilityLabel="Pickup details">
      <View style={styles.row}>
        <MapPin size={16} color={C.ink} />
        <View style={styles.rowText}>
          <Text style={styles.title} numberOfLines={2}>
            Pickup{pickupTime ? ` ${pickupTime}` : ""} · {street(match.pickup_address, "to be agreed in chat")}
          </Text>
          {!!hint && (
            <View style={styles.hintRow}>
              {match.pickup_kind === "door"
                ? <Car size={12} color={C.door} />
                : <Footprints size={12} color={C.muted} />}
              <Text style={[styles.hint, match.pickup_kind === "door" && viewer === "driver" && { color: C.door }]}>{hint}</Text>
            </View>
          )}
        </View>
      </View>

      {hasDropoff && (
        <View style={styles.row}>
          <Flag size={16} color={C.ink} />
          <View style={styles.rowText}>
            <Text style={styles.title} numberOfLines={2}>
              Drop-off{dropTime ? ` ${dropTime}` : ""} · {street(match.dropoff_address, "on the way")}
            </Text>
            {!!dropWalk && <Text style={styles.hint}>{dropWalk}</Text>}
          </View>
        </View>
      )}

      {match.shared_km != null && match.shared_km > 0 && (
        <Text style={styles.together}>{match.shared_km} km together</Text>
      )}

      {mapUrl && (
        <Image
          source={{ uri: mapUrl }}
          style={styles.map}
          resizeMode="cover"
          accessibilityLabel={`Map of the pickup${hasDropoff ? " and drop-off" : ""}`}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: C.line,
    gap: 8,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  rowText: { flex: 1 },
  title: { fontSize: 14, fontWeight: "700", color: C.ink },
  hintRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  hint: { fontSize: 13, color: C.muted },
  together: { fontSize: 13, fontWeight: "600", color: C.muted },
  map: { width: "100%", height: 120, borderRadius: 14, backgroundColor: "#E3FAFB" },
});
