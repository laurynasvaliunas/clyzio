import { View, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Avatar, toneFromKey } from "./ui/editorial";
import { editorial } from "../lib/theme/tokens";

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
          <Avatar
            initials={initials}
            size={42}
            tone={toneFromKey(userName || "U")}
            ring
          />
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
    shadowColor: editorial.ink,
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 5,
  },
  logoImage: {
    width: 38,
    height: 38,
    borderRadius: 10,
  },
  avatarBtn: {
    shadowColor: editorial.ink,
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: editorial.paper,
  },
});
