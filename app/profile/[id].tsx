import { useEffect, useState } from "react";
import { View, Text, StyleSheet, ActivityIndicator, Image, TouchableOpacity, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, UserCircle, Leaf, Route, Award } from "lucide-react-native";
import { supabase } from "../../lib/supabase";
import { logger } from "../../lib/logger";

const COLORS = {
  primary: "#26C6DA",
  dark: "#006064",
  gray: "#90A4AE",
  textSecondary: "#546E7A",
  white: "#FFFFFF",
  bg: "#F5FAFA",
  border: "#E0F2F3",
};

type PublicProfile = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  department: string | null;
  total_co2_saved: number | null;
  trips_completed: number | null;
  level: number | null;
};

/**
 * Public profile of a peer-visible commuter (same company, or cross-org opt-in).
 * Data comes from the `get_public_profiles` SECURITY DEFINER RPC, which gates on
 * is_peer_visible — so this only ever shows people the viewer is allowed to see.
 */
export default function PublicProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<PublicProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) { setLoading(false); return; }
      try {
        const { data, error } = await supabase.rpc("get_public_profiles", { p_ids: [id] });
        if (!cancelled) setProfile(error ? null : ((data?.[0] as PublicProfile) ?? null));
      } catch (e) {
        logger.error("public profile fetch failed:", e);
        if (!cancelled) setProfile(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  const name = profile
    ? `${profile.first_name ?? ""} ${profile.last_name ?? ""}`.trim() || "Commuter"
    : "";

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} accessibilityLabel="Back">
          <ChevronLeft size={24} color={COLORS.dark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={COLORS.primary} /></View>
      ) : !profile ? (
        <View style={styles.center}>
          <UserCircle size={56} color={COLORS.gray} />
          <Text style={styles.emptyTitle}>Profile unavailable</Text>
          <Text style={styles.emptySub}>This commuter isn't visible to you, or their profile is private.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body}>
          <View style={styles.avatarWrap}>
            {profile.avatar_url
              ? <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
              : <UserCircle size={96} color={COLORS.primary} />}
          </View>
          <Text style={styles.name}>{name}</Text>
          {!!profile.department && <Text style={styles.dept}>📍 {profile.department}</Text>}

          <View style={styles.statsRow}>
            <View style={styles.statCard}>
              <Leaf size={20} color="#4CAF50" />
              <Text style={styles.statValue}>{(profile.total_co2_saved ?? 0).toFixed(1)} kg</Text>
              <Text style={styles.statLabel}>CO₂ saved</Text>
            </View>
            <View style={styles.statCard}>
              <Route size={20} color={COLORS.primary} />
              <Text style={styles.statValue}>{profile.trips_completed ?? 0}</Text>
              <Text style={styles.statLabel}>Trips</Text>
            </View>
            <View style={styles.statCard}>
              <Award size={20} color="#F2C744" />
              <Text style={styles.statValue}>Lvl {profile.level ?? 1}</Text>
              <Text style={styles.statLabel}>Level</Text>
            </View>
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: "700", color: COLORS.dark },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: "700", color: COLORS.dark, marginTop: 8 },
  emptySub: { fontSize: 14, color: COLORS.textSecondary, textAlign: "center", lineHeight: 20 },
  body: { alignItems: "center", paddingTop: 32, paddingHorizontal: 24 },
  avatarWrap: {
    width: 110, height: 110, borderRadius: 55, backgroundColor: COLORS.bg,
    alignItems: "center", justifyContent: "center", overflow: "hidden", marginBottom: 16,
  },
  avatar: { width: 110, height: 110 },
  name: { fontSize: 24, fontWeight: "700", color: COLORS.dark },
  dept: { fontSize: 15, color: COLORS.textSecondary, marginTop: 4 },
  statsRow: { flexDirection: "row", gap: 12, marginTop: 28, alignSelf: "stretch" },
  statCard: {
    flex: 1, backgroundColor: COLORS.bg, borderRadius: 16, paddingVertical: 18,
    alignItems: "center", gap: 6, borderWidth: 1, borderColor: COLORS.border,
  },
  statValue: { fontSize: 17, fontWeight: "700", color: COLORS.dark },
  statLabel: { fontSize: 12, color: COLORS.gray },
});
