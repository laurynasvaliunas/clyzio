import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { Sparkles, X } from "lucide-react-native";

const COLORS = {
  primary: "#26C6DA",
  primaryDark: "#00ACC1",
  dark: "#006064",
  white: "#FFFFFF",
  gray: "#90A4AE",
};

interface AISuggestionChipProps {
  insight: string;
  onPress: () => void;
  onDismiss: () => void;
  loading?: boolean;
}

export default function AISuggestionChip({
  insight,
  onPress,
  onDismiss,
  loading = false,
}: AISuggestionChipProps) {
  return (
    <TouchableOpacity
      style={styles.chip}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={styles.iconBox}>
        <Sparkles size={14} color={COLORS.primary} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {loading ? "Loading AI suggestions…" : insight}
      </Text>
      <TouchableOpacity style={styles.dismiss} onPress={onDismiss} hitSlop={8}>
        <X size={14} color={COLORS.gray} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.white,
    borderRadius: 16,
    paddingVertical: 10,
    paddingLeft: 12,
    paddingRight: 10,
    shadowColor: "#000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    gap: 8,
  },
  iconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#E0F7FA",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontSize: 12,
    color: COLORS.dark,
    lineHeight: 17,
    fontWeight: "500",
  },
  dismiss: {
    padding: 4,
  },
});
