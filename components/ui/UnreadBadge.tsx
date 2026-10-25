import React from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "./AppText";

/**
 * Small count bubble for unread chat messages (hidden at 0). Position it
 * with `style` (e.g. absolute, top/right over a button's icon).
 */
export function UnreadBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  if (count <= 0) return null;
  return (
    <View
      style={[styles.badge, style]}
      accessible
      accessibilityLabel={count === 1 ? "1 unread message" : `${count} unread messages`}
    >
      <Text style={styles.text}>{count > 9 ? "9+" : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: "#DC2626", // white text 4.8:1
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "#FFFFFF", fontSize: 11, fontWeight: "800", lineHeight: 14 },
});
