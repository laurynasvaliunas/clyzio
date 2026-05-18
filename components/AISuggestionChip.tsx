import { TouchableOpacity, Text, View, StyleSheet } from "react-native";
import { X } from "lucide-react-native";
import { Picto } from "./ui/editorial";
import { editorial } from "../lib/theme/tokens";

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
        <Picto kind="spark" size={15} color={editorial.teal} stroke={1.6} />
      </View>
      <Text style={styles.text} numberOfLines={2}>
        {loading ? "Loading AI suggestions…" : insight}
      </Text>
      <TouchableOpacity style={styles.dismiss} onPress={onDismiss} hitSlop={8}>
        <X size={14} color={editorial.ink4} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: editorial.ivory,
    borderRadius: 18,
    paddingVertical: 11,
    paddingLeft: 13,
    paddingRight: 10,
    shadowColor: editorial.ink,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    borderLeftWidth: 3,
    borderLeftColor: editorial.teal,
    gap: 10,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: editorial.cyanFog,
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    flex: 1,
    fontFamily: editorial.fonts.serif,
    fontSize: 14,
    color: editorial.ink,
    lineHeight: 18,
  },
  dismiss: {
    padding: 4,
  },
});
