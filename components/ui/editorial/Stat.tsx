import { View, Text, ViewStyle, StyleProp } from "react-native";
import { editorial, weights } from "../../../lib/theme/tokens";
import Eyebrow from "./Eyebrow";

/**
 * Editorial stat block — big Instrument Serif tabular value + mono unit,
 * with an eyebrow caption underneath. Mirrors `Stat` from the design
 * system. Presentational only.
 */
export default function Stat({
  value,
  unit,
  label,
  big = false,
  color = editorial.ink,
  style,
}: {
  value: string | number;
  unit?: string;
  label: string;
  big?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
        <Text
          style={{
            fontWeight: weights.heavy,
            fontSize: big ? 44 : 28,
            lineHeight: big ? 46 : 30,
            letterSpacing: -0.5,
            color,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text
            style={{
              fontWeight: weights.semibold,
              fontSize: 11,
              letterSpacing: 0.4,
              color: editorial.ink3,
            }}
          >
            {unit}
          </Text>
        ) : null}
      </View>
      <Eyebrow style={{ marginTop: 4 }}>{label}</Eyebrow>
    </View>
  );
}
