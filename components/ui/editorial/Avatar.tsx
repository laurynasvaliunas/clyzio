import { View, Text, ViewStyle, StyleProp } from "react-native";
import { editorial } from "../../../lib/theme/tokens";

export type AvatarTone =
  | "cyan"
  | "sand"
  | "rust"
  | "olive"
  | "ink"
  | "paper";

const TONES: Record<AvatarTone, { bg: string; fg: string }> = {
  cyan: { bg: "#0B4A52", fg: "#DCF1F4" },
  sand: { bg: "#E8DCC2", fg: "#5A4B26" },
  rust: { bg: "#9F4B2C", fg: "#FCEFE4" },
  olive: { bg: "#4A5733", fg: "#EBEFD9" },
  ink: { bg: "#162226", fg: "#E5E1D5" },
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
          fontFamily: editorial.fonts.serifItalic,
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
