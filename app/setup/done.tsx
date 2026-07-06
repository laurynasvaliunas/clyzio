import { useEffect, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { Home, Briefcase, ArrowRight } from "lucide-react-native";

import { supabase } from "../../lib/supabase";
import { parseVehicles, type Vehicle } from "../../lib/vehicles";
import SetupProgress from "../../components/SetupProgress";

/**
 * Stage 1.3 — "You're ready to go!"
 *
 * No required interaction. Pure reward / completion screen: home → work
 * pin visual + distance + the vehicles the user just picked, then a
 * "Plan my first commute" CTA that flips `commute_setup_done = true`
 * and lands them on the Map with the bottom sheet auto-open (Phase 4
 * will wire the auto-open; for now it just navigates to /(tabs)).
 */

const COLORS = {
  bg: "#F7F9FA",
  surface: "#FFFFFF",
  ink: "#0B1A1F",
  inkSoft: "#5A6A6F",
  primary: "#00565A",
  primaryDark: "#003D40",
  homePin: "#00565A",
  workPin: "#059669",
  divider: "#EDF1F2",
};

const VEHICLE_EMOJI: Record<string, string> = {
  car: "🚗",
  motorcycle: "🏍️",
  bicycle: "🚲",
  scooter: "🛵",
  ebike: "⚡🚲",
  escooter: "⚡🛵",
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export default function DoneScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [finishing, setFinishing] = useState(false);
  const [homeAddress, setHomeAddress] = useState<string>("");
  const [workAddress, setWorkAddress] = useState<string>("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  // Entry animation
  const pinScale = useState(() => new Animated.Value(0.6))[0];
  const pinOpacity = useState(() => new Animated.Value(0))[0];
  const detailsOpacity = useState(() => new Animated.Value(0))[0];

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          router.replace("/(auth)/login" as any);
          return;
        }
        const { data: profile } = await supabase
          .from("profiles")
          .select("home_address, home_lat, home_long, work_address, work_lat, work_long, vehicles")
          .eq("id", user.id)
          .single();
        if (profile) {
          setHomeAddress(profile.home_address ?? "");
          setWorkAddress(profile.work_address ?? "");
          setVehicles(parseVehicles((profile as any).vehicles));
          if (
            profile.home_lat != null && profile.home_long != null &&
            profile.work_lat != null && profile.work_long != null
          ) {
            setDistanceKm(
              haversineKm(profile.home_lat, profile.home_long, profile.work_lat, profile.work_long),
            );
          }
        }
      } catch { /* tolerate missing data — still show the celebration */ }
      finally {
        setLoading(false);
        Animated.parallel([
          Animated.spring(pinScale, {
            toValue: 1, friction: 5, tension: 80, useNativeDriver: true,
          }),
          Animated.timing(pinOpacity, {
            toValue: 1, duration: 280, useNativeDriver: true,
          }),
          Animated.timing(detailsOpacity, {
            toValue: 1, duration: 360, delay: 220, useNativeDriver: true,
          }),
        ]).start();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Flip the first-run gate so we don't re-enter setup on next launch.
        // Tolerate the column being absent — the resolver also tolerates that.
        await supabase
          .from("profiles")
          .update({ commute_setup_done: true } as never)
          .eq("id", user.id)
          .then(() => undefined, () => undefined);
      }
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
      router.replace("/(tabs)" as any);
    } catch {
      // Even on error, send them to the Map — they can retry setup from Settings.
      router.replace("/(tabs)" as any);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={["#E6F1F2", COLORS.bg]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <SetupProgress current={3} total={4} />

        <View style={styles.header}>
          <Text style={styles.heading} accessibilityRole="header">
            You're ready to go!
          </Text>
          <Text style={styles.subhead}>
            Here's your daily commute.
          </Text>
        </View>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.primary} />
          </View>
        ) : (
          <Animated.View
            style={[
              styles.commute,
              { opacity: pinOpacity, transform: [{ scale: pinScale }] },
            ]}
          >
            {/* Home → dotted line → Work visual */}
            <View style={styles.commuteRow}>
              <View style={styles.endpoint}>
                <View style={[styles.endpointDot, { backgroundColor: COLORS.homePin }]}>
                  <Home size={18} color={COLORS.surface} />
                </View>
                <Text style={styles.endpointLabel}>Home</Text>
                <Text style={styles.endpointAddress} numberOfLines={2}>
                  {homeAddress || "Your home"}
                </Text>
              </View>

              <View style={styles.between}>
                <View style={styles.dottedLine} />
                {distanceKm != null && (
                  <View style={styles.distancePill}>
                    <Text style={styles.distanceText}>{distanceKm.toFixed(1)} km</Text>
                  </View>
                )}
                <View style={styles.dottedLine} />
              </View>

              <View style={styles.endpoint}>
                <View style={[styles.endpointDot, { backgroundColor: COLORS.workPin }]}>
                  <Briefcase size={18} color={COLORS.surface} />
                </View>
                <Text style={styles.endpointLabel}>Work</Text>
                <Text style={styles.endpointAddress} numberOfLines={2}>
                  {workAddress || "Your office"}
                </Text>
              </View>
            </View>

            {/* Vehicle icons */}
            <Animated.View style={[styles.vehicles, { opacity: detailsOpacity }]}>
              {vehicles.length === 0 ? (
                <Text style={styles.vehiclesEmpty}>
                  No vehicles — you're going zero-emission by default.
                </Text>
              ) : (
                <>
                  <Text style={styles.vehiclesHeader}>You travel with</Text>
                  <View style={styles.vehiclesRow}>
                    {vehicles.map((v) => (
                      <View key={v.id} style={styles.vehicleChip}>
                        <Text style={styles.vehicleEmoji}>
                          {VEHICLE_EMOJI[v.type] ?? "🚗"}
                        </Text>
                      </View>
                    ))}
                  </View>
                </>
              )}
            </Animated.View>
          </Animated.View>
        )}

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.cta}
            onPress={handleFinish}
            disabled={finishing}
            activeOpacity={0.9}
            accessibilityRole="button"
            accessibilityLabel="Plan my first commute"
          >
            {finishing ? (
              <ActivityIndicator color={COLORS.surface} />
            ) : (
              <>
                <Text style={styles.ctaText}>Plan my first commute</Text>
                <ArrowRight size={20} color={COLORS.surface} />
              </>
            )}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1, paddingHorizontal: 16 },
  header: {
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 6,
  },
  heading: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "700",
    letterSpacing: -0.4,
    color: COLORS.ink,
  },
  subhead: {
    fontSize: 14,
    color: COLORS.inkSoft,
    lineHeight: 19,
  },
  loadingWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  commute: {
    flex: 1,
    justifyContent: "center",
    gap: 28,
    paddingHorizontal: 8,
  },
  commuteRow: {
    flexDirection: "row",
    alignItems: "stretch",
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  endpoint: {
    flex: 1,
    alignItems: "center",
    gap: 6,
  },
  endpointDot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  endpointLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.inkSoft,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginTop: 4,
  },
  endpointAddress: {
    fontSize: 12,
    color: COLORS.ink,
    textAlign: "center",
    lineHeight: 16,
    paddingHorizontal: 4,
  },
  between: {
    flex: 0.6,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingTop: 16,
  },
  dottedLine: {
    width: "100%",
    height: 0,
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderTopColor: COLORS.inkSoft,
    opacity: 0.45,
  },
  distancePill: {
    backgroundColor: COLORS.ink,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  distanceText: {
    color: COLORS.surface,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.4,
  },
  vehicles: {
    alignItems: "center",
    gap: 8,
  },
  vehiclesHeader: {
    fontSize: 11,
    fontWeight: "600",
    color: COLORS.inkSoft,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  vehiclesEmpty: {
    fontSize: 13,
    color: COLORS.inkSoft,
    textAlign: "center",
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  vehiclesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  vehicleChip: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: COLORS.surface,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  vehicleEmoji: {
    fontSize: 24,
  },
  footer: {
    paddingTop: 12,
    paddingBottom: 8,
  },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.ink,
    paddingVertical: 18,
    borderRadius: 999,
    minHeight: 56,
  },
  ctaText: {
    color: COLORS.surface,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
});
