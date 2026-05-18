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
  leaf: { bg: "rgba(91,143,91,0.12)", fg: "#2C5532", bd: "rgba(91,143,91,0.15)" },
  sun: { bg: "rgba(242,199,68,0.18)", fg: "#7A5A0E", bd: "rgba(242,199,68,0.30)" },
  rust: { bg: "rgba(196,98,63,0.12)", fg: "#7A2E10", bd: "rgba(196,98,63,0.22)" },
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
