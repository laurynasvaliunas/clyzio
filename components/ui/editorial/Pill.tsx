import { View, Text, ViewStyle, StyleProp } from "react-native";
import { editorial, typography } from "../../../lib/theme/tokens";

export type PillTone =
  | "paper"
  | "cyan"
  | "dark"
  | "leaf"
  | "sun"
  | "rust"
  | "ghost";

const TONES: Record<PillTone, { bg: string; fg: string; bd: string }> = {
  paper: { bg: "rgba(11,26,31,0.04)", fg: editorial.ink2, bd: "rgba(11,26,31,0.06)" },
  cyan: { bg: editorial.cyanFog, fg: editorial.teal2, bd: "rgba(0,61,64,0.08)" },
  dark: { bg: editorial.ink, fg: "#FFFFFF", bd: "transparent" },
  leaf: { bg: "rgba(5,150,105,0.10)", fg: "#047857", bd: "rgba(5,150,105,0.18)" },
  sun: { bg: "rgba(245,158,11,0.12)", fg: "#92400E", bd: "rgba(245,158,11,0.28)" },
  rust: { bg: "rgba(220,38,38,0.08)", fg: "#B91C1C", bd: "rgba(220,38,38,0.18)" },
  ghost: { bg: "transparent", fg: editorial.ink3, bd: "rgba(11,26,31,0.10)" },
};

/**
 * Editorial pill / tag — mono uppercase label inside a hairline-bordered
 * rounded chip. Mirrors `Pill` from the design system. Presentational only.
 */
export default function Pill({
  children,
  tone = "paper",
  size = "sm",
  dot,
  style,
}: {
  children: React.ReactNode;
  tone?: PillTone;
  size?: "sm" | "lg";
  /** Optional leading status dot color (mirrors the design's pill dot). */
  dot?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  const lg = size === "lg";
  return (
    <View
      style={[
        {
          alignSelf: "flex-start",
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: t.bg,
          borderColor: t.bd,
          borderWidth: 1,
          borderRadius: 999,
          paddingVertical: lg ? 7 : 4,
          paddingHorizontal: lg ? 12 : 9,
        },
        style,
      ]}
    >
      {dot && (
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 6,
            backgroundColor: dot,
          }}
        />
      )}
      <Text
        style={[
          typography.pillText,
          { color: t.fg, fontSize: lg ? 12 : 10.5 },
        ]}
      >
        {children}
      </Text>
    </View>
  );
}
