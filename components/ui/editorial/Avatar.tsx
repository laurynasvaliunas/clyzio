import { View, ViewStyle, StyleProp } from "react-native";
import { Text } from "../AppText";
import { editorial, weights } from "../../../lib/theme/tokens";

export type AvatarTone =
  | "cyan"
  | "sand"
  | "rust"
  | "olive"
  | "ink"
  | "paper";

// Harmonized to the deep-teal brand family (tone KEYS kept for compat).
const TONES: Record<AvatarTone, { bg: string; fg: string }> = {
  cyan: { bg: "#007C89", fg: "#E3FAFB" },
  sand: { bg: "#E3FAFB", fg: "#0B2540" },
  rust: { bg: "#0B2540", fg: "#E3FAFB" },
  olive: { bg: "#059669", fg: "#ECFDF5" },
  ink: { bg: "#0B2540", fg: "#EEF6F7" },
  paper: { bg: editorial.paper2, fg: editorial.ink3 },
};

const TONE_ORDER: AvatarTone[] = ["cyan", "rust", "olive", "sand", "ink"];

/** Deterministic tone from a name/id so avatars stay stable across renders. */
export function toneFromKey(key?: string | null): AvatarTone {
  if (!key) return "cyan";
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0;
  return TONE_ORDER[Math.abs(h) % TONE_ORDER.length];
}

/**
 * Editorial avatar — Instrument Serif italic initials on a toned disc,
 * optional paper ring. Mirrors `Avatar` from the design system.
 * Presentational only; pass real initials from the screen.
 */
export default function Avatar({
  initials,
  size = 36,
  tone = "cyan",
  ring = false,
  style,
}: {
  initials: string;
  size?: number;
  tone?: AvatarTone;
  ring?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONES[tone];
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size,
          backgroundColor: t.bg,
          alignItems: "center",
          justifyContent: "center",
          ...(ring
            ? {
                borderWidth: 3,
                borderColor: editorial.paper,
              }
            : null),
        },
        style,
      ]}
    >
      <Text
        style={{
          fontWeight: weights.bold,
          fontSize: size * 0.46,
          letterSpacing: -0.4,
          color: t.fg,
        }}
      >
        {initials}
      </Text>
    </View>
  );
}
