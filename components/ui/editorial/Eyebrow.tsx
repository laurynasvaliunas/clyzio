import { Text, TextStyle, StyleProp } from "react-native";
import { editorial, typography } from "../../../lib/theme/tokens";

/**
 * Editorial micro-label — JetBrains Mono, uppercase, wide-tracked.
 * Mirrors `.eyebrow` from the design system. Presentational only.
 */
export default function Eyebrow({
  children,
  color = editorial.ink3,
  style,
  numberOfLines,
}: {
  children: React.ReactNode;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[typography.eyebrow, { color }, style]}
    >
      {children}
    </Text>
  );
}
