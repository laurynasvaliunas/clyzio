import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  dark: "#006064",
  white: "#FFFFFF",
};

interface BrandHeaderProps {
  userName?: string;
  userAvatar?: string | null;
  userLevel?: number;
}

export default function BrandHeader({ userName = "", userAvatar, userLevel = 1 }: BrandHeaderProps) {
  const router = useRouter();
  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <View style={styles.container}>
      <BlurView intensity={60} tint="light" style={styles.blur}>
        <View style={styles.content}>
          {/* Logo */}
          <View style={styles.logoRow}>
            <Text style={styles.logoText}>CLYZIO</Text>
            <View style={styles.logoDot} />
          </View>

          <View style={{ flex: 1 }} />

          {/* Avatar */}
          <TouchableOpacity
            style={styles.avatarBtn}
            onPress={() => router.push("/(tabs)/profile")}
            activeOpacity={0.8}
          >
            {userAvatar ? (
              <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
            ) : (
              <LinearGradient
                colors={[COLORS.primary, COLORS.primaryDark]}
                style={styles.avatarGradient}
              >
                <Text style={styles.avatarInitials}>{initials}</Text>
              </LinearGradient>
            )}
            <View style={styles.levelBadge}>
              <Text style={styles.levelBadgeText}>L{userLevel}</Text>
            </View>
          </TouchableOpacity>
        </View>
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 50,
  },
  blur: {
    paddingTop: 52,
    paddingBottom: 10,
    paddingHorizontal: 20,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
  },
  logoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoText: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  logoDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.accent,
    marginLeft: 2,
    marginTop: 3,
  },
  avatarBtn: {
    position: "relative",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  avatarGradient: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarInitials: {
    fontSize: 15,
    fontWeight: "700",
    color: COLORS.white,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
    paddingHorizontal: 3,
  },
  levelBadgeText: {
    fontSize: 9,
    fontWeight: "800",
    color: COLORS.dark,
  },
});
