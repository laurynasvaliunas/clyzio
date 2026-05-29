import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, toneFromKey } from "./ui/editorial";
import { editorial } from "../lib/theme/tokens";

interface BrandHeaderProps {
  userName?: string;
  userAvatar?: string | null;
  /**
   * When provided, renders a date line beside the logo (customer-journey
   * PDF Stage 2: "Top bar — small avatar + date 'Wednesday, May 28'").
   * Pass a pre-formatted string so the header stays presentational.
   */
  dateLabel?: string;
}

export default function BrandHeader({ userName = "", userAvatar, dateLabel }: BrandHeaderProps) {
  const router = useRouter();
  // Anchor below the iOS Dynamic Island / Android status bar so logo + avatar
  // are never overlapped by system UI.
  const insets = useSafeAreaInsets();
  const initials = userName
    ? userName.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2)
    : "U";

  // First name only for a friendly, compact greeting next to the date.
  const firstName = userName ? userName.split(" ")[0] : "";

  return (
    <View
      style={[styles.container, { top: insets.top + 8 }]}
      pointerEvents="box-none"
    >
      {/* Logo + date floats top-left */}
      <View style={styles.leftCluster}>
        <View style={styles.logoWrapper}>
          <Image
            source={require("../assets/icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Clyzio"
          />
        </View>
        {dateLabel ? (
          <View style={styles.dateChip}>
            {firstName ? (
              <Text style={styles.greeting} numberOfLines={1}>
                Hi {firstName}
              </Text>
            ) : null}
            <Text style={styles.dateText} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Avatar floats top-right */}
      <TouchableOpacity
        style={styles.avatarBtn}
        onPress={() => router.push("/(tabs)/profile")}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open your profile and settings"
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
  leftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  dateChip: {
    backgroundColor: "rgba(250,247,239,0.92)",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
    shadowColor: editorial.ink,
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  greeting: {
    fontSize: 11,
    fontWeight: "600",
    color: editorial.cyan,
    letterSpacing: 0.2,
  },
  dateText: {
    fontSize: 13,
    fontWeight: "700",
    color: editorial.ink,
    letterSpacing: -0.2,
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
