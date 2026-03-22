import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Search, MapPin } from "lucide-react-native";
import * as Haptics from "expo-haptics";
import GlassView from "./GlassView";
import { useTheme } from "../contexts/ThemeContext";

// Brand Colors
const COLORS = {
  primary: "#26C6DA",  // Unified Cyan (Phase 27)
  gray: "#90A4AE",
  white: "#FFFFFF",
};

interface ActionDockProps {
  onPress: () => void;
  hasRoute?: boolean;
}

export default function ActionDock({ onPress, hasRoute = false }: ActionDockProps) {
  const { isDark } = useTheme();
  
  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  return (
    <View style={styles.container}>
      {/* Enhanced white background with stronger shadow for visibility */}
      <View style={styles.solidBackground}>
        <TouchableOpacity 
          style={styles.touchable} 
          onPress={handlePress} 
          activeOpacity={0.7}
        >
          <View style={styles.content}>
            <Search size={22} color={COLORS.primary} />
            <Text style={styles.text}>
              {hasRoute ? "Change destination" : "Where to today?"}
            </Text>
          </View>
          <View style={styles.button}>
            <MapPin size={20} color={COLORS.white} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 40,
    left: 20,
    right: 20,
    height: 64,
    borderRadius: 32,
    // ENHANCED: Stronger shadow for better separation from map
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 8 },
    shadowRadius: 24,
    elevation: 16,
    zIndex: 30,
  },
  solidBackground: {
    backgroundColor: COLORS.white,
    borderRadius: 32,
    height: 64,
    // Additional border for definition
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.05)",
  },
  glassContainer: {
    borderRadius: 32,
    overflow: 'hidden',
  },
  touchable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 20,
    paddingRight: 6,
    height: 64,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  text: {
    // ENHANCED: Larger and bolder text for better visibility
    fontSize: 17,
    color: "#334155",
    fontWeight: "600",
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.primary,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.primary,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});

