import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#006064",
  accent: "#FDD835",
  white: "#FFFFFF",
};

interface BrandHeaderProps {
  userName?: string;
  userAvatar?: string | null;
}

export default function BrandHeader({ userName = "", userAvatar }: BrandHeaderProps) {
  const router = useRouter();
  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Logo floats top-left */}
      <View style={styles.logoWrapper}>
        <Image
          source={require("../assets/icon.png")}
          style={styles.logoImage}
          resizeMode="contain"
          accessibilityLabel="Clyzio"
        />
      </View>

      {/* Avatar floats top-right */}
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
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 56,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    zIndex: 50,
  },
  logoWrapper: {
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 5,
  },
  logoImage: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  avatarBtn: {
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: COLORS.white,
  },
  avatarGradient: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
  },
  avatarInitials: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
  },
});
