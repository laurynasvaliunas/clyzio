import { View, Text, TouchableOpacity, Image, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useTheme } from "../contexts/ThemeContext";

// Brand Colors (matching logo)
const COLORS = {
  primary: "#26C6DA",  // Unified Cyan
  accent: "#FDD835",   // Yellow sun
  dark: "#006064",
  white: "#FFFFFF",
};

// Logo image
let logoImage: any = null;
try {
  logoImage = require("../assets/images/clyzio-logo.png");
} catch (e) {
  // Logo not found, use fallback
}

interface BrandHeaderProps {
  userName?: string;
  userAvatar?: string | null;
  userLevel?: number;
}

export default function BrandHeader({ userName = "", userAvatar, userLevel = 1 }: BrandHeaderProps) {
  const router = useRouter();
  const { isDark } = useTheme();

  return (
    <View style={styles.container}>
      {/* Content - Transparent Background */}
      <View style={styles.content}>
        {/* Logo - Direct render */}
        {logoImage ? (
          <Image
            source={logoImage}
            style={styles.logo}
          />
        ) : (
          // Fallback matching the logo design
          <View style={styles.fallbackLogo}>
            <Text style={styles.logoText}>clyzio</Text>
            <View style={styles.sunIcon} />
          </View>
        )}

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* User Avatar */}
        <TouchableOpacity style={styles.avatarButton} onPress={() => router.push("/(tabs)/profile")}>
          {userAvatar ? (
            <Image source={{ uri: userAvatar }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>{userName.charAt(0).toUpperCase() || "U"}</Text>
            </View>
          )}
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>{userLevel}</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 50, // Below status bar
    left: 0,
    right: 0,
    zIndex: 50,
    // NO BACKGROUND - fully transparent
  },
  content: {
    paddingHorizontal: 24,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    // Transparent - map shows through
  },
  // Logo image - wide, no cropping
  logo: {
    width: 100,
    height: 36,
    resizeMode: "contain",
  },
  // Fallback logo matching the design
  fallbackLogo: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  logoText: {
    fontSize: 28,
    fontWeight: "bold",
    color: COLORS.primary,
    letterSpacing: -0.5,
    // Add shadow for visibility over map
    textShadowColor: "rgba(255,255,255,0.8)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  sunIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: COLORS.accent,
    marginLeft: 2,
    marginTop: -2,
  },
  // Avatar styles
  avatarButton: {
    position: "relative",
  },
  avatarImage: {
    width: 44,
    height: 44,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
    // Shadow for visibility
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  avatarInitials: {
    fontSize: 16,
    fontWeight: "bold",
    color: COLORS.white,
  },
  levelBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: COLORS.white,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: "bold",
    color: COLORS.dark,
  },
});
