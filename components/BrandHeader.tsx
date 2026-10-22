import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Avatar, toneFromKey } from "./ui/editorial";
import { editorial, elevation, getGlass, getPalette } from "../lib/theme/tokens";
import { useTheme } from "../contexts/ThemeContext";

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
  const { isDark } = useTheme();
  const g = getGlass(isDark);
  const p = getPalette(isDark);
  const shadow = (isDark ? elevation.dark : elevation.light).e3;
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
        <View style={[styles.logoWrapper, { boxShadow: shadow }]}>
          <Image
            source={require("../assets/icon.png")}
            style={styles.logoImage}
            resizeMode="contain"
            accessibilityLabel="Clyzio"
          />
        </View>
        {dateLabel ? (
          <View style={[styles.dateChip, { boxShadow: shadow }]}>
            <View style={styles.chipClip}>
              <BlurView intensity={g.intensity} tint={g.tint} style={StyleSheet.absoluteFill} />
              <View style={[StyleSheet.absoluteFill, { backgroundColor: g.fill }]} />
            </View>
            <View
              pointerEvents="none"
              style={[styles.chipClip, { borderWidth: StyleSheet.hairlineWidth, borderColor: g.stroke, borderTopColor: g.highlight }]}
            />
            {firstName ? (
              <Text style={[styles.greeting, isDark && { color: "#7FD3D6" }]} numberOfLines={1}>
                Hi {firstName}
              </Text>
            ) : null}
            <Text style={[styles.dateText, { color: p.text }]} numberOfLines={1}>
              {dateLabel}
            </Text>
          </View>
        ) : null}
      </View>

      {/* Avatar floats top-right */}
      <TouchableOpacity
        style={[styles.avatarBtn, { boxShadow: shadow }]}
        onPress={() => router.push("/(tabs)/profile")}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Open your profile and settings"
      >
        {userAvatar ? (
          <Image source={{ uri: userAvatar }} style={[styles.avatarImage, { borderColor: p.surface }]} />
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
    // `top` is set inline from useSafeAreaInsets — see the render.
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // 16 matches every floating card on the Map (CommuteHomeCard, the
    // AI chip stack); it was 20, so the logo/avatar sat 4pt outside them.
    paddingHorizontal: 16,
    zIndex: 50,
  },
  leftCluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  logoWrapper: {
    borderRadius: 12,
  },
  logoImage: {
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  dateChip: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipClip: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 16,
    overflow: "hidden",
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
    borderRadius: 23,
  },
  avatarImage: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    borderColor: editorial.paper,
  },
});
