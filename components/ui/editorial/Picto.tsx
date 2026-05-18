import Svg, { Circle, Path } from "react-native-svg";
import { editorial } from "../../../lib/theme/tokens";

export type PictoKind =
  | "carpool"
  | "bike"
  | "bus"
  | "walk"
  | "leaf"
  | "route"
  | "spark"
  | "message"
  | "shield"
  | "star"
  | "mic"
  | "plus"
  | "arrow"
  | "chev"
  | "search"
  | "pin";

/**
 * Editorial line-glyph icon set. Direct RN port of `Picto` from the design
 * system (react-native-svg). Presentational only.
 */
export default function Picto({
  kind = "route",
  size = 22,
  color = editorial.ink2,
  stroke = 1.5,
}: {
  kind?: PictoKind;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    case "carpool":
      return (
        <Svg {...common}>
          <Circle cx="9" cy="8" r="3" />
          <Circle cx="16" cy="9" r="2.4" />
          <Path d="M3 19c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <Path d="M14 17.2c.4-2 2-3.7 4-4.2" />
        </Svg>
      );
    case "bike":
      return (
        <Svg {...common}>
          <Circle cx="6" cy="17" r="4" />
          <Circle cx="18" cy="17" r="4" />
          <Path d="M6 17l4-8h5l3 8" />
          <Path d="M10 9l-1-3h-2" />
          <Circle cx="14" cy="5.5" r="1.2" fill={color} />
        </Svg>
      );
    case "bus":
      return (
        <Svg {...common}>
          <Path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z" />
          <Path d="M4 13h16" />
          <Circle cx="8" cy="17" r="1.5" fill={color} />
          <Circle cx="16" cy="17" r="1.5" fill={color} />
          <Path d="M7 8h3M14 8h3" />
        </Svg>
      );
    case "walk":
      return (
        <Svg {...common}>
          <Circle cx="13" cy="5" r="2" />
          <Path d="M10 21l2-6-3-3 2-5 4 3 3 1" />
          <Path d="M9 12l-2 4" />
        </Svg>
      );
    case "leaf":
      return (
        <Svg {...common}>
          <Path d="M5 19c0-9 7-14 15-14 0 8-5 15-14 15-1 0-1-.5-1-1z" />
          <Path d="M5 19c4-4 7-6 11-8" />
        </Svg>
      );
    case "route":
      return (
        <Svg {...common}>
          <Circle cx="6" cy="6" r="2" />
          <Circle cx="18" cy="18" r="2" />
          <Path d="M6 8v4a4 4 0 0 0 4 4h4" />
        </Svg>
      );
    case "spark":
      return (
        <Svg {...common}>
          <Path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
        </Svg>
      );
    case "message":
      return (
        <Svg {...common}>
          <Path d="M4 6a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v7a3 3 0 0 1-3 3h-4l-5 4v-4H7a3 3 0 0 1-3-3z" />
        </Svg>
      );
    case "shield":
      return (
        <Svg {...common}>
          <Path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
        </Svg>
      );
    case "star":
      return (
        <Svg {...common}>
          <Path
            d="M12 3l2.6 5.6 6.2.7-4.6 4.2 1.3 6L12 16.7 6.5 19.5l1.3-6L3.2 9.3l6.2-.7z"
            fill={color}
            fillOpacity={0.15}
          />
        </Svg>
      );
    case "mic":
      return (
        <Svg {...common}>
          <Path d="M9 6a3 3 0 0 1 6 0v5a3 3 0 0 1-6 0z" />
          <Path d="M5 12a7 7 0 0 0 14 0M12 19v3" />
        </Svg>
      );
    case "plus":
      return (
        <Svg {...common}>
          <Path d="M12 5v14M5 12h14" />
        </Svg>
      );
    case "arrow":
      return (
        <Svg {...common}>
          <Path d="M5 12h14M13 6l6 6-6 6" />
        </Svg>
      );
    case "chev":
      return (
        <Svg {...common}>
          <Path d="M9 6l6 6-6 6" />
        </Svg>
      );
    case "search":
      return (
        <Svg {...common}>
          <Circle cx="11" cy="11" r="7" />
          <Path d="M20 20l-4-4" />
        </Svg>
      );
    case "pin":
      return (
        <Svg {...common}>
          <Path d="M12 21s-7-7-7-12a7 7 0 0 1 14 0c0 5-7 12-7 12z" />
          <Circle cx="12" cy="9" r="2.5" />
        </Svg>
      );
    default:
      return null;
  }
}
