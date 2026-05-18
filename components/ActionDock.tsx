import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import * as Haptics from "expo-haptics";
import { useTheme } from "../contexts/ThemeContext";
import { Picto } from "./ui/editorial";
import { editorial, typography } from "../lib/theme/tokens";

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
      <View style={[styles.pill, isDark && styles.pillDark]}>
        <TouchableOpacity
          style={styles.touchable}
          onPress={handlePress}
          activeOpacity={0.85}
          accessibilityLabel={hasRoute ? "Change destination" : "Plan your route"}
          accessibilityRole="button"
        >
          <View style={styles.content}>
            <Picto kind="search" size={20} color={editorial.cyan} stroke={1.6} />
            <Text style={styles.text}>
              {hasRoute ? "Change destination" : "Plan your route"}
            </Text>
          </View>
          <View style={styles.button}>
            <Picto kind="arrow" size={18} color={editorial.ink} stroke={2} />
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 104,
    left: 16,
    right: 16,
    height: 64,
    borderRadius: 28,
    shadowColor: editorial.ink,
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 10 },
    shadowRadius: 28,
    elevation: 16,
    zIndex: 30,
  },
  pill: {
    backgroundColor: editorial.ink,
    borderRadius: 28,
    height: 64,
    borderWidth: 1,
    borderColor: "transparent",
  },
  pillDark: {
    backgroundColor: editorial.night2,
    borderColor: editorial.nightLine,
  },
  touchable: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: 22,
    paddingRight: 6,
    height: 64,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  text: {
    ...typography.pillText,
    fontSize: 12,
    color: editorial.paper,
  },
  button: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: editorial.cyan,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: editorial.cyan,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 6,
  },
});
