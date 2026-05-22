import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { editorial, weights } from "../../../lib/theme/tokens";

/**
 * Editorial level ring — hairline track + ink progress arc with a big
 * Instrument Serif level numeral centered. Mirrors `LevelRing` from the
 * design system. Presentational only.
 */
export default function LevelRing({
  level,
  progress,
  size = 92,
  color = editorial.ink,
}: {
  level: number | string;
  /** 0..1 */
  progress: number;
  size?: number;
  color?: string;
}) {
  const r = (size / 92) * 38;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle
        cx={cx}
        cy={cx}
        r={r}
        stroke={editorial.hairline}
        strokeWidth={3}
        fill="none"
      />
      <Circle
        cx={cx}
        cy={cx}
        r={r}
        stroke={color}
        strokeWidth={3}
        fill="none"
        strokeDasharray={c}
        strokeDashoffset={c - c * clamped}
        strokeLinecap="round"
        transform={`rotate(-90 ${cx} ${cx})`}
      />
      <SvgText
        x={cx}
        y={cx + size * 0.04}
        textAnchor="middle"
        fontWeight={weights.heavy}
        fontSize={size * 0.41}
        fill={color}
      >
        {String(level)}
      </SvgText>
    </Svg>
  );
}
