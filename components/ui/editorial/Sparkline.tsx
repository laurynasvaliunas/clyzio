import Svg, { Path, Circle } from "react-native-svg";
import { editorial } from "../../../lib/theme/tokens";

/**
 * Minimal trend sparkline. Mirrors `Sparkline` from the design system.
 * Presentational only — pass real series data from the screen.
 */
export default function Sparkline({
  data = [3, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12, 14],
  width = 120,
  height = 28,
  color = editorial.teal,
  fill = false,
}: {
  data?: number[];
  width?: number;
  height?: number;
  color?: string;
  fill?: boolean;
}) {
  if (!data || data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const pts = data.map((v, i) => [
    i * (width / (data.length - 1)),
    height - ((v - min) / span) * (height - 4) - 2,
  ]);
  const d = pts
    .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");
  const fillD = `${d} L${width},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <Svg width={width} height={height}>
      {fill && <Path d={fillD} fill={color} fillOpacity={0.12} />}
      <Path
        d={d}
        stroke={color}
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={last[0]} cy={last[1]} r={2.5} fill={color} />
    </Svg>
  );
}
