import { View, StyleSheet } from "react-native";

/**
 * SetupProgress — 3-dot indicator (●●○) for the top of the first-run setup
 * screens (Places / Garage / Done). Matches the customer-journey PDF spec
 * for Stage 1.
 *
 * Usage:
 *   <SetupProgress current={0} total={3} />  // ● ○ ○
 *   <SetupProgress current={1} total={3} />  // ● ● ○
 *   <SetupProgress current={2} total={3} />  // ● ● ●
 *
 * The active+filled dots are larger and use the brand teal; pending dots
 * are smaller and use the paper-2 tint. The component is fixed-height + a
 * small gap so callers can drop it under a SafeAreaView without layout work.
 */

const COLORS = {
  filled: "#09E0E8",     // logo cyan — completed/current
  empty: "#EEF6F7",      // paper-2 — pending
};

interface Props {
  current: number;       // 0-based index of the active step
  total?: number;        // defaults to 3 per the PDF
}

export default function SetupProgress({ current, total = 3 }: Props) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 1, max: total, now: Math.min(current + 1, total) }}
      accessibilityLabel={`Setup step ${Math.min(current + 1, total)} of ${total}`}
    >
      {Array.from({ length: total }).map((_, i) => {
        const filled = i <= current;
        return (
          <View
            key={i}
            style={[
              styles.dot,
              filled ? styles.filled : styles.empty,
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  filled: {
    width: 26,
    backgroundColor: COLORS.filled,
    // Lit pill: a soft teal glow + highlight so progress reads as "on".
    boxShadow: "inset 0px -2px 0px rgba(11,37,64,0.14), 0px 2px 6px rgba(9,224,232,0.45)",
  },
  empty: {
    width: 8,
    backgroundColor: COLORS.empty,
    boxShadow: "inset 0px 1px 2px rgba(11,37,64,0.10)",
  },
});
